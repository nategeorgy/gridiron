// The Second Level identity, as components.
//
// Only the 2L itself is artwork and therefore inline SVG. Everything else in the
// identity is type, and the app already loads Inter 400/500/600/700, so the wordmarks
// render as live text: selectable, weightless in the bundle, and sharp at any size.
// The outlined SVGs in brand/second-level are for the places a webfont cannot be
// relied on (social cards, PDFs, email), not for here.
//
// Colour follows the theme rather than the fixed brand hex. The white half is
// `currentColor`, so it inverts to dark ink on the light theme, and the green is
// `var(--accent)`, which is #00e389 on dark and the deeper #00b06a on light where the
// brighter green would fail contrast. The standalone brand files keep the fixed
// #11c759 for use outside the app.

const MARK_VIEWBOX = "0 0 1000 620.36";

/** The 2L mark on its own. Sizing comes from className (set a height, leave width auto). */
export function BrandMark({ className = "h-7 w-auto", style }) {
  return (
    <svg viewBox={MARK_VIEWBOX} className={className} style={style} role="img" aria-label="Second Level">
      <path fill="currentColor" fillRule="evenodd" d="M156.2,343.4L117.8,372.5C104.3,404.2 67.7,426.7 64.3,461.0L0.0,614.1L443.4,613.9L490.8,504.4L188.4,501.2C178.8,479.1 202.3,453.6 217.8,435.0L161.1,342.7L156.2,343.4Z M268.5,125.5C238.5,129.5 211.9,150.5 190.5,171.9C175.1,187.2 157.0,204.7 154.7,226.2L463.0,231.0L459.5,249.6C455.7,256.0 453.8,263.3 451.1,270.2C451.1,270.2 450.6,271.8 450.6,271.8C450.6,271.8 450.1,273.3 450.1,273.3C450.1,273.3 449.4,274.8 449.4,274.8C449.4,274.8 448.5,276.1 448.5,276.1C446.7,278.7 446.2,282.1 444.4,284.7C444.4,284.7 443.4,286.0 443.4,286.0C443.4,286.0 442.3,287.2 442.3,287.2C442.3,287.2 441.1,288.4 441.1,288.4C441.1,288.4 439.9,289.6 439.9,289.6C439.9,289.6 438.7,290.7 438.7,290.7C438.7,290.7 437.5,291.9 437.5,291.9C437.5,291.9 436.3,293.0 436.3,293.0C436.3,293.0 435.1,294.1 435.1,294.1C435.1,294.1 433.7,294.8 433.7,294.8C428.8,297.0 424.4,300.3 420.4,303.8L237.9,310.0L203.8,319.7L183.2,330.8L246.2,416.7L418.7,416.8L437.6,412.1L462.7,402.0C473.2,393.0 484.5,383.9 497.7,379.6C497.7,379.6 499.2,379.1 499.2,379.1C499.2,379.1 500.6,378.3 500.6,378.3C500.6,378.3 501.9,377.3 501.9,377.3C501.9,377.3 503.1,376.2 503.1,376.2C503.1,376.2 504.3,375.0 504.3,375.0C509.1,370.3 513.7,365.5 518.5,360.8C524.5,354.9 530.4,348.9 536.3,343.0C536.3,343.0 537.5,341.9 537.5,341.9C537.5,341.9 538.7,340.7 538.7,340.7C539.5,339.9 540.3,339.1 541.1,338.3C541.1,338.3 542.3,337.1 542.3,337.1C542.3,337.1 543.5,335.9 543.5,335.9C543.5,335.9 544.7,334.7 544.7,334.7C544.7,334.7 545.8,333.5 545.8,333.5C545.8,333.5 546.9,332.3 546.9,332.3C546.9,332.3 547.8,331.0 547.8,331.0C553.3,321.2 559.1,311.4 566.5,303.0L614.0,179.6L614.5,153.6L582.4,121.6L275.4,121.7L268.5,125.5Z" />
      <path fill="var(--accent)" fillRule="evenodd" d="M795.1,0.0L672.6,113.5L698.1,117.5L680.8,174.0L548.6,476.6L541.2,485.3L529.9,518.6L517.3,542.5L501.7,584.3L493.5,599.7L489.7,612.9L874.8,615.4C887.0,622.8 903.2,619.7 917.5,619.7C926.9,619.7 936.3,619.7 945.7,619.7C952.2,619.7 958.7,619.7 965.1,619.7C969.3,619.7 973.4,619.7 977.5,619.7C980.4,619.7 983.4,619.7 986.3,619.7C988.1,619.7 989.8,619.8 991.5,619.7C991.5,619.7 993.1,619.5 993.1,619.5C993.1,619.5 994.5,619.0 994.5,619.0C994.5,619.0 995.7,618.3 995.7,618.3C995.7,618.3 996.7,617.3 996.7,617.3C996.7,617.3 997.7,616.3 997.7,616.3C997.7,616.3 998.8,615.3 998.8,615.3C998.8,615.3 999.6,614.3 999.6,614.3C999.6,614.3 1000.0,613.2 1000.0,613.2C1000.0,613.2 999.8,612.1 999.8,612.1L913.9,503.6L667.2,499.4L797.6,184.2C800.1,167.4 801.1,146.6 814.5,136.2C822.5,130.1 836.7,142.9 844.7,136.8L801.9,0.1L795.1,0.0Z" />
    </svg>
  );
}

