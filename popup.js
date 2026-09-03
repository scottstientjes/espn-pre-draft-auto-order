const fileInput = document.getElementById("csvFile");
const highlightBtn = document.getElementById("highlightBtn");
const reorderBtn = document.getElementById("reorderBtn");
const stopBtn = document.getElementById("stopBtn");
const clearBtn = document.getElementById("clearBtn");
const statusEl = document.getElementById("status");

let rankings = null;

function showStatus(text) {
  statusEl.style.display = "block";
  statusEl.textContent = text;
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    rankings = parseRankingsCSV(text);
    await chrome.storage.local.set({ rankings });
    highlightBtn.disabled = false;
    reorderBtn.disabled = false;
    showStatus(`Parsed ${rankings.length} players from "${file.name}".`);
  } catch (err) {
    rankings = null;
    highlightBtn.disabled = true;
    reorderBtn.disabled = true;
    showStatus(`Could not parse CSV: ${err.message}`);
  }
});

async function getActiveEspnTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.startsWith("https://fantasy.espn.com/football/")) {
    throw new Error(
      "Open your ESPN Fantasy Football pre-draft rankings page in the active tab first."
    );
  }
  return tab;
}

highlightBtn.addEventListener("click", async () => {
  if (!rankings) return;
  try {
    const tab = await getActiveEspnTab();
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "HIGHLIGHT_RANKINGS",
      rankings,
    });

    if (!response) {
      showStatus(
        "No response from the page. Reload the ESPN tab (so the extension's content script attaches) and try again."
      );
      return;
    }

    if (response.error) {
      showStatus(`Error: ${response.error}`);
      return;
    }

    clearBtn.disabled = false;
    showStatus(
      `Matched ${response.matchedCount}/${rankings.length} players on the page.\n` +
        (response.unmatchedCsv.length
          ? `\nNot found on page (${response.unmatchedCsv.length}):\n` +
            response.unmatchedCsv.slice(0, 20).join(", ") +
            (response.unmatchedCsv.length > 20 ? ", ..." : "")
          : "All CSV players matched.") +
        "\n\nRows on the page are now labeled with your target rank — drag " +
        "each into place in ESPN's editor, then hit Save there."
    );
  } catch (err) {
    showStatus(err.message);
  }
});

clearBtn.addEventListener("click", async () => {
  try {
    const tab = await getActiveEspnTab();
    await chrome.tabs.sendMessage(tab.id, { type: "CLEAR_HIGHLIGHTS" });
    clearBtn.disabled = true;
    showStatus("Highlights cleared.");
  } catch (err) {
    showStatus(err.message);
  }
});

reorderBtn.addEventListener("click", async () => {
  if (!rankings) return;

  const ok = confirm(
    "This simulates dragging rows on ESPN's rankings table to match your CSV. " +
      "It can take a couple of minutes for a full list and nothing is saved " +
      "until you click Save on ESPN's own page — reloading the tab discards " +
      "any in-progress changes. Continue?"
  );
  if (!ok) return;

  try {
    const tab = await getActiveEspnTab();
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "AUTO_REORDER",
      rankings,
    });

    if (!response || !response.started) {
      showStatus("Could not start the reorder. Reload the ESPN tab and try again.");
      return;
    }

    stopBtn.disabled = false;
    showStatus(
      "Reorder started — watch the progress banner in the bottom-right of the " +
        "ESPN page. You can close this popup; the reorder keeps running. " +
        "Review the result, then click Save on ESPN's page yourself."
    );
  } catch (err) {
    showStatus(err.message);
  }
});

stopBtn.addEventListener("click", async () => {
  try {
    const tab = await getActiveEspnTab();
    await chrome.tabs.sendMessage(tab.id, { type: "STOP_REORDER" });
    stopBtn.disabled = true;
    showStatus("Stop requested — it'll halt after the move in progress.");
  } catch (err) {
    showStatus(err.message);
  }
});

// Restore previously imported CSV, if any, when the popup reopens.
chrome.storage.local.get("rankings").then((data) => {
  if (data.rankings && data.rankings.length) {
    rankings = data.rankings;
    highlightBtn.disabled = false;
    reorderBtn.disabled = false;
    showStatus(`Loaded ${rankings.length} players from last import.`);
  }
});
