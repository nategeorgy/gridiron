// A headshot inside an SVG chart: a disc with the player's initials, the photo clipped
// to a circle over it, and a coloured ring.
//
// The clip path needs an id, and ids must be unique in the document (two charts on one
// page each carry their own), so a chart calls useClipId() once and renders <ClipDef>
// in its <defs>. The initials stay under the photo, so a missing headshot, or one an
// export could not fetch, still reads as someone.
import { useId } from "react";
import { initials } from "../../utils/explore";

/** A document-unique clip-path id for one chart. */
export function useClipId() {
  return `head-clip${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

/** The circular clip every headshot in a chart shares (objectBoundingBox, so one serves all sizes). */
export function ClipDef({ id }) {
  return (
    <clipPath id={id} clipPathUnits="objectBoundingBox">
      <circle cx="0.5" cy="0.5" r="0.5" />
    </clipPath>
  );
}

/** A headshot centred on the enclosing group's origin. */
export function SvgHeadshot({ url, name, r, ring, ringWidth = 2, clipId }) {
  return (
    <g>
      <circle r={r} fill="color-mix(in srgb, var(--fg) 12%, var(--surface-solid))" />
      <text
        textAnchor="middle"
        dy="0.35em"
        style={{ fontSize: Math.max(8, r * 0.62), fontWeight: 600, fill: "var(--muted)" }}
      >
        {initials(name)}
      </text>
      {url && (
        <image
          href={url}
          x={-r}
          y={-r}
          width={2 * r}
          height={2 * r}
          clipPath={`url(#${clipId})`}
          preserveAspectRatio="xMidYMin slice"
        />
      )}
      <circle className="ring" r={r + ringWidth / 2} fill="none" stroke={ring ?? "var(--border-strong)"} strokeWidth={ringWidth} />
    </g>
  );
}