// The artwork's own proportions: the wordmark is 1.5493x the mark's width, its cap
// height 0.1364x the mark's height, and the gap between them 0.1667x. Width and gap are
// reproduced exactly. The cap height is NOT: at a header-sized mark the canonical ratio
// puts it near 5px, which is a smudge, so the type is set a little larger and the
// tracking absorbs the difference to keep the overall width right.
const LOCKUP = { wordOverMark: 1.5493, gapOverMark: 0.1667, markAspect: 1.612 };

// Width of "SECOND LEVEL" in Inter 600 at zero tracking, in em. Measured off the live
// render rather than estimated, so the tracking below solves exactly: at 9px with
// 0.3em tracking the wordmark measured 100px, and 100/9 - 11 * 0.3 = 7.81.
const WORDMARK_BASE_EM = 7.81;
const WORDMARK_GAPS = "SECOND LEVEL".length - 1;

/** Header lockup: the mark with SECOND LEVEL stacked beneath it. */
export function BrandLockup({ markHeight = 36, className = "" }) {
  const markWidth = markHeight * LOCKUP.markAspect;
  const wordWidth = markWidth * LOCKUP.wordOverMark;
  const gap = markHeight * LOCKUP.gapOverMark;
  // 9px is a floor, not a preference: below it the tracked caps stop being readable.
  const fontSize = Math.max(9, markHeight * 0.25);
  // Having floored the size, tracking takes up the slack so the wordmark still spans
  // the lockup width the artwork specifies.
  const tracking = (wordWidth / fontSize - WORDMARK_BASE_EM) / WORDMARK_GAPS;

  return (
    <div className={`flex flex-col items-center ${className}`} style={{ width: wordWidth }}>
      <BrandMark className="w-auto text-fg" style={{ height: markHeight }} />
      <span
        className="whitespace-nowrap font-semibold uppercase leading-none text-fg"
        style={{
          marginTop: gap,
          fontSize,
          letterSpacing: `${tracking}em`,
          // The last letter carries a trailing space of tracking it should not, so the
          // box is pulled back by it to keep the wordmark optically centred.
          marginRight: `${-tracking}em`,
        }}
      >
        Second <span className="text-accent">Level</span>
      </span>
    </div>
  );
}

/** The slash divider lockup, wide and quiet, with the tagline under it. */
export function SlashLockup({ className = "", showTagline = true, align = "center" }) {
  return (
    <div
      className={`flex flex-col ${align === "start" ? "items-start" : "items-center"} ${className}`}
    >
      <span
        className="flex items-baseline whitespace-nowrap text-[15px] font-semibold uppercase leading-none text-fg"
        style={{ letterSpacing: "0.3em" }}
      >
        Second
        {/* The slash leans 19.6 degrees off vertical in the artwork, and is taller than
            the caps on both sides. A skewed rule reproduces that without shipping a
            second copy of the path data. */}
        <span
          aria-hidden="true"
          className="mx-[0.42em] inline-block w-[2px] shrink-0 bg-accent"
          style={{ height: "1.9em", transform: "skewX(-19.6deg) translateY(0.32em)" }}
        />
        <span className="text-accent">Level</span>
      </span>
      {showTagline && (
        <span
          className="mt-2.5 whitespace-nowrap text-[9px] font-semibold uppercase leading-none text-muted"
          style={{ letterSpacing: "0.32em" }}
        >
          Fantasy Football Data
        </span>
      )}
    </div>
  );
}
