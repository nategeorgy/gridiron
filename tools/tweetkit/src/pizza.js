// D25 and D26: pizza charts (November 2026, from the radar and pizza mockups).
//
// One slice per stat, clockwise from 12 o'clock, its length the percentile from the hole
// (0) to the rim (100). Nate's pick for the card: NFL.com's identity rose (tinted category
// quadrants, the team logo in the hole) with The Athletic's labels: the percentile on a
// badge at each slice's end, and the stat with its number outside the rim.
//
// The slices are the site's radar stats grouped by category, `PIZZA_STATS` in
// frontend/src/constants/playerTabs.js: change both together. A category's colour is a
// series token, as on the site.
const PIZZA_CATS = {
  Fantasy: "var(--series-4)", Opportunity: "var(--series-1)", Workload: "var(--series-1)", Efficiency: "var(--series-3)",
  Running: "var(--series-3)", "Passing game": "var(--series-5)", Passing: "var(--series-1)", "Ball security": "var(--series-2)",
};
const PIZZA_DEF = {
  WR: [["fantasy_ppg", "PPG", "Fantasy"], ["fantasy_points_per_route_run", "FP / route", "Fantasy"],
    ["target_share", "Target share", "Opportunity"], ["air_yards_share", "Air yard share", "Opportunity"], ["red_zone_targets", "RZ targets", "Opportunity"], ["adot", "aDOT", "Opportunity"],
    ["targets_per_route_run", "TPRR", "Efficiency"], ["yards_per_route_run", "YPRR", "Efficiency"], ["receiving_epa", "Rec EPA", "Efficiency"]],
  RB: [["fantasy_ppg", "PPG", "Fantasy"],
    ["rush_attempt_share", "Rush share", "Workload"], ["opportunity_share", "Opp share", "Workload"], ["rush_att_inside_5", "Carries inside 5", "Workload"],
    ["target_share", "Target share", "Passing game"], ["route_participation", "Route share", "Passing game"], ["targets_per_route_run", "TPRR", "Passing game"],
    ["rushing_epa", "Rush EPA", "Running"], ["ngs_rush_yards_over_expected_per_att", "RYOE / att", "Running"], ["rush_yac_per_att", "YAC / att", "Running"]],
  QB: [["fantasy_ppg", "PPG", "Fantasy"],
    ["epa_per_play", "EPA / play", "Efficiency"], ["epa", "EPA", "Efficiency"], ["cpoe", "CPOE", "Efficiency"],
    ["yards_per_attempt", "Y/A", "Passing"], ["yards_per_completion", "Y/C", "Passing"], ["pass_td_rate", "TD%", "Passing"], ["ngs_pass_intended_air_yards", "aDOT", "Passing"],
    ["interception_rate", "INT%", "Ball security"]],
};
PIZZA_DEF.TE = PIZZA_DEF.WR;
/** The slices for a position, each with the format its value prints in (the radar's). */
function pizzaStats(pos) {
  const fmt = Object.fromEntries(radarStats(pos).map((st) => [st.id, st.f]));
  return PIZZA_DEF[pos].map(([id, label, cat]) => ({ id, label, cat, color: PIZZA_CATS[cat], f: fmt[id] ?? n1 }));
}
const pizzaCats = (stats) => [...new Map(stats.map((st) => [st.cat, st.color])).entries()];

const polar = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
/** An annular sector from r0 to r1 between angles a0 and a1, clockwise. */
function sectorPath(cx, cy, r0, r1, a0, a1) {
  if (r1 <= r0 + 0.01) return "";
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const p = (r, a) => polar(cx, cy, r, a).map((v) => v.toFixed(2)).join(",");
  return `M${p(r1, a0)}A${r1.toFixed(2)},${r1.toFixed(2)} 0 ${large} 1 ${p(r1, a1)}L${p(r0, a1)}A${r0.toFixed(2)},${r0.toFixed(2)} 0 ${large} 0 ${p(r0, a0)}Z`;
}
/** A label wrapped onto two lines at about `max` characters. */
function wrapTwo(text, max) {
  if (text.length <= max) return [text];
  const words = text.split(" ");
  let a = "", i = 0;
  while (i < words.length && (a + (a ? " " : "") + words[i]).length <= max) { a += (a ? " " : "") + words[i]; i += 1; }
  if (!a) { a = words[0]; i = 1; }
  return [a, words.slice(i).join(" ")].filter(Boolean);
}
/** The stat's label and, under it, its number: set outside the rim at angle `a`. */
function rimLabel(cx, cy, rad, a, label, valueSvg, size) {
  const [x, y] = polar(cx, cy, rad, a);
  const c = Math.cos(a), sn = Math.sin(a);
  const anchor = Math.abs(c) < 0.2 ? "middle" : c > 0 ? "start" : "end";
  const lines = wrapTwo(label, 13);
  const lh = size * 1.15, vh = size * 1.12;
  const total = lines.length * lh + vh;
  const y0 = sn < -0.55 ? y - total + lh * 0.8 : sn > 0.55 ? y + lh * 0.8 : y - total / 2 + lh * 0.8;
  let s = "";
  lines.forEach((ln, i) => { s += T(x, y0 + i * lh, ln, { size, weight: 700, anchor }); });
  return s + valueSvg(x, y0 + lines.length * lh - lh * 0.8 + vh * 0.82, anchor);
}

