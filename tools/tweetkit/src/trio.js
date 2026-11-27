// D27 to D29: one to three players at one position (November 2026), the tweet versions of
// Player Comparison's three profile cards (frontend/src/components/compare/CompareProfiles.jsx):
// pizzas side by side, one radar, and percentile strips. The card's player is the first;
// "Second player" and "Third player" pick the others, and None drops one.
//
// Each player draws in a team colour, and a team whose colour sits too close to one already
// used (two blue teams) takes its second colour, then a series colour.

const NONE_OPTION = { id: "", name: "None", team: "" };
const samePosition = (pid) => Object.values(DATA.players).filter((o) => o.pos === DATA.players[pid].pos && o.id !== pid)
  .sort((a, b) => b.season.fantasy_points - a.season.fantasy_points);
/** The nearest player by points to `pid` who is not already on the card. */
function defaultThird(pid, taken) {
  const same = Object.values(DATA.players).filter((o) => o.pos === DATA.players[pid].pos).sort((a, b) => b.season.fantasy_points - a.season.fantasy_points);
  const at = same.findIndex((o) => o.id === pid);
  const free = same.map((o, i) => ({ o, d: Math.abs(i - at) })).filter(({ o }) => o.id !== pid && !taken.includes(o.id)).sort((a, b) => a.d - b.d);
  return free[0]?.o.id ?? "";
}
const TRIO_CONTROLS = [
  { key: "vs", type: "player", label: "Second player", pool: (pid) => [NONE_OPTION, ...samePosition(pid)], defaults: (pid) => defaultRival(pid) ?? "" },
  { key: "vs2", type: "player", label: "Third player", pool: (pid, o) => [NONE_OPTION, ...samePosition(pid).filter((p) => p.id !== o.vs)], defaults: (pid, o) => defaultThird(pid, [o.vs]) },
];
/** The card's players: the subject, then whoever the controls name, once each, same position. */
function trioPeople(pid, opts) {
  const pos = DATA.players[pid].pos;
  return [pid, opts.vs, opts.vs2].filter((id, i, all) => id && DATA.players[id]?.pos === pos && all.indexOf(id) === i).map((id) => DATA.players[id]);
}
/** A colour per player: the team's own, its second when too close to one already used, then a series colour. */
function trioColors(people) {
  const used = [];
  return people.map((p, i) => {
    const t = TEAMS[p.team];
    const main = parseHex(t?.color), second = parseHex(t?.color2);
    const options = [preferred(main, second), second && lighten(second), main && lighten(main)].filter(Boolean);
    const pick = options.find((c) => used.every((u) => hueGap(u, c) >= 40));
    if (pick) { used.push(pick); return toHex(pick); }
    return `var(--series-${i + 1})`;
  });
}
const trioTitle = (people) => (people.length === 1 ? people[0].name : people.map((p) => lastName(p.name)).join(" vs "));
function trioFrame(people, w, h, what) {
  const p = people[0];
  return frame(w, h, {
    kicker: `${p.pos} ${what} · ${DATA.season} through Week ${thru(...people.map((x) => x.team))} · PPR`,
    title: trioTitle(people),
    subtitle: `Percentiles among qualified ${posWord(p.pos)} (${minimumText(p)})`,
  });
}
/** Each player's line under the card when a percentile is ranked as if qualified. */
const trioNotes = (fr, people, y) => people.map(asIfNote).filter(Boolean)
  .map((note, i) => T(fr.pad, y + i * 22, fit(note, fr.w - fr.pad * 2, 15), { size: 15, fill: "var(--muted)" })).join("");

