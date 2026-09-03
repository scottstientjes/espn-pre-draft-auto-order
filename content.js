// Runs on fantasy.espn.com/football/*. Depends on common/csv.js and
// common/match.js (loaded first per manifest.json).
//
// Row extraction is built against ESPN's rankings-editor markup as of
// 2026-09 (confirmed from an actual row's outerHTML):
//
//   <tr class="Table__TR ..." data-idx="1" draggable="true" data-player-row="1" ...>
//     ...
//     <div class="player-column__athlete">
//       <a class="AnchorLink ...">Ja'Marr Chase</a>
//     </div>
//     <span class="playerinfo__playerteam">CIN</span>
//     <span class="playerinfo__playerpos ttu">WR</span>
//     ...
//     <img class="..." src=".../headshots/nfl/players/full/4362628.png...">
//     <input type="checkbox" data-idx="4362628" data-row-idx="1" ...>
//
// Rows are native HTML5 drag sources (draggable="true"), not a pointer-based
// DnD library, so reordering is simulated with real DragEvent/DataTransfer
// dispatch. This has NOT been verified against the live page yet — try it,
// and if rows don't actually move, check the console for
// "[rank-sync]" logs and report back what you see. Nothing is destructive:
// ESPN only persists the order once you hit its own Save button.

const BADGE_CLASS = "espn-rank-sync-badge";
const ROW_MARK_ATTR = "data-espn-rank-sync";
const BANNER_ID = "espn-rank-sync-banner";

const TIER_COLORS = [
  "#8e24aa", "#3949ab", "#1e88e5", "#00897b", "#43a047",
  "#c0ca33", "#fdd835", "#fb8c00", "#f4511e", "#6d4c41", "#546e7a",
];

function log(...args) {
  console.log("[rank-sync]", ...args);
}

function tierColor(tier) {
  const n = parseInt(tier, 10);
  if (!n || n < 1) return "#546e7a";
  return TIER_COLORS[(n - 1) % TIER_COLORS.length];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- Row extraction -------------------------------------------------

// Specific to ESPN's rankings table. Returns rows in DOM order, which is
// always the current visual/ranked order regardless of what data-idx says.
function findRankingTableRows() {
  const trs = Array.from(document.querySelectorAll("tr[data-player-row]"));
  if (trs.length === 0) return null;

  return trs
    .map((tr) => {
      const nameEl =
        tr.querySelector(".player-column__athlete a.AnchorLink") ||
        tr.querySelector(".player-column a.AnchorLink") ||
        tr.querySelector("a.AnchorLink");
      const name = nameEl ? nameEl.textContent.trim() : "";

      const team = tr.querySelector(".playerinfo__playerteam")?.textContent.trim() || "";
      const position = (
        tr.querySelector(".playerinfo__playerpos")?.textContent.trim() || ""
      ).toUpperCase();

      const checkbox = tr.querySelector('input[type="checkbox"][data-idx]');
      let playerId = checkbox ? checkbox.getAttribute("data-idx") : null;
      if (!playerId) {
        const img = tr.querySelector(".player-headshot img");
        const m = img && img.src && img.src.match(/\/full\/(\d+)\.png/);
        playerId = m ? m[1] : null;
      }

      const displayedRank = tr.querySelector(".ranking-column")?.textContent.trim() || "";

      return { element: tr, text: name, name, team, position, playerId, displayedRank };
    })
    .filter((r) => r.name);
}

// Generic fallback for pages where the table above isn't found: any
// leaf-ish li/tr/draggable element with short, unique text.
function findGenericRows() {
  const all = document.querySelectorAll("li, tr, [role='listitem'], [draggable='true']");
  const rows = [];
  const seenTexts = new Set();

  for (const el of all) {
    const text = (el.innerText || "").trim().replace(/\s+/g, " ");
    if (!text || text.length > 120) continue;
    if (el.querySelectorAll("li, tr").length > 0) continue;
    if (seenTexts.has(text)) continue;
    seenTexts.add(text);
    rows.push({ element: el, text });
  }

  return rows;
}

function findRows() {
  return findRankingTableRows() || findGenericRows();
}

// ---- "Show More" pagination -------------------------------------------
//
// The table only renders players in batches; a "Show More" button
// (<div class="show-more-wrapper"><button class="... show-more ...">)
// appends the next batch when clicked. This clicks it repeatedly until
// enough rows are loaded to cover the CSV, the button disappears (full
// list loaded), or a click stops producing new rows.

function findShowMoreButton() {
  const scoped = document.querySelector(".show-more-wrapper button, button.show-more");
  if (scoped) return scoped;
  return (
    Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent.trim().toLowerCase() === "show more"
    ) || null
  );
}

