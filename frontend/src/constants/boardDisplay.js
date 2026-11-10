// How the player leaderboard draws a stat cell (November 2026). Five modes, picked from
// the Display menu and kept in the URL (`display=`), so a saved view or a shared link
// opens drawn the way it was saved. Chosen over two rounds of mockups.
//
// - shaded:      the value, the cell tinted by its percentile (the default)
// - percentile:  the value, its percentile in small type beneath
// - rank:        the value, "#12" beneath: its rank among the position this season
// - values:      the value alone
// - percentiles: the percentile in place of the value, tinted
//
// Percentiles and ranks come from one pool per position and season (backend
// app/percentiles.py), so a rank and a percentile for the same cell always agree on
// who was compared.

export const DISPLAY_MODES = [
  { id: "shaded", label: "Values + percentile shaded", hint: "Each cell tinted by its percentile" },
  { id: "percentile", label: "Values + percentile", hint: "Percentile under the value" },
  { id: "rank", label: "Values + rank", hint: "Rank among position under the value" },
  { id: "values", label: "Values", hint: "Only the values" },
  { id: "percentiles", label: "Percentiles, shaded", hint: "The percentile in place of the value" },
];

export const DEFAULT_DISPLAY = "shaded";
export const DISPLAY_IDS = DISPLAY_MODES.map((mode) => mode.id);
export const displayMode = (id) => DISPLAY_MODES.find((mode) => mode.id === id) ?? DISPLAY_MODES[0];

/** Whether a mode tints the cell (and so wants the legend). */
export const isShadedDisplay = (id) => id === "shaded" || id === "percentiles";
