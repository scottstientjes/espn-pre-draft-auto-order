// Name normalization + matching helpers shared by popup.js and content.js.
// ESPN's on-page player names don't always render identically to a
// hand-built CSV (suffixes, punctuation, "D/ST" naming), so matching is
// done on a normalized key rather than an exact string.

const SUFFIXES = /\b(jr|sr|ii|iii|iv|v)\b/g;

function normalizeName(name) {
  if (!name) return "";
  let n = name.toLowerCase();
  n = n.replace(/[’']/g, ""); // curly/straight apostrophes: Ja'Marr -> jamarr
  n = n.replace(/\./g, "");
  n = n.replace(SUFFIXES, "");
  n = n.replace(/[^a-z0-9\s]/g, " ");
  n = n.replace(/\s+/g, " ").trim();
  return n;
}

// D/ST rows are usually rendered as "<City/Team Name> D/ST" and don't line
// up well with a CSV that also just has a team abbreviation. Match those by
// team abbreviation instead of by name.
const TEAM_ABBRS = [
  "ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB",
  "HOU","IND","JAX","KC","LAC","LAR","LV","MIA","MIN","NE","NO","NYG","NYJ",
  "PHI","PIT","SEA","SF","TB","TEN","WAS",
];

function isDefense(entry) {
  return (
    (entry.position || "").toUpperCase() === "DST" ||
    /d\/st/i.test(entry.player || "")
  );
}

// Given the list of parsed CSV entries and a list of { text } candidates
// scraped from the page (one per rendered row, in DOM order), returns:
//   matched:   [{ csv, rowIndex }]  — rowIndex into `rows`
//   unmatchedCsv:  csv entries with no matching row found
//   unmatchedRows: row indexes with no matching csv entry
function matchCsvToRows(csvEntries, rows) {
  const rowKeys = rows.map((r) => normalizeName(r.text));
  const usedRows = new Set();
  const matched = [];
  const unmatchedCsv = [];

  for (const entry of csvEntries) {
    let rowIndex = -1;

    if (isDefense(entry)) {
      const abbr = (entry.team || "").toUpperCase();
      rowIndex = rows.findIndex(
        (r, i) =>
          !usedRows.has(i) &&
          /d\/st|defense/i.test(r.text) &&
          new RegExp(`\\b${abbr}\\b`, "i").test(r.text)
      );
    } else {
      const key = normalizeName(entry.player);
      rowIndex = rowKeys.findIndex((k, i) => !usedRows.has(i) && k === key);

      // Fall back to a substring match (handles cases like a middle name
      // or short form ESPN renders differently) if an exact key misses.
      if (rowIndex === -1) {
        rowIndex = rowKeys.findIndex(
          (k, i) =>
            !usedRows.has(i) &&
            k.length > 0 &&
            (k.includes(key) || key.includes(k))
        );
      }
    }

    if (rowIndex >= 0) {
      usedRows.add(rowIndex);
      matched.push({ csv: entry, rowIndex });
    } else {
      unmatchedCsv.push(entry);
    }
  }

  const unmatchedRows = rows
    .map((_, i) => i)
    .filter((i) => !usedRows.has(i));

  return { matched, unmatchedCsv, unmatchedRows };
}

if (typeof window !== "undefined") {
  window.normalizeName = normalizeName;
  window.matchCsvToRows = matchCsvToRows;
}
