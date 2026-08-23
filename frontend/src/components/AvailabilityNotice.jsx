// Says which of a board's columns have no data in the selected season, and why (M8).
//
// GridironIQ covers 1999 onwards, but coverage deepens over time: charted passing data
// starts in 2006, snap counts in 2013, routes in 2016, and targets are missing entirely
// from 2003 to 2008 because play-by-play in those seasons names a receiver only on
// completions. Without this, picking 2004 on a receiving board renders three columns of
// dashes and reads as a broken page.
//
// The tone is deliberate: this is a fact about the historical record, not an error, so
// it renders as a quiet note rather than a warning.
import { describeAvailability, unavailableColumns } from "../utils/availability";

export function AvailabilityNotice({ columns, metrics, season, sortFallback = null }) {
  const missing = unavailableColumns(columns, metrics, season);
  if (!missing.length) return null;

  // One shared cause usually explains the whole set (every air-yards column has the
  // same note), so lead with the reason and list the columns after it.
  const reasons = [...new Set(missing.map((metric) => metric.availability?.note).filter(Boolean))];

  return (
    <div className="glass-card border-l-2 border-l-line p-4 text-sm">
      <p className="text-muted">
        <span className="font-semibold text-fg">Not recorded in {season}:</span>{" "}
        {missing.map((metric, index) => (
          <span key={metric.id}>
            {index > 0 && ", "}
            <span
              className="text-fg"
              title={`Available ${describeAvailability(metric.availability)}`}
            >
              {metric.label ?? metric.id}
            </span>
          </span>
        ))}
        .
      </p>
      {reasons.map((reason) => (
        <p key={reason} className="mt-1 text-xs text-faint">
          {reason}
        </p>
      ))}
      {sortFallback && (
        <p className="mt-1 text-xs text-faint">
          Sorted by {sortFallback} instead — ranking by a stat this season has no data
          for would order the table arbitrarily.
        </p>
      )}
    </div>
  );
}
