// League-context editor: team count plus the starting lineup. Emits a league spec
// string (e.g. "12" or "10:rb=2,flex=2") via onChange.
//
// Why it exists: replacement level — and therefore VORP — depends on how many of each
// position the league starts. The panel shows the resulting replacement level per
// position so the connection is visible rather than implied.
import { useState } from "react";
import { Select } from "./ui/Select";
import { formatStat } from "../utils/format";
import {
  DEFAULT_LINEUP,
  LINEUP_SLOTS,
  TEAM_COUNT_OPTIONS,
  leagueLabel,
  parseLeague,
  serializeLeague,
} from "../constants/league";

export function LeagueControl({ league, onChange, replacement }) {
  const [open, setOpen] = useState(false);
  const { teams, lineup } = parseLeague(league);
  const isCustom = league.includes(":");

  const setSlot = (key, raw) => {
    const value = Number(raw);
    if (raw === "" || Number.isNaN(value)) return;
    onChange(serializeLeague(teams, { ...lineup, [key]: value }));
  };

  return (
    <div className="glass-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="League Size"
          value={String(teams)}
          onChange={(value) => onChange(serializeLeague(Number(value), lineup))}
          options={TEAM_COUNT_OPTIONS}
        />
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="btn-ghost px-3 py-2 text-sm transition hover:!text-accent"
        >
          {open ? "Hide lineup" : "Starting lineup"}
        </button>
        <span className="pb-2 text-xs text-muted">
          Active: <span className="font-semibold text-accent">{leagueLabel(league)}</span>
          {isCustom && (
            <button
              type="button"
              onClick={() => onChange(String(teams))}
              className="ml-2 text-faint underline transition hover:text-muted"
            >
              reset
            </button>
          )}
        </span>
      </div>

      {open && (
        <div className="mt-4 border-t border-line pt-4">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {LINEUP_SLOTS.map(({ key, label }) => (
              <label key={key} className="flex flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
                  {label}
                </span>
                <input
                  type="number"
                  min={0}
                  max={6}
                  step={1}
                  value={lineup[key]}
                  onChange={(event) => setSlot(key, event.target.value)}
                  className="glass-input w-full px-2 py-1.5 text-sm"
                />
              </label>
            ))}
          </div>

          {replacement && (
            <div className="mt-4">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
                Replacement level in this league
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(replacement).map(([position, info]) => (
                  <span
                    key={position}
                    className="glass-pill px-2.5 py-1 text-xs"
                    title={`${position}${info.rank} — the last startable ${position} in a ${leagueLabel(league)} league`}
                  >
                    <span className="font-semibold text-fg">{position}</span>
                    <span className="ml-1.5 text-faint">#{info.rank}</span>
                    <span className="stat-num ml-2 font-semibold text-accent">
                      {formatStat(info.ppg, 2)}
                    </span>
                    <span className="ml-1 text-faint">PPG</span>
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-faint">
                Flex spots are shared out across RB/WR/TE in proportion to the starters
                your lineup already uses; a superflex counts toward QB. Each baseline is
                the average of the three players around that rank, in your scoring.
              </p>
            </div>
          )}

          {!Object.keys(lineup).some((key) => lineup[key] !== DEFAULT_LINEUP[key]) && (
            <p className="mt-3 text-[11px] text-faint">
              This is the standard lineup — change a slot to match your league.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
