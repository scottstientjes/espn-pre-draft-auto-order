// Shared CSV parsing — loaded by both the popup and the content script.
// No dependency on an external CSV library, and handles quoted fields
// with embedded commas (e.g. the "Notes" column in the example rankings file).

function parseCSVRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // ignore, \n handles the line break
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

// Turns the raw CSV rows into ranking objects, sorted by Rank.
// Expects a header row containing at least Rank and Player; Tier, Team,
// Position, Bye, and Notes are picked up if present but optional.
function parseRankingsCSV(text) {
  const rows = parseCSVRows(text);
  if (rows.length < 2) {
    throw new Error("CSV needs a header row plus at least one player row.");
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name) => header.indexOf(name);

  const rankIdx = col("rank");
  const tierIdx = col("tier");
  const playerIdx = col("player");
  const teamIdx = col("team");
  const posIdx = col("position");
  const byeIdx = col("bye");
  const notesIdx = col("notes");

  if (playerIdx === -1) {
    throw new Error('CSV is missing a "Player" column.');
  }

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const player = (r[playerIdx] || "").trim();
    if (!player) continue;

    out.push({
      rank: rankIdx >= 0 && r[rankIdx] ? Number(r[rankIdx]) : i,
      tier: tierIdx >= 0 ? (r[tierIdx] || "").trim() : "",
      player,
      team: teamIdx >= 0 ? (r[teamIdx] || "").trim() : "",
      position: posIdx >= 0 ? (r[posIdx] || "").trim() : "",
      bye: byeIdx >= 0 ? (r[byeIdx] || "").trim() : "",
      notes: notesIdx >= 0 ? (r[notesIdx] || "").trim() : "",
    });
  }

  out.sort((a, b) => a.rank - b.rank);
  return out;
}

// Shared between popup.js (window) and content.js (content-script global scope).
if (typeof window !== "undefined") {
  window.parseRankingsCSV = parseRankingsCSV;
}
