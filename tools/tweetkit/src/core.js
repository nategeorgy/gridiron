// Shared pieces for every card: the frame, text, faces, logos, chips, colours, formats.
const DATA = JSON.parse(document.getElementById("data").textContent);
const IMG = JSON.parse(document.getElementById("img").textContent);
const TEAMS = DATA.teams;

const SANS = "Inter, 'Helvetica Neue', Arial, sans-serif";
const MONO = "'JetBrains Mono', 'SF Mono', Menlo, monospace";
/** The theme in force: an explicit data-theme, else the viewer's system setting. */
const theme = () => {
  const set = document.documentElement.getAttribute("data-theme");
  if (set === "dark" || set === "light") return set;
  return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

// ------------------------------------------------------------------ formats
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (v, d = 1) => (v == null || Number.isNaN(v) ? "-" : Number(v).toFixed(d));
const pct = (v, d = 0) => (v == null ? "-" : `${(v * 100).toFixed(d)}%`);
const signed = (v, d = 1) => {
  if (v == null) return "-";
  const shown = Math.abs(v).toFixed(d);
  return `${Number(shown) === 0 ? "" : v > 0 ? "+" : "−"}${shown}`;
};
const ord = (n) => {
  if (n == null) return "-";
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i;
function lastName(name) {
  const parts = String(name ?? "").split(" ");
  if (parts.length > 2 && SUFFIX.test(parts[parts.length - 1])) return parts.slice(-2).join(" ");
  return parts.slice(1).join(" ") || String(name ?? "");
}
function shortName(name) {
  const parts = String(name ?? "").split(" ");
  return parts.length < 2 ? name : `${parts[0][0]}. ${lastName(name)}`;
}
/** Lower-case a label's first letter for mid-sentence use, leaving acronyms (EPA, CPOE) alone. */
const lowerFirst = (s) => (/^[A-Z]{2,}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const initials = (name) => String(name ?? "").split(" ").filter((p) => p && !SUFFIX.test(p)).map((p) => p[0]).slice(0, 2).join("");
const lin = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
const pathOf = (points) => points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function kickoff(header) {
  const [y, m, d] = header.game_date.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const [hh, mm] = (header.kickoff_time || "13:00").split(":").map(Number);
  const hour = ((hh + 11) % 12) + 1;
  return { day: DAYS[date.getUTCDay()], date: `${MONTHS[m - 1]} ${d}`, time: `${hour}:${String(mm).padStart(2, "0")} ${hh >= 12 ? "PM" : "AM"} ET` };
}
const yds = (n) => `${n} yd${Math.abs(n) === 1 ? "" : "s"}`;
const tds = (n, what = "TD") => (n ? `, ${n > 1 ? `${n} ` : ""}${what}` : "");
/** One player's game in words. `compact` drops targets so it fits a narrow row. */
const statLine = (p, compact = false) => {
  const parts = [];
  if (p.attempts >= 5) parts.push(`${p.completions}/${p.attempts}, ${yds(p.passing_yards)}, ${p.passing_tds} TD${p.interceptions ? `, ${p.interceptions} INT` : ""}`);
  if (p.carries > 0 && (p.attempts < 5 || p.carries >= 3)) parts.push(`${p.carries} car, ${yds(p.rushing_yards)}${tds(p.rushing_tds)}`);
  if (p.targets > 0) parts.push(compact ? `${p.receptions} rec, ${yds(p.receiving_yards)}${tds(p.receiving_tds)}` : `${p.receptions}/${p.targets}, ${yds(p.receiving_yards)}${tds(p.receiving_tds)}`);
  return parts.join(" · ");
};
/** Implied totals are quarter points: 28.25, 24.5, 24. */
const implied = (v) => (v == null ? "-" : String(parseFloat(v.toFixed(2))));

// ------------------------------------------------------------- measuring
const measureCtx = document.createElement("canvas").getContext("2d");
function textWidth(text, size, weight = 500, mono = false) {
  measureCtx.font = `${weight} ${size}px ${mono ? MONO : SANS}`;
  return measureCtx.measureText(String(text)).width;
}
/** Shorten `text` with an ellipsis until it fits. */
/** The largest of `sizes` at which `text` fits, else the smallest with an ellipsis. */
function fitSize(text, max, sizes, weight = 500) {
  for (const size of sizes) if (textWidth(text, size, weight) <= max) return { text, size };
  const size = sizes[sizes.length - 1];
  return { text: fit(text, max, size, weight), size };
}
function fit(text, max, size, weight = 500, mono = false) {
  let s = String(text ?? "");
  if (textWidth(s, size, weight, mono) <= max) return s;
  while (s.length > 1 && textWidth(`${s}…`, size, weight, mono) > max) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

// ----------------------------------------------------------------- svg atoms
let uid = 0;
const nextId = (p = "c") => `${p}${++uid}`;
function T(x, y, text, o = {}) {
  const attrs = [
    `x="${num(x, 1)}"`, `y="${num(y, 1)}"`,
    `font-size="${o.size ?? 20}"`, `font-weight="${o.weight ?? 500}"`,
    `fill="${o.fill ?? "var(--fg)"}"`,
    o.anchor ? `text-anchor="${o.anchor}"` : "",
    o.mono ? `font-family="${MONO}"` : "",
    o.ls ? `letter-spacing="${o.ls}"` : "",
    o.opacity != null ? `opacity="${o.opacity}"` : "",
    o.baseline ? `dominant-baseline="${o.baseline}"` : "",
  ].filter(Boolean).join(" ");
  return `<text ${attrs}>${o.raw ? text : esc(text)}</text>`;
}
const R = (x, y, w, h, o = {}) => `<rect x="${num(x, 1)}" y="${num(y, 1)}" width="${num(Math.max(0, w), 1)}" height="${num(Math.max(0, h), 1)}" rx="${o.rx ?? 0}" fill="${o.fill ?? "none"}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw ?? 1}"` : ""}${o.opacity != null ? ` opacity="${o.opacity}"` : ""}${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}/>`;
const L = (x1, y1, x2, y2, o = {}) => `<line x1="${num(x1, 1)}" y1="${num(y1, 1)}" x2="${num(x2, 1)}" y2="${num(y2, 1)}" stroke="${o.stroke ?? "var(--divider)"}" stroke-width="${o.sw ?? 1}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}${o.cap ? ` stroke-linecap="${o.cap}"` : ""}${o.opacity != null ? ` opacity="${o.opacity}"` : ""}/>`;
const C = (cx, cy, r, o = {}) => `<circle cx="${num(cx, 1)}" cy="${num(cy, 1)}" r="${num(r, 1)}" fill="${o.fill ?? "none"}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw ?? 1}"` : ""}${o.opacity != null ? ` opacity="${o.opacity}"` : ""}/>`;
const mix = (color, amount, other = "transparent") => `color-mix(in srgb, ${color} ${amount}%, ${other})`;

/** A headshot in a circle, ringed. Initials when the image is missing. */
function face(pid, cx, cy, r, ring = "var(--border-strong)", name = "") {
  const href = IMG[`p:${pid}`];
  const id = nextId("f");
  let out = `<clipPath id="${id}"><circle cx="${num(cx, 1)}" cy="${num(cy, 1)}" r="${num(r, 1)}"/></clipPath>`;
  out += C(cx, cy, r + r * 0.06, { fill: "var(--chip)", stroke: ring, sw: Math.max(2, r * 0.09) });
  if (href) out += `<image href="${href}" x="${num(cx - r, 1)}" y="${num(cy - r, 1)}" width="${num(r * 2, 1)}" height="${num(r * 2, 1)}" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/>`;
  else out += T(cx, cy + r * 0.32, initials(name), { size: r * 0.85, weight: 700, anchor: "middle", fill: "var(--muted)" });
  return out;
}
function logo(abbr, x, y, size) {
  const href = theme() === "dark" ? IMG[`ld:${abbr}`] || IMG[`l:${abbr}`] : IMG[`l:${abbr}`];
  return href ? `<image href="${href}" x="${num(x, 1)}" y="${num(y, 1)}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>` : "";
}

// ---------------------------------------------------------------- finishes
// The finish bands, set per position by Nate (October 2026): where each band ends, best
// first. Mirrors FINISH_BANDS in frontend/src/components/player/FinishChip.jsx, so a chip
// on a tweet is the colour it is on the site; change both together.
const BANDS = { QB: [6, 12, 18, 24], RB: [8, 14, 20, 26], WR: [12, 24, 32, 38], TE: [5, 10, 15, 20] };
const BAND_NAMES = ["top", "starter", "flex", "outside", "far"];
const TONES = {
  top: { bg: mix("var(--pos)", 42), fg: mix("var(--pos)", 30, "var(--fg)") },
  starter: { bg: mix("var(--pos)", 24), fg: mix("var(--pos)", 62, "var(--fg)") },
  flex: { bg: mix("var(--warn)", 8), fg: mix("var(--warn)", 70, "var(--fg)") },
  outside: { bg: mix("var(--neg)", 30), fg: mix("var(--neg)", 64, "var(--fg)") },
  far: { bg: mix("var(--neg)", 50), fg: mix("var(--neg)", 30, "var(--fg)") },
};
function tier(rank, pos) {
  if (rank == null) return null;
  const ends = BANDS[pos] || BANDS.WR;
  const band = ends.findIndex((end) => rank <= end);
  return BAND_NAMES[band === -1 ? ends.length : band];
}
/** A finish chip ("WR4") centred at cx. */
function chip(rank, pos, cx, cy, o = {}) {
  const size = o.size ?? 19;
  const h = o.h ?? size * 1.55;
  const w = o.w ?? Math.max(size * 3.3, textWidth(`${pos}${rank}`, size, 700, true) + size * 1.1);
  if (rank == null) return T(cx, cy + size * 0.36, o.empty ?? "-", { size, anchor: "middle", fill: "var(--faint)", mono: true });
  const tone = TONES[tier(rank, pos)];
  return R(cx - w / 2, cy - h / 2, w, h, { rx: h * 0.28, fill: tone.bg }) +
    T(cx, cy + size * 0.36, o.label ?? `${pos}${rank}`, { size, weight: 700, anchor: "middle", fill: tone.fg, mono: true });
}
/** A rounded pill with text, coloured by `tone` (a CSS colour) or neutral. */
function pill(text, x, cy, o = {}) {
  const size = o.size ?? 18;
  const w = textWidth(text, size, o.weight ?? 650) + size * 1.2;
  const h = size * 1.6;
  const left = o.anchor === "end" ? x - w : o.anchor === "middle" ? x - w / 2 : x;
  const tone = o.tone;
  const fill = tone ? mix(tone, 16) : "var(--chip)";
  const stroke = tone ? mix(tone, 40) : "var(--border-strong)";
  const ink = tone ? mix(tone, 62, "var(--fg)") : "var(--muted)";
  return { svg: R(left, cy - h / 2, w, h, { rx: h / 2, fill, stroke, sw: 1.5 }) + T(left + w / 2, cy + size * 0.36, text, { size, weight: o.weight ?? 650, anchor: "middle", fill: ink }), w };
}
/** Percentile to a colour, red through yellow to green. */
function pctColor(p) {
  if (p == null) return "var(--faint)";
  return p >= 50 ? mix("var(--pos)", Math.round(((p - 50) / 50) * 100), "var(--scale-mid)") : mix("var(--neg)", Math.round(((50 - p) / 50) * 100), "var(--scale-mid)");
}
/** Rank of N to a colour: 1 green, N red. */
function rankColor(rank, of = 32) {
  if (rank == null) return "var(--faint)";
  return pctColor(100 - ((rank - 1) / Math.max(1, of - 1)) * 100);
}
const posColor = (pos) => `var(--position-${String(pos).toLowerCase()})`;

// ------------------------------------------------------------- team colours
function parseHex(hex) {
  const m = String(hex || "").match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16) };
}
function lum({ r, g, b }) {
  const lin = [r, g, b].map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
const toHex = ({ r, g, b }) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
function hsl({ r, g, b }) {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn), l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}
function fromHsl({ h, s, l }) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}
function lighten(rgb) {
  if (lum(rgb) >= 0.14) return rgb;
  const { h, s, l } = hsl(rgb);
  for (let next = l; next <= 0.72; next += 0.02) { const c = fromHsl({ h, s, l: next }); if (lum(c) >= 0.14) return c; }
  return fromHsl({ h, s, l: 0.72 });
}
const vivid = (rgb) => rgb && hsl(rgb).s >= 0.45 && lum(rgb) >= 0.2;
function preferred(primary, secondary) {
  if (!primary) return secondary ? lighten(secondary) : null;
  if (lum(primary) < 0.035 && secondary && vivid(secondary)) return secondary;
  return lighten(primary);
}
function hueGap(a, b) {
  const ha = hsl(a), hb = hsl(b);
  if (ha.s < 0.15 && hb.s < 0.15) return 0;
  const gap = Math.abs(ha.h - hb.h) % 360;
  return Math.min(gap, 360 - gap);
}
/** The game page's two-team colours (components/game/colors.js). */
function gameColors(away, home) {
  const ap = parseHex(TEAMS[away]?.color), as = parseHex(TEAMS[away]?.color2);
  const hp = parseHex(TEAMS[home]?.color), hs = parseHex(TEAMS[home]?.color2);
  const a = preferred(ap, as);
  let h = preferred(hp, hs);
  if (a && h && hueGap(a, h) < 40) h = [hs, hp].filter(Boolean).map(lighten).find((c) => hueGap(a, c) >= 40) ?? { r: 138, g: 148, b: 166 };
  return { [away]: a ? toHex(a) : "var(--series-1)", [home]: h ? toHex(h) : "var(--series-2)" };
}
const teamColor = (abbr) => { const c = preferred(parseHex(TEAMS[abbr]?.color), parseHex(TEAMS[abbr]?.color2)); return c ? toHex(c) : "var(--series-1)"; };
const teamText = (color) => mix(color, 62, "var(--fg)");
const nickname = (abbr) => (TEAMS[abbr]?.name || abbr).split(" ").slice(-1)[0];