/**
 * One player's pizza at (cx, cy): the rose's tinted quadrants and logo, P1's badges and
 * labels. person: { pct, val, asif, team }.
 */
function pizzaRose(cx, cy, RR, stats, person, o = {}) {
  const r0 = o.r0 ?? RR * 0.16, k = o.k ?? 1.8;
  const n = stats.length, step = (Math.PI * 2) / n;
  const slices = stats.map((st, i) => ({ st, a0: -Math.PI / 2 + i * step, a1: -Math.PI / 2 + (i + 1) * step, am: -Math.PI / 2 + (i + 0.5) * step }));
  const rad = (p) => r0 + (RR - r0) * (Math.max(0, Math.min(100, p)) / 100);
  let s = "";
  // Tinted quadrants, one per category.
  for (let i = 0; i < slices.length;) {
    let j = i;
    while (j + 1 < slices.length && slices[j + 1].st.cat === slices[i].st.cat) j += 1;
    s += `<path d="${sectorPath(cx, cy, r0, RR + 6 * k, slices[i].a0, slices[j].a1)}" fill="${mix(slices[i].st.color, 11)}"/>`;
    i = j + 1;
  }
  slices.forEach(({ st, a0, a1 }) => {
    const pc = person.pct[st.id];
    if (pc == null) return;
    const open = person.asif?.includes(st.id);
    s += open
      ? `<path d="${sectorPath(cx, cy, r0, rad(pc), a0, a1)}" fill="${mix(st.color, 38)}" stroke="${st.color}" stroke-width="${1.5 * k}" stroke-dasharray="${4 * k} ${3 * k}"/>`
      : `<path d="${sectorPath(cx, cy, r0, rad(pc), a0, a1)}" fill="${st.color}" stroke="var(--card)" stroke-width="${2 * k}"/>`;
  });
  for (const q of [33, 66]) s += C(cx, cy, rad(q), { stroke: mix("var(--fg)", 22), sw: 1.4, dash: `${4 * k} ${4 * k}` });
  s += C(cx, cy, r0 + 2 * k, { fill: "var(--chip)", stroke: "var(--rule)", sw: 1.5 * k });
  // The hole holds the team logo, or the player's headshot (`o.face`) where several share a card.
  if (o.face) s += face(o.face.pid, cx, cy, r0 - 2 * k, o.face.ring, o.face.name);
  else if (person.team) s += logo(person.team, cx - r0 * 0.72, cy - r0 * 0.72, r0 * 1.44);
  // The percentile on a badge at each slice's end.
  slices.forEach(({ st, am }) => {
    const pc = person.pct[st.id];
    if (pc == null) return;
    const open = person.asif?.includes(st.id);
    const [bx, by] = polar(cx, cy, rad(Math.max(pc, 14)), am);
    const bw = (String(pc).length > 2 ? 36 : 30) * k, bh = 21 * k;
    s += R(bx - bw / 2, by - bh / 2, bw, bh, { rx: 5 * k, fill: open ? "var(--card)" : st.color, stroke: open ? st.color : "var(--card)", sw: 1.4 * k, dash: open ? `${3 * k} ${2 * k}` : null });
    s += T(bx, by + 4.4 * k, pc, { size: 13 * k, weight: 800, anchor: "middle", mono: true, fill: open ? teamText(st.color) : "#0b0d12" });
  });
  // The stat and its number outside the rim.
  const size = o.labelSize ?? 12 * k;
  slices.forEach(({ st, am }) => {
    const v = person.val[st.id];
    const valueSvg = (x, y, anchor) => T(x, y, v == null ? "-" : st.f(v), { size: size * 0.92, weight: 600, anchor, mono: true, fill: "var(--muted)" });
    s += rimLabel(cx, cy, RR + (o.labelGap ?? 30) * k, am, st.label, valueSvg, size);
  });
  return s;
}

/** "12 routes per team game", the position's minimum, for the note under a pizza. */
const minimumText = (p) => (p.min ? `${p.min.per_team_game} ${p.min.measure} per team game` : "the position's minimum");