// D27 ----------------------------------------------------------- Percentile pizzas
function cardTrioPizzas(pid, opts = {}) {
  const people = trioPeople(pid, opts);
  const colors = trioColors(people);
  const stats = pizzaStats(people[0].pos);
  const fr = trioFrame(people, 1600, 900, "percentile pizzas");
  const { pad, w } = fr;
  let s = "";
  // The category chips sit at the right end of the subheading's line.
  let x = w - pad;
  [...pizzaCats(stats)].reverse().forEach(([cat, color]) => {
    const chip = pill(cat, x, fr.top - 46, { tone: color, size: 18, weight: 700, anchor: "end" });
    s += chip.svg;
    x -= chip.w + 10;
  });
  const notes = people.filter((p) => asIfNote(p)).length;
  const bottom = fr.bottom - notes * 22;
  const top = fr.top - 4;
  const n = people.length;
  // The outer labels may use the side margins.
  const edge = 24;
  const slot = (w - edge * 2) / n;
  const k = n === 3 ? 1.05 : 1.25;
  const gap = 22;
  // Above and below the rim: the gap, two label lines and the number.
  const reach = gap * k + 12 * k * 1.15 * 2 + 12 * k;
  // The labels beside the rim limit the radius across; the names and the labels limit it down.
  const radius = Math.min(slot / 2 - gap * k - 78 * k, (bottom - top - 60) / 2 - reach);
  const groupH = 60 + 2 * (radius + reach);
  const groupTop = top + (bottom - top - groupH) / 2;
  people.forEach((p, i) => {
    const cx = edge + slot * (i + 0.5);
    s += T(cx, groupTop + 22, p.name, { size: 26, weight: 800, anchor: "middle", fill: teamText(colors[i]) });
    s += T(cx, groupTop + 48, `${p.team} · ${p.season.games_played} games · ${num(p.season.fantasy_ppg, 1)} PPG`, { size: 17, anchor: "middle", fill: "var(--muted)" });
    const cy = groupTop + 60 + reach + radius;
    s += pizzaRose(cx, cy, radius, stats, { pct: p.pct, val: p.season, asif: p.asif },
      { r0: radius * 0.3, k, labelGap: gap, face: { pid: p.id, ring: colors[i], name: p.name } });
  });
  s += trioNotes(fr, people, bottom + 18);
  return wrapCard(fr, s);
}

// D28 ------------------------------------------------------------ Percentile radar
function cardTrioRadar(pid, opts = {}) {
  const people = trioPeople(pid, opts);
  const colors = trioColors(people);
  const stats = radarStats(people[0].pos);
  const fr = trioFrame(people, 1600, 900, "percentile radar");
  const { pad, w } = fr;
  const notes = people.filter((p) => asIfNote(p)).length;
  const bottom = fr.bottom - notes * 22;
  const cy = (fr.top + bottom) / 2 + 10;
  const radius = Math.min(196, (bottom - fr.top) / 2 - 78);
  let s = radar(pad + 500, cy, radius, stats, people.map((p, i) => ({ color: colors[i], pct: p.pct, val: p.season, asif: p.asif })));
  // Beside it, a card per player: who, and how many of the radar's stats they have the best percentile on.
  const shown = stats.filter((st) => people.every((p) => p.pct[st.id] != null));
  const best = people.map((p) => shown.filter((st) => people.every((o) => o === p || (p.pct[st.id] ?? -1) > (o.pct[st.id] ?? -1))).length);
  const x0 = 1080, x1 = w - pad, cardH = Math.min(150, (bottom - fr.top) / Math.max(people.length, 2) - 16);
  const y0 = (fr.top + bottom) / 2 - (people.length * (cardH + 16) - 16) / 2;
  people.forEach((p, i) => {
    const y = y0 + i * (cardH + 16);
    s += R(x0, y, x1 - x0, cardH, { rx: 18, fill: mix(colors[i], 12), stroke: mix(colors[i], 45), sw: 1.5 });
    s += R(x0, y, 8, cardH, { rx: 4, fill: colors[i] });
    s += face(p.id, x0 + 70, y + cardH / 2, Math.min(46, cardH / 2 - 14), colors[i], p.name);
    const nm = fitSize(p.name, x1 - x0 - 150, [28, 25, 22], 800);
    s += T(x0 + 134, y + cardH / 2 - 16, nm.text, { size: nm.size, weight: 800 });
    s += T(x0 + 134, y + cardH / 2 + 12, fit(`${p.team} · ${p.season.games_played} games · ${num(p.season.fantasy_ppg, 1)} PPG`, x1 - x0 - 150, 17), { size: 17, fill: "var(--muted)" });
    if (people.length > 1) s += T(x0 + 134, y + cardH / 2 + 38, `Best percentile on ${best[i]} of ${shown.length}`, { size: 17, weight: 700, fill: teamText(colors[i]) });
  });
  s += trioNotes(fr, people, bottom + 18);
  return wrapCard(fr, s);
}

