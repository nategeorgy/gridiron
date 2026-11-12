// A small percentile or rank, in a dashed pill when it was ranked as if qualified
// (utils/qualifiers.js): the open bubble of the player card, at the size of a number
// printed under a value.
export function AsIfNumber({ open, color, className = "", title, children }) {
  return (
    <span
      className={`${className} ${open ? "inline-block rounded-full border border-dashed px-1 leading-[1.15]" : ""}`}
      style={{ color, borderColor: open ? color : undefined }}
      title={open ? [title, "as if qualified"].filter(Boolean).join(", ") : title}
    >
      {children}
    </span>
  );
}