// --------------------------------------------------------------------- frame
const MARK = window.MARK_PATHS;
const MARK_ASPECT = 1000 / 620.36;
function mark(x, y, h, opacity = 1) {
  const s = h / 620.36;
  return `<g transform="translate(${num(x, 1)},${num(y, 1)}) scale(${s.toFixed(5)})"${opacity < 1 ? ` opacity="${opacity}"` : ""}><path fill="var(--fg)" fill-rule="evenodd" d="${MARK.ink}"/><path fill="var(--accent)" fill-rule="evenodd" d="${MARK.accent}"/></g>`;
}
/**
 * The export frame from utils/exportImage.js, at tweet size: green bar, title and
 * subtitle, the 2L top right, and the footer (wordmark, URL, handle, data credit).
 * Returns { open, close, top, bottom, pad } so a card draws between top and bottom.
 */
function frame(w, h, { title, subtitle, kicker, noHeader = false, credit = "Data: nflverse", headshot = null } = {}) {
  const pad = w >= 1500 ? 60 : 56;
  const foot = 96;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="${SANS}">`;
  s += R(0, 0, w, h, { fill: "var(--card)" });
  s += R(0, 0, w, 6, { fill: "var(--accent)" });
  let top = pad;
  if (!noHeader) {
    const markH = 46;
    s += mark(w - pad - markH * MARK_ASPECT, pad - 4, markH);
    let y = pad;
    // A headshot, when given, sits left of the title block and the text moves over.
    let tx = pad;
    if (headshot) {
      const r = 60;
      s += face(headshot.pid, pad + r, pad + (kicker ? 62 : 46), r, headshot.ring, headshot.name);
      tx = pad + r * 2 + 30;
    }
    if (kicker) { s += T(tx, y + 16, kicker.toUpperCase(), { size: 18, weight: 700, fill: "var(--accent-text)", ls: 2.2 }); y += 34; }
    const tt = fitSize(title, w - tx - pad - markH * MARK_ASPECT - 24, [44, 40, 36], 750);
    s += T(tx, y + 38, tt.text, { size: tt.size, weight: 750 });
    y += 50;
    if (subtitle) { s += T(tx, y + 30, fit(subtitle, w - tx - pad, 23, 500), { size: 23, weight: 500, fill: "var(--muted)" }); y += 40; }
    top = y + 28;
  }
  const fy = h - foot;
  let f = L(pad, fy, w - pad, fy, { stroke: "var(--rule)" });
  const mw = 36 * MARK_ASPECT;
  f += mark(pad, fy + 28, 36);
  f += `<text x="${pad + mw + 16}" y="${fy + 55}" font-size="20" font-weight="700" letter-spacing="3.4" fill="var(--fg)">SECOND <tspan fill="var(--accent)">LEVEL</tspan></text>`;
  f += T(w - pad, fy + 48, "secondlevel.app   @SecondLevelFF", { size: 21, weight: 600, anchor: "end" });
  f += T(w - pad, fy + 72, credit, { size: 16, weight: 500, anchor: "end", fill: "var(--faint)" });
  return { open: s, close: `${f}</svg>`, top, bottom: fy - 24, pad, w, h };
}
const wrapCard = (fr, body) => fr.open + body + fr.close;

/** A small legend item: a swatch shape then a label. Returns { svg, w }. */
function legendItem(x, cy, shape, label, size = 19) {
  const w = textWidth(label, size, 500) + 34;
  return { svg: shape(x + 10, cy) + T(x + 28, cy + size * 0.36, label, { size, fill: "var(--muted)" }), w };
}
function legendRow(x, cy, items, size = 19, gap = 26) {
  let out = "", at = x;
  for (const [shape, label] of items) { const it = legendItem(at, cy, shape, label, size); out += it.svg; at += it.w + gap; }
  return { svg: out, w: at - x - gap };
}

// ------------------------------------------------------------- shared blocks
/**
 * Stat tiles in labelled groups ("Fantasy points: Per game | Total", "Rushing: Yards | TDs"):
 * one panel per group with its cells split by hairlines and the group's name above it.
 * groups: [{label, cells: [{label, value, chip(cx, cy)}]}]. Returns { svg, h }.
 */
function tileGroups(x, y, w, groups, { cellH = 132, gap = 16 } = {}) {
  const n = groups.reduce((total, g) => total + g.cells.length, 0);
  const cw = (w - gap * (groups.length - 1)) / n;
  const size = cw >= 190 ? 40 : cw >= 150 ? 34 : 30;
  let s = "", at = x;
  for (const group of groups) {
    const gw = cw * group.cells.length;
    s += T(at + 4, y + 14, group.label.toUpperCase(), { size: 15, weight: 750, fill: "var(--faint)", ls: 1.6 });
    s += R(at, y + 26, gw, cellH, { rx: 22, fill: "var(--panel)" });
    group.cells.forEach((c, i) => {
      const cx = at + i * cw;
      if (i) s += L(cx, y + 44, cx, y + 26 + cellH - 18, { stroke: "var(--divider)", sw: 1.5 });
      const lb = fitSize(c.label.toUpperCase(), cw - 30, [14, 13, 12], 750);
      s += T(cx + 16, y + 58, lb.text, { size: lb.size, weight: 750, fill: "var(--faint)", ls: 1.1 });
      s += T(cx + 16, y + 26 + 82, c.value, { size, weight: 800, mono: true });
      if (c.chip) s += c.chip(cx + 16 + 31, y + 26 + 112);
    });
    at += gw + gap;
  }
  return { svg: s, h: 26 + cellH };
}

/** A rank of N as a tinted chip ("3rd"), green toward 1st. Team surfaces use this. */
function rankChip(rank, of, cx, cy, o = {}) {
  if (rank == null) return "";
  const color = rankColor(rank, of);
  const w = o.w ?? 66, h = o.h ?? 28, size = o.size ?? 16;
  return R(cx - w / 2, cy - h / 2, w, h, { rx: 9, fill: mix(color, 26) }) +
    T(cx, cy + size * 0.36, ord(rank), { size, weight: 700, anchor: "middle", mono: true, fill: mix(color, 62, "var(--fg)") });
}

/**
 * A point's label: its name, and under it (when `line` is given) its actual values, e.g.
 * "aDOT 11.2 · TGT 31.5%". Centred on cx with its top at y. Returns { svg, w, h }.
 */
function valueTag(cx, y, name, line, ring) {
  const nw = textWidth(name, 15, 700), lw = line ? textWidth(line, 14, 600, true) : 0;
  const w = Math.max(nw, lw) + (line ? 18 : 10), h = line ? 42 : 20;
  let svg = R(cx - w / 2, y, w, h, { rx: line ? 9 : 6, fill: "var(--card)", opacity: line ? 0.94 : 0.86, ...(line ? { stroke: ring, sw: 1.5 } : {}) });
  svg += T(cx, y + 15, name, { size: 15, weight: 700, anchor: "middle" });
  if (line) svg += T(cx, y + 34, line, { size: 14, weight: 600, anchor: "middle", mono: true, fill: "var(--muted)" });
  return { svg, w, h };
}
/**
 * Put each tag where it covers the least of the chart (other markers, tags already placed,
 * and lightly, dots): beside its marker (below, above, right, left), then at its corners,
 * then pushed further out, each costing a little more so the nearest clear spot wins.
 * Markers never move, so picking a point leaves the rest of the chart where it was.
 * tags: [{cx, cy, half, w, h}], half being the marker's half-size. Sets tag.box, and
 * tag.far when it sits away from its marker and wants a connector.
 */
function placeTags(tags, { markers = [], dots = [], bounds }) {
  const area = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const placed = [];
  for (const t of tags) {
    const slide = (x0) => Math.max(bounds.x0, Math.min(bounds.x1 - t.w, x0));
    const { cx, cy, half, w, h } = t;
    const near = [[slide(cx - w / 2), cy + half + 4], [slide(cx - w / 2), cy - half - 4 - h], [cx + half + 8, cy - h / 2], [cx - half - 8 - w, cy - h / 2]];
    const corners = [[cx + half * 0.7, cy + half * 0.7], [cx + half * 0.7, cy - half * 0.7 - h], [cx - half * 0.7 - w, cy + half * 0.7], [cx - half * 0.7 - w, cy - half * 0.7 - h]];
    const out = 36;
    const far = [[slide(cx - w / 2), cy + half + 4 + out], [slide(cx - w / 2), cy - half - 4 - h - out], [cx + half + 8 + out, cy - h / 2], [cx - half - 8 - w - out, cy - h / 2]];
    const spots = [...near.map((p, k) => [...p, k * 40, false]), ...corners.map((p, k) => [...p, 180 + k * 20, false]), ...far.map((p, k) => [...p, 420 + k * 20, true])];
    let best = null;
    for (const [x0, y0, pref, isFar] of spots) {
      const box = [x0, y0, x0 + w, y0 + h];
      const room = [x0 - 4, y0 - 4, x0 + w + 4, y0 + h + 4]; // scored with a little air around it
      let cost = pref;
      for (const m of markers) if (m !== t.marker) cost += area(room, m);
      for (const d of dots) cost += area(room, d) * 0.3;
      for (const p of placed) cost += area(room, p) * 3;
      cost += 2000 * (Math.max(0, bounds.x0 - box[0]) + Math.max(0, box[2] - bounds.x1) + Math.max(0, bounds.y0 - box[1]) + Math.max(0, box[3] - bounds.y1));
      if (!best || cost < best.cost) best = { cost, box, far: isFar };
    }
    t.box = best.box;
    t.far = best.far;
    placed.push(best.box);
  }
  return tags;
}
/** A thin line from a marker to a tag set away from it, to the nearest point of the tag. */
function tagConnector(t) {
  const [x0, y0, x1, y1] = t.box;
  const px = Math.max(x0, Math.min(x1, t.cx)), py = Math.max(y0, Math.min(y1, t.cy));
  return L(t.cx, t.cy, px, py, { stroke: "var(--muted)", sw: 1.4 });
}
/** "aDOT 11.2 · TGT 31.5%": a point's x and y in its chart's short labels. */
const valueLine = (cfg, p) => `${cfg.xshort} ${(cfg.xtip ?? cfg.xfmt)(p.x)} · ${cfg.yshort} ${(cfg.ytip ?? cfg.yfmt)(p.y)}`;

/**
 * A scatter card's plot: grid, tick labels, a par diagonal or dashed reference lines, the
 * key, axis titles, every point as a dot, and the highlighted ones as faces with names,
 * nudged apart and tied back to their dot. points: [{id, x, y, name, face, color}];
 * highlight: ids in the order to draw; numbers: ids whose faces also print their actual
 * x and y (in xshort/yshort); quadrants: four labels (or null) for the corners top right,
 * top left, bottom right, bottom left. xflip/yflip run an axis high to low, for a stat
 * where lower is better.
 */
/** A tick step that gives about six ticks across [lo, hi]. */
function niceStep(lo, hi, ticks = 6) {
  const raw = Math.max((hi - lo) / ticks, 1e-6);
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
}
function scatterPlot(fr, cfg) {
  const { pad, w } = fr;
  const px0 = pad + 74, px1 = w - pad - 10, py0 = fr.top + (cfg.key ? 34 : 6), py1 = fr.bottom - 50;
  const pts = cfg.points.filter((p) => p.x != null && p.y != null);
  const span = (vals, step) => [Math.floor(Math.min(...vals) / step) * step, Math.ceil(Math.max(...vals) / step) * step];
  if (cfg.xstep === "auto") cfg = { ...cfg, xstep: niceStep(Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x))) };
  if (cfg.ystep === "auto") cfg = { ...cfg, ystep: niceStep(Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y))) };
  const xr = cfg.xr ?? span(pts.map((p) => p.x), cfg.xstep), yr = cfg.yr ?? span(pts.map((p) => p.y), cfg.ystep);
  if (cfg.diagonal) { const lo = Math.min(xr[0], yr[0]), hi = Math.max(xr[1], yr[1]); xr[0] = yr[0] = lo; xr[1] = yr[1] = hi; }
  const x = cfg.xflip ? lin(xr[1], xr[0], px0, px1) : lin(xr[0], xr[1], px0, px1);
  const y = cfg.yflip ? lin(yr[1], yr[0], py1, py0) : lin(yr[0], yr[1], py1, py0);
  const dashed = { stroke: "var(--plot-rule)", dash: "8 7", sw: 1.5 };
  let s = "";
  for (const v of axisTicks(xr[0], xr[1], cfg.xstep)) s += L(x(v), py0, x(v), py1) + T(x(v), py1 + 30, cfg.xfmt(v), { size: 18, anchor: "middle", mono: true, fill: "var(--faint)" });
  for (const v of axisTicks(yr[0], yr[1], cfg.ystep)) s += L(px0, y(v), px1, y(v)) + T(px0 - 12, y(v) + 6, cfg.yfmt(v), { size: 18, anchor: "end", mono: true, fill: "var(--faint)" });
  if (cfg.diagonal) s += L(x(xr[0]), y(xr[0]), x(xr[1]), y(xr[1]), dashed);
  if (cfg.refX != null) s += L(x(cfg.refX), py0, x(cfg.refX), py1, dashed);
  if (cfg.refY != null) s += L(px0, y(cfg.refY), px1, y(cfg.refY), dashed);
  s += T((px0 + px1) / 2, py1 + 62, cfg.xlabel, { size: 19, weight: 650, anchor: "middle", fill: "var(--muted)" });
  s += `<text transform="translate(${pad + 8},${(py0 + py1) / 2}) rotate(-90)" text-anchor="middle" font-size="19" font-weight="650" fill="var(--muted)">${esc(cfg.ylabel)}</text>`;
  if (cfg.key) {
    const kw = textWidth(cfg.key, 17);
    s += L(px1 - kw - 52, fr.top + 8, px1 - kw - 18, fr.top + 8, dashed) + T(px1, fr.top + 14, cfg.key, { size: 17, anchor: "end", fill: "var(--muted)" });
  }
  // A point with its numbers shown always gets a face too.
  const numbered = new Set((cfg.numbers || []).filter((id) => pts.some((p) => p.id === id)));
  const hl = [...new Set([...cfg.highlight, ...numbered])].filter((id) => pts.some((p) => p.id === id));
  const hlSet = new Set(hl);
  // Bubble size, where the chart has one, on the dots only: faces stay one size.
  const sizes = pts.map((p) => p.z).filter((v) => v != null);
  const dotR = (p) => (p.z == null || !sizes.length ? 7 : 5 + 8 * Math.sqrt(Math.max(0, p.z - Math.min(...sizes)) / Math.max(1e-6, Math.max(...sizes) - Math.min(...sizes))));
  for (const p of pts) if (!hlSet.has(p.id)) s += C(x(p.x), y(p.y), dotR(p), { fill: mix(p.color, 50), stroke: p.color, sw: 1.5 });
  const r = cfg.r ?? 25, drop = 10;
  const items = hl.map((id) => pts.find((p) => p.id === id)).map((p) => ({ p, ax: x(p.x), ay: y(p.y) + drop, r: r + 15 }));
  relax(items, { r: r + 15, bounds: { x0: px0 + r + 10, x1: px1 - r - 10, y0: py0 + r + drop, y1: py1 - r - 10 } });
  for (const it of items) { it.y -= drop; it.ay -= drop; }
  for (const it of items) if (Math.hypot(it.x - it.ax, it.y - it.ay) > 8) s += L(it.ax, it.ay, it.x, it.y, { stroke: "var(--muted)", sw: 1.4 }) + C(it.ax, it.ay, 4, { fill: "var(--muted)" });
  // A face with its numbers trades its name for a two-line tag, put where it covers least.
  const surnames = {};
  for (const it of items) surnames[lastName(it.p.name)] = (surnames[lastName(it.p.name)] || 0) + 1;
  const nameOf = (it) => (surnames[lastName(it.p.name)] > 1 ? shortName(it.p.name) : lastName(it.p.name));
  for (const it of items) it.marker = [it.x - r, it.y - r, it.x + r, it.y + r];
  const tags = items.filter((it) => numbered.has(it.p.id)).map((it) => {
    const tag = valueTag(0, 0, nameOf(it), valueLine(cfg, it.p), "");
    return { it, cx: it.x, cy: it.y, half: r - 1, w: tag.w, h: tag.h, marker: it.marker };
  });
  const names = items.filter((it) => !numbered.has(it.p.id)).map((it) => { const w = textWidth(nameOf(it), 15, 700) + 10; return [it.x - w / 2, it.y + r + 3, it.x + w / 2, it.y + r + 23]; });
  placeTags(tags, { markers: [...items.map((it) => it.marker), ...names], dots: pts.filter((p) => !hlSet.has(p.id)).map((p) => [x(p.x) - 7, y(p.y) - 7, x(p.x) + 7, y(p.y) + 7]), bounds: { x0: px0, x1: px1, y0: py0, y1: py1 } });
  for (const t of tags) if (t.far) s += tagConnector(t);
  if (cfg.quadrants) {
    const boxes = [...items.map((it) => [it.x - r, it.y - r, it.x + r, it.y + r + 22]), ...tags.map((t) => t.box)];
    s += quadrantLabels({ px0, px1, py0, py1, mx: cfg.refX != null ? x(cfg.refX) : (px0 + px1) / 2, my: cfg.refY != null ? y(cfg.refY) : (py0 + py1) / 2, boxes, labels: cfg.quadrants });
  }
  for (const it of items) {
    s += face(it.p.face, it.x, it.y, r, it.p.color, it.p.name);
    if (!numbered.has(it.p.id)) s += valueTag(it.x, it.y + r + 3, nameOf(it), null).svg;
  }
  for (const t of tags) s += valueTag((t.box[0] + t.box[2]) / 2, t.box[1], nameOf(t.it), valueLine(cfg, t.it.p), t.it.p.color).svg;
  // Invisible hover targets on the review page: who each point is, and a click cycles his
  // face and numbers (clickStep in app.js). They draw nothing in a PNG. An axis label's
  // direction ("→", "(quicker →)") is dropped from the tooltip.
  const name = (label) => String(label).replace(/\s*\([^)]*[→↑]\)\s*$/, "").replace(/\s*[→↑]\s*$/, "");
  const tipOf = (p) => (p.tip ?? [`${p.name}${p.team ? ` (${p.team})` : ""}`, `${name(cfg.xlabel)}: ${(cfg.xtip ?? cfg.xfmt)(p.x)}`, `${name(cfg.ylabel)}: ${(cfg.ytip ?? cfg.yfmt)(p.y)}`,
    ...(p.z != null && cfg.zlabel ? [`${cfg.zlabel}: ${(cfg.ztip ?? num)(p.z)}`] : [])]).join("|");
  const placed = Object.fromEntries(items.map((it) => [it.p.id, it]));
  for (const p of pts) {
    const it = placed[p.id];
    s += `<circle class="hit" cx="${num(it ? it.x : x(p.x), 1)}" cy="${num(it ? it.y : y(p.y), 1)}" r="${it ? r + 3 : Math.max(11, dotR(p) + 3)}" fill="transparent" data-pid="${esc(p.id)}" data-tip="${esc(tipOf(p))}"/>`;
  }
  return s;
}

/**
 * A team scatter: every team as its logo. Picked teams (`picked`) stay bright and carry a
 * tag with their actual values and ranks; the rest fade. Nothing picked: every logo bright.
 * points: [{id, x, y, tip, xrank, yrank}]. xr/yr fix the ranges (else padded to the data);
 * xflip/yflip run an axis high to low; refX/refY draw dashed reference lines; shade tints
 * the top-right and bottom-left quadrants; quadrants as in scatterPlot.
 */
function logoScatter(fr, cfg) {
  const { pad, w } = fr;
  const px0 = pad + 70, px1 = w - pad - 10, py0 = fr.top + (cfg.key ? 34 : 6), py1 = fr.bottom - 50;
  const pts = cfg.points.filter((p) => p.x != null && p.y != null);
  const padded = (vals, step) => {
    const lo = Math.min(...vals), hi = Math.max(...vals), m = (hi - lo) * 0.06 || step;
    return [lo - m, hi + m];
  };
  const xstep = cfg.xstep === "auto" || cfg.xstep == null ? niceStep(Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x))) : cfg.xstep;
  const ystep = cfg.ystep === "auto" || cfg.ystep == null ? niceStep(Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y))) : cfg.ystep;
  const xr = cfg.xr ?? padded(pts.map((p) => p.x), xstep), yr = cfg.yr ?? padded(pts.map((p) => p.y), ystep);
  const x = cfg.xflip ? lin(xr[1], xr[0], px0, px1) : lin(xr[0], xr[1], px0, px1);
  const y = cfg.yflip ? lin(yr[1], yr[0], py1, py0) : lin(yr[0], yr[1], py1, py0);
  const dashed = { stroke: "var(--plot-rule)", dash: "8 7", sw: 1.5 };
  const mx = cfg.refX != null ? x(cfg.refX) : (px0 + px1) / 2, my = cfg.refY != null ? y(cfg.refY) : (py0 + py1) / 2;
  let s = "";
  if (cfg.shade) s += R(mx, py0, px1 - mx, my - py0, { fill: mix("var(--pos)", 6) }) + R(px0, my, mx - px0, py1 - my, { fill: mix("var(--neg)", 6) });
  for (const v of axisTicks(xr[0], xr[1], xstep)) s += L(x(v), py0, x(v), py1) + T(x(v), py1 + 30, cfg.xfmt(v), { size: 18, anchor: "middle", mono: true, fill: "var(--faint)" });
  for (const v of axisTicks(yr[0], yr[1], ystep)) s += L(px0, y(v), px1, y(v)) + T(px0 - 12, y(v) + 6, cfg.yfmt(v), { size: 18, anchor: "end", mono: true, fill: "var(--faint)" });
  if (cfg.refX != null) s += L(mx, py0, mx, py1, dashed);
  if (cfg.refY != null) s += L(px0, my, px1, my, dashed);
  s += T((px0 + px1) / 2, py1 + 62, cfg.xlabel, { size: 19, weight: 650, anchor: "middle", fill: "var(--muted)" });
  s += `<text transform="translate(${pad + 8},${(py0 + py1) / 2}) rotate(-90)" text-anchor="middle" font-size="19" font-weight="650" fill="var(--muted)">${esc(cfg.ylabel)}</text>`;
  if (cfg.key) {
    const kw = textWidth(cfg.key, 17);
    s += L(px1 - kw - 52, fr.top + 8, px1 - kw - 18, fr.top + 8, dashed) + T(px1, fr.top + 14, cfg.key, { size: 17, anchor: "end", fill: "var(--muted)" });
  }
  const size = cfg.size ?? 58;
  const picked = new Set((cfg.picked || []).filter((id) => pts.some((p) => p.id === id)));
  const part = (v, fmt, rank) => `${fmt(v)}${rank ? ` (${ord(rank)})` : ""}`;
  const lineOf = (p) => `${cfg.xshort} ${part(p.x, cfg.xtip ?? cfg.xfmt, p.xrank)} · ${cfg.yshort} ${part(p.y, cfg.ytip ?? cfg.yfmt, p.yrank)}`;
  const items = pts.map((p) => ({ p, ax: x(p.x), ay: y(p.y), r: size * 0.42 }));
  relax(items, { r: size * 0.42, bounds: { x0: px0 + size / 2, x1: px1 - size / 2, y0: py0 + size / 2, y1: py1 - size / 2 }, iterations: 80 });
  for (const it of items) it.marker = [it.x - size * 0.42, it.y - size * 0.42, it.x + size * 0.42, it.y + size * 0.42];
  const tags = items.filter((it) => picked.has(it.p.id)).map((it) => {
    const tag = valueTag(0, 0, nickname(it.p.id), lineOf(it.p), "");
    return { it, cx: it.x, cy: it.y, half: size * 0.42, w: tag.w, h: tag.h, marker: it.marker };
  });
  placeTags(tags, { markers: items.map((it) => it.marker), bounds: { x0: px0, x1: px1, y0: py0, y1: py1 } });
  const draw = (it) => {
    let out = "";
    if (Math.hypot(it.x - it.ax, it.y - it.ay) > 10) out += L(it.ax, it.ay, it.x, it.y, { stroke: "var(--muted)", sw: 1.2 }) + C(it.ax, it.ay, 3, { fill: "var(--muted)" });
    const img = logo(it.p.id, it.x - size / 2, it.y - size / 2, size);
    return out + (!picked.size || picked.has(it.p.id) ? img : `<g opacity="0.22">${img}</g>`);
  };
  // Faded logos first, then the picked ones, then their tags, so a tag is never drawn under a logo.
  for (const it of items) if (!picked.has(it.p.id)) s += draw(it);
  for (const t of tags) if (t.far) s += tagConnector(t);
  for (const it of items) if (picked.has(it.p.id)) s += draw(it);
  for (const t of tags) s += valueTag((t.box[0] + t.box[2]) / 2, t.box[1], nickname(t.it.p.id), lineOf(t.it.p), teamColor(t.it.p.id)).svg;
  for (const it of items) {
    s += `<rect class="hit" x="${num(it.x - size / 2, 1)}" y="${num(it.y - size / 2, 1)}" width="${size}" height="${size}" fill="transparent" data-pid="${it.p.id}" data-tip="${esc(it.p.tip)}"/>`;
  }
  if (cfg.quadrants) {
    const boxes = [...items.map((it) => [it.x - size / 2, it.y - size / 2, it.x + size / 2, it.y + size / 2]), ...tags.map((t) => t.box)];
    s += quadrantLabels({ px0, px1, py0, py1, mx, my, boxes, labels: cfg.quadrants });
  }
  return s;
}
