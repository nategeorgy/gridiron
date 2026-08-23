// Which seasons a metric actually has data in, and how to say so (M8).
//
// GridironIQ covers 1999 onwards, but the data does not arrive all at once: the NFL
// began publishing charted passing data in 2006, snap counts start in 2013, routes in
// 2016, and 2003–2008 has no targets at all because play-by-play in those seasons
// names a receiver only on completions.
//
// The backend already stores NULL for all of that, so a board is never *wrong* — it
// just renders a column of dashes, which reads as a bug. These helpers let the UI say
// "air yards weren't recorded in 2004" before the user wonders what broke. The windows
// themselves come from the registry (`GET /metrics`), never from constants here —
// there is one measured source of truth and it lives in the backend.

/** True if `metric` has data in `season`. Unknown metrics are assumed available. */
export function isMetricAvailable(metric, season) {
  const window = metric?.availability;
  if (!window || !season) return true;
  const year = Number(season);
  if (year < window.first_season) return false;
  if (window.last_season != null && year > window.last_season) return false;
  return !(window.gaps ?? []).some(([start, end]) => year >= start && year <= end);
}

/**
 * A human sentence for why a metric has no data in a season, or null if it does.
 *
 * Prefers the registry's own note, which explains the *cause* ("play-by-play names a
 * receiver only on completions…") rather than restating the year the reader can
 * already see.
 */
export function unavailableReason(metric, season) {
  if (isMetricAvailable(metric, season)) return null;
  const window = metric?.availability;
  if (!window) return null;
  const label = metric.label ?? metric.id;
  return `${label} isn't recorded in ${season}. ${window.note ?? ""}`.trim();
}

/** "2016–2025", "2006–present", "1999–2002, 2009–present" — the covered seasons. */
export function describeAvailability(availability) {
  if (!availability) return "1999–present";
  const { first_season: first, last_season: last, gaps = [] } = availability;
  const end = last ?? "present";
  if (!gaps.length) return `${first}–${end}`;

  // Turn a window with holes into the list of stretches that survive them.
  const ordered = [...gaps].sort((a, b) => a[0] - b[0]);
  const parts = [];
  let cursor = first;
  for (const [start, stop] of ordered) {
    if (start > cursor) parts.push(start - 1 === cursor ? `${cursor}` : `${cursor}–${start - 1}`);
    cursor = stop + 1;
  }
  if (last == null || cursor <= last) parts.push(`${cursor}–${end}`);
  return parts.join(", ");
}

/** The subset of `columns` with no data in `season`, as metric objects. */
export function unavailableColumns(columns, metrics, season) {
  return columns
    .map((id) => ({ id, ...(metrics[id] ?? {}) }))
    .filter((metric) => !isMetricAvailable(metric, season));
}

/**
 * A sort column that works in this season.
 *
 * Sorting by a metric the season has no data for returns a page of dashes in an
 * arbitrary order, which is worse than silently changing the sort — so a board that
 * lands on one falls back to its default, and says so.
 */
export function firstAvailableColumn(columns, metrics, season, preferred) {
  const usable = (id) => isMetricAvailable({ id, ...(metrics[id] ?? {}) }, season);
  if (preferred && usable(preferred)) return preferred;
  return columns.find(usable) ?? preferred ?? columns[0];
}
