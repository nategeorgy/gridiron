// A heading over a band of Command Center cards ("Week 4 · Preview"): a small accent
// eyebrow, a title, and one faint line of context. It labels the band rather than any one
// card, so it sits outside the glass and carries the divider beneath it instead.
export function BandHeading({ eyebrow, title, sub }) {
  return (
    <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1 border-b border-line pb-2.5">
      <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-accent">{eyebrow}</span>
      <h2 className="text-lg font-bold leading-none tracking-tight text-fg">{title}</h2>
      {sub && <span className="text-[12px] leading-tight text-faint">{sub}</span>}
    </div>
  );
}
