// Compare up to three players without leaving the draft room (M9).
//
// Two states in one dialog: **pick**, showing the same available-players list as the
// panel below the board, and **compare**, showing what those players did. Same list in
// both places on purpose — the thing you were just scanning is the thing you compare
// from, so there is nothing new to learn.
//
// **The numbers are last season's, and the dialog says so.** There are no 2026
// projections in any feed we have (nflverse publishes ranks, not points), so a column
// labelled "projected" would be one we invented. Only metrics that apply to *every*
// selected player are shown, which is the M4 comparison rule: a quarterback and a
// receiver get compared on common ground rather than on rows of dashes.
import { Fragment, useMemo, useState } from "react";
import { Dialog } from "./ui/Dialog";
import { useCompare } from "../hooks/useExplore";
import { useMetrics } from "../hooks/useMetrics";
import { formatStat } from "../utils/format";
import { PositionTag } from "./PositionTag";

const MAX_PLAYERS = 3;

export function ComparePopup({ open, onClose, players, season, scoring }) {
  const [selected, setSelected] = useState([]);
  const [comparing, setComparing] = useState(false);
  const [search, setSearch] = useState("");
  const { metrics } = useMetrics();

  const ids = selected.map((player) => player.player_id).join(",");
  // useCompare enables itself on a non-empty `players`, so an empty string is how the
  // pick step avoids firing a request for a comparison nobody has asked for yet.
  const { data, isLoading, isError } = useCompare({
    players: comparing && selected.length > 1 ? ids : "",
    season,
    scoring,
  });

  function close() {
    setSelected([]);
    setComparing(false);
    setSearch("");
    onClose?.();
  }

  function toggle(player) {
    setSelected((current) => {
      const without = current.filter((chosen) => chosen.player_id !== player.player_id);
      if (without.length !== current.length) return without;
      if (current.length >= MAX_PLAYERS) return current;
      return [...current, player];
    });
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return players
      .filter((player) => (query ? player.name.toLowerCase().includes(query) : true))
      .slice(0, 60);
  }, [players, search]);

  // --- Compare ---------------------------------------------------------------

  if (comparing) {
    const compared = data?.data ?? [];
    const metricIds = data?.metrics ?? [];
    const sections = data?.sections ?? [];

    return (
      <Dialog open={open} onClose={close} title="Compare players" width="max-w-4xl">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setComparing(false)}
            className="glass-pill px-3 py-1.5 text-xs"
          >
            ← Change players
          </button>
          <span className="text-[11px] text-faint">
            {season} regular season, in your scoring. No 2026 projections exist in any
            free feed, so nothing here is a forecast.
          </span>
        </div>

        {isLoading && <p className="p-6 text-center text-sm text-muted">Loading…</p>}
        {isError && (
          <p className="p-6 text-center text-sm text-muted">Could not load the comparison.</p>
        )}

        {!isLoading && !isError && (
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10" style={{ background: "var(--surface-solid)" }}>
                <tr className="text-xs uppercase tracking-wide text-faint">
                  <th className="px-2 py-2">Stat</th>
                  {compared.map((player) => (
                    <th key={player.player_id} className="px-2 py-2 text-right">
                      <span className="block truncate text-fg">{player.name}</span>
                      <PositionTag position={player.position} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(sections.length ? sections : [{ label: "", metrics: metricIds }]).map(
                  (section) => (
                    <Fragment key={section.label || "all"}>
                      {section.label && (
                        <tr>
                          <td
                            colSpan={compared.length + 1}
                            className="px-2 pb-1 pt-4 text-[10px] font-bold uppercase tracking-wide text-accent"
                          >
                            {section.label}
                          </td>
                        </tr>
                      )}
                      {(section.metrics ?? []).map((metricId) => {
                        const definition = metrics?.[metricId];
                        const values = compared.map((player) => player.stats?.[metricId]);
                        const present = values.filter(
                          (value) => value !== null && value !== undefined,
                        );
                        // Direction comes from the registry, so "leading" fumbles
                        // means the fewest of them.
                        const best = present.length
                          ? definition?.higherIsBetter === false
                            ? Math.min(...present)
                            : Math.max(...present)
                          : null;
                        return (
                          <tr key={metricId} className="border-b border-line last:border-0">
                            <td className="px-2 py-1.5 text-xs text-muted">
                              {definition?.label ?? metricId}
                            </td>
                            {compared.map((player, index) => (
                              <td
                                key={player.player_id}
                                className={`stat-num px-2 py-1.5 text-right ${
                                  values[index] === best && present.length > 1
                                    ? "font-semibold text-accent"
                                    : "text-fg"
                                }`}
                              >
                                {formatStat(values[index], definition?.format ?? 1)}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </Fragment>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </Dialog>
    );
  }

  // --- Pick ------------------------------------------------------------------

  return (
    <Dialog open={open} onClose={close} title="Compare players" width="max-w-2xl">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter by name…"
          className="glass-input flex-1 px-3 py-2 text-sm"
        />
        <span className="text-xs text-muted">
          {selected.length}/{MAX_PLAYERS} selected
        </span>
        <button
          type="button"
          onClick={() => setComparing(true)}
          disabled={selected.length < 2}
          className="glass-pill px-3 py-1.5 text-sm !text-accent disabled:opacity-50"
        >
          Compare
        </button>
      </div>

      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selected.map((player) => (
            <button
              key={player.player_id}
              type="button"
              onClick={() => toggle(player)}
              className="glass-pill px-2.5 py-1 text-xs !text-accent"
              title="Remove"
            >
              {player.name} ×
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 max-h-[50vh] overflow-y-auto">
        <table className="w-full text-left text-sm">
          <tbody>
            {filtered.map((player) => {
              const chosen = selected.some((one) => one.player_id === player.player_id);
              return (
                <tr
                  key={player.player_id}
                  className="border-b border-line last:border-0 hover:bg-surface-2"
                >
                  <td className="stat-num px-2 py-1.5 text-right text-xs text-faint">
                    {player.rank}
                  </td>
                  <td className="px-2 py-1.5 font-medium text-fg">{player.name}</td>
                  <td className="px-2 py-1.5">
                    <PositionTag position={player.position} />
                    <span className="stat-num ml-2 text-xs text-muted">
                      {player.team_abbreviation ?? "FA"}
                    </span>
                  </td>
                  <td className="stat-num px-2 py-1.5 text-right text-muted">
                    {formatStat(player.fantasy_points, 1)}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => toggle(player)}
                      disabled={!chosen && selected.length >= MAX_PLAYERS}
                      className={`glass-pill px-2 py-0.5 text-xs disabled:opacity-40 ${
                        chosen ? "!text-accent" : ""
                      }`}
                    >
                      {chosen ? "Selected" : "Add"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}
