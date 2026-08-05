// CSV export (M4). Exports the *current view* — active filters, scoring, league
// context, and any custom metrics — with that context written into a header comment,
// so a downloaded file is self-describing rather than a column of numbers nobody can
// reproduce later.

/** Quote a value for CSV: wrap in quotes and double any inner quote. */
function escapeCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Build CSV text from rows.
 *
 * @param {Object[]} rows      the data rows
 * @param {Object[]} columns   [{ key, label }] in output order
 * @param {string[]} [context] lines describing the view, written as leading comments
 */
export function toCsv(rows, columns, context = []) {
  const lines = context.map((line) => `# ${line}`);
  lines.push(columns.map((column) => escapeCell(column.label)).join(","));
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCell(row[column.key])).join(","));
  }
  return lines.join("\n");
}

/** Trigger a browser download of `text` as `filename`. */
export function downloadCsv(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Build export rows/columns for a ranked board (leaderboard or Insight).
 *
 * Values are read through `columnKey` so a board using the fixed-PPR fallback exports
 * the numbers it actually displayed, and metric labels come from the registry so the
 * header matches the column the user was looking at.
 */
export function buildBoardExport(rows, columns, metrics, columnKey = (key) => key) {
  const exportColumns = [
    { key: "rank", label: "Rank" },
    { key: "name", label: "Player" },
    { key: "position", label: "Position" },
    { key: "team_abbreviation", label: "Team" },
    { key: "games_played", label: "Games" },
    ...columns.map((key) => ({ key, label: metrics[key]?.label ?? key })),
  ];

  const exportRows = rows.map((row, index) => ({
    rank: index + 1,
    name: row.name,
    position: row.position,
    team_abbreviation: row.team_abbreviation,
    games_played: row.games_played,
    ...Object.fromEntries(columns.map((key) => [key, row[columnKey(key)]])),
  }));

  return { rows: exportRows, columns: exportColumns };
}

/** A filesystem-safe slug for filenames, e.g. "Fantasy Leaders" -> "fantasy-leaders". */
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