// D25 --------------------------------------------------------------- Pizza profile
function cardPizza(pid) {
  const p = DATA.players[pid];
  const stats = pizzaStats(p.pos);
  const fr = ppFrame(p, 1200, 1500, `${p.pos} profile · ${DATA.season} through Week ${thru(p.team)} · PPR`, `${p.name} in ${DATA.season}`,
    `Percentiles among qualified ${posWord(p.pos)}, by category`);
  const { pad, w } = fr;
  const ctx = [TEAMS[p.team]?.name || p.team, `${p.season.games_played} games`, p.min ? `${p.min.value.toLocaleString()} ${p.min.measure}` : null, p.age ? `Age ${Math.floor(p.age)}` : null]
    .filter(Boolean).join("  ·  ");
  let s = T(pad, fr.top + 4, ctx, { size: 22, weight: 600, fill: "var(--muted)" });
  // The categories sit with the header as tinted pills, the key to the slices' colours.
  let x = pad;
  pizzaCats(stats).forEach(([cat, color]) => {
    const chip = pill(cat, x, fr.top + 52, { tone: color, size: 20, weight: 700 });
    s += chip.svg;
    x += chip.w + 10;
  });
  const note = asIfNote(p);
  const footY = fr.bottom - (note ? 30 : 4);
  const top = fr.top + 84, bottom = footY - 40;
  const radius = Math.min(352, (bottom - top) / 2 - 92);
  s += pizzaRose(w / 2, (top + bottom) / 2 + 6, radius, stats, { pct: p.pct, val: p.season, asif: p.asif, team: p.team }, { r0: 58, k: 1.8 });
  s += T(pad, footY, `Percentile among qualified ${posWord(p.pos)} (${minimumText(p)}), clockwise from the top.`, { size: 17, fill: "var(--faint)" });
  if (note) s += T(pad, footY + 26, fit(note, w - pad * 2, 16), { size: 16, fill: "var(--muted)" });
  return wrapCard(fr, s);
}

// D26 -------------------------------------------------------------- Back to back
/** Two half pizzas back to back: the first player's slices on the left, the second's mirrored on the right. */
function pizzaMirror(cx, cy, RR, stats, people, o = {}) {
  const r0 = o.r0 ?? RR * 0.14, k = o.k ?? 1.7;
  const n = stats.length, step = Math.PI / n;
  const rad = (p) => r0 + (RR - r0) * (Math.max(0, Math.min(100, p)) / 100);
  const pt = (r, a, side) => [cx + side * r * Math.cos(a), cy + r * Math.sin(a)];
  const wedge = (r1, a0, a1, side) => {
    if (r1 <= r0 + 0.01) return "";
    const sw = side === 1 ? 1 : 0;
    const f = (r, a) => pt(r, a, side).map((v) => v.toFixed(2)).join(",");
    return `M${f(r1, a0)}A${r1.toFixed(2)},${r1.toFixed(2)} 0 0 ${sw} ${f(r1, a1)}L${f(r0, a1)}A${r0.toFixed(2)},${r0.toFixed(2)} 0 0 ${1 - sw} ${f(r0, a0)}Z`;
  };
  let s = "";
  people.forEach((pp, idx) => {
    const side = idx ? 1 : -1;
    stats.forEach((st, i) => {
      const a0 = -Math.PI / 2 + i * step, a1 = a0 + step;
      s += `<path d="${wedge(RR, a0, a1, side)}" fill="${mix("var(--fg)", 3.5)}"/>`;
      const pc = pp.pct[st.id];
      if (pc == null) return;
      const open = pp.asif?.includes(st.id);
      s += `<path d="${wedge(rad(pc), a0, a1, side)}" fill="${open ? mix(pp.color, 30) : mix(pp.color, 85)}" stroke="var(--card)" stroke-width="${1.6 * k}"${open ? ` stroke-dasharray="${4 * k} ${3 * k}"` : ""}/>`;
    });
  });
  for (const q of [25, 50, 75]) s += C(cx, cy, rad(q), { stroke: mix("var(--fg)", 22), sw: 1.4, dash: `${5 * k} ${5 * k}` });
  s += C(cx, cy, RR, { stroke: mix("var(--fg)", 30), sw: 1.4 * k });
  s += L(cx, cy - RR - 20, cx, cy + RR + 16, { stroke: "var(--fg)", sw: 2.6 * k });
  s += C(cx, cy, r0, { fill: "var(--card)", stroke: "var(--fg)", sw: 2 * k });
  const size = o.labelSize ?? 11.5 * k;
  people.forEach((pp, idx) => {
    const side = idx ? 1 : -1;
    stats.forEach((st, i) => {
      const am = -Math.PI / 2 + (i + 0.5) * step;
      const pc = pp.pct[st.id];
      if (pc != null) {
        const open = pp.asif?.includes(st.id);
        const [bx, by] = pt(Math.max(rad(pc) - 15 * k, r0 + 14 * k), am, side);
        s += `<text x="${num(bx, 1)}" y="${num(by + 4.2 * k, 1)}" font-size="${num(12 * k, 1)}" font-weight="800" text-anchor="middle" font-family="${MONO}" fill="${open ? "var(--fg)" : "#ffffff"}" stroke="${open ? "var(--card)" : "rgba(0,0,0,.5)"}" stroke-width="${num(3 * k, 1)}" paint-order="stroke" stroke-linejoin="round">${pc}</text>`;
      }
      const [lx, ly] = pt(RR + 18 * k, am, side);
      const anchor = side === 1 ? "start" : "end";
      const v = pp.val[st.id];
      s += T(lx, ly - 1, st.label, { size, weight: 700, anchor });
      s += T(lx, ly + size * 1.15, v == null ? "-" : st.f(v), { size: size * 0.95, weight: 750, anchor, mono: true, fill: teamText(pp.color) });
    });
  });
  return s;
}

