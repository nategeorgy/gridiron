// League scoring presets, editable weights, and (de)serialization helpers.
// Mirrors the backend grammar in app/scoring.py: a scoring spec is
// `preset[:key=value,key=value]`, e.g. "ppr" or "ppr:pass_td=6,te_rec=1.5".

// Standard baseline weights (must match backend STANDARD_WEIGHTS).
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

// Weights exposed in the custom editor, in display order.
export const EDITABLE_WEIGHTS = [
  { key: "rec", label: "Per Reception", step: 0.5 },
  { key: "te_rec", label: "Per Reception (TE)", step: 0.5, optional: true },
  { key: "pass_td", label: "Passing TD", step: 1 },
  { key: "pass_yd", label: "Per Passing Yard", step: 0.01 },
  { key: "pass_int", label: "Interception", step: 1 },
  { key: "rush_td", label: "Rushing TD", step: 1 },
  { key: "rush_yd", label: "Per Rushing Yard", step: 0.1 },
  { key: "rec_td", label: "Receiving TD", step: 1 },
  { key: "rec_yd", label: "Per Receiving Yard", step: 0.1 },
  { key: "fumble_lost", label: "Fumble Lost", step: 1 },
];

/** Full weights object for a preset (standard baseline + preset overrides). */
export function presetToConfig(preset) {
  return { ...STANDARD_WEIGHTS, te_rec: null, ...(PRESETS[preset] ?? {}) };
}

/** Parse a scoring spec into { preset, config } (config = full resolved weights). */
export function parseScoring(spec) {
  const raw = spec || DEFAULT_SCORING;
  const [presetName, overridePart] = raw.split(":");
  const preset = PRESETS[presetName] ? presetName : DEFAULT_SCORING;
  const config = presetToConfig(preset);
  if (overridePart) {
    for (const clause of overridePart.split(",")) {
      const [key, value] = clause.split("=");
      if ((key in STANDARD_WEIGHTS || key === "te_rec") && value !== undefined) {
        const num = Number(value);
        if (!Number.isNaN(num)) config[key] = num;
      }
    }
  }
  return { preset, config };
}

/** Weights in `config` that differ from the preset baseline. */
export function diffFromPreset(config, preset) {
  const base = presetToConfig(preset);
  const overrides = {};
  for (const { key } of EDITABLE_WEIGHTS) {
    const value = config[key];
    if (key === "te_rec") {
      if (value !== null && value !== undefined && value !== base.te_rec) overrides[key] = value;
    } else if (value !== base[key] && value !== null && value !== undefined) {
      overrides[key] = value;
    }
  }
  return overrides;
}

/** Build a `preset[:overrides]` spec string. */
export function serializeScoring(preset, overrides) {
  const parts = EDITABLE_WEIGHTS.filter(({ key }) => key in overrides).map(
    ({ key }) => `${key}=${overrides[key]}`,
  );
  return parts.length ? `${preset}:${parts.join(",")}` : preset;
}

/** Human-readable summary of a scoring spec, e.g. "PPR · custom". */
export function scoringLabel(spec) {
  const { preset } = parseScoring(spec);
  const label = PRESET_LABELS[preset] ?? preset.toUpperCase();
  return spec.includes(":") ? `${label} · custom` : label;
}
