// Shared date/kickoff helpers for the schedule surfaces.
//
// Kickoff is stored as a NAIVE time that always means Eastern (see games.kickoff_time
// in CLAUDE.md), so it is formatted as digits plus a literal "ET" and never run
// through a timezone conversion — converting it would be a lie in both directions.
// Dates are split by hand rather than parsed as a local Date, which would shift the
// day backwards for anyone west of UTC.

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** { dow, mon, day, month } for an ISO date, read as UTC so the day never shifts. */
export function dateParts(iso) {
  if (!iso) return null;
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return { dow: WEEKDAYS[date.getUTCDay()], mon: MONTHS[month - 1], day, month };
}

/** "Sun 9/27" — the compact form used in dense rows. */
export function formatGameDate(iso) {
  const parts = dateParts(iso);
  return parts ? `${parts.dow} ${parts.month}/${parts.day}` : "";
}

/** "Sun Sep 27" — the form used in group headings, where there is room. */
export function formatGameDateLong(iso) {
  const parts = dateParts(iso);
  return parts ? `${parts.dow} ${parts.mon} ${parts.day}` : "";
}

/** "1:00 PM ET". Always ET — see the note above. */
export function formatKickoff(time) {
  if (!time) return "";
  const [hours, minutes] = time.split(":").map(Number);
  const hour12 = ((hours + 11) % 12) + 1;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"} ET`;
}

/** "1:00 PM" — inside a group already labelled with its day, ET is implied once. */
export function formatKickoffShort(time) {
  if (!time) return "";
  const [hours, minutes] = time.split(":").map(Number);
  const hour12 = ((hours + 11) % 12) + 1;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

// The named windows a week is actually read in. A reader parses a slate as Thursday /
// Sunday early / Sunday late / Sunday night / Monday, and a flat list by date makes
// them reconstruct that from timestamps.
export const SLOT_ORDER = [
  "Thursday Night",
  "Friday",
  "Saturday",
  "Sunday Early",
  "Sunday Late",
  "Sunday Night",
  "Monday Night",
  "Other",
];

/** Which of SLOT_ORDER a game kicks off in. */
export function slotOf(game) {
  const parts = dateParts(game.game_date);
  if (!parts) return "Other";
  const hour = Number((game.kickoff_time || "13:00").split(":")[0]);
  switch (parts.dow) {
    case "Thu": return "Thursday Night";
    case "Fri": return "Friday";
    case "Sat": return "Saturday";
    case "Mon": return "Monday Night";
    case "Tue":
    case "Wed": return "Other";
    default: break;
  }
  if (hour >= 20) return "Sunday Night";
  if (hour >= 16) return "Sunday Late";
  return "Sunday Early";
}
