// The scoring picker: one dropdown over the four supported presets.
//
// It used to carry a "Customize" panel of per-stat weights and, beneath it, the
// league-profile bar. Both were cut before launch — see constants/scoring.js for why
// the weights went, and note what is left is deliberately not a *setting*: it is a
// lens, switched as freely as a column sort, and it lives in the URL so a link carries
// it (see hooks/useScoring).
import { Select } from "./ui/Select";
import { SCORING_PRESET_OPTIONS, normalizeScoring } from "../constants/scoring";

export function ScoringControl({ scoring, onChange, bare = false, label = "League Scoring" }) {
  return (
    <div className={bare ? "" : "glass-card p-4"}>
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label={label}
          value={normalizeScoring(scoring)}
          onChange={onChange}
          options={SCORING_PRESET_OPTIONS}
        />
      </div>
    </div>
  );
}
