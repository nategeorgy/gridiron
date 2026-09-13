// Tooltip payload for a metric on the player page.
//
// Same content as a board header — label, definition, the seasons it covers — but
// `hint: null`, because nothing here sorts and the board's "Click to sort" footer
// would be a promise this page cannot keep.
import { describeAvailability, isMetricAvailable, unavailableReason } from "../../utils/availability";

/** "2016 onwards", "1999–2025", or nothing when a metric spans the whole range. */
function seasonWindow(metric) {
  const window = metric?.availability;
  if (!window || (window.first_season <= 1999 && !window.last_season)) return null;
  if (window.first_season >= 9999) return "No free source publishes this";
  return describeAvailability(window);
}

export function metricTip(metric, column, season) {
  const unavailable = season != null && !isMetricAvailable(metric, season);
  return {
    label: metric?.label ?? column.replace(/_/g, " "),
    short: metric?.short,
    description: unavailable
      ? unavailableReason(metric, season) ?? metric?.description
      : metric?.description,
    seasons: seasonWindow(metric),
    unavailable,
    hint: null,
  };
}
