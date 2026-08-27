// Creating a board of your own (M9): upload a CSV, or start from the board on screen.
//
// **The CSV format is strict on purpose** — `rank, player, position` required, `team`
// and `tier` optional. Sniffing columns is how an importer silently produces a board
// that is subtly not the one someone uploaded, and a wrong cheat sheet is worse than a
// rejected file. The dialog states the format up front and hands back every row it
// could not match, with its rank, rather than quietly dropping it.
//
// The file is read in the browser and posted as JSON text. A ranking board is a few
// tens of kilobytes; multipart would mean a new dependency in a deployed service to
// carry less data than most of our API responses.
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog } from "./ui/Dialog";
import { useRankingBoards } from "../hooks/useRankings";
import { getRankings } from "../services/draft";

const TEMPLATE = [
  "rank,player,position,team,tier",
  "1,Ja'Marr Chase,WR,CIN,1",
  "2,Jahmyr Gibbs,RB,DET,1",
  "3,Puka Nacua,WR,LA,2",
].join("\n");

const MAX_BYTES = 256_000;

function apiError(error) {
  return error?.response?.data?.detail ?? error?.message ?? "Something went wrong.";
}

/** Download the blank template, so nobody has to guess the header row. */
function downloadTemplate() {
  const blob = new Blob([`${TEMPLATE}\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "gridironiq-rankings-template.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function UnmatchedList({ rows }) {
  if (!rows?.length) return null;
  return (
    <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3">
      <p className="text-xs font-semibold text-fg">
        {rows.length} row{rows.length === 1 ? "" : "s"} could not be matched
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted">
        These are not on the board. Names are matched, never guessed — an
        &ldquo;ambiguous&rdquo; row means several current players share that name and
        position, and adding the team column separates them.
      </p>
      <ul className="mt-2 space-y-0.5">
        {rows.slice(0, 12).map((row) => (
          <li key={`${row.rank}-${row.name}`} className="text-[11px] text-faint">
            <span className="stat-num">#{row.rank}</span> {row.name} ({row.position})
            <span className="ml-1 text-faint">— {row.reason}</span>
          </li>
        ))}
        {rows.length > 12 && (
          <li className="text-[11px] text-faint">…and {rows.length - 12} more</li>
        )}
      </ul>
    </div>
  );
}

/**
 * @param {string|null} seedFrom   label of the board being copied, for the button text
 * @param {object|null} seedParams query params that fetch that board *in full* — not
 *   the rows on screen, which are one page of fifty. Copying a board has to copy the
 *   board.
 * @param {number} seedCount       how many players that is, for the explanatory line
 */
export function BoardImportDialog({
  open, onClose, seedFrom = null, seedParams = null, seedCount = 0,
}) {
  const navigate = useNavigate();
  const { createBoard, importBoard, isImporting, isSaving } = useRankingBoards();
  const fileInput = useRef(null);

  const [name, setName] = useState("");
  const [content, setContent] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  function reset() {
    setName("");
    setContent(null);
    setFileName(null);
    setError(null);
    setResult(null);
  }

  function close() {
    reset();
    onClose?.();
  }

  async function readFile(file) {
    setError(null);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError("That file is larger than a ranking board should be — check it's the right one.");
      return;
    }
    setFileName(file.name);
    setContent(await file.text());
    // A sensible default name, so the common case is one click: the file, minus its
    // extension, is almost always what the board should be called.
    if (!name) setName(file.name.replace(/\.csv$/i, "").slice(0, 60));
  }

  async function submitUpload(event) {
    event.preventDefault();
    setError(null);
    try {
      const imported = await importBoard({ name: name.trim(), content });
      setResult(imported);
    } catch (exception) {
      setError(apiError(exception));
    }
  }

  async function submitCopy(event) {
    event.preventDefault();
    setError(null);
    try {
      // Fetched here rather than taken from the page: the table shows one page of
      // fifty, and a board copied from it would silently be fifty players long.
      const full = await getRankings({ ...seedParams, limit: 800, offset: 0 });
      const board = await createBoard({
        name: name.trim(),
        seeded_from: seedFrom ?? undefined,
        entries: full.data.map((entry) => ({ player_id: entry.player_id })),
      });
      close();
      navigate(`/draft/boards/${board.board_id}`);
    } catch (exception) {
      setError(apiError(exception));
    }
  }

  // After a successful import: show what landed and what didn't, and let the user go
  // straight to the editor. Not auto-navigating, because the unmatched list is the
  // one moment those names are visible and worth reading.
  if (result) {
    return (
      <Dialog open={open} title="Board imported" onClose={close}>
        <p className="text-sm text-muted">
          <span className="font-semibold text-fg">{result.matched}</span> of{" "}
          {result.total_rows} rows are on{" "}
          <span className="font-semibold text-fg">{result.board.name}</span>.
          {result.out_of_scope > 0 && (
            <>
              {" "}
              {result.out_of_scope} kicker/defense row
              {result.out_of_scope === 1 ? " was" : "s were"} skipped — GridironIQ
              covers QB, RB, WR and TE.
            </>
          )}
        </p>
        <UnmatchedList rows={result.unmatched} />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={close} className="glass-pill px-3 py-1.5 text-sm">
            Done
          </button>
          <button
            type="button"
            onClick={() => {
              const boardId = result.board.board_id;
              close();
              navigate(`/draft/boards/${boardId}`);
            }}
            className="glass-pill px-3 py-1.5 text-sm !text-accent"
          >
            Edit the board
          </button>
        </div>
      </Dialog>
    );
  }

  const copyMode = Boolean(seedParams) && !content;

  return (
    <Dialog open={open} title="New ranking board" onClose={close}>
      <form onSubmit={content ? submitUpload : submitCopy} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
            Board name
          </span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            required
            placeholder="My 2026 board"
            className="glass-input w-full px-3 py-2 text-sm"
          />
        </label>

        <div className="rounded-lg border border-line p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-fg">Upload a CSV</span>
            <button
              type="button"
              onClick={downloadTemplate}
              className="text-[11px] text-muted underline underline-offset-2 transition hover:text-accent"
            >
              Download the template
            </button>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            Columns: <span className="stat-num">rank</span>,{" "}
            <span className="stat-num">player</span>,{" "}
            <span className="stat-num">position</span> are required;{" "}
            <span className="stat-num">team</span> and{" "}
            <span className="stat-num">tier</span> are optional. Team is what separates
            two players with the same name.
          </p>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => readFile(event.target.files?.[0])}
            className="mt-2 block w-full text-xs text-muted file:mr-3 file:rounded-full file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-fg"
          />
          {fileName && (
            <p className="mt-1.5 text-[11px] text-accent">Ready to import: {fileName}</p>
          )}
        </div>

        {seedParams && (
          <p className="text-[11px] leading-relaxed text-muted">
            Or leave the file empty to start from{" "}
            <span className="font-semibold text-fg">{seedFrom}</span> —{" "}
            {seedCount || "all"} players in its current order, which you can then drag
            into your own.
          </p>
        )}

        {error && <p className="text-xs text-neg">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={close} className="glass-pill px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button
            type="submit"
            disabled={isImporting || isSaving || !name.trim() || (!content && !copyMode)}
            className="glass-pill px-3 py-1.5 text-sm !text-accent disabled:opacity-50"
          >
            {isImporting || isSaving
              ? "Working…"
              : content
                ? "Import"
                : `Start from ${seedFrom ?? "this board"}`}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
