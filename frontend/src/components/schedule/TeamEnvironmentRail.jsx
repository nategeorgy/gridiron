// The Vegas board's summary half: every offense playing this week, one bar each,
// ranked by implied total.
//
// Why one row per team rather than per player — which is what this board used to do:
// implied total is a fact about the **offense**, so ranking players by it produced a
// list where the top twelve rows were the same San Francisco number twelve times
// before it reached another team. One row per distinct value is the honest shape, and
// it answers "is my guy's offense in a good spot" in one look.
//
// Bars are drawn from zero against the week's best, so their lengths stay comparable.
// Teams below the week's median are drawn faint rather than in a second hue: `--accent`
// already means "more points" here, and a second colour would have to mean something.
import { Link } from "react-router-dom";
import { formatStat } from "../../utils/format";

export function TeamEnvironmentRail({ teams, median, max }) {
  if (teams.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5">
      {teams.map((team) => (
        <div
          key={`${team.gameId}-${team.abbreviation}`}
          className="grid grid-cols-[minmax(104px,auto)_1fr_46px] items-center gap-3 rounded-lg px-2 py-1 transition hover:bg-surface-2"
        >
          <span className="flex items-center gap-2">
            {team.logoUrl ? (
              <img src={team.logoUrl} alt="" loading="lazy" className="h-[18px] w-[18px] flex-none object-contain" />
            ) : (
              <span className="h-[18px] w-[18px] flex-none rounded-full bg-surface-2" />
            )}
            <Link to={`/teams/${team.teamId}`} className="text-[13px] font-bold text-fg transition hover:text-accent">
              {team.abbreviation}
            </Link>
            <span className="stat-num text-[10.5px] text-faint">
              {team.isHome ? "vs" : "@"} {team.opponent}
            </span>
          </span>

          <span className="h-[18px] overflow-hidden rounded-md bg-surface-2">
            {team.implied != null && (
              <span
                className="block h-full rounded-md"
                style={{
                  width: `${max ? (team.implied / max) * 100 : 0}%`,
                  // See ImpliedSplit: a `/35` opacity modifier on these tokens
                  // compiles to an invalid colour and renders transparent.
                  background:
                    team.implied < median
                      ? "color-mix(in srgb, var(--accent) 35%, transparent)"
                      : "var(--accent)",
                }}
              />
            )}
          </span>

          <span className="stat-num text-right text-[13px] font-bold text-fg">
            {team.implied != null ? (
              formatStat(team.implied, 1)
            ) : (
              <span
                className="text-[10px] font-normal italic text-faint"
                title="The market has not posted a line for this game yet."
              >
                no line
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
