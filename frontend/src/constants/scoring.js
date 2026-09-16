// League scoring presets and (de)serialization helpers.
//
// The backend grammar (app/scoring.py) still accepts `preset[:key=value,...]`, but the
// product no longer offers the override half: the four presets below are the whole
// vocabulary the UI can produce or display. Custom weights were cut before launch
// because a scoring editor invites a manager to reproduce their exact league, and a
// half-reproduced league is worse than an honest approximation — every number on the
// page would be quoted in a scoring nobody actually plays.
//
// ⚠️ `parseScoring` therefore NORMALISES rather than parses: an override clause left
// over in an old shared link or in localStorage resolves to its bare preset. Keeping
// it would show "PPR" in the picker while the table was priced as something else,
// which is the one failure mode worse than dropping the customisation.

// Standard baseline weights (must match backend STANDARD_WEIGHTS). Kept because the
// presets are defined as sparse overrides of it, and because it documents what
// "standard" means without a round trip.
export const STANDARD_WEIGHTS = {
  pass_yd: 0.04,
  pass_td: 4,
  pass_int: -2,
  rush_yd: 0.1,
  rush_td: 6,
  rec: 0,
  rec_yd: 0.1,
  rec_td: 6,
  fumble_lost: -2,
};

// Named presets — sparse overrides of the standard weights.
const PRESETS = {
  std: {},
  half: { rec: 0.5 },
  ppr: { rec: 1 },
  ppr_te: { rec: 1, te_rec: 1.5 },
};

export const DEFAULT_SCORING = "ppr";

export const SCORING_PRESET_OPTIONS = [
  { value: "ppr", label: "PPR" },
  { value: "half", label: "Half-PPR" },
  { value: "std", label: "Standard" },
  { value: "ppr_te", label: "TE-Premium" },
];

const PRESET_LABELS = Object.fromEntries(
  SCORING_PRESET_OPTIONS.map(({ value, label }) => [value, label]),
);

/** Full weights object for a preset (standard baseline + preset overrides). */
export function presetToConfig(preset) {
  return { ...STANDARD_WEIGHTS, te_rec: null, ...(PRESETS[preset] ?? {}) };
}

/**
 * Reduce any scoring spec to a supported preset name.
 *
 * Anything unrecognised — an unknown preset, or a preset carrying custom overrides
 * the UI can no longer render — collapses to the bare preset, falling back to PPR.
 */
export function normalizeScoring(spec) {
  const name = String(spec || DEFAULT_SCORING).split(":")[0];
  return PRESETS[name] ? name : DEFAULT_SCORING;
}

/** Parse a scoring spec into { preset, config } (config = full resolved weights). */
export function parseScoring(spec) {
  const preset = normalizeScoring(spec);
  return { preset, config: presetToConfig(preset) };
}

/** Human-readable name of a scoring spec, e.g. "PPR". */
export function scoringLabel(spec) {
  const preset = normalizeScoring(spec);
  return PRESET_LABELS[preset] ?? preset.toUpperCase();
}
