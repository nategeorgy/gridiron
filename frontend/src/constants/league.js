// League context (M3): league size and starting lineup, plus (de)serialization.
// Mirrors the backend grammar in app/league.py: a league spec is
// `teams[:slot=value,...]`, e.g. "12" or "10:rb=2,wr=3,flex=2".
//
// This is what makes value league-aware: the lineup decides how deep each position
// runs before a manager is picking off the waiver wire, which is the baseline VORP
// measures against.

export const DEFAULT_LINEUP = {
  qb: 1,
  rb: 2,
  wr: 3,
  te: 1,
  flex: 1,
  superflex: 0,
};

export const DEFAULT_TEAMS = 12;
export const DEFAULT_LEAGUE = String(DEFAULT_TEAMS);

// Slots exposed in the editor, in display order.
export const LINEUP_SLOTS = [
  { key: "qb", label: "QB" },
  { key: "rb", label: "RB" },
  { key: "wr", label: "WR" },
  { key: "te", label: "TE" },
  { key: "flex", label: "FLEX" },
  { key: "superflex", label: "SUPERFLEX" },
];

export const TEAM_COUNT_OPTIONS = [8, 10, 12, 14, 16].map((count) => ({
  value: String(count),
  label: `${count} teams`,
}));

const MAX_SLOT = 6;

/** Parse a league spec into { teams, lineup }. Invalid parts fall back to defaults. */
export function parseLeague(spec) {
  const raw = spec || DEFAULT_LEAGUE;
  const [teamsPart, overridePart] = raw.split(":");
  const teams = Number(teamsPart);
  const lineup = { ...DEFAULT_LINEUP };
  if (overridePart) {
    for (const clause of overridePart.split(",")) {
      const [key, value] = clause.split("=");
      if (key in lineup && value !== undefined) {
        const count = Number(value);
        if (Number.isInteger(count) && count >= 0 && count <= MAX_SLOT) lineup[key] = count;
      }
    }
  }
  return {
    teams: Number.isInteger(teams) && teams >= 2 && teams <= 32 ? teams : DEFAULT_TEAMS,
    lineup,
  };
}

/** Build a `teams[:overrides]` spec, omitting slots that match the default lineup. */
export function serializeLeague(teams, lineup) {
  const overrides = LINEUP_SLOTS.filter(({ key }) => lineup[key] !== DEFAULT_LINEUP[key]).map(
    ({ key }) => `${key}=${lineup[key]}`,
  );
  return overrides.length ? `${teams}:${overrides.join(",")}` : String(teams);
}

/** Human-readable summary, e.g. "12-team · 1QB/2RB/3WR/1TE/1FLEX". */
export function leagueLabel(spec) {
  const { teams, lineup } = parseLeague(spec);
  const parts = ["qb", "rb", "wr", "te"].map((key) => `${lineup[key]}${key.toUpperCase()}`);
  if (lineup.flex) parts.push(`${lineup.flex}FLEX`);
  if (lineup.superflex) parts.push(`${lineup.superflex}SFLEX`);
  return `${teams}-team · ${parts.join("/")}`;
}