function cardPizzaPair(pid, opts = {}) {
  const a = DATA.players[pid];
  const b = DATA.players[opts.vs] && DATA.players[opts.vs].pos === a.pos ? DATA.players[opts.vs] : DATA.players[defaultRival(pid)];
  // Two colours that differ on screen (the site's gameColors), even for teammates.
  const pair = a.team === b.team ? { [a.team]: teamColor(a.team) } : gameColors(a.team, b.team);
  const ca = pair[a.team], cb = a.team === b.team ? "var(--series-2)" : pair[b.team];
  const stats = pizzaStats(a.pos);
  const fr = frame(1200, 1500, { noHeader: true });
  const { pad, w } = fr;
  let s = mark(w / 2 - 23 * MARK_ASPECT, pad - 6, 46);
  s += T(w / 2, 136, `Back to back · ${DATA.season} through Week ${thru(a.team, b.team)} · PPR`.toUpperCase(), { size: 17, weight: 750, anchor: "middle", fill: "var(--accent-text)", ls: 1.8 });
  [[a, ca, true], [b, cb, false]].forEach(([p, color, left]) => {
    const cx = left ? pad + 76 : w - pad - 76;
    s += face(p.id, cx, 238, 70, color, p.name);
    const tx = left ? pad + 166 : w - pad - 166;
    const nm = fitSize(p.name, 300, [32, 28, 25], 800);
    s += T(tx, 230, nm.text, { size: nm.size, weight: 800, anchor: left ? "start" : "end" });
    s += T(tx, 264, `${p.pos} · ${TEAMS[p.team]?.name || p.team}`, { size: 19, anchor: left ? "start" : "end", fill: "var(--muted)" });
    s += T(tx, 292, `${p.season.games_played} games · ${num(p.season.fantasy_ppg, 1)} PPG`, { size: 17, anchor: left ? "start" : "end", fill: "var(--faint)" });
  });
  s += T(w / 2, 250, "vs", { size: 26, weight: 700, anchor: "middle", fill: "var(--faint)" });
  // Who has the better percentile on how many stats, in each player's colour.
  const wins = [a, b].map((p, i) => stats.filter((st) => {
    const mine = p.pct[st.id], theirs = (i ? a : b).pct[st.id];
    return mine != null && theirs != null && mine > theirs;
  }).length);
  const line = `<tspan fill="var(--muted)">Better percentile on </tspan><tspan fill="${teamText(ca)}" font-weight="800">${wins[0]}</tspan><tspan fill="var(--muted)"> of ${stats.length} for ${esc(lastName(a.name))}, </tspan>`
    + `<tspan fill="${teamText(cb)}" font-weight="800">${wins[1]}</tspan><tspan fill="var(--muted)"> for ${esc(lastName(b.name))}</tspan>`;
  s += `<text x="${w / 2}" y="378" font-size="22" font-weight="600" text-anchor="middle">${line}</text>`;
  const notes = [a, b].map(asIfNote).filter(Boolean);
  const keyY = fr.bottom - 46 - notes.length * 24;
  const top = 410, bottom = keyY - 24;
  const radius = Math.min(340, (bottom - top) / 2 - 40);
  s += pizzaMirror(w / 2, (top + bottom) / 2 + 10, radius, stats, [
    { color: ca, pct: a.pct, val: a.season, asif: a.asif },
    { color: cb, pct: b.pct, val: b.season, asif: b.asif },
  ], { k: 1.7 });
  s += T(pad, keyY + 16, fit(`Percentile among qualified ${posWord(a.pos)} (${minimumText(a)}). The same stats on both halves, mirrored.`, w - pad * 2, 17), { size: 17, fill: "var(--faint)" });
  notes.forEach((nt, i) => { s += T(pad, keyY + 42 + i * 24, fit(nt, w - pad * 2, 16), { size: 16, fill: "var(--muted)" }); });
  return wrapCard(fr, s);
}
