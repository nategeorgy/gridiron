// "Export CSV" button shared by every board and both Explore views (M4).
// Builds the file from the rows currently on screen plus a context header, so what
// downloads is exactly what the user is looking at.
import { downloadCsv, slugify, toCsv } from "../utils/csv";

export function ExportButton({ filename, rows, columns, context = [], disabled = false }) {
  const empty = !rows || rows.length === 0;

  const handleExport = () => {
    if (empty) return;
    downloadCsv(`${slugify(filename)}.csv`, toCsv(rows, columns, context));
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={disabled || empty}
      title={empty ? "Nothing to export yet" : `Download ${rows.length} rows as CSV`}
      className="btn-ghost px-3 py-2 text-sm transition enabled:hover:!text-accent disabled:opacity-40"
    >
      Export CSV
    </button>
  );
}
