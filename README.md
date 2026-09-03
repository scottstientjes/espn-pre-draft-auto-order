# ESPN Fantasy Pre-Draft Rankings Sync

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A free Chrome extension that imports your own custom fantasy football rankings
(as a CSV) and lines them up against ESPN Fantasy Football's pre-draft
"Edit Rankings" table — either as a drag guide, or by driving the reorder
for you automatically. You review the result and click ESPN's own **Save**
button yourself; nothing is persisted to your account until you do.

Unofficial and unaffiliated with ESPN. It runs entirely in your browser
against your already-logged-in ESPN session — it never asks for or handles
credentials, and sends your data nowhere but the ESPN tab it's running on.

## Features

- Import a CSV of your own rankings (rank, tier, team, position, bye,
  notes)
- **Highlight mode** — every player ESPN's table has in common with your
  CSV gets a colored badge showing your target rank and tier, so you can
  drag rows into place by eye
- **Auto-reorder (experimental)** — simulates ESPN's native drag-and-drop
  to physically move rows into your target order for you
- Automatically clicks through ESPN's "Show More" pagination so the whole
  list is loaded before matching runs
- Name matching normalizes punctuation/suffixes (Jr., Sr., III, apostrophes)
  so small formatting differences between your CSV and ESPN's display don't
  cause misses; defense/special teams rows match by team instead of name

## Install

This isn't on the Chrome Web Store — load it as an unpacked extension:

1. Clone or download this repo
2. Go to `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the repo folder

## Usage

1. Open your ESPN Fantasy Football pre-draft rankings ("Edit Rankings")
   page and stay logged in as normal
2. Click the extension icon and load your rankings CSV
3. Click **Highlight rankings on page** to get a visual guide, or
   **Auto-reorder (experimental)** to have it attempt the drags for you
4. Review the order, then click **Save** on ESPN's own page

Nothing is saved to your account by this extension — if an auto-reorder
run goes sideways, just reload the tab to discard it, or hit
**Stop reorder** to halt mid-run.

## CSV format

A header row plus one row per player. `Rank` and `Player` are required;
`Tier`, `Team`, `Position`, `Bye`, and `Notes` are read if present. See
[`sample_rankings.csv`](sample_rankings.csv) for a working example
(including a quoted field with an embedded comma, to confirm your notes
column can contain commas safely):

```csv
Rank,Tier,Player,Team,Position,Bye,Notes
1,1,Jahmyr Gibbs,DET,RB,6,
2,1,Bijan Robinson,ATL,RB,11,
3,1,Ja'Marr Chase,CIN,WR,6,TD volume + long-TD bonuses
```

## How it works

ESPN's rankings table renders each player as a `tr[data-player-row]` with
`draggable="true"`. The extension:

1. Reads player name / team / position / ESPN player ID out of each row
2. Matches those rows to your CSV by normalized player name (or team, for
   D/ST rows)
3. In highlight mode, labels matched rows in place; in auto-reorder mode,
   dispatches real `dragstart → dragenter → dragover → drop → dragend`
   events to move each row into its target position, one at a time,
   re-reading the table between moves

## Known limitations

- Depends on ESPN's current page markup — if ESPN changes their rankings
  table structure, the CSS selectors in `content.js` will need updating
- Auto-reorder is experimental; if it doesn't move rows reliably in your
  browser, fall back to highlight mode and drag manually
- A full ~200-player auto-reorder simulates a drag per out-of-place row,
  so it can take a couple of minutes
- Defense/special-teams row matching hasn't been extensively verified
  against ESPN's actual D/ST markup

## Contributing

Issues and PRs welcome — DOM-selector fixes if ESPN changes their markup
are especially useful, since that's the part most likely to drift over
time.

## License

[MIT](LICENSE) — free to use, modify, and redistribute, for any purpose,
including commercially.

## Files

- `manifest.json` — Manifest V3 extension config
- `popup.html` / `popup.js` — CSV import UI and controls
- `content.js` — runs on the ESPN page: row extraction, CSV matching,
  highlight badges, pagination handling, and the drag-simulation engine
- `common/csv.js` — CSV parsing
- `common/match.js` — name normalization and CSV-to-row matching
- `sample_rankings.csv` — example CSV in the expected format
- `LICENSE` — MIT
