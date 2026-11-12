// Rate-stat minimums (November 2026). The backend decides who clears them
// (app/qualifiers.py); this is how the site talks about the answer.
//
// A rate (yards per route, aDOT, completion %, ...) and a few shares per position are
// ranked only among players who clear their position's volume minimum per team game:
// QB 7 dropbacks, RB 3 carries + targets, WR 12 routes, TE 2 targets. A player below it
// is still given a percentile on his own card, where his rate would sit among the
// qualified, and every row says which of its percentiles are read that way (`as_if`).
// Those are drawn as an OPEN bubble: dashed, unfilled, so it never passes for the real
// thing. Nobody else's percentile counts him.

/** Whether a row (any /stats/intelligence, career or compare row) is below the minimum. */
export const belowMinimum = (row) => row?.minimum?.met === false;

/** Whether this row's percentile (or rank) for `metricId` is as if qualified. */
export const isAsIf = (row, metricId) => Boolean(row?.as_if?.includes(metricId));

const number = (value) => Number(value).toLocaleString();

/** "12 routes per team game". */
export function minimumRule(minimum) {
  if (!minimum) return "";
  return `${number(minimum.per_team_game)} ${minimum.measure} per team game`;
}

/** "65 of 96 routes". */
export function minimumProgress(minimum) {
  if (!minimum) return "";
  return `${number(minimum.value)} of ${number(minimum.needed)} ${minimum.measure}`;
}

// The rule per position, for copy that has no row to read it from. The API's
// `minimums` block is the source; this is its fallback while a request loads.
export const MINIMUM_RULES = {
  QB: { measure: "dropbacks", per_team_game: 7 },
  RB: { measure: "carries and targets", per_team_game: 3 },
  WR: { measure: "routes", per_team_game: 12 },
  TE: { measure: "targets", per_team_game: 2 },
};

/** "QB 7 dropbacks, WR 12 routes" for the positions given, per team game. */
export function rulesFor(positions, minimums = MINIMUM_RULES) {
  return positions
    .map((position) => {
      const rule = minimums?.[position] ?? MINIMUM_RULES[position];
      return rule ? `${position} ${number(rule.per_team_game)} ${rule.measure}` : null;
    })
    .filter(Boolean)
    .join(", ");
}

const POSITION_NAMES = { QB: "quarterbacks", RB: "running backs", WR: "receivers", TE: "tight ends" };
const lastName = (name) => String(name ?? "").replace(/\s+(Jr\.?|Sr\.?|II|III|IV|V)$/i, "").split(" ").slice(-1)[0];

/**
 * The line under a card whose percentiles include open ones, or null when none are.
 * "Below the minimum: 65 of 96 routes (12 per team game). Open bubbles show where Palmer
 * would rank among qualified receivers."
 */
export function asIfNote(row, name, position, mark = "Open bubbles") {
  if (!row?.as_if?.length) return null;
  const group = POSITION_NAMES[position] ?? "players at the position";
  const tail = `${mark} show where ${lastName(name)} would rank among qualified ${group}.`;
  if (belowMinimum(row)) {
    return `Below the minimum: ${minimumProgress(row.minimum)} (${number(row.minimum.per_team_game)} per team game). ${tail}`;
  }
  return `Too few games to qualify. ${tail}`;
}
