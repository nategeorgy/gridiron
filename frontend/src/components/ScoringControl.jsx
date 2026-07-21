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
    <div className="rounded-lg border border-navy-800 bg-navy-900 p-4">
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
          className="rounded-md border border-navy-700 px-3 py-2 text-sm text-slate-300 transition hover:border-accent hover:text-white"
        >
          {open ? "Hide custom scoring" : "Customize"}
        </button>
        <span className="pb-2 text-xs text-slate-400">
          Active: <span className="font-semibold text-accent">{scoringLabel(scoring)}</span>
          {isCustom && (
            <button
              type="button"
              onClick={() => onChange(preset)}
              className="ml-2 text-slate-500 underline transition hover:text-slate-300"
            >
              reset
            </button>
          )}
        </span>
      </div>

      {open && (
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-navy-800 pt-4 sm:grid-cols-3 lg:grid-cols-5">
          {EDITABLE_WEIGHTS.map(({ key, label, step, optional }) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                {label}
              </span>
              <input
                type="number"
                step={step}
                value={config[key] ?? ""}
                placeholder={optional ? "= reception" : undefined}
                onChange={(event) => setWeight(key, event.target.value)}
                className="w-full rounded-md border border-navy-700 bg-navy-850 px-2 py-1.5 text-sm text-slate-100 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