function waitForRowCountAbove(prevCount, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const rows = findRankingTableRows();
      const count = rows ? rows.length : 0;
      if (count > prevCount || Date.now() - start > timeoutMs) {
        resolve(count);
      } else {
        setTimeout(check, 150);
      }
    };
    check();
  });
}

async function expandRows(targetCount, { onProgress, maxClicks = 40 } = {}) {
  for (let i = 0; i < maxClicks; i++) {
    const rows = findRankingTableRows();
    const count = rows ? rows.length : 0;
    if (targetCount && count >= targetCount) return count;

    const btn = findShowMoreButton();
    if (!btn) return count;

    if (onProgress) onProgress(count);
    btn.click();
    const newCount = await waitForRowCountAbove(count);
    if (newCount <= count) return newCount; // stopped making progress
  }
  const rows = findRankingTableRows();
  return rows ? rows.length : 0;
}

// ---- Highlight / guide mode ------------------------------------------

function insertBadge(rowEl, badge) {
  if (rowEl.tagName === "TR") {
    const anchor = rowEl.querySelector(".ranking-column") || rowEl.querySelector("td");
    if (anchor) {
      anchor.insertBefore(badge, anchor.firstChild);
      return;
    }
  }
  rowEl.insertBefore(badge, rowEl.firstChild);
}

function clearHighlights() {
  document.querySelectorAll(`.${BADGE_CLASS}`).forEach((el) => el.remove());
  document.querySelectorAll(`[${ROW_MARK_ATTR}]`).forEach((el) => {
    el.removeAttribute(ROW_MARK_ATTR);
    el.style.outline = "";
  });
}

async function highlightRankings(rankings) {
  clearHighlights();

  if (findRankingTableRows()) {
    showBanner("Loading more players...");
    await expandRows(rankings.length, {
      onProgress: (count) => showBanner(`Loading more players... (${count} loaded)`),
    });
    removeBanner();
  }

  const rows = findRows();
  const { matched, unmatchedCsv, unmatchedRows } = matchCsvToRows(rankings, rows);

  for (const { csv, rowIndex } of matched) {
    const row = rows[rowIndex].element;
    row.setAttribute(ROW_MARK_ATTR, String(csv.rank));
    row.style.outline = `2px solid ${tierColor(csv.tier)}`;
    row.style.outlineOffset = "-2px";

    const badge = document.createElement("span");
    badge.className = BADGE_CLASS;
    badge.textContent = csv.tier ? `#${csv.rank} · T${csv.tier}` : `#${csv.rank}`;
    badge.style.cssText = `
      display:inline-block; min-width:44px; margin-right:6px; padding:1px 6px;
      background:${tierColor(csv.tier)}; color:#fff; font-weight:600;
      font-size:11px; font-family:Arial,sans-serif; border-radius:4px;
      vertical-align:middle; z-index:2147483647; position:relative;
    `;
    insertBadge(row, badge);
  }

  const result = {
    matchedCount: matched.length,
    rowsFoundCount: rows.length,
    unmatchedCsv: unmatchedCsv.map((c) => c.player),
    unmatchedRowsCount: unmatchedRows.length,
  };

  if (rankings.length > 0 && rows.length < rankings.length * 0.25) {
    result.notes =
      "Only a small fraction of your CSV matched anything on the page. " +
      "ESPN's list may be virtualized (only rendering visible rows) — " +
      "try scrolling through the full list and re-running the highlight.";
  }

  return result;
}

// ---- On-page progress banner -----------------------------------------

function showBanner(text) {
  let el = document.getElementById(BANNER_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = BANNER_ID;
    el.style.cssText = `
      position:fixed; bottom:16px; right:16px; z-index:2147483647;
      background:#0b5ed7; color:#fff; padding:10px 14px; border-radius:8px;
      font:13px/1.4 Arial,sans-serif; box-shadow:0 2px 10px rgba(0,0,0,.3);
      max-width:320px; white-space:pre-wrap;
    `;
    document.body.appendChild(el);
  }
  el.textContent = text;
  return el;
}

function removeBanner() {
  document.getElementById(BANNER_ID)?.remove();
}

// ---- Drag-and-drop simulation ------------------------------------------

function centerOf(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function fireDragEvent(type, element, dataTransfer, x, y) {
  const evt = new DragEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: x,
    clientY: y,
    dataTransfer,
  });
  element.dispatchEvent(evt);
}

