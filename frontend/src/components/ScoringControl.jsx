// League-scoring editor: a preset picker plus an expandable custom-weights panel.
// Emits a scoring spec string (e.g. "ppr" or "ppr:pass_td=6") via onChange.
import { useState } from "react";
import { Select } from "./ui/Select";
import {
  EDITABLE_WEIGHTS,
  SCORING_PRESET_OPTIONS,
  diffFromPreset,
  parseScoring,
  scoringLabel,
  serializeScoring,
} from "../constants/scoring";

export function ScoringControl({ scoring, onChange }) {
  const [open, setOpen] = useState(false);
  const { preset, config } = parseScoring(scoring);
  const isCustom = scoring.includes(":");

  const setWeight = (key, raw) => {
    const value = raw === "" ? null : Number(raw);
    if (raw !== "" && Number.isNaN(value)) return;
    const nextConfig = { ...config, [key]: value };
    onChange(serializeScoring(preset, diffFromPreset(nextConfig, preset)));
  };

  return (
    <div className="glass-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="League Scoring"
          value={preset}
          onChange={(value) => onChange(value)}
          options={SCORING_PRESET_OPTIONS}
        />
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="btn-ghost px-3 py-2 text-sm transition hover:!text-accent"
        >
          {open ? "Hide custom scoring" : "Customize"}
        </button>
        <span className="pb-2 text-xs text-muted">
          Active: <span className="font-semibold text-accent">{scoringLabel(scoring)}</span>
          {isCustom && (
            <button
              type="button"
              onClick={() => onChange(preset)}
              className="ml-2 text-faint underline transition hover:text-muted"
            >
              reset
            </button>
          )}
        </span>
      </div>

      {open && (
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-3 lg:grid-cols-5">
          {EDITABLE_WEIGHTS.map(({ key, label, step, optional }) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
                {label}
              </span>
              <input
                type="number"
                step={step}
                value={config[key] ?? ""}
                placeholder={optional ? "= reception" : undefined}
                onChange={(event) => setWeight(key, event.target.value)}
                className="glass-input w-full px-2 py-1.5 text-sm"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
