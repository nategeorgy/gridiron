// Record Book (October 2026): this week's standout lines against every season since
// 2009, answered live by the Query Builder (`/explore/query`, which searches an
// in-memory copy of every player-game, so these cost no database reads).
//
// The entries are `RECORD_BOOK` in constants/signals.js. As with the other picks, only
// the selection is written there: the counts, the ranks and the stat lines are the
// search results, so a correction to the data corrects the card.
import { Link } from "react-router-dom";
import { Card, CardHead, CardLink, CardState } from "./primitives";
import { Headshot } from "../explore/common";
import { useQuerySearch } from "../../hooks/useExplore";
import { FIRST_SEASON } from "../../constants";
import { scoringLabel } from "../../constants/scoring";
import { formatStat } from "../../utils/format";

function LeadersEntry({ entry, scoring }) {
  const search = useQuerySearch({ ...entry.query, scoring });
  const rows = search.data?.rows ?? [];
  const featured = rows.find((row) => row.player_id === entry.playerId);
  const top = rows[0]?.fantasy_points ?? 0;
  // Bars run from 60% of the leader up, so a list of near neighbours still shows its order.
  const floor = top * 0.6;

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-3">
        <Headshot url={(featured ?? rows[0])?.headshot_url} name={(featured ?? rows[0])?.name ?? ""} size={46} />
        <div className="min-w-0 text-[14px] leading-snug text-fg">
          <b>{entry.title}</b>
          <span className="block text-[11.5px] text-faint">Any season since {FIRST_SEASON} {"·"} {scoringLabel(scoring)}</span>
        </div>
      </div>
      {search.isLoading && <CardState isLoading rows={3} />}
      {rows.map((row) => {
        const mine = row.player_id === entry.playerId;
        return (
          <div key={`${row.player_id}-${row.season}`} className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_46px] items-center gap-2.5">
            <Link to={`/players/${row.player_id}`} className={`truncate text-[13.5px] hover:text-accent ${mine ? "font-bold text-fg" : "text-muted"}`}>
              {row.name} <span className="stat-num text-[11.5px] font-normal text-faint">{row.season}</span>
            </Link>
            <span className="relative h-2.5 overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--fg) 8%, transparent)" }}>
              <span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${top > floor ? Math.max(4, ((row.fantasy_points - floor) / (top - floor)) * 100) : 100}%`,
                  background: mine ? "var(--accent)" : "color-mix(in srgb, var(--fg) 30%, transparent)",
                }}
              />
            </span>
            <span className={`stat-num text-right text-[13.5px] ${mine ? "font-bold text-fg" : "text-muted"}`}>
              {formatStat(row.fantasy_points, 1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CountEntry({ entry, season, week }) {
  const all = useQuerySearch(entry.query);
  const thisSeason = useQuerySearch({ ...entry.query, first_season: season, last_season: season, limit: 1 });
  const featured = (all.data?.rows ?? []).find(
    (row) => row.player_id === entry.playerId && row.season === season && row.week === week,
  );
  const total = all.data?.total;
  const seasonTotal = thisSeason.data?.total;

  return (
    <div className="flex gap-3">
      <Headshot url={featured?.headshot_url} name={featured?.name ?? ""} size={46} />
      <div className="min-w-0 leading-snug">
        <div className="text-[14px]">
          <b className="text-fg">{featured?.name ?? "…"}</b>{" "}
          {featured && <span className="stat-num text-[12.5px] font-semibold text-accent">{entry.line(featured)}</span>}
        </div>
        <div className="mt-1 text-[13px] text-muted">
          {total === undefined ? "…" : (
            <>
              One of {total} games since {FIRST_SEASON} with {entry.title.charAt(0).toLowerCase() + entry.title.slice(1)}
              {seasonTotal ? `, ${seasonTotal === 1 ? "the only one" : seasonTotal} this season` : ""}.
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function RecordBookCard({ book, scoring }) {
  return (
    <Card>
      <CardHead title="Record Book" sub={`Week ${book.week}, against every season`} />
      <div className="grid gap-3.5">
        {book.entries.map((entry, index) => (
          <div key={entry.title} className={index ? "border-t border-line pt-3.5" : ""}>
            {entry.kind === "leaders" ? (
              <LeadersEntry entry={entry} scoring={scoring} />
            ) : (
              <CountEntry entry={entry} season={book.season} week={book.week} />
            )}
          </div>
        ))}
      </div>
      <CardLink to="/explore/query">Search it in Query Builder</CardLink>
    </Card>
  );
}