// Drags sourceEl and drops it onto targetEl. `insertBefore` picks whether
// the pointer lands in the top or bottom portion of the target row, since
// most sortable-list implementations use that to decide "insert above" vs
// "insert below" the hovered row.
async function simulateRowDrag(sourceEl, targetEl, insertBefore) {
  const dt = new DataTransfer();
  const src = centerOf(sourceEl);
  const rect = targetEl.getBoundingClientRect();
  const tx = rect.left + rect.width / 2;
  const ty = insertBefore ? rect.top + rect.height * 0.2 : rect.top + rect.height * 0.8;

  fireDragEvent("dragstart", sourceEl, dt, src.x, src.y);
  await sleep(30);
  fireDragEvent("dragenter", targetEl, dt, tx, ty);
  await sleep(20);
  fireDragEvent("dragover", targetEl, dt, tx, ty);
  await sleep(20);
  fireDragEvent("dragover", targetEl, dt, tx, ty);
  await sleep(20);
  fireDragEvent("drop", targetEl, dt, tx, ty);
  await sleep(20);
  fireDragEvent("dragend", sourceEl, dt, tx, ty);
}

function waitForTableChange(timeoutMs = 500) {
  const table = document.querySelector("tr[data-player-row]")?.closest("table") || document.body;
  return new Promise((resolve) => {
    let done = false;
    const obs = new MutationObserver(() => {
      if (done) return;
      done = true;
      obs.disconnect();
      resolve(true);
    });
    obs.observe(table, { childList: true, subtree: true });
    setTimeout(() => {
      if (done) return;
      done = true;
      obs.disconnect();
      resolve(false);
    }, timeoutMs);
  });
}

let stopRequested = false;

// Selection-sort style reorder: for each target position (top to bottom),
// find the row that belongs there and, if it isn't already there, drag it
// into place. Re-reads the table from the DOM after every move since
// positions shift as rows move.
async function autoReorder(rankings) {
  stopRequested = false;

  let rows = findRankingTableRows();
  if (!rows) {
    throw new Error(
      "Couldn't find ESPN's rankings table (expected tr[data-player-row]) on this page."
    );
  }

  showBanner("Loading more players...");
  await expandRows(rankings.length, {
    onProgress: (count) => showBanner(`Loading more players... (${count} loaded)`),
  });
  rows = findRankingTableRows();

  const { matched, unmatchedCsv, unmatchedRows } = matchCsvToRows(rankings, rows);
  const matchedSorted = [...matched].sort((a, b) => a.csv.rank - b.csv.rank);
  const desiredIds = matchedSorted.map((m) => rows[m.rowIndex].playerId).filter(Boolean);
  const leftoverIds = unmatchedRows
    .map((i) => rows[i].playerId)
    .filter(Boolean);
  const targetOrder = [...desiredIds, ...leftoverIds];

  let moves = 0;
  showBanner(`Reordering: 0/${targetOrder.length} in place...`);

  for (let target = 0; target < targetOrder.length; target++) {
    if (stopRequested) {
      showBanner(`Stopped after ${moves} move(s). Nothing is saved — reload to discard.`);
      break;
    }

    rows = findRankingTableRows();
    if (!rows) break;

    const currentIndex = rows.findIndex((r) => r.playerId === targetOrder[target]);
    if (currentIndex === -1) {
      log("target player not found in current DOM, skipping", targetOrder[target]);
      continue;
    }
    if (currentIndex !== target) {
      const sourceEl = rows[currentIndex].element;
      const targetEl = rows[target].element;
      const insertBefore = currentIndex > target;

      log(`moving row ${currentIndex} (${rows[currentIndex].name}) -> ${target}`);
      await simulateRowDrag(sourceEl, targetEl, insertBefore);
      await waitForTableChange(500);
      moves++;
    }

    if (target % 5 === 0 || target === targetOrder.length - 1) {
      showBanner(`Reordering: ${target + 1}/${targetOrder.length} placed · ${moves} move(s) so far...`);
    }
  }

  const summary = {
    moves,
    matchedCount: matched.length,
    unmatchedCsv: unmatchedCsv.map((c) => c.player),
  };

  if (!stopRequested) {
    showBanner(
      `Done. ${summary.moves} move(s), ${summary.matchedCount}/${rankings.length} CSV players matched.\n` +
        `Check the order, then hit Save on ESPN's page.`
    );
  }

  return summary;
}

// ---- Messaging -----------------------------------------------------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "HIGHLIGHT_RANKINGS") {
    highlightRankings(msg.rankings)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (msg.type === "CLEAR_HIGHLIGHTS") {
    clearHighlights();
    removeBanner();
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "AUTO_REORDER") {
    // Ack immediately — the popup may close before this finishes, but the
    // drag simulation keeps running in the page; progress shows in the
    // on-page banner instead of the popup.
    sendResponse({ started: true });
    autoReorder(msg.rankings)
      .then((summary) => log("auto-reorder complete", summary))
      .catch((err) => {
        log("auto-reorder failed", err);
        showBanner(`Auto-reorder failed: ${err.message}`);
      });
    return true;
  }

  if (msg.type === "STOP_REORDER") {
    stopRequested = true;
    sendResponse({ ok: true });
    return true;
  }
});