// D29 ----------------------------------------------------------- Percentile strips
// Portrait, so each row has the height to spread faces that land on the same percentile.
function cardTrioStrips(pid, opts = {}) {
  const people = trioPeople(pid, opts);
  const colors = trioColors(people);
  const stats = radarStats(people[0].pos).filter((st) => people.some((p) => p.pct[st.id] != null));
  const fr = trioFrame(people, 1200, 1500, "percentile strips");
  const { pad, w } = fr;
  const notes = people.filter((p) => asIfNote(p)).length;
  const bottom = fr.bottom - notes * 22;
  // The players as a key along the top, each face ringed in the colour it draws in.
  let s = "";
  let kx = pad;
  people.forEach((p, i) => {
    s += face(p.id, kx + 18, fr.top + 6, 18, colors[i], p.name);
    s += T(kx + 44, fr.top + 13, p.name, { size: 21, weight: 750, fill: teamText(colors[i]) });
    kx += 44 + textWidth(p.name, 21, 750) + 34;
  });
  const top = fr.top + 70;
  const x0 = pad + 200, x1 = w - pad - 300;
  const X = lin(0, 100, x0, x1);
  const rowH = Math.min(124, (bottom - top) / stats.length);
  [0, 25, 50, 75, 100].forEach((t) => {
    s += L(X(t), top - 8, X(t), top + stats.length * rowH, { stroke: "var(--divider)", sw: 1.5 });
    s += T(X(t), top - 16, t, { size: 16, anchor: "middle", mono: true, fill: "var(--faint)" });
  });
  if (people.length > 1) s += T(w - pad, top - 16, "BEST IN BOLD", { size: 14, weight: 750, anchor: "end", fill: "var(--faint)", ls: 1.4 });
  const r = Math.min(21, rowH / 2 - 16);
  const lane = Math.min(2 * r - 2, rowH / 2 - r - 4);
  stats.forEach((st, i) => {
    const cy = top + i * rowH + rowH / 2;
    if (i % 2 === 0) s += R(pad - 10, cy - rowH / 2 + 3, w - pad * 2 + 20, rowH - 6, { rx: 14, fill: "var(--panel)" });
    s += T(pad + 6, cy + 8, st.label, { size: 22, weight: 650 });
    s += L(X(0), cy, X(100), cy, { stroke: "var(--rule)", sw: 6, cap: "round" });
    const placed = people.map((p, j) => ({ p, j, pc: p.pct[st.id] })).filter((d) => d.pc != null).map((d) => ({ ...d, px: X(d.pc), dy: 0 })).sort((a, b) => a.px - b.px);
    // Each face takes the lane (on the track, above, below) furthest from the faces already placed.
    placed.forEach((d, at) => {
      const room = (dy) => Math.min(Infinity, ...placed.slice(0, at).map((o) => Math.hypot(o.px - d.px, o.dy - dy)));
      d.dy = [0, -lane, lane].reduce((bestDy, dy) => (room(dy) >= 2 * r || room(bestDy) >= 2 * r ? (room(bestDy) >= 2 * r ? bestDy : dy) : room(dy) > room(bestDy) ? dy : bestDy), 0);
    });
    placed.forEach((d) => {
      s += face(d.p.id, d.px, cy + d.dy, r, colors[d.j], d.p.name);
      if (d.p.asif?.includes(st.id)) s += C(d.px, cy + d.dy, r + 5, { stroke: colors[d.j], sw: 2, dash: "4 3" });
    });
    // The numbers at the end of the row, each in its colour, the best percentile bold.
    const ranked = [...placed].sort((a, b) => b.pc - a.pc);
    const leader = ranked.length > 1 && ranked[0].pc !== ranked[1].pc ? ranked[0].j : -1;
    const parts = people.map((p, j) => {
      const v = p.season[st.id];
      return `<tspan fill="${teamText(colors[j])}" font-weight="${leader === j ? 800 : 500}">${esc(v == null ? "-" : st.f(v))}</tspan>`;
    }).join(`<tspan fill="var(--faint)" font-weight="400"> · </tspan>`);
    s += `<text x="${w - pad}" y="${num(cy + 8, 1)}" font-size="21" font-family="${MONO}" text-anchor="end">${parts}</text>`;
  });
  s += trioNotes(fr, people, bottom + 18);
  return wrapCard(fr, s);
}
