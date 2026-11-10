// D11 to D24: the player page's visuals (November 2026), as reply cards. Each mirrors a
// panel on the site's six-tab player page (frontend/src/components/player/page/*), with the
// same stats, lines and colours, so a tweet and the page agree about the same player.

// ------------------------------------------------------------- game stats
// The game chart's stats (GAME_STATS in frontend/src/constants/playerTabs.js). Each is one
// game's parts, summed before dividing, so a window's value is Σyards / Σroutes.
const ratioOf = (numer, denom) => (g) => {
  const a = numer(g), b = denom(g);
  return a == null || b == null || !(b > 0) ? null : [a, b];
};
const sumOf = (...keys) => (g) => keys.reduce((total, key) => total + (g[key] ?? 0), 0);
function passerRating([completions, attempts, yards, tdsThrown, ints]) {
  if (!(attempts > 0)) return null;
  const clamp = (v) => Math.max(0, Math.min(2.375, v));
  return ((clamp((completions / attempts - 0.3) * 5) + clamp((yards / attempts - 3) * 0.25)
    + clamp((tdsThrown / attempts) * 20) + clamp(2.375 - (ints / attempts) * 25)) / 6) * 100;
}
const GSTAT = {
  ppg: { label: "Points per game", pill: "PPG", metric: "fantasy_ppg", format: 1, parts: (g) => (g.fantasy_points == null ? null : [g.fantasy_points, 1]), axis: [0, 40], ticks: [0, 10, 20, 30, 40] },
  epa: { label: "EPA per play", pill: "EPA / play", metric: "epa_per_play", format: 2, signed: true, parts: ratioOf((g) => g.epa, sumOf("attempts", "carries", "targets")) },
  yprr: { label: "Yards per route run", pill: "YPRR", metric: "yards_per_route_run", format: 2, parts: ratioOf((g) => (g.routes_run ? g.receiving_yards ?? 0 : null), (g) => g.routes_run), axis: [0, 6], ticks: [0, 1, 2, 3, 4, 5, 6] },
  tprr: { label: "Targets per route run", pill: "TPRR", metric: "targets_per_route_run", format: "pct0", parts: ratioOf((g) => (g.routes_run ? g.targets ?? 0 : null), (g) => g.routes_run), axis: [0.05, 0.5], ticks: [0.05, 0.2, 0.35, 0.5] },
  rush: { label: "Rush share", pill: "Rush share", metric: "rush_attempt_share", format: "pct0", parts: (g) => (g.rush_attempt_share == null ? null : [g.rush_attempt_share, 1]), axis: [0, 1], ticks: [0, 0.25, 0.5, 0.75, 1] },
  yac: { label: "Yards after contact per carry", pill: "YAC / att", metric: "rush_yac_per_att", format: 2, parts: ratioOf((g) => g.rush_yards_after_contact, (g) => (g.rush_yards_after_contact == null ? null : g.carries)), axis: [0, 5], ticks: [0, 1, 2, 3, 4, 5] },
  cpoe: { label: "CPOE", pill: "CPOE", metric: "cpoe", format: 1, signed: true, parts: (g) => (g.cpoe == null || !g.attempts ? null : [g.cpoe * g.attempts, g.attempts]), axis: [-20, 20], ticks: [-20, -10, 0, 10, 20] },
  adot: { label: "Average depth of target", pill: "aDOT", metric: "pass_adot", format: 1, parts: (g) => (g.pass_adot == null || !g.attempts ? null : [g.pass_adot * g.attempts, g.attempts]), axis: [4, 15], ticks: [4, 6, 8, 10, 12, 14] },
  rate: { label: "Passer rating", pill: "Passer rating", metric: "passer_rating", format: 1, combine: passerRating, axis: [0, 160], ticks: [0, 40, 80, 120, 160],
    parts: (g) => (g.attempts > 0 ? [g.completions ?? 0, g.attempts, g.passing_yards ?? 0, g.passing_tds ?? 0, g.interceptions ?? 0] : null) },
};
const EPA_AXIS = {
  WR: { axis: [-1, 1.5], ticks: [-1, -0.5, 0, 0.5, 1, 1.5] }, TE: { axis: [-1, 1.5], ticks: [-1, -0.5, 0, 0.5, 1, 1.5] },
  RB: { axis: [-0.8, 0.8], ticks: [-0.8, -0.4, 0, 0.4, 0.8] }, QB: { axis: [-0.8, 0.8], ticks: [-0.8, -0.4, 0, 0.4, 0.8] },
};
const GAME_CHART = {
  WR: { stats: ["ppg", "epa", "yprr", "tprr"], rank: 24, lines: { ppg: "rank", epa: "avg", yprr: "rank", tprr: "rank" } },
  TE: { stats: ["ppg", "epa", "yprr", "tprr"], rank: 12, lines: { ppg: "rank", epa: "avg", yprr: "rank", tprr: "rank" } },
  RB: { stats: ["ppg", "epa", "tprr", "rush", "yac"], rank: 18, lines: { ppg: "rank", epa: "avg", tprr: "rank", rush: "rank", yac: "avg" } },
  QB: { stats: ["ppg", "epa", "cpoe", "adot", "rate"], rank: 12, lines: { ppg: "rank", epa: "avg", cpoe: "avg", adot: "avg", rate: "avg" } },
};
const gameStat = (pos, key) => (key === "epa" ? { ...GSTAT.epa, ...EPA_AXIS[pos] } : GSTAT[key] ?? GSTAT.ppg);
const gameValue = (stat, g) => { const parts = stat.parts(g); return parts ? (stat.combine ? stat.combine(parts) : parts[0] / parts[1]) : null; };
function combineGames(stat, games, weights) {
  let acc = null;
  games.forEach((g, i) => {
    const parts = stat.parts(g);
    if (!parts) return;
    const wt = weights ? weights[i] : 1;
    acc = acc ? acc.map((v, k) => v + wt * parts[k]) : parts.map((v) => wt * v);
  });
  if (!acc) return null;
  return stat.combine ? stat.combine(acc) : acc[1] ? acc[0] / acc[1] : null;
}
function gsFmt(stat, v) {
  if (v == null || Number.isNaN(v)) return "-";
  if (stat.format === "pct0") return `${Math.round(v * 100)}%`;
  const text = Math.abs(v).toFixed(stat.format);
  return stat.signed ? (v > 0 ? `+${text}` : v < 0 ? `−${text}` : text) : v < 0 ? `−${text}` : text;
}
const lineName = (pos, kind, rank, short = false) => (kind === "rank" ? `${pos}${rank}` : short ? `${pos} avg` : `${pos} average`);
/** The dashed line a stat's games hang from in a season: the Nth best season or the average. */
function refLine(pos, season, statKey) {
  const cfg = GAME_CHART[pos], stat = gameStat(pos, statKey);
  const pair = DATA.pos_lines[pos]?.[season]?.[stat.metric];
  return pair ? pair[cfg.lines[statKey] === "rank" ? 1 : 0] : null;
}
/** Every career game as an object with the arc's parts. */
function careerGames(p) {
  const keys = DATA.arc_keys[p.pos];
  return (p.arc || []).map((row) => { const g = { season: row[0], week: row[1] }; keys.forEach((k, i) => { g[k] = row[i + 2]; }); return g; });
}
const statOptions = (pid) => GAME_CHART[posOf(pid)].stats.map((key) => [key, gameStat(posOf(pid), key).label]);
const statControl = { key: "stat", type: "select", label: "Stat", options: (pid) => statOptions(pid), defaults: () => "ppg" };

/** A smooth line through points (Catmull-Rom as cubic Béziers), as the site draws it. */
function smoothPath(points) {
  if (!points.length) return "";
  const f = (v) => v.toFixed(1);
  if (points.length === 1) return `M${f(points[0][0])},${f(points[0][1])}`;
  let d = `M${f(points[0][0])},${f(points[0][1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}
const clampTo = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** A heat-grid cell: the percentile's colour, stronger the further from the middle (the site's heatFill). */
const heatFill = (pc) => (pc == null ? mix("var(--fg)", 4) : mix(pctColor(pc), Math.round(12 + pc * 0.32)));
const ppFrame = (p, w, h, kicker, title, subtitle) => frame(w, h, { kicker, title, subtitle, headshot: { pid: p.id, name: p.name, ring: teamColor(p.team) } });
const emptyBody = (fr, text) => T(fr.w / 2, (fr.top + fr.bottom) / 2, text, { size: 26, weight: 600, anchor: "middle", fill: "var(--muted)" });
const posWord = (pos) => POS_NAME[pos] || "players";
/** His career rows, oldest season first. */
const careerRows = (p) => [...(p.career || [])].sort((a, b) => a.season - b.season);

// ------------------------------------------------------------- radar stats
// RADAR_STATS (playerTabs.js), with the format each value prints in.
const RADAR_DEF = {
  WR: [["fantasy_ppg", "PPG", n1], ["receiving_epa", "Rec EPA", s1], ["target_share", "Target share", p0], ["red_zone_targets", "RZ targets", n0],
    ["yards_per_route_run", "YPRR", n2], ["targets_per_route_run", "TPRR", p0], ["fantasy_points_per_route_run", "FP / route", n2], ["adot", "aDOT", n1], ["air_yards_share", "Air yard share", p0]],
  RB: [["fantasy_ppg", "PPG", n1], ["rushing_epa", "Rush EPA", s1], ["ngs_rush_yards_over_expected_per_att", "RYOE / att", s2], ["rush_yac_per_att", "YAC / att", n2],
    ["rush_attempt_share", "Rush share", p0], ["target_share", "Target share", p0], ["opportunity_share", "Opp share", p0], ["rush_att_inside_5", "Carries inside 5", n0],
    ["targets_per_route_run", "TPRR", p0], ["route_participation", "Route share", p0]],
  QB: [["fantasy_ppg", "PPG", n1], ["epa_per_play", "EPA / play", s2], ["epa", "EPA", s1], ["cpoe", "CPOE", s1], ["yards_per_attempt", "Y/A", n1],
    ["yards_per_completion", "Y/C", n1], ["pass_td_rate", "TD%", p1], ["interception_rate", "INT%", p1], ["ngs_pass_intended_air_yards", "aDOT", n1]],
};
RADAR_DEF.TE = RADAR_DEF.WR;
const radarStats = (pos) => RADAR_DEF[pos].map(([id, label, f]) => ({ id, label, f }));

/**
 * A percentile radar. One player: a bubble at each point holding his percentile, coloured
 * red to green, his number under each label. Two: two translucent shapes, both percentiles
 * under each label. people: [{color, pct: {id: percentile}, val: {id: value}}].
 */
function radar(cx, cy, radius, stats, people, o = {}) {
  const shown = stats.filter((st) => people.every((pp) => pp.pct[st.id] != null));
  if (shown.length < 3) return T(cx, cy, "Not enough ranked stats for a profile", { size: 22, anchor: "middle", fill: "var(--muted)" });
  const n = shown.length, pair = people.length > 1;
  const pt = (i, v) => { const a = (Math.PI * 2 * i) / n - Math.PI / 2; return [cx + Math.cos(a) * radius * (v / 100), cy + Math.sin(a) * radius * (v / 100)]; };
  const ring = (v) => shown.map((_, i) => pt(i, v).map((c) => c.toFixed(1)).join(",")).join(" ");
  const ls = o.labelSize ?? 19;
  let s = "";
  for (const v of [25, 50, 75, 100]) s += `<polygon points="${ring(v)}" fill="${v === 100 ? mix("var(--fg)", 2) : "none"}" stroke="var(--divider)" stroke-width="1.5"/>`;
  s += T(cx + 8, pt(0, 50)[1] + 18, "50", { size: 14, mono: true, fill: "var(--faint)" });
  shown.forEach((st, i) => {
    const [ex, ey] = pt(i, 100), [lx, ly] = pt(i, 121);
    const anchor = Math.abs(lx - cx) < 14 ? "middle" : lx > cx ? "start" : "end";
    const base = ly < cy - radius * 0.6 ? ly - (pair ? 22 : 14) : ly + 4;
    s += L(cx, cy, ex, ey, { stroke: "var(--divider)", sw: 1.5 });
    s += T(lx, base, st.label, { size: ls, weight: 700, anchor });
    if (pair) {
      const parts = people.map((pp) => `<tspan fill="${pp.color}" font-weight="800">${pp.pct[st.id]}</tspan>`).join(`<tspan fill="var(--faint)" font-weight="400"> · </tspan>`);
      s += `<text x="${num(lx, 1)}" y="${num(base + ls + 2, 1)}" font-size="${ls - 1}" font-family="${MONO}" text-anchor="${anchor}">${parts}</text>`;
    } else {
      const v = people[0].val[st.id];
      s += T(lx, base + ls + 1, v == null ? "-" : st.f(v), { size: ls - 2, anchor, mono: true, fill: "var(--muted)" });
    }
  });
  [...people].reverse().forEach((pp) => {
    s += `<polygon points="${shown.map((st, i) => pt(i, pp.pct[st.id]).map((c) => c.toFixed(1)).join(",")).join(" ")}" fill="${pp.color}" fill-opacity="${pair ? 0.16 : 0.2}" stroke="${pp.color}" stroke-width="3.5" stroke-linejoin="round"/>`;
  });
  const br = o.bubble ?? 17;
  [...people].reverse().forEach((pp) => shown.forEach((st, i) => {
    const pc = pp.pct[st.id];
    const [px, py] = pt(i, pc);
    if (pair) s += C(px, py, 6, { fill: pp.color, stroke: "var(--card)", sw: 2 });
    else s += C(px, py, br, { fill: pctColor(pc), stroke: "var(--card)", sw: 3 }) + T(px, py + br * 0.36, pc, { size: br * 0.86, weight: 800, anchor: "middle", mono: true, fill: "#06110b" });
  }));
  return s;
}
/** A season row's radar values and percentiles as {id: value}, from the career arrays. */
function radarOf(p, row) {
  const keys = DATA.radar_keys[p.pos];
  const val = {}, pc = {};
  keys.forEach((k, i) => { val[k] = row.rv?.[i] ?? null; pc[k] = row.rp?.[i] ?? null; });
  return { val, pct: pc };
}

/** A percentile row as D1 draws it: label, value, then the bar with its bubble. */
function pctRow(s0, x0, x1, cy, rowH, label, value, pc, i, o = {}) {
  let s = s0;
  const bx0 = o.bx0, bx1 = x1 - 22;
  if (i % 2 === 0) s += R(x0 - 10, cy - rowH / 2 + 2, x1 - x0 + 20, rowH - 4, { rx: 12, fill: "var(--panel)" });
  const lb = fitSize(label, bx0 - x0 - 110, [o.size ?? 19, 17, 15], 600);
  s += T(x0, cy + 6, lb.text, { size: lb.size, weight: 600, fill: "var(--muted)" });
  s += T(bx0 - 24, cy + 7, value, { size: (o.size ?? 19) + 1, weight: 800, anchor: "end", mono: true });
  s += L(bx0, cy, bx1, cy, { stroke: "var(--rule)", sw: 7, cap: "round" });
  if (pc != null) {
    const bx = lin(0, 100, bx0, bx1)(pc), color = pctColor(pc), r = Math.min(17, rowH / 2 - 2);
    s += L(bx0, cy, bx, cy, { stroke: color, sw: 7, cap: "round" }) + C(bx, cy, r, { fill: mix(color, 30, "var(--card)"), stroke: color, sw: 3 }) + T(bx, cy + r * 0.38, pc, { size: r * 0.95, weight: 800, anchor: "middle", mono: true });
  } else s += T(bx1, cy + 6, "Not ranked", { size: 15, anchor: "end", fill: "var(--faint)" });
  return s;
}

// ------------------------------------------------------------- role
// ROLE_RULES (playerTabs.js): what his job is, from his share of the team's work.
function roleOf(pos, row) {
  const pc = (v) => `${Math.round((v ?? 0) * 100)}%`;
  if (pos === "QB") {
    const rushing = 0.1 * (row.rushing_yards ?? 0) + 6 * (row.rushing_tds ?? 0);
    const share = row.fantasy_points ? rushing / row.fantasy_points : 0;
    return [share >= 0.2 ? "Dual threat" : "Pocket passer", `${pc(share)} of points from running`];
  }
  if (pos === "RB") {
    const rush = row.rush_attempt_share ?? 0, routes = row.route_participation;
    if (rush >= 0.4 && (routes ?? 0) >= 0.5) return ["Three-down back", `${pc(rush)} of the carries, on ${pc(routes)} of the routes`];
    if (rush >= 0.4) return ["Early-down back", `${pc(rush)} of the carries, on ${pc(routes)} of the routes`];
    if ((routes ?? 0) >= 0.45) return ["Passing-down back", `on ${pc(routes)} of the routes, ${pc(rush)} of the carries`];
    return ["Committee back", `${pc(rush)} of the carries`];
  }
  const share = row.target_share ?? 0, routes = row.route_participation ?? 0;
  if (share >= 0.25 && routes >= 0.8) return ["Alpha", `${pc(share)} of the targets on ${pc(routes)} of the routes`];
  if (routes >= 0.8) return ["Every-down starter", `on ${pc(routes)} of the routes`];
  if (routes >= 0.55) return ["Rotational", `on ${pc(routes)} of the routes`];
  return ["Part-time", `on ${pc(routes)} of the routes`];
}
const qualifiedCount = (pos) => DATA.sim_pool[pos]?.length ?? 0;

// D11 ---------------------------------------------------- Percentile profile
function cardPercentileProfile(pid) {
  const p = DATA.players[pid];
  const fr = ppFrame(p, 1600, 900, `${DATA.season} · Percentile profile · PPR`, p.name,
    `Through Week ${thru(p.team)}, among ${qualifiedCount(p.pos)} qualified ${posWord(p.pos)}`);
  const { pad, w } = fr;
  const color = teamColor(p.team);
  const [role, why] = roleOf(p.pos, p.season);
  let s = R(pad, fr.top - 6, 560, 104, { rx: 20, fill: mix(color, 20), stroke: mix(color, 45), sw: 1.5 });
  s += T(pad + 22, fr.top + 20, `${DATA.season} ROLE`, { size: 14, weight: 750, fill: "var(--faint)", ls: 1.6 });
  s += T(pad + 22, fr.top + 52, role, { size: 30, weight: 800 });
  s += T(pad + 22, fr.top + 80, fit(why, 516, 18), { size: 18, fill: "var(--muted)" });
  const cy = fr.top + 104 + (fr.bottom - fr.top - 104) / 2 + 8;
  s += radar(pad + 330, cy, 160, radarStats(p.pos), [{ color: "var(--series-1)", pct: p.pct, val: p.season }]);
  // The player card's percentile list beside it (PCT_LIST, D1's rows).
  const list = PCT_LIST[p.pos];
  const x0 = 830, x1 = w - pad;
  s += T(x0, fr.top + 14, `Percentile among ${posWord(p.pos)}`, { size: 21, weight: 750 });
  const rowH = Math.min(42, (fr.bottom - fr.top - 30) / list.length);
  list.forEach((id, i) => {
    const [label, f] = STAT[id];
    const v = p.season[id];
    s = pctRow(s, x0, x1, fr.top + 34 + i * rowH + rowH / 2, rowH, STAT_LABEL[p.pos]?.[id] ?? label, v == null ? "-" : f(v), p.pct[id], i, { bx0: x0 + 400, size: rowH < 38 ? 17 : 18 });
  });
  return wrapCard(fr, s);
}

// D12 --------------------------------------------------------- Game chart
/** Each game's x, its value, and the rolling value through it (to date, or the last `win`). */
function rollGames(games, stat, win) {
  const out = [], seen = [];
  for (const g of games) {
    if (stat.parts(g)) seen.push(g);
    const window = win === Infinity ? seen : seen.slice(-win);
    if (!window.length) continue;
    out.push({ x: g.week, v: combineGames(stat, window), gv: gameValue(stat, g), g });
  }
  return out;
}
function cardGameChart(pid, opts = {}) {
  const p = DATA.players[pid];
  const cfg = GAME_CHART[p.pos];
  const key = cfg.stats.includes(opts.stat) ? opts.stat : "ppg";
  const stat = gameStat(p.pos, key);
  const kind = cfg.lines[key];
  const l3 = opts.line === "l3";
  const ref = refLine(p.pos, DATA.season, key);
  const refName = lineName(p.pos, kind, cfg.rank);
  const fr = ppFrame(p, 1600, 900, `${DATA.season} · Game by game${key === "ppg" ? " · PPR" : ""}`, `${p.name}: ${lowerFirst(stat.label)}`,
    `Every game hanging from the ${refName}. The line is ${l3 ? "the average over the last three games" : "the average to date"}`);
  const { pad, w } = fr;
  const last = thru(p.team);
  const games = [...p.log].sort((a, b) => a.week - b.week);
  const points = rollGames(games, stat, l3 ? 3 : Infinity);
  if (!points.length) return wrapCard(fr, emptyBody(fr, `No games with ${lowerFirst(stat.label)} this season`));
  const byes = DATA.byes[p.team] || [];
  const played = new Set(games.map((g) => g.week));
  const missed = [];
  for (let wk = 1; wk <= last; wk++) {
    if (played.has(wk) || byes.includes(wk)) continue;
    const before = points.filter((pt) => pt.x < wk).pop() ?? points[0];
    missed.push({ x: wk, v: before.v });
  }
  const px0 = pad + 70, px1 = w - pad - 150, py0 = fr.top + 50, py1 = fr.bottom - 44;
  const x = lin(0.5, last + 0.5, px0, px1);
  const [d0, d1] = stat.axis;
  const y = lin(d0, d1, py1, py0);
  const yc = (v) => clampTo(y(v), py0, py1);
  const F = (v) => gsFmt(stat, v);
  const series = "var(--series-1)";
  let s = legendRow(pad, fr.top + 6, [
    [(cx, cy) => L(cx - 12, cy, cx + 12, cy, { stroke: series, sw: 5, cap: "round" }), l3 ? "Last 3 games" : "Season to date"],
    [(cx, cy) => L(cx, cy + 10, cx, cy - 4, { stroke: "var(--muted)", sw: 2 }) + C(cx, cy - 6, 6, { fill: "var(--muted)" }), "One game"],
    [(cx, cy) => L(cx - 12, cy, cx + 12, cy, { stroke: "var(--muted)", sw: 2, dash: "7 5" }), `${refName} this season`],
  ], 19).svg;
  for (const t of stat.ticks) s += L(px0, y(t), px1, y(t)) + T(px0 - 14, y(t) + 6, F(t).replace(/\.0+$/, ""), { size: 18, anchor: "end", mono: true, fill: "var(--faint)" });
  if (d0 < 0 && d1 > 0) s += L(px0, y(0), px1, y(0), { stroke: "var(--plot-rule)", sw: 1.5 });
  for (let wk = 1; wk <= last; wk++) s += T(x(wk), py1 + 32, byes.includes(wk) ? "Bye" : `W${wk}`, { size: 18, weight: 700, anchor: "middle", fill: "var(--faint)" });
  if (ref != null) s += L(px0, yc(ref), px1, yc(ref), { stroke: "var(--muted)", sw: 2, dash: "9 6", opacity: 0.85 }) + T(px1 + 14, yc(ref) + 6, `${lineName(p.pos, kind, cfg.rank, true)} ${F(ref)}`, { size: 18, weight: 700, fill: "var(--muted)" });
  const labels = [];
  for (const pt of points) {
    if (pt.gv == null) continue;
    const cx = x(pt.x), over = pt.gv > d1 ? 1 : pt.gv < d0 ? -1 : 0, cy = yc(pt.gv);
    const edge = over > 0 ? py0 - 8 : py1 + 8, size = 9;
    if (ref != null) s += L(cx, yc(ref), cx, over ? edge : cy, { stroke: "var(--muted)", sw: 2.2, opacity: over ? 0.75 : 0.5 });
    if (over) s += `<path d="M${num(cx - size, 1)},${num(edge + over * size * 1.4, 1)}L${num(cx + size, 1)},${num(edge + over * size * 1.4, 1)}L${num(cx, 1)},${num(edge, 1)}Z" fill="var(--muted)"/>`;
    else s += C(cx, cy, 8, { fill: "var(--muted)" });
    // The game's own number, on the side of its dot away from the line.
    const label = F(pt.gv), lw = textWidth(label, 16, 700, true) + 10;
    // Opposite its stem, unless the line runs there; then the other side.
    let up = pt.gv >= (ref ?? -Infinity);
    const lineY = yc(pt.v);
    if (Math.abs((up ? cy - 22 : cy + 22) - lineY) < 20) up = !up;
    const [lx, ly, anchor] = over ? [cx + 16, edge + (over > 0 ? 12 : -2), "start"] : [cx, up ? cy - 16 : cy + 28, "middle"];
    labels.push(R(anchor === "start" ? lx - 5 : lx - lw / 2, ly - 16, lw, 22, { rx: 6, fill: "var(--card)", opacity: 0.86 }) + T(lx, ly, label, { size: 16, weight: 700, anchor, mono: true, fill: "var(--muted)" }));
  }
  s += `<path d="${smoothPath(points.map((pt) => [x(pt.x), yc(pt.v)]))}" fill="none" stroke="${series}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
  for (const m of missed) {
    const cx = x(m.x), cy = yc(m.v);
    s += `<path d="M${num(cx - 9, 1)},${num(cy - 9, 1)}L${num(cx + 9, 1)},${num(cy + 9, 1)}M${num(cx + 9, 1)},${num(cy - 9, 1)}L${num(cx - 9, 1)},${num(cy + 9, 1)}" stroke="var(--fg)" stroke-opacity="0.7" stroke-width="3.5" stroke-linecap="round"/>`;
  }
  s += labels.join("");
  const end = points[points.length - 1];
  s += C(x(end.x), yc(end.v), 10, { fill: series, stroke: "var(--card)", sw: 3 });
  s += T(px1 + 14, yc(end.v) + (ref != null && Math.abs(yc(end.v) - yc(ref)) < 26 ? (yc(end.v) < yc(ref) ? -8 : 22) : 7), `${l3 ? "Last 3" : "Season"} ${F(end.v)}`, { size: 19, weight: 800, fill: series });
  if (missed.length) s += T(px0, fr.bottom + 4, "X: did not play", { size: 16, fill: "var(--faint)" });
  return wrapCard(fr, s);
}

// D13 --------------------------------------------------------- Next game
function cardNextGame(pid) {
  const p = DATA.players[pid];
  const nx = p.next;
  const game = nx && DATA.next_games[nx.g];
  const allows = nx && DATA.allows_pp[`${nx.opp}:${p.pos}`];
  const fr = ppFrame(p, 1600, 900, game ? `Week ${game.week} · Next game · PPR` : "Next game", game ? `${p.name}: what ${nx.opp} allows` : p.name,
    game ? `${p.pos} points ${nx.opp} has allowed in every game, ${p.pos === "WR" ? "with the offense's two most-targeted receivers" : p.pos === "RB" ? "with the offense's most-used back" : p.pos === "QB" ? "with the starting quarterback" : "with the offense's top tight end"} marked` : "");
  if (!game || !allows) return wrapCard(fr, emptyBody(fr, "No game on the schedule"));
  const { pad, w } = fr;
  const mine = nx.home ? game.home : game.away, theirs = nx.home ? game.away : game.home;
  const ko = kickoff(game);
  // The game strip: both teams, kickoff, and the line.
  const sy = fr.top - 8, sh = 86;
  let s = R(pad, sy, w - pad * 2, sh, { rx: 20, fill: "var(--panel)" });
  const side = (abbr, record, x, right) => {
    let out = logo(abbr, right ? x - 60 : x, sy + 13, 60);
    const tx = right ? x - 74 : x + 74;
    out += T(tx, sy + 42, abbr, { size: 28, weight: 800, anchor: right ? "end" : "start" });
    out += T(tx, sy + 68, record || "", { size: 18, mono: true, anchor: right ? "end" : "start", fill: "var(--muted)" });
    return out;
  };
  s += side(mine, nx.home ? game.home_record : game.away_record, pad + 22, false);
  s += side(theirs, nx.home ? game.away_record : game.home_record, pad + 640, true);
  s += T(pad + 331, sy + 40, nx.home ? "vs" : "@", { size: 26, weight: 800, anchor: "middle" });
  s += T(pad + 331, sy + 66, `${ko.day.slice(0, 3)} ${ko.date} · ${ko.time}`, { size: 17, anchor: "middle", fill: "var(--muted)" });
  const spread = game.spread_line == null ? null : nx.home ? game.spread_line : -game.spread_line;
  const lineText = spread == null ? "-" : spread > 0 ? `${mine} -${spread}` : spread < 0 ? `${theirs} -${-spread}` : "Pick'em";
  const imp = nx.home ? game.home_implied : game.away_implied;
  const facts = [["Line", lineText], ["Total", game.total_line == null ? "-" : String(game.total_line)], [`${mine} implied`, implied(imp)], ["Consensus", nx.cons?.label ?? "-"]];
  facts.forEach(([label, value], i) => {
    const cx = w - pad - 100 - (facts.length - 1 - i) * 190;
    s += T(cx, sy + 34, label.toUpperCase(), { size: 14, weight: 750, anchor: "middle", fill: "var(--faint)", ls: 1.4 });
    s += T(cx, sy + 66, value, { size: 26, weight: 800, anchor: "middle", mono: true });
  });
  // What the defense allowed, game by game.
  const games = allows.games;
  const lastWeek = Math.max(...games.map((g) => g[0]));
  const weeks = Array.from({ length: lastWeek }, (_, i) => i + 1);
  const px0 = pad + 56, px1 = w - pad - 210, py0 = sy + sh + 52, py1 = fr.bottom - 56;
  const colW = (px1 - px0) / weeks.length;
  const peak = Math.max(...games.map((g) => Math.max(g[3], ...g[6].map((pl) => pl[2]))), allows.avg ?? 0, p.season.fantasy_ppg ?? 0) * 1.1;
  const tickStep = niceStep(0, peak, 4), top = Math.ceil(peak / tickStep) * tickStep;
  const y = lin(0, top, py1, py0);
  for (let t = 0; t <= top + 1e-9; t += tickStep) s += L(px0, y(t), px1, y(t)) + T(px0 - 12, y(t) + 6, Math.round(t), { size: 17, anchor: "end", mono: true, fill: "var(--faint)" });
  const color = teamColor(nx.opp);
  const barW = Math.min(64, colW * 0.36), faceR = 19;
  const holes = [];
  const cols = weeks.map((wk, i) => {
    const cx = px0 + colW * (i + 0.5);
    const g = games.find((row) => row[0] === wk);
    if (!g) return { wk, cx, g: null };
    const bx = cx - colW * 0.17;
    const order = g[6].map((pl, which) => ({ pl, which, at: y(Math.max(0, pl[2])) })).sort((a, b) => a.at - b.at);
    const gap = faceR * 2 + 22, floor = py1 - faceR - 18;
    order.forEach((e, k) => { e.fy = Math.max(py0 + faceR, Math.min(floor, e.at)); if (k && e.fy - order[k - 1].fy < gap) e.fy = order[k - 1].fy + gap; });
    for (let k = order.length - 1; k >= 0; k--) order[k].fy = Math.min(order[k].fy, k === order.length - 1 ? floor : order[k + 1].fy - gap);
    const fx = bx + barW / 2 + faceR + 8;
    order.forEach((e) => { e.fx = fx; holes.push([fx - faceR - 4, e.fy - faceR - 4, faceR * 2 + 8, faceR * 2 + 26]); });
    const labelAt = y(Math.max(g[3], ...g[6].map((pl) => pl[2]), 0));
    holes.push([bx - 34, labelAt - 30, 68, 24]);
    return { wk, cx, bx, g, faces: order, labelAt };
  });
  const surname = lastName(p.name);
  const lines = [
    { value: allows.avg, stroke: "var(--muted)", dash: "8 6", text: `${nx.opp} average` },
    { value: p.season.fantasy_ppg, stroke: "var(--series-1)", dash: null, text: `${surname}/game` },
  ].filter((ln) => ln.value != null);
  lines.forEach((ln) => { ln.ly = y(ln.value) + 6; });
  if (lines.length === 2 && Math.abs(lines[0].ly - lines[1].ly) < 24) {
    const mid = (lines[0].ly + lines[1].ly) / 2;
    const [up, down] = lines[0].ly <= lines[1].ly ? lines : [lines[1], lines[0]];
    up.ly = mid - 12; down.ly = mid + 12;
  }
  for (const c of cols) {
    if (!c.g) { s += T(c.cx, py1 - 14, "Bye", { size: 17, weight: 700, anchor: "middle", fill: "var(--faint)" }) + T(c.cx, py1 + 30, `W${c.wk}`, { size: 16, weight: 700, anchor: "middle", fill: "var(--faint)" }); continue; }
    const [, offense, offHome, total] = c.g;
    s += R(c.bx - barW / 2, y(total), barW, y(0) - y(total), { rx: 8, fill: mix(color, 24), stroke: mix(color, 55), sw: 1.5 });
    s += logo(offense, c.cx - 15, py1 + 8, 30);
    s += T(c.cx, py1 + 52, `W${c.wk} ${offHome ? "@" : "vs"} ${offense}`, { size: 15, weight: 650, anchor: "middle", fill: "var(--muted)" });
  }
  // The two lines across, with gaps cut where they would cross a face or a number.
  const maskId = nextId("m");
  s += `<mask id="${maskId}" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${fr.h}"><rect x="0" y="0" width="${w}" height="${fr.h}" fill="white"/>${holes.map(([hx, hy, hw, hh]) => R(hx, hy, hw, hh, { rx: 6, fill: "black" })).join("")}</mask>`;
  s += `<g mask="url(#${maskId})">${lines.map((ln) => L(px0, y(ln.value), px1 + 10, y(ln.value), { stroke: ln.stroke, sw: 2.6, dash: ln.dash })).join("")}</g>`;
  for (const ln of lines) s += `<text x="${num(px1 + 18, 1)}" y="${num(ln.ly, 1)}" font-size="18" font-weight="700" fill="${ln.stroke}">${esc(ln.text)} <tspan font-family="${MONO}" font-weight="800">${num(ln.value, 1)}</tspan></text>`;
  for (const c of cols) {
    if (!c.g) continue;
    const ring = teamColor(c.g[1]);
    for (const e of c.faces) s += L(c.bx - barW / 2 + 6, y(Math.max(0, e.pl[2])), c.bx + barW / 2 - 6, y(Math.max(0, e.pl[2])), { stroke: "var(--fg)", sw: 3.5, cap: "round" });
    s += T(c.bx, c.labelAt - 10, num(c.g[3], 1), { size: 18, weight: 800, anchor: "middle", mono: true });
    for (const e of c.faces) {
      s += face(e.pl[0], e.fx, e.fy, faceR, ring, e.pl[1]);
      const label = `${fit(lastName(e.pl[1]), 82, 13, 700)} ${num(e.pl[2], 1)}`;
      s += T(e.fx, e.fy + faceR + 17, label, { size: 13, weight: 700, anchor: "middle", fill: "var(--muted)" });
    }
  }
  return wrapCard(fr, s);
}

// D14, D15 ------------------------------------------------------ Week grids
// USAGE_ROWS and RANKED_ROWS (playerTabs.js). perGame: the season column is a game's average.
const USAGE_GRID = {
  WR: [["snap_share", "Snap %", "pct0"], ["route_participation", "Route %", "pct0"], ["target_share", "Target share", "pct0"], ["air_yards_share", "Air yard share", "pct0"],
    ["targets", "Targets", "int", true], ["air_yards", "Air yards", "int", true], ["adot", "aDOT", 1], ["red_zone_targets", "RZ targets", "int", true], ["wopr", "WOPR", 2]],
  RB: [["snap_share", "Snap %", "pct0"], ["rush_attempt_share", "Rush share", "pct0"], ["target_share", "Target share", "pct0"], ["route_participation", "Route %", "pct0"],
    ["opportunity_share", "Opp share", "pct0"], ["carries", "Carries", "int", true], ["targets", "Targets", "int", true], ["rush_att_inside_10", "Inside 10", "int", true], ["red_zone_targets", "RZ targets", "int", true]],
  QB: [["attempts", "Attempts", "int", true], ["dropbacks", "Dropbacks", "int", true], ["sacks_suffered", "Sacks", "int", true], ["carries", "Carries", "int", true],
    ["rush_attempt_share", "Rush share", "pct0"], ["passing_first_downs", "Pass 1D", "int", true], ["ngs_pass_time_to_throw", "Time to throw", 2], ["ngs_pass_intended_air_yards", "aDOT", 1]],
};
const RANKED_GRID = {
  WR: [["fantasy_points", "Points", 1, true, "fantasy_ppg"], ["targets", "Targets", "int", true], ["target_share", "Target share", "pct0"], ["receptions", "Catches", "int", true],
    ["receiving_yards", "Rec yards", "int", true], ["air_yards", "Air yards", "int", true], ["yards_per_route_run", "Yards / route", 2], ["route_participation", "Route share", "pct0"], ["receiving_epa", "Rec EPA", "s1"]],
  RB: [["fantasy_points", "Points", 1, true, "fantasy_ppg"], ["carries", "Carries", "int", true], ["rush_attempt_share", "Rush share", "pct0"], ["rushing_yards", "Rush yards", "int", true],
    ["yards_per_carry", "Yards / carry", 1], ["targets", "Targets", "int", true], ["opportunity_share", "Opp share", "pct0"], ["snap_share", "Snap share", "pct0"], ["rushing_epa", "Rush EPA", "s1"]],
  QB: [["fantasy_points", "Points", 1, true, "fantasy_ppg"], ["passing_yards", "Pass yards", "int", true], ["passing_tds", "Pass TDs", "int", true], ["yards_per_attempt", "Yards / att", 1],
    ["cpoe", "CPOE", "s1"], ["epa", "EPA", "s1", true], ["rushing_yards", "Rush yards", "int", true], ["interceptions", "INT", "int", true]],
};
USAGE_GRID.TE = USAGE_GRID.WR;
RANKED_GRID.TE = RANKED_GRID.WR;
function cellText(format, v) {
  if (v == null || Number.isNaN(v)) return "-";
  if (format === "pct0") return `${Math.round(Math.min(v, 1) * 100)}%`;
  if (format === "int") return String(Math.round(v));
  if (format === "s1") return signed(v, 1);
  return Number(v).toFixed(format);
}
function weekGrid(pid, rowsByPos, ranked) {
  const p = DATA.players[pid];
  const rows = rowsByPos[p.pos];
  const qb = p.pos === "QB";
  const fr = ppFrame(p, 1600, 900, `${DATA.season} · ${ranked ? "Every week, ranked · PPR" : "Usage by week"}`,
    `${p.name}: ${ranked ? "every week, ranked" : "usage by week"}`,
    ranked ? `Each game's number and its rank among every ${p.pos} who played that week` : `Each week shaded by its rank among every ${p.pos} who played that week${qb ? " (fewer sacks is greener)" : ""}`);
  const { pad, w } = fr;
  const slots = weekSlots(p);
  const games = p.season.games_played || 1;
  const labelW = 196, seasonW = 128, gap = 6;
  const x0 = pad + labelW, x1 = w - pad - seasonW - 10;
  const cw = (x1 - x0) / slots.length;
  const headH = 64;
  const rowH = Math.min(62, (fr.bottom - fr.top - headH - 30) / rows.length);
  let s = "";
  slots.forEach((sl, i) => {
    const cx = x0 + cw * i + cw / 2;
    s += T(cx, fr.top + 14, `W${sl.week}`, { size: 16, weight: 750, anchor: "middle", fill: "var(--faint)", ls: 1 });
    const res = DATA.results[p.team]?.[sl.week];
    if (sl.bye) s += T(cx, fr.top + 46, "BYE", { size: 16, weight: 750, anchor: "middle", fill: "var(--faint)" });
    else if (res) { s += T(cx - 6, fr.top + 46, res[1] ? "vs" : "@", { size: 16, weight: 700, anchor: "end", fill: "var(--muted)" }) + logo(res[0], cx - 2, fr.top + 24, 28); }
  });
  const sx = w - pad - seasonW / 2;
  s += T(sx, fr.top + 46, "SEASON", { size: 15, weight: 750, anchor: "middle", fill: "var(--faint)", ls: 1.4 });
  rows.forEach(([id, label, format, perGame, seasonId], r) => {
    const top = fr.top + headH + r * rowH;
    const cy = top + rowH / 2;
    s += T(pad, cy + 7, label, { size: 20, weight: 650 });
    const vals = p.wk?.[id] || [];
    slots.forEach((sl, i) => {
      const cx = x0 + cw * i;
      const cell = vals[sl.week - 1];
      if (sl.bye || !cell) {
        s += R(cx + gap / 2, top + gap / 2, cw - gap, rowH - gap, { rx: 10, fill: mix("var(--fg)", 3) });
        if (!sl.bye && !sl.log && sl.week <= thru(p.team)) s += T(cx + cw / 2, cy + 6, "Out", { size: 15, anchor: "middle", fill: "var(--faint)" });
        else if (!sl.bye) s += T(cx + cw / 2, cy + 7, "-", { size: 17, anchor: "middle", fill: "var(--faint)" });
        return;
      }
      const [v, rank, pc] = cell;
      s += R(cx + gap / 2, top + gap / 2, cw - gap, rowH - gap, { rx: 10, fill: heatFill(pc) });
      if (ranked) {
        s += T(cx + cw / 2, cy - 1, cellText(format, v), { size: 19, weight: 800, anchor: "middle", mono: true });
        s += T(cx + cw / 2, cy + 19, `${p.pos}${rank}`, { size: 14, weight: 650, anchor: "middle", mono: true, fill: "var(--muted)" });
      } else s += T(cx + cw / 2, cy + 7, cellText(format, v), { size: 20, weight: 800, anchor: "middle", mono: true });
    });
    const sid = seasonId ?? id;
    const sv = p.season[sid];
    const spc = p.pct[sid];
    const text = cellText(format, perGame && !seasonId && sv != null ? sv / games : sv);
    s += R(w - pad - seasonW + gap / 2, top + gap / 2, seasonW - gap, rowH - gap, { rx: 10, fill: heatFill(spc ?? null) });
    if (ranked) {
      s += T(sx, cy - 1, text, { size: 19, weight: 800, anchor: "middle", mono: true });
      s += T(sx, cy + 19, spc != null ? `${spc} pct` : "", { size: 14, weight: 650, anchor: "middle", mono: true, fill: "var(--muted)" });
    } else s += T(sx, cy + 7, text, { size: 20, weight: 800, anchor: "middle", mono: true });
  });
  s += T(pad, fr.bottom + 4, `Season: ${ranked ? "an average a game (the rate, for a rate) and the" : "a game's average for a count, the rate for a rate, shaded by the"} percentile among qualified ${posWord(p.pos)}`, { size: 16, fill: "var(--faint)" });
  return wrapCard(fr, s);
}
const cardUsageGrid = (pid) => weekGrid(pid, USAGE_GRID, false);
const cardRankedGrid = (pid) => weekGrid(pid, RANKED_GRID, true);

// D16 --------------------------------------------------------------- Runs
const RUN_LANES = [["le", "L end"], ["lt", "L tackle"], ["lg", "L guard"], ["mid", "Middle"], ["rg", "R guard"], ["rt", "R tackle"], ["re", "R end"]];
const RUN_OUTCOMES = [
  { key: "stuffed", label: "Stuffed", sub: "0 or less", color: "var(--neg)" },
  { key: "short", label: "Short", sub: "1-3 yards", color: "var(--warn)" },
  { key: "medium", label: "Medium", sub: "4-9 yards", color: "var(--series-1)" },
  { key: "explosive", label: "Explosive", sub: "10+ yards", color: "var(--series-3)" },
];
const runShares = (outcomes) => {
  const total = RUN_OUTCOMES.reduce((t, o) => t + (outcomes?.[o.key] ?? 0), 0) || 1;
  return Object.fromEntries(RUN_OUTCOMES.map((o) => [o.key, (outcomes?.[o.key] ?? 0) / total]));
};
function cardRunFan(pid) {
  const p = DATA.players[pid];
  const runs = p.runs;
  const fr = ppFrame(p, 1600, 900, `${DATA.season} · ${p.pos === "QB" ? "Designed runs" : "Running"}`, `${p.name}: ${p.pos === "QB" ? "designed runs by lane" : "running by lane"}`,
    runs?.carries ? `${runs.carries} designed runs, ${Math.round(((runs.succ ?? 0) / runs.carries) * 100)}% successful, ${runs.fd ?? 0} first downs` : "");
  if (!runs?.carries) return wrapCard(fr, emptyBody(fr, "No designed runs this season"));
  const { pad, w } = fr;
  const byLane = Object.fromEntries(runs.lanes.map((ln) => [ln.lane, ln]));
  const avg = Object.fromEntries((runs.avg?.lanes || []).map((ln) => [ln.lane, ln]));
  const avgAll = (runs.avg?.lanes || []).reduce((t, ln) => [t[0] + ln.yards, t[1] + ln.carries], [0, 0]);
  const overall = avgAll[1] ? avgAll[0] / avgAll[1] : 0;
  const total = runs.lanes.reduce((t, ln) => t + ln.carries, 0) || 1;
  // The fan: from the back, through the line, out to each lane.
  const fx0 = pad, fw = 820, sc = fw / 640;
  const top = fr.top + 6, los = top + 176 * sc * 0.82, bx = fx0 + fw / 2, by = fr.bottom - 26;
  let s = R(fx0, top, fw, los - top, { rx: 18, fill: mix("var(--series-3)", 7) });
  s += L(fx0 + 10, los, fx0 + fw - 10, los, { stroke: "var(--plot-rule)", sw: 3 });
  const LANE_X = [40, 135, 215, 320, 425, 505, 600].map((v) => fx0 + v * sc);
  const BLOCK_X = [95, 175, 255, 320, 385, 465, 545].map((v) => fx0 + v * sc);
  RUN_LANES.forEach(([key, name], i) => {
    const lane = byLane[key] ?? { carries: 0, yards: 0 };
    const a = avg[key];
    const ypc = lane.carries ? lane.yards / lane.carries : 0;
    const avgYpc = a?.carries ? a.yards / a.carries : overall;
    const diff = ypc - avgYpc;
    const color = diff >= 0 ? mix("var(--pos)", Math.min(90, 45 + diff * 18), "var(--card)") : mix("var(--neg)", Math.min(90, 45 - diff * 18), "var(--card)");
    const tx = LANE_X[i], ty = top + 92;
    if (lane.carries > 0) s += `<path d="M${num(bx, 1)},${num(by - 26, 1)} Q${num((bx + tx) / 2, 1)},${num(los + 60, 1)} ${num(tx, 1)},${num(ty + 92, 1)}" fill="none" stroke="${color}" stroke-width="${num(5 + (lane.carries / total) * 56, 1)}" stroke-linecap="round" opacity="0.92"/>`;
    s += T(tx, top + 30, name, { size: 16, weight: 700, anchor: "middle", fill: "var(--muted)" });
    s += T(tx, ty - 12, lane.carries ? ypc.toFixed(1) : "-", { size: 28, weight: 800, anchor: "middle", mono: true });
    s += T(tx, ty + 12, `avg ${avgYpc.toFixed(1)}`, { size: 15, anchor: "middle", mono: true, fill: "var(--faint)" });
    s += T(tx, ty + 62, `${lane.carries} car`, { size: 17, weight: 800, anchor: "middle", mono: true });
  });
  ["TE", "LT", "LG", "C", "RG", "RT", "TE"].forEach((label, i) => {
    s += R(BLOCK_X[i] - 26, los + 12, 52, 30, { rx: 8, fill: "var(--card)", stroke: "var(--border-strong)", sw: 1.5 }) + T(BLOCK_X[i], los + 33, label, { size: 15, weight: 750, anchor: "middle", fill: "var(--muted)" });
  });
  s += face(p.id, bx, by - 14, 24, teamColor(p.team), p.name);
  s += legendRow(fx0, fr.bottom + 4, [
    [(cx, cy) => L(cx - 12, cy, cx + 12, cy, { stroke: mix("var(--pos)", 70, "var(--card)"), sw: 8, cap: "round" }), "Above the RB average in that lane"],
    [(cx, cy) => L(cx - 12, cy, cx + 12, cy, { stroke: mix("var(--neg)", 70, "var(--card)"), sw: 8, cap: "round" }), "Below"],
  ], 16).svg;
  // How runs end, beside it.
  const rx0 = fx0 + fw + 50, rx1 = w - pad;
  const mine = runShares(runs.outcomes), every = runShares(runs.avg?.outcomes);
  s += T(rx0, top + 18, "How runs end", { size: 24, weight: 750 });
  const bar = (src, name, y0) => {
    let out = T(rx0, y0 + 26, name, { size: 19, weight: 750 });
    let at = rx0 + 140;
    const bw = rx1 - at, gapPx = 4;
    RUN_OUTCOMES.forEach((o) => {
      const wd = Math.max(4, src[o.key] * (bw - gapPx * 3));
      out += R(at, y0, wd, 40, { rx: 10, fill: mix(o.color, 30), stroke: mix(o.color, 55), sw: 1.5 });
      if (src[o.key] >= 0.08) out += T(at + wd / 2, y0 + 27, `${Math.round(src[o.key] * 100)}%`, { size: 17, weight: 800, anchor: "middle", mono: true, fill: mix(o.color, 45, "var(--fg)") });
      at += wd + gapPx;
    });
    return out;
  };
  s += bar(mine, fit(lastName(p.name), 130, 19, 750), top + 40);
  s += bar(every, `Every ${p.pos === "QB" ? "RB" : p.pos}`, top + 92);
  const tw = (rx1 - rx0 - 36) / 4;
  RUN_OUTCOMES.forEach((o, i) => {
    const tx = rx0 + i * (tw + 12), ty = top + 158;
    const diff = mine[o.key] - every[o.key];
    const good = o.key === "stuffed" || o.key === "short" ? diff < 0 : diff > 0;
    s += R(tx, ty, tw, 118, { rx: 14, fill: mix("var(--fg)", 4) }) + R(tx, ty, tw, 5, { rx: 2, fill: o.color });
    s += T(tx + 14, ty + 30, o.label.toUpperCase(), { size: 13, weight: 750, fill: "var(--faint)", ls: 1.2 }) + T(tx + 14, ty + 50, o.sub, { size: 14, fill: "var(--faint)" });
    s += T(tx + 14, ty + 84, `${Math.round(mine[o.key] * 100)}%`, { size: 28, weight: 800, mono: true });
    s += T(tx + 14, ty + 106, `${diff >= 0 ? "+" : "−"}${Math.abs(Math.round(diff * 100))} vs avg`, { size: 15, weight: 700, mono: true, fill: Math.abs(diff) < 0.015 ? "var(--muted)" : good ? "var(--pos)" : "var(--neg)" });
  });
  // Every carry by yards gained, against every back (the line).
  const c = p.carries;
  if (c?.carries) {
    const hy0 = top + 312, hy1 = fr.bottom - 24;
    s += T(rx0, hy0, `EVERY CARRY BY YARDS GAINED · LINE IS EVERY ${p.pos === "QB" ? "RB" : p.pos}`, { size: 13, weight: 750, fill: "var(--faint)", ls: 1.2 });
    const minePct = c.mine.map((v) => v / (c.carries || 1)), lg = c.league.map((v) => v / (c.league_carries || 1));
    const peakV = Math.max(...minePct, ...lg) * 1.1, unit = peakV > 0.3 ? 0.1 : 0.05;
    const topV = Math.ceil(peakV / unit) * unit || 0.05;
    const yy = lin(0, topV, hy1 - 26, hy0 + 18);
    const hx0 = rx0 + 44, bwid = (rx1 - hx0) / c.bins.length;
    for (let k = 0; k <= 2; k++) { const t = (topV / 2) * k; s += L(hx0, yy(t), rx1, yy(t)) + T(hx0 - 8, yy(t) + 5, `${Math.round(t * 100)}%`, { size: 14, anchor: "end", mono: true, fill: "var(--faint)" }); }
    c.bins.forEach((bin, k) => {
      const o = RUN_OUTCOMES[k <= 1 ? 0 : k <= 3 ? 1 : k <= 5 ? 2 : 3];
      const bx0 = hx0 + k * bwid;
      s += R(bx0 + bwid * 0.16, yy(minePct[k]), bwid * 0.68, yy(0) - yy(minePct[k]), { rx: 6, fill: mix(o.color, 34), stroke: mix(o.color, 60), sw: 1.5 });
      s += L(bx0 + bwid * 0.08, yy(lg[k]), bx0 + bwid * 0.92, yy(lg[k]), { stroke: "var(--fg)", sw: 3, cap: "round" });
      s += T(bx0 + bwid / 2, hy1 - 4, bin, { size: 14, weight: 700, anchor: "middle", fill: "var(--faint)" });
    });
  }
  return wrapCard(fr, s);
}

// D17 ----------------------------------------------------- By quarterback
// "Who threw to him" (ByQuarterback.jsx): his numbers in each quarterback's starts.
const QB_METRICS = [
  ["PPG", (a) => (a.g ? a.fp / a.g : null), (v) => v.toFixed(1), [0, 30]],
  ["Target share", (a) => (a.tt ? a.tg / a.tt : null), (v) => `${(v * 100).toFixed(1)}%`, [0, 0.4]],
  ["YPRR", (a) => (a.rr ? a.ry / a.rr : null), (v) => v.toFixed(2), [0, 4]],
  ["TPRR", (a) => (a.rr ? a.rt / a.rr : null), (v) => `${Math.round(v * 100)}%`, [0, 0.4]],
  ["EPA / target", (a) => (a.et ? a.epa / a.et : null), (v) => signed(v, 2), [-0.5, 1]],
];
const qbTotals = (rows) => rows.reduce((t, x) => ({ g: t.g + x[3], fp: t.fp + x[4], tg: t.tg + x[5], tt: t.tt + x[6], epa: t.epa + x[7], et: t.et + x[8], rr: t.rr + (x[9] || 0), rt: t.rt + (x[10] || 0), ry: t.ry + (x[11] || 0) }),
  { g: 0, fp: 0, tg: 0, tt: 0, epa: 0, et: 0, rr: 0, rt: 0, ry: 0 });
function cardByQuarterback(pid, opts = {}) {
  const p = DATA.players[pid];
  const both = opts.scope !== "one";
  const seasons = both ? [DATA.season, DATA.season - 1, DATA.season - 2] : [DATA.season];
  const fr = ppFrame(p, 1600, 900, `${both ? `${DATA.season - 2} to ${DATA.season}` : DATA.season} · By quarterback · PPR`, `${p.name}: who threw the ball`,
    "In each quarterback's starts. Green beats the overall number (the tick), red falls short of it");
  if (p.pos === "QB" || !(p.byqb || []).length) return wrapCard(fr, emptyBody(fr, p.pos === "QB" ? "For quarterbacks, the passing network (F1) shows the other side" : "No games this season"));
  const { pad, w } = fr;
  const rows = p.byqb.filter((x) => seasons.includes(x[0]));
  if (!rows.length) return wrapCard(fr, emptyBody(fr, "No games this season"));
  // A row per quarterback, or per quarterback and season across three seasons, newest first.
  const groups = new Map();
  rows.forEach((x) => { const k = both ? `${x[1]}:${x[0]}` : x[1]; if (!groups.has(k)) groups.set(k, { id: x[1], name: x[2], season: x[0], rows: [] }); groups.get(k).rows.push(x); });
  const overall = qbTotals(rows);
  const cards = [...groups.values()].map((g) => ({ ...g, t: qbTotals(g.rows) })).sort((a, b) => (both ? b.season - a.season : 0) || b.t.g - a.t.g).slice(0, 5);
  const compare = cards.length > 1;
  const nRows = cards.length + (compare ? 1 : 0);
  const rowH = Math.min(150, (fr.bottom - fr.top - 10) / nRows);
  const y0 = fr.top + Math.max(0, (fr.bottom - fr.top - 10 - rowH * nRows) / 2);
  const big = rowH >= 130;
  const nameW = 360, mx0 = pad + nameW, mw = (w - pad - mx0) / QB_METRICS.length;
  let s = "";
  const drawRow = (y0, title, sub, totals, faceId, isAll) => {
    let out = R(pad - 10, y0 + 4, w - pad * 2 + 20, rowH - 8, { rx: 18, fill: isAll ? mix("var(--fg)", 2) : "var(--panel)", stroke: isAll ? "var(--border-strong)" : undefined, sw: 1.5, dash: isAll ? "6 5" : undefined });
    const cy = y0 + rowH / 2;
    const fr0 = big ? 42 : 32;
    if (faceId) out += face(faceId, pad + 10 + fr0, cy, fr0, teamColor(p.team), title);
    const tx = pad + (faceId ? fr0 * 2 + 28 : 16);
    out += T(tx, cy - 4, fit(title, nameW - (tx - pad) - 16, big ? 27 : 24, 750), { size: big ? 27 : 24, weight: 750 });
    out += T(tx, cy + 26, sub, { size: 18, fill: "var(--muted)" });
    QB_METRICS.forEach(([label, value, text, [lo, hi]], k) => {
      const x0 = mx0 + k * mw + 10, x1 = x0 + mw - 34;
      const v = value(totals);
      out += T(x0, cy - (big ? 30 : 22), label.toUpperCase(), { size: big ? 14 : 13, weight: 750, fill: "var(--faint)", ls: 1.2 });
      if (v == null) { out += T(x0, cy + 12, "-", { size: 26, weight: 800, mono: true, fill: "var(--faint)" }); return; }
      const base = value(overall);
      const diff = compare && !isAll && base != null ? v - base : null;
      const tone = diff == null ? null : diff > (hi - lo) * 0.02 ? "var(--pos)" : diff < -(hi - lo) * 0.02 ? "var(--neg)" : null;
      out += T(x0, cy + (big ? 14 : 12), text(v), { size: big ? 34 : 27, weight: 800, mono: true, fill: tone ?? "var(--fg)" });
      const sx = lin(lo, hi, x0, x1), zero = clampTo(sx(0), x0, x1), at = clampTo(sx(v), x0, x1);
      const by = cy + (big ? 32 : 26), bh = big ? 10 : 8;
      out += R(x0, by, x1 - x0, bh, { rx: bh / 2, fill: mix("var(--fg)", 8) }) + R(Math.min(zero, at), by, Math.abs(at - zero), bh, { rx: bh / 2, fill: teamColor(p.team) });
      if (compare && !isAll && base != null) out += R(clampTo(sx(base), x0, x1) - 1.5, by - 6, 3, bh + 12, { fill: "var(--fg)" });
    });
    return out;
  };
  cards.forEach((c, i) => {
    s += drawRow(y0 + i * rowH, c.name, `${both ? `${c.season} · ` : ""}${c.t.g} game${c.t.g === 1 ? "" : "s"}`, c.t, c.id, false);
  });
  if (compare) s += drawRow(y0 + cards.length * rowH, both ? "All three seasons" : "Every quarterback", `${overall.g} games`, overall, null, true);
  return wrapCard(fr, s);
}

// D25 ----------------------------------------------------- Player by quarterback
// His career split by who threw to him: every game as a dot on a points strip, each
// quarterback's average, and his numbers against a baseline quarterback's row (the one he
// played the most games with, unless picked), then everyone else together. The rows are
// the by-quarterback endpoint's (DATA.byqb_keys), and each game's points come from his
// career log (`arc`), matched by season and week. Regular season only, like both sources.
const QB_SPLIT_SHARE = [["Target", "share"], (t) => (t.tt ? t.tg / t.tt : null), (v) => `${(v * 100).toFixed(1)}%`];
const QB_SPLIT_METRICS = {
  WR: [
    QB_SPLIT_SHARE,
    [["Yards", "per game"], (t) => t.ry / t.g, (v) => v.toFixed(1)],
    [["Yards", "per target"], (t) => (t.tg ? t.ry / t.tg : null), (v) => v.toFixed(1)],
    [["Catch", "rate"], (t) => (t.tg ? t.rec / t.tg : null), (v) => `${Math.round(v * 100)}%`],
    [["EPA per", "target"], (t) => (t.et ? t.epa / t.et : null), (v) => signed(v, 2)],
    [["TDs per", "17 games"], (t) => (t.rtd / t.g) * 17, (v) => v.toFixed(1)],
  ],
  RB: [
    [["Carries", "per game"], (t) => t.car / t.g, (v) => v.toFixed(1)],
    QB_SPLIT_SHARE,
    [["Scrimmage", "yds / game"], (t) => (t.ry + t.rushy) / t.g, (v) => v.toFixed(1)],
    [["Yards per", "carry"], (t) => (t.car ? t.rushy / t.car : null), (v) => v.toFixed(1)],
    [["Yards per", "target"], (t) => (t.tg ? t.ry / t.tg : null), (v) => v.toFixed(1)],
    [["TDs per", "17 games"], (t) => ((t.rtd + t.rushtd) / t.g) * 17, (v) => v.toFixed(1)],
  ],
};
QB_SPLIT_METRICS.TE = QB_SPLIT_METRICS.WR;
// Each running total and the by-quarterback field it adds up.
const QB_SUMS = { g: "games", fp: "fantasy_points", tg: "targets", tt: "team_targets", epa: "receiving_epa", et: "epa_targets",
  rec: "receptions", ry: "receiving_yards", rtd: "receiving_tds", car: "carries", rushy: "rushing_yards", rushtd: "rushing_tds" };
const byqbAt = () => Object.fromEntries((DATA.byqb_keys || []).map((key, i) => [key, i]));
/** One group per quarterback over the given rows: totals, and every game as [season, week, points]. */
function qbCollect(p, rows) {
  const at = byqbAt();
  const fp = 2 + (DATA.arc_keys[p.pos] || []).indexOf("fantasy_points");
  const points = new Map((p.arc || []).map((g) => [`${g[0]}:${g[1]}`, g[fp]]));
  const groups = new Map();
  for (const x of rows) {
    const id = x[at.qb_id];
    if (!groups.has(id)) groups.set(id, { id, name: x[at.name], t: Object.fromEntries(Object.keys(QB_SUMS).map((k) => [k, 0])), games: [] });
    const g = groups.get(id);
    for (const [k, key] of Object.entries(QB_SUMS)) g.t[k] += x[at[key]] ?? 0;
    for (const week of x[at.weeks] || []) g.games.push([x[at.season], week, points.get(`${x[at.season]}:${week}`)]);
  }
  for (const g of groups.values()) g.games.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return groups;
}
/** The quarterbacks he has played with, most games first: the baseline picker. */
const qbSplitPool = (pid) => [...qbCollect(DATA.players[pid], DATA.players[pid].byqb || []).values()]
  .sort((a, b) => b.t.g - a.t.g).map((g) => ({ id: g.id, name: g.name, team: `${g.t.g} game${g.t.g === 1 ? "" : "s"}` }));
const qbSplitSeasons = (pid) => [...new Set((DATA.players[pid].byqb || []).map((x) => x[0]))].sort((a, b) => a - b);
const yearSpan = (a, b) => (a === b ? String(a) : `${a}-${String(b).slice(2)}`);
const possessive = (name) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);
/** The baseline in the team's colour and everyone else in its second one, both readable on the card. */
function qbSplitColors(abbr) {
  const t = TEAMS[abbr] || {};
  const p1 = parseHex(t.color), p2 = parseHex(t.color2);
  const a = preferred(p1, p2);
  const second = a && p2 && toHex(a) === toHex(p2) ? p1 : p2;
  let b = second ? lighten(second) : null;
  // A grey or black second colour (Bengals, Lions) reads as faded, so it gives way to a series hue.
  if (!a || !b || hsl(b).s < 0.15 || hueGap(a, b) < 40 || Math.abs(lum(a) - lum(b)) < 0.03) b = null;
  // A pale colour (Vikings gold) on the light theme's white card: deepen it until it holds.
  const hold = (c) => {
    if (theme() !== "light" || lum(c) <= 0.3) return c;
    const { h, s, l } = hsl(c);
    for (let next = l; next >= 0.2; next -= 0.02) { const d = fromHsl({ h, s, l: next }); if (lum(d) <= 0.3) return d; }
    return fromHsl({ h, s, l: 0.2 });
  };
  const A = a ? toHex(hold(a)) : "var(--series-1)";
  const B = b ? toHex(hold(b)) : a && hueGap(a, { r: 235, g: 104, b: 52 }) < 40 ? "var(--series-1)" : "var(--series-2)";
  return [A, B];
}
/** Dots stacked away from the centre line until they stop overlapping; returns each dot's offset. */
function swarm(xs, r, maxOff) {
  const placed = [], out = new Array(xs.length), step = r * 1.9;
  const offsets = [0];
  for (let k = 1; k * step <= maxOff + 0.1; k++) offsets.push(-k * step, k * step);
  for (const [x, i] of xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0])) {
    let best = offsets.find((dy) => placed.every(([px, py]) => Math.hypot(px - x, py - dy) >= r * 1.95));
    if (best === undefined) best = offsets[placed.length % offsets.length];
    placed.push([x, best]);
    out[i] = best;
  }
  return out;
}
function cardQbSplit(pid, opts = {}) {
  const p = DATA.players[pid];
  const W = 1600, H = 900;
  const metrics = QB_SPLIT_METRICS[p.pos];
  const plain = (text) => { const f = ppFrame(p, W, H, "By quarterback · Regular season · PPR", `${p.name} by quarterback`, null); return wrapCard(f, emptyBody(f, text)); };
  if (!metrics) return plain("For quarterbacks, the passing network (F1) shows the other side");
  const rows = p.byqb || [];
  const at = byqbAt();
  const career = qbCollect(p, rows);
  const base = career.get(opts.base) ?? [...career.values()].sort((a, b) => b.t.g - a.t.g)[0];
  if (!base) return plain("No games on record");
  const from = opts.from && opts.from !== "all" ? Number(opts.from) : -Infinity;
  const min = Number(opts.min || 3);
  const pool = qbCollect(p, rows.filter((x) => x[at.season] >= from && x[at.qb_id] !== base.id));
  const first = (g) => g.games[0] ?? [Infinity, 0];
  const others = [...pool.values()].filter((g) => g.t.g >= min).sort((a, b) => b.t.g - a.t.g).slice(0, 5)
    .sort((a, b) => first(a)[0] - first(b)[0] || first(a)[1] - first(b)[1]);
  // Everyone else in the window together, the quarterbacks under the minimum included.
  const rest = { id: null, t: Object.fromEntries(Object.keys(QB_SUMS).map((k) => [k, 0])), games: [] };
  for (const g of pool.values()) { for (const k of Object.keys(QB_SUMS)) rest.t[k] += g.t[k]; rest.games.push(...g.games); }
  if (!rest.t.g) return plain(`No other quarterback has thrown to him${from > -Infinity ? ` since ${from}` : ""}`);
  const last = base.games.at(-1) ?? [-Infinity, 0];
  const after = rest.games.length > 0 && rest.games.every((g) => g[0] > last[0] || (g[0] === last[0] && g[1] > last[1]));
  const baseName = lastName(base.name);
  rest.name = after ? `Since ${baseName}` : `Without ${baseName}`;
  const shown = [{ ...base, kind: "base" }, ...others.map((g) => ({ ...g, kind: "qb" }))];
  if (others.length >= 2 || rest.t.g > others.reduce((total, g) => total + g.t.g, 0)) shown.push({ ...rest, kind: "rest" });
  const seasons = shown.flatMap((g) => g.games.map((x) => x[0]));
  const lo = Math.min(...seasons), hi = Math.max(...seasons);
  const fr = ppFrame(p, W, H, `${lo === hi ? lo : `${lo} to ${hi}`} · By quarterback · Regular season · PPR`,
    after ? `${p.name} with ${base.name}, and since` : `${p.name} with and without ${base.name}`, null);
  const { pad, w } = fr;
  const [colorA, colorB] = qbSplitColors(p.team);

  // Columns.
  const nameW = 290, sx0 = pad + nameW + 14, sx1 = sx0 + 380, ppgX = sx1 + 26, ppgW = 100;
  const mx0 = ppgX + ppgW + 8, mw = (w - pad - mx0) / metrics.length;
  const maxPts = Math.max(0, ...shown.flatMap((g) => g.games.map((x) => x[2] ?? 0)));
  const axisHi = Math.min(60, Math.max(30, Math.ceil(maxPts / 10) * 10));
  const ticks = Array.from({ length: axisHi / 10 + 1 }, (_, i) => i * 10);
  const sx = lin(0, axisHi, sx0, sx1);
  // Rows share the space, up to 120 each, and the block sits in the middle of it.
  const headH = 54, footH = 36, rowGap = 8;
  const room = fr.bottom + 24 - fr.top;
  const rowH = Math.min(120, Math.floor((room - headH - footH) / shown.length));
  const top = fr.top + Math.max(0, Math.floor((room - headH - footH - rowH * shown.length) / 2));
  const y0 = top + headH, yEnd = y0 + rowH * shown.length;
  let s = "";

  // Header row.
  const hy = top + 42;
  const label = (x, text, y = hy) => { const f = fitSize(text.toUpperCase(), mw - 16, [14, 13, 12], 750); return T(x, y, f.text, { size: f.size, weight: 750, fill: "var(--faint)", ls: 1.2 }); };
  s += T(pad + 6, hy, "QUARTERBACK", { size: 14, weight: 750, fill: "var(--faint)", ls: 1.2 });
  s += T(sx0, top + 14, "PPR POINTS, EVERY GAME", { size: 14, weight: 750, fill: "var(--faint)", ls: 1.2 });
  for (const v of ticks) s += T(sx(v), hy, String(v), { size: 15, weight: 600, mono: true, fill: "var(--faint)", anchor: "middle" });
  s += T(ppgX + ppgW - 14, hy, "PPG", { size: 14, weight: 750, fill: "var(--faint)", ls: 1.2, anchor: "end" });
  metrics.forEach(([[l1, l2]], k) => { s += label(mx0 + k * mw + 12, l1, hy - 19) + label(mx0 + k * mw + 12, l2); });

  // Panels first, so the strip's grid and the baseline's dashed line draw over them.
  shown.forEach((g, i) => {
    const isBase = g.kind === "base", isRest = g.kind === "rest";
    s += R(pad - 12, y0 + i * rowH + rowGap / 2, w - pad * 2 + 24, rowH - rowGap, {
      rx: 18, fill: isBase ? mix(colorA, 13) : isRest ? mix("var(--fg)", 2) : "var(--panel)",
      stroke: isRest ? "var(--border-strong)" : isBase ? mix(colorA, 45) : undefined, sw: 1.5, dash: isRest ? "6 5" : undefined,
    });
  });
  for (const v of ticks) s += L(sx(v), y0 + 6, sx(v), yEnd - 6, { stroke: "var(--divider)", sw: 1.5 });
  const ppg = (t) => t.fp / t.g;
  s += L(sx(ppg(base.t)), y0 + 2, sx(ppg(base.t)), yEnd - 2, { stroke: "var(--plot-rule)", dash: "7 6", sw: 2 });

  // Bars run over the rows on show, so each player's card reads at its own scale.
  const ranges = metrics.map(([, value]) => {
    const vals = shown.map((g) => value(g.t)).filter((v) => v != null && Number.isFinite(v));
    const lo = Math.min(0, ...vals) * 1.12, hi = Math.max(0, ...vals) * 1.12;
    return [lo, hi > lo ? hi : lo + 1];
  });
  const most = Math.max(...shown.map((g) => g.games.length));
  const r = most > 100 ? 3.6 : most > 60 ? 4.6 : 5.8;
  shown.forEach((g, i) => {
    const cy = y0 + i * rowH + rowH / 2;
    const isBase = g.kind === "base", isRest = g.kind === "rest";
    const color = isBase ? colorA : colorB;
    // Who, and how many games.
    const fr0 = Math.min(26, rowH / 2 - 14);
    if (isRest) s += `<circle cx="${num(pad + 8 + fr0, 1)}" cy="${num(cy, 1)}" r="${num(fr0, 1)}" fill="none" stroke="${colorB}" stroke-width="2.5" stroke-dasharray="6 5"/>`;
    else s += face(g.id, pad + 8 + fr0, cy, fr0, color, g.name);
    const tx = pad + 8 + fr0 * 2 + 16;
    const nm = fitSize(g.name, sx0 - tx - 14, [25, 23, 21], 750);
    s += T(tx, cy - 1, nm.text, { size: nm.size, weight: 750 });
    const seen = g.games.map((x) => x[0]);
    const span = seen.length ? `${yearSpan(Math.min(...seen), Math.max(...seen))} · ` : "";
    s += T(tx, cy + 25, `${span}${g.t.g} game${g.t.g === 1 ? "" : "s"}`, { size: 18, weight: 500, fill: "var(--muted)" });

    // Every game, then the average as a bar through the dots.
    const pts = g.games.map((x) => x[2]).filter((v) => v != null);
    const xs = pts.map((v) => clampTo(sx(v), sx0 + r, sx1 - r));
    const ys = swarm(xs, r, rowH / 2 - r - 10);
    xs.forEach((x, k) => { s += C(x, cy + ys[k], r, { fill: mix(color, 55), stroke: color, sw: 1.6 }); });
    const bh = rowH - 26;
    s += R(sx(ppg(g.t)) - 2.5, cy - bh / 2, 5, bh, { rx: 2.5, fill: "var(--fg)" });

    // Points per game, then his numbers, each against the baseline: green beats it, red falls short.
    const tone = (diff, band) => (isBase ? "var(--fg)" : diff > band ? "var(--pos)" : diff < -band ? "var(--neg)" : "var(--fg)");
    s += T(ppgX + ppgW - 14, cy + 13, ppg(g.t).toFixed(1), { size: 36, weight: 800, mono: true, anchor: "end", fill: tone(ppg(g.t) - ppg(base.t), 0.3) });
    metrics.forEach(([, value, fmt], k) => {
      const x0 = mx0 + k * mw + 12, x1 = x0 + mw - 30;
      const v = value(g.t), b = value(base.t);
      if (v == null || !Number.isFinite(v)) { s += T(x0, cy + 4, "-", { size: 26, weight: 800, mono: true, fill: "var(--faint)" }); return; }
      const [lo, hi] = ranges[k];
      s += T(x0, cy + 4, fmt(v), { size: 26, weight: 800, mono: true, fill: b == null ? "var(--fg)" : tone(v - b, (hi - lo) * 0.015) });
      const bx = lin(lo, hi, x0, x1), zero = clampTo(bx(0), x0, x1), end = clampTo(bx(v), x0, x1), by = cy + 18;
      s += R(x0, by, x1 - x0, 8, { rx: 4, fill: mix("var(--fg)", 8) }) + R(Math.min(zero, end), by, Math.abs(end - zero), 8, { rx: 4, fill: color });
      if (!isBase && b != null) s += R(clampTo(bx(b), x0, x1) - 1.5, by - 5, 3, 18, { fill: "var(--fg)" });
    });
  });

  s += T(pad, yEnd + 26, `Each dot is a game. The solid bar is that quarterback's average, the dashed line ${possessive(baseName)}. Green beats the ${baseName} row, red falls short of it.`,
    { size: 16, weight: 500, fill: "var(--muted)" });
  return wrapCard(fr, s);
}

// D18 ----------------------------------------------------- By situation
const SPLIT_UNIT = {
  QB: { unit: "Plays", one: "play", noun: "dropback and run", share: false },
  RB: { unit: "Touches", one: "touch", noun: "carry and target", share: true },
  WR: { unit: "Targets", one: "target", noun: "target", share: true },
};
SPLIT_UNIT.TE = SPLIT_UNIT.WR;
function cardSituations(pid) {
  const p = DATA.players[pid];
  const sit = p.sit || {};
  const unit = SPLIT_UNIT[p.pos];
  const groups = (sit.groups || []).filter((g) => g[1].length);
  const rowsN = groups.reduce((t, g) => t + g[1].length, 0);
  const rowH = 38, groupH = 56;
  const h = Math.max(1500, Math.round(330 + groups.length * groupH + rowsN * rowH + 130));
  const base = sit.all?.[0] ? sit.all[1] / sit.all[0] : 0;
  const fr = ppFrame(p, 1200, h, `${DATA.season} · By situation · PPR`, `${p.name}: by situation`,
    `Every ${unit.noun}, by the situation it came in. The tick is the overall ${base.toFixed(2)} points per ${unit.one}`);
  if (!sit.ok || !groups.length) return wrapCard(fr, emptyBody(fr, "No plays this season"));
  const { pad, w } = fr;
  const label = (i) => DATA.split_labels[i] ?? "";
  const max = Math.max(base, ...groups.flatMap((g) => g[1].filter((x) => x[1] >= 3).map((x) => x[3] / x[1]))) * 1.1 || 1;
  const cLabel = pad, cN = pad + 380, cShare = pad + 470, bx0 = pad + (unit.share ? 500 : 420), bx1 = w - pad - 200, cVal = w - pad - 120, cEpa = w - pad;
  let y = fr.top + 4;
  let s = "";
  groups.forEach(([title, rows]) => {
    const charted = title === "Play type" || title === "Formation";
    s += T(pad, y + 30, title.toUpperCase(), { size: 16, weight: 800, ls: 1.6 });
    if (charted) s += T(pad + textWidth(title.toUpperCase(), 16, 800) + 1.6 * title.length + 14, y + 30, "from FTN charting", { size: 15, fill: "var(--faint)" });
    s += T(cN, y + 30, unit.unit.toUpperCase(), { size: 13, weight: 750, anchor: "end", fill: "var(--faint)", ls: 1 });
    if (unit.share) s += T(cShare, y + 30, "SHARE", { size: 13, weight: 750, anchor: "end", fill: "var(--faint)", ls: 1 });
    s += T(bx0, y + 30, `POINTS PER ${unit.one.toUpperCase()}`, { size: 13, weight: 750, fill: "var(--faint)", ls: 1 });
    s += T(cEpa, y + 30, "EPA", { size: 13, weight: 750, anchor: "end", fill: "var(--faint)", ls: 1 });
    y += groupH;
    rows.forEach(([li, n, team, pts, , , epa], k) => {
      const cy = y + rowH / 2;
      if (k % 2 === 0) s += R(pad - 10, y + 2, w - pad * 2 + 20, rowH - 4, { rx: 10, fill: "var(--panel)" });
      const small = n < 5;
      s += T(cLabel, cy + 7, fit(label(li), cN - cLabel - 70, 19, 600), { size: 19, weight: 600, fill: small ? "var(--muted)" : "var(--fg)" });
      s += T(cN, cy + 7, n, { size: 19, weight: 700, anchor: "end", mono: true, fill: small ? "var(--muted)" : "var(--fg)" });
      if (!n) { s += T(bx0, cy + 7, "None", { size: 17, fill: "var(--faint)" }); y += rowH; return; }
      if (unit.share) s += T(cShare, cy + 7, `${Math.round((n / (team || 1)) * 100)}%`, { size: 18, anchor: "end", mono: true, fill: "var(--muted)" });
      const per = pts / n, diff = per - base;
      const fill = small ? mix("var(--fg)", 22) : diff >= 0.15 * base ? mix("var(--pos)", 70) : diff <= -0.15 * base ? mix("var(--neg)", 60) : mix("var(--fg)", 30);
      const sx = lin(0, max, bx0, bx1);
      s += R(bx0, cy - 10, bx1 - bx0, 20, { rx: 6, fill: mix("var(--fg)", 6) }) + R(bx0, cy - 10, Math.min(bx1, sx(per)) - bx0, 20, { rx: 6, fill });
      s += R(sx(base) - 1.5, cy - 14, 3, 28, { fill: "var(--fg)" });
      s += T(cVal, cy + 7, per.toFixed(2), { size: 19, weight: 800, anchor: "end", mono: true });
      const e = epa / n;
      s += T(cEpa, cy + 7, signed(e, 2), { size: 19, weight: 800, anchor: "end", mono: true, fill: e >= 0.15 ? "var(--pos)" : e < -0.05 ? "var(--neg)" : "var(--muted)" });
      y += rowH;
    });
    y += 10;
  });
  s += T(pad, fr.bottom + 4, `Rows with under five ${unit.unit.toLowerCase()} are grey.${unit.share ? ` Share is the part of the team's ${p.pos === "RB" ? "carries and targets" : "targets"} in that situation.` : ""}`, { size: 16, fill: "var(--faint)" });
  return wrapCard(fr, s);
}

// D19 -------------------------------------------------------- Game splits
function cardGameSplits(pid) {
  const p = DATA.players[pid];
  const gs = p.gsplit || {};
  const overall = gs.ppg ?? 0;
  const fr = ppFrame(p, 1600, 900, `${DATA.season} · Game splits · PPR`, `${p.name}: game splits`,
    `PPR points per game in each kind of game. The tick on each bar is the overall ${num(overall, 1)} PPG`);
  const groups = (gs.groups || []).filter((g) => g[0] !== "Form" || g[1].length);
  if (!groups.length) return wrapCard(fr, emptyBody(fr, "No games this season"));
  const { pad, w } = fr;
  const label = (i) => DATA.split_labels[i] ?? "";
  const max = Math.max(overall, ...groups.flatMap((g) => g[1].map((x) => x[2] ?? 0))) * 1.1 || 1;
  const cols = 3, gapX = 24, gapY = 18;
  const rowsOfGrid = Math.ceil((groups.length + 1) / cols);
  const bw = (w - pad * 2 - gapX * (cols - 1)) / cols;
  const bh = (fr.bottom - fr.top + 10 - gapY * (rowsOfGrid - 1)) / rowsOfGrid;
  let s = "";
  groups.forEach(([title, rows], i) => {
    const bx = pad + (i % cols) * (bw + gapX), by = fr.top - 6 + Math.floor(i / cols) * (bh + gapY);
    s += R(bx, by, bw, bh, { rx: 18, fill: "var(--panel)" });
    s += T(bx + 18, by + 32, title.toUpperCase(), { size: 15, weight: 800, ls: 1.5 });
    const rh = Math.min(58, (bh - 56) / Math.max(2, rows.length));
    rows.forEach(([li, g, ppg], k) => {
      const cy = by + 54 + rh * k + rh / 2;
      const diff = g ? ppg - overall : null;
      const tone = diff == null ? null : diff >= 2 ? "var(--pos)" : diff <= -2 ? "var(--neg)" : null;
      s += T(bx + 18, cy + 6, fit(label(li), 196, 17, 600), { size: 17, weight: 600, fill: g ? "var(--fg)" : "var(--faint)" });
      s += T(bx + 250, cy + 6, `${g} G`, { size: 15, anchor: "end", mono: true, fill: "var(--faint)" });
      const x0 = bx + 262, x1 = bx + bw - 132;
      if (!g) { s += T(x0, cy + 6, "No games", { size: 15, fill: "var(--faint)" }); return; }
      const sx = lin(0, max, x0, x1);
      s += R(x0, cy - 8, x1 - x0, 16, { rx: 5, fill: mix("var(--fg)", 6) }) + R(x0, cy - 8, sx(ppg) - x0, 16, { rx: 5, fill: tone ? mix(tone, 65) : mix("var(--fg)", 30) });
      s += R(sx(overall) - 1.5, cy - 12, 3, 24, { fill: "var(--fg)" });
      s += T(bx + bw - 76, cy + 7, ppg.toFixed(1), { size: 19, weight: 800, anchor: "end", mono: true });
      s += T(bx + bw - 16, cy + 6, signed(diff, 1), { size: 15, weight: 800, anchor: "end", mono: true, fill: tone ?? "var(--muted)" });
    });
  });
  // The last slot: the season as a whole.
  const all = (gs.groups || []).flatMap((g) => g[1]).find((x) => label(x[0]) === "All games");
  if (groups.length % cols) {
    const i = groups.length, bx = pad + (i % cols) * (bw + gapX), by = fr.top - 6 + Math.floor(i / cols) * (bh + gapY);
    s += R(bx, by, bw, bh, { rx: 18, fill: mix("var(--accent)", 8), stroke: mix("var(--accent)", 30), sw: 1.5 });
    s += T(bx + 18, by + 32, "EVERY GAME", { size: 15, weight: 800, ls: 1.5 });
    s += T(bx + 18, by + 96, num(overall, 1), { size: 50, weight: 800, mono: true });
    s += T(bx + 22 + textWidth(num(overall, 1), 50, 800, true), by + 96, "PPG", { size: 20, weight: 700, fill: "var(--muted)" });
    if (all) s += T(bx + 18, by + 132, `${all[1]} games · best ${num(all[3], 1)} · worst ${num(all[4], 1)}`, { size: 18, fill: "var(--muted)" });
  }
  return wrapCard(fr, s);
}

// D20 -------------------------------------------------------- Career arc
/** Season hues, cyan to violet, so neighbouring seasons read apart (the site's oklch ramp, in HSL). */
const seasonShade = (i, n) => `hsl(${Math.round(188 + (n === 1 ? 45 : (i / (n - 1)) * 82))}, 72%, ${theme() === "dark" ? 64 : 50}%)`;
function quantile(sorted, q) {
  if (!sorted.length) return null;
  const at = (sorted.length - 1) * q, lo = Math.floor(at), hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}
/** Dots stacked sideways out from the column's centre as they collide. */
function swarmX(items, r) {
  const placed = [], gap = (2 * r + 0.8) ** 2;
  [...items].sort((a, b) => a.py - b.py).forEach((it) => {
    for (let k = 0; ; k++) {
      const dx = k === 0 ? 0 : Math.ceil(k / 2) * (r * 1.9) * (k % 2 ? 1 : -1);
      if (placed.every((q) => Math.abs(q.py - it.py) > 2 * r + 1 || (q.dx - dx) ** 2 + (q.py - it.py) ** 2 >= gap)) { it.dx = dx; placed.push(it); break; }
    }
  });
  return items;
}
function cardCareerArc(pid, opts = {}) {
  const p = DATA.players[pid];
  const cfg = GAME_CHART[p.pos];
  const key = cfg.stats.includes(opts.stat) ? opts.stat : "ppg";
  const stat = gameStat(p.pos, key);
  const kind = cfg.lines[key];
  const F = (v) => gsFmt(stat, v);
  const all = careerGames(p);
  const seasons = [...new Set(all.map((g) => g.season))].sort();
  const columns = seasons.map((season) => {
    const games = all.filter((g) => g.season === season);
    return { season, all: games, games: games.map((g) => ({ g, v: gameValue(stat, g) })).filter((e) => e.v != null && Number.isFinite(e.v)) };
  }).filter((c) => c.games.length).slice(-10);
  const fr = ppFrame(p, 1600, 900, `Career · ${columns.length ? `${columns[0].season} to ${columns[columns.length - 1].season}` : ""}${key === "ppg" ? " · PPR" : ""}`, `${p.name}: career arc`,
    `Every game as a dot, a column per season: the median, the middle half, and that season's ${lineName(p.pos, kind, cfg.rank)} (dashed)`);
  if (!columns.length) return wrapCard(fr, emptyBody(fr, `No games with ${lowerFirst(stat.label)}`));
  const { pad, w } = fr;
  const teamOf = Object.fromEntries((p.career || []).map((c) => [c.season, c.team_abbreviation]));
  const n = columns.length;
  const px0 = pad + 70, px1 = w - pad - 120, py0 = fr.top + 62, py1 = fr.bottom - 62;
  const colW = (px1 - px0) / n;
  const [d0, d1] = stat.axis;
  const y = lin(d0, d1, py1, py0);
  const yc = (v) => clampTo(y(v), py0, py1);
  let r = 10;
  for (; r > 3; r -= 0.4) {
    columns.forEach((c) => { c.dots = swarmX(c.games.map((e) => ({ ...e, py: yc(e.v) })), r); });
    if (columns.every((c) => Math.max(...c.dots.map((d) => Math.abs(d.dx))) + r <= colW * 0.44)) break;
  }
  let s = "";
  for (const t of stat.ticks) s += L(px0, y(t), px1, y(t)) + T(px0 - 14, y(t) + 6, F(t).replace(/\.0+$/, ""), { size: 18, anchor: "end", mono: true, fill: "var(--faint)" });
  if (d0 < 0 && d1 > 0) s += L(px0, y(0), px1, y(0), { stroke: "var(--plot-rule)", sw: 1.5 });
  let lastRef = null;
  columns.forEach((c, i) => {
    const cx = px0 + colW * (i + 0.5);
    const color = seasonShade(i, n);
    const values = c.games.map((e) => e.v).sort((a, b) => a - b);
    const q1 = quantile(values, 0.25), md = quantile(values, 0.5), q3 = quantile(values, 0.75);
    const spread = Math.max(...c.dots.map((d) => Math.abs(d.dx))) + r;
    const bw = Math.min(colW * 0.86, Math.max(spread * 2 + 20, 50));
    const ref = refLine(p.pos, c.season, key);
    if (i === n - 1) lastRef = ref;
    if (i > 0) s += L(px0 + colW * i, py0 - 48, px0 + colW * i, py1 + 58, { stroke: "var(--divider)", opacity: 0.6 });
    if (ref != null) s += L(cx - colW * 0.46, yc(ref), cx + colW * 0.46, yc(ref), { stroke: "var(--muted)", sw: 2, dash: "8 6", opacity: 0.85 });
    s += `<rect x="${num(cx - bw / 2, 1)}" y="${num(yc(q3), 1)}" width="${num(bw, 1)}" height="${num(Math.max(3, yc(q1) - yc(q3)), 1)}" rx="12" fill="${color}" fill-opacity="0.16" stroke="${color}" stroke-opacity="0.45" stroke-width="1.5"/>`;
    for (const d of c.dots) {
      const px = cx + d.dx, over = d.v > d1 ? 1 : d.v < d0 ? -1 : 0;
      if (over) { const ey = over > 0 ? py0 - 6 : py1 + 6; s += `<path d="M${num(px - r, 1)},${num(ey + over * r * 1.4, 1)}L${num(px + r, 1)},${num(ey + over * r * 1.4, 1)}L${num(px, 1)},${num(ey, 1)}Z" fill="${color}"/>`; }
      else s += `<circle cx="${num(px, 1)}" cy="${num(d.py, 1)}" r="${num(r, 1)}" fill="${color}" fill-opacity="0.9" stroke="var(--card)" stroke-width="1.5"/>`;
    }
    s += L(cx - bw / 2 + 3, yc(md), cx + bw / 2 - 3, yc(md), { stroke: "var(--fg)", sw: 4.5, cap: "round" });
    s += T(cx, py0 - 30, F(md), { size: n > 8 ? 19 : 22, weight: 800, anchor: "middle", mono: true, fill: color });
    s += T(cx, py0 - 12, "median", { size: 14, anchor: "middle", fill: "var(--faint)" });
    s += T(cx, py1 + 30, c.season, { size: 19, weight: 800, anchor: "middle", mono: true });
    s += T(cx, py1 + 52, `${teamOf[c.season] ? `${teamOf[c.season]} · ` : ""}${c.games.length} G`, { size: 15, anchor: "middle", mono: true, fill: "var(--faint)" });
  });
  if (lastRef != null) s += T(px1 + 14, yc(lastRef) + 6, `${lineName(p.pos, kind, cfg.rank, true)} ${F(lastRef)}`, { size: 17, weight: 700, fill: "var(--muted)" });
  return wrapCard(fr, s);
}

// D21 ---------------------------------------------------- Career profile
function cardCareerProfile(pid) {
  const p = DATA.players[pid];
  const rows = careerRows(p).slice(-10);
  const stats = radarStats(p.pos);
  const fr = ppFrame(p, 1600, 900, `Career · ${rows.length ? `${rows[0].season} to ${rows[rows.length - 1].season}` : ""}`, `${p.name}: career profile`,
    `The radar's stats every season. Dots are coloured by the percentile among ${posWord(p.pos)} that season`);
  if (rows.length < 2) return wrapCard(fr, emptyBody(fr, "One season so far: the career profile starts with the second"));
  const { pad, w } = fr;
  const cols = 5, gx = 18, gy = 18;
  const nRows = Math.ceil(stats.length / cols);
  const tw = (w - pad * 2 - gx * (cols - 1)) / cols, th = (fr.bottom - fr.top + 14 - gy * (nRows - 1)) / nRows;
  const keys = DATA.radar_keys[p.pos];
  let s = "";
  stats.forEach((st, i) => {
    const tx = pad + (i % cols) * (tw + gx), ty = fr.top - 8 + Math.floor(i / cols) * (th + gy);
    const k = keys.indexOf(st.id);
    const vals = rows.map((row) => row.rv?.[k] ?? null), pcs = rows.map((row) => row.rp?.[k] ?? null);
    const latest = vals[vals.length - 1], latestPct = pcs[pcs.length - 1];
    s += R(tx, ty, tw, th, { rx: 18, fill: "var(--panel)" });
    s += T(tx + 16, ty + 30, st.label, { size: 18, weight: 750 });
    s += T(tx + 16, ty + 68, latest == null ? "-" : st.f(latest), { size: 30, weight: 800, mono: true });
    if (latestPct != null) s += pill(`${ord(latestPct)} pct`, tx + tw - 16, ty + 58, { size: 14, anchor: "end", tone: pctColor(latestPct) }).svg;
    const present = vals.filter((v) => v != null);
    if (!present.length) return;
    const min = Math.min(...present), max = Math.max(...present), padV = (max - min || Math.abs(max) || 1) * 0.15;
    const lx0 = tx + 20, lx1 = tx + tw - 20, ly0 = ty + 92, ly1 = ty + th - 34;
    const x = lin(0, Math.max(1, rows.length - 1), lx0, lx1), y = lin(min - padV, max + padV, ly1, ly0);
    const pts = vals.map((v, j) => (v == null ? null : [x(j), y(v)])).filter(Boolean);
    const color = pctColor(latestPct);
    if (pts.length > 1) {
      s += `<path d="${smoothPath(pts)} L${num(pts[pts.length - 1][0], 1)},${num(ly1, 1)} L${num(pts[0][0], 1)},${num(ly1, 1)} Z" fill="${color}" fill-opacity="0.12"/>`;
      s += `<path d="${smoothPath(pts)}" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round"/>`;
    }
    vals.forEach((v, j) => { if (v != null) s += C(x(j), y(v), 6, { fill: pctColor(pcs[j]), stroke: "var(--card)", sw: 2 }); });
    s += T(lx0, ty + th - 10, `'${String(rows[0].season).slice(2)}`, { size: 14, mono: true, fill: "var(--faint)" }) + T(lx1, ty + th - 10, `'${String(rows[rows.length - 1].season).slice(2)}`, { size: 14, anchor: "end", mono: true, fill: "var(--faint)" });
  });
  // A spare slot holds the key.
  if (stats.length % cols) {
    const i = stats.length, tx = pad + (i % cols) * (tw + gx), ty = fr.top - 8 + Math.floor(i / cols) * (th + gy);
    s += R(tx, ty, tw, th, { rx: 18, fill: "none", stroke: "var(--border-strong)", sw: 1.5, dash: "6 5" });
    s += T(tx + 16, ty + 30, "Dot colour", { size: 18, weight: 750 });
    s += T(tx + 16, ty + 56, "Percentile that season", { size: 16, fill: "var(--muted)" });
    const gx0 = tx + 20, gx1 = tx + tw - 20, gy0 = ty + th / 2 + 10;
    for (let k = 0; k <= 20; k++) s += C(lin(0, 20, gx0, gx1)(k), gy0, 6, { fill: pctColor(k * 5) });
    s += T(gx0, gy0 + 34, "0", { size: 15, mono: true, fill: "var(--faint)" }) + T((gx0 + gx1) / 2, gy0 + 34, "50", { size: 15, anchor: "middle", mono: true, fill: "var(--faint)" }) + T(gx1, gy0 + 34, "100", { size: 15, anchor: "end", mono: true, fill: "var(--faint)" });
    s += T(tx + 16, ty + th - 20, "Counts are this season to date", { size: 14, fill: "var(--faint)" });
  }
  return wrapCard(fr, s);
}

// D22 ------------------------------------------------ This season against last
function cardVsLastSeason(pid) {
  const p = DATA.players[pid];
  const rows = careerRows(p);
  const now = rows.find((row) => row.season === DATA.season);
  const then = [...rows].reverse().find((row) => row.season < DATA.season);
  const fr = ppFrame(p, 1600, 900, `${DATA.season} against ${then ? then.season : "last season"}`, `${p.name}: ${DATA.season} against ${then ? then.season : "last season"}`,
    `Percentiles among qualified ${posWord(p.pos)}: the radar for the shape, the arrows for the detail`);
  if (!now || !then) return wrapCard(fr, emptyBody(fr, "No earlier season to compare"));
  const { pad, w } = fr;
  const A = radarOf(p, now), B = radarOf(p, then);
  const NOW = "var(--series-1)", THEN = "var(--series-2)";
  const stats = radarStats(p.pos);
  const cy = (fr.top + fr.bottom) / 2 + 14;
  let s = radar(pad + 300, cy, 172, stats, [{ color: NOW, pct: A.pct, val: A.val }, { color: THEN, pct: B.pct, val: B.val }]);
  s += legendRow(pad, fr.bottom + 4, [
    [(x, y) => C(x, y, 8, { fill: THEN }), String(then.season)], [(x, y) => C(x, y, 8, { fill: NOW }), String(now.season)],
  ], 17).svg;
  // Arrows: an open dot where he was, the arrowhead where he is.
  const list = stats.filter((st) => A.pct[st.id] != null && B.pct[st.id] != null);
  const x0 = 760, x1 = w - pad;
  const labelW = 170, rawW = 200, pillW = 80;
  const ax0 = x0 + labelW, ax1 = x1 - pillW - rawW - 20;
  const ax = lin(0, 100, ax0, ax1);
  const head = 34, rowH = Math.min(54, (fr.bottom - fr.top - head) / Math.max(1, list.length));
  for (const t of [0, 25, 50, 75, 100]) s += L(ax(t), fr.top + head - 6, ax(t), fr.top + head + list.length * rowH, { stroke: "var(--divider)" }) + T(ax(t), fr.top + 14, t, { size: 15, anchor: "middle", mono: true, fill: "var(--faint)" });
  s += T(x1 - pillW - 16, fr.top + 14, `${then.season} → ${now.season}`, { size: 14, weight: 750, anchor: "end", fill: "var(--faint)", ls: 1 });
  s += T(x1 - pillW / 2, fr.top + 14, "CHANGE", { size: 14, weight: 750, anchor: "middle", fill: "var(--faint)", ls: 1 });
  list.forEach((st, i) => {
    const a = B.pct[st.id], b = A.pct[st.id], change = b - a, dir = Math.sign(change);
    const cyR = fr.top + head + i * rowH + rowH / 2;
    s += R(x0, cyR - rowH / 2 + 3, x1 - x0, rowH - 6, { rx: 12, fill: mix("var(--fg)", i % 2 ? 2.5 : 4.5) });
    s += L(ax(0), cyR, ax(100), cyR, { stroke: mix("var(--fg)", 9), sw: 6, cap: "round" });
    s += T(x0 + 16, cyR + 7, st.label, { size: 19, weight: 650 });
    const xa = ax(a), xb = dir === 0 ? xa : Math.abs(ax(b) - xa) >= 26 ? ax(b) : xa + dir * 26;
    const ink = mix(dir > 0 ? "var(--pos)" : "var(--neg)", 80, "var(--fg)");
    if (dir !== 0) {
      s += L(xa, cyR, xb - dir * 12, cyR, { stroke: ink, sw: 4.5, cap: "round" });
      s += `<path d="M${num(xb, 1)},${num(cyR, 1)}L${num(xb - dir * 16, 1)},${num(cyR - 9.5, 1)}L${num(xb - dir * 16, 1)},${num(cyR + 9.5, 1)}Z" fill="${ink}"/>`;
      s += C(xa, cyR, 7, { fill: "var(--card)", stroke: "var(--muted)", sw: 3 });
    } else s += C(xa, cyR, 7.5, { fill: "var(--muted)" });
    const rawThen = B.val[st.id] == null ? "-" : st.f(B.val[st.id]), rawNow = A.val[st.id] == null ? "-" : st.f(A.val[st.id]);
    s += `<text x="${num(x1 - pillW - 16, 1)}" y="${num(cyR + 6, 1)}" font-size="17" font-family="${MONO}" text-anchor="end" fill="var(--faint)">${esc(rawThen)} → <tspan fill="var(--fg)" font-weight="700">${esc(rawNow)}</tspan></text>`;
    const tone = change > 0 ? "var(--pos)" : change < 0 ? "var(--neg)" : null;
    const text = change > 0 ? `▲ ${change}` : change < 0 ? `▼ ${-change}` : "= 0";
    s += R(x1 - pillW + 6, cyR - 14, pillW - 12, 28, { rx: 8, fill: tone ? mix(tone, 16) : mix("var(--fg)", 7) });
    s += T(x1 - pillW / 2, cyR + 6, text, { size: 16, weight: 800, anchor: "middle", mono: true, fill: tone ? mix(tone, 72, "var(--fg)") : "var(--muted)" });
  });
  return wrapCard(fr, s);
}

// D23 ---------------------------------------------------- Compare lines
function compareSeries(p, stat, range) {
  if (range === "career") {
    const all = careerGames(p);
    return [...new Set(all.map((g) => g.season))].sort().map((season) => ({ x: season, v: combineGames(stat, all.filter((g) => g.season === season)) })).filter((pt) => pt.v != null);
  }
  const out = [], seen = [];
  [...p.log].sort((a, b) => a.week - b.week).forEach((g) => {
    if (stat.parts(g)) seen.push(g);
    if (seen.length) out.push({ x: g.week, v: combineGames(stat, seen) });
  });
  return out;
}
function cardCompareLines(pid, opts = {}) {
  const p = DATA.players[pid];
  const vs = DATA.players[opts.vs] && opts.vs !== pid ? DATA.players[opts.vs] : DATA.players[defaultRival(pid)];
  const cfg = GAME_CHART[p.pos];
  const key = cfg.stats.includes(opts.stat) ? opts.stat : "ppg";
  const stat = gameStat(p.pos, key);
  const career = opts.range === "career";
  const F = (v) => gsFmt(stat, v);
  const fr = frame(1600, 900, { kicker: `${career ? "By season" : `${DATA.season} · Season to date`}${key === "ppg" ? " · PPR" : ""}`, title: `${p.name} and ${vs?.name ?? "-"}: ${lowerFirst(stat.label)}`,
    subtitle: career ? "Each season's number, summed before dividing" : "Each week's line is the season to date through that game" });
  const { pad, w } = fr;
  const colors = ["var(--series-1)", "var(--series-2)"];
  const people = [p, vs].filter(Boolean).map((pl, i) => ({ pl, color: colors[i], points: compareSeries(pl, stat, career ? "career" : "season") }));
  const xs = people.flatMap((pp) => pp.points.map((pt) => pt.x));
  if (!xs.length) return wrapCard(fr, emptyBody(fr, "No games to compare"));
  const vals = people.flatMap((pp) => pp.points.map((pt) => pt.v));
  const [d0, d1] = stat.axis;
  const lo = Math.max(d0, Math.min(...vals)), hi = Math.min(d1, Math.max(...vals));
  const step = niceStep(lo, hi, 5);
  const ylo = Math.floor((lo - step * 0.3) / step) * step, yhi = Math.ceil((hi + step * 0.3) / step) * step;
  const xlo = career ? Math.min(...xs) : 1, xhi = career ? Math.max(...xs) : thru(p.team, vs?.team);
  const px0 = pad + 70, px1 = w - pad - 380, py0 = fr.top + 20, py1 = fr.bottom - 44;
  const x = lin(xlo - 0.4, xhi + 0.4, px0, px1), y = lin(ylo, yhi, py1, py0);
  const yc = (v) => clampTo(y(v), py0, py1);
  let s = "";
  for (const t of axisTicks(ylo, yhi, step)) s += L(px0, y(t), px1, y(t)) + T(px0 - 14, y(t) + 6, F(t).replace(/\.0+$/, ""), { size: 18, anchor: "end", mono: true, fill: "var(--faint)" });
  if (ylo < 0 && yhi > 0) s += L(px0, y(0), px1, y(0), { stroke: "var(--plot-rule)", sw: 1.5 });
  const xstep = career ? Math.max(1, Math.ceil((xhi - xlo + 1) / 12)) : 1;
  for (let v = xlo; v <= xhi; v += xstep) s += T(x(v), py1 + 32, career ? String(v) : `W${v}`, { size: 18, weight: 700, anchor: "middle", mono: career, fill: "var(--faint)" });
  for (const pp of people) {
    s += `<path d="${smoothPath(pp.points.map((pt) => [x(pt.x), yc(pt.v)]))}" fill="none" stroke="${pp.color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
    for (const pt of pp.points) s += C(x(pt.x), yc(pt.v), 6, { fill: pp.color, stroke: "var(--card)", sw: 2 });
  }
  // A card for each name on the right, with the latest value.
  people.forEach((pp, i) => {
    const cy = fr.top + 70 + i * 200;
    const cx0 = w - pad - 340;
    s += R(cx0, cy - 60, 340, 170, { rx: 22, fill: mix(pp.color, 12), stroke: mix(pp.color, 45), sw: 2 });
    s += face(pp.pl.id, cx0 + 64, cy, 40, teamColor(pp.pl.team), pp.pl.name);
    const nm = fitSize(pp.pl.name, 206, [24, 21, 19], 750);
    s += T(cx0 + 120, cy - 8, nm.text, { size: nm.size, weight: 750 });
    s += T(cx0 + 120, cy + 20, `${pp.pl.team} · ${pp.pl.pos}`, { size: 17, fill: "var(--muted)" });
    const last = pp.points[pp.points.length - 1];
    s += T(cx0 + 24, cy + 86, last ? F(last.v) : "-", { size: 38, weight: 800, mono: true, fill: pp.color });
    s += T(cx0 + 316, cy + 84, career ? `${last?.x ?? ""}` : "season to date", { size: 16, anchor: "end", fill: "var(--muted)" });
  });
  return wrapCard(fr, s);
}

// D24 ------------------------------------------------------ Most similar
const SIM_LABELS = {
  WR: ["PPG", "TGT%", "AY%", "aDOT", "Route%", "TPRR", "YPRR", "Catch%", "YAC", "RZ tgts"],
  RB: ["PPG", "Rush%", "TGT%", "Route%", "Inside 5", "YPC", "YAC/att", "RZ tgts", "Snap%"],
  QB: ["PPG", "Rating", "CPOE", "Y/A", "aDOT", "Carries", "Rush yds", "EPA/play", "Aggressive%"],
};
SIM_LABELS.TE = SIM_LABELS.WR;
/** 0-100, 100 minus the RMS of percentile gaps (constants/similarity.js, a placeholder Nate is replacing). */
function closeness(mine, theirs) {
  let total = 0, count = 0, missing = 0;
  mine.forEach((a, i) => { const b = theirs[i]; if (a == null || b == null) { missing++; return; } total += (a - b) ** 2; count++; });
  return missing > 2 || !count ? null : Math.round(100 - Math.sqrt(total / count));
}
function cardMostSimilar(pid) {
  const p = DATA.players[pid];
  const pool = DATA.sim_pool[p.pos] || [];
  const mine = pool.find((row) => row[0] === pid);
  const fr = ppFrame(p, 1600, 900, `${DATA.season} · Most similar`, `${p.name}: who plays the most like this`,
    `Every qualified ${posWord(p.pos).replace(/s$/, "")} by how close the percentiles are on ${SIM_LABELS[p.pos].length} stats; the five closest as faces`);
  if (!mine) return wrapCard(fr, emptyBody(fr, "Not qualified at the position this season"));
  const { pad, w } = fr;
  const ranked = pool.filter((row) => row[0] !== pid).map((row) => ({ row, match: closeness(mine[3], row[3]) })).filter((e) => e.match != null).sort((a, b) => b.match - a.match);
  if (!ranked.length) return wrapCard(fr, emptyBody(fr, "Not enough qualified players to compare"));
  const top = ranked.slice(0, 5);
  const ring = teamColor(p.team);
  // The closeness line.
  const lx0 = pad + 20, lx1 = w - pad - 20, base = fr.top + 180;
  const low = Math.max(0, Math.floor((ranked[ranked.length - 1].match - 2) / 10) * 10);
  const x = lin(low, 100, lx0, lx1);
  const r = 5;
  const dots = ranked.map((e) => ({ ...e, px: x(e.match) }));
  const placed = [], gap = (2 * r + 1) ** 2;
  [...dots].sort((a, b) => a.px - b.px).forEach((d) => {
    for (let k = 0; ; k++) {
      const dy = k === 0 ? 0 : Math.ceil(k / 2) * (r * 1.9) * (k % 2 ? 1 : -1);
      if (placed.every((q) => Math.abs(q.px - d.px) > 2 * r + 1 || (q.px - d.px) ** 2 + (q.dy - dy) ** 2 >= gap)) { d.dy = dy; placed.push(d); break; }
    }
  });
  let s = L(lx0, base, lx1, base, { stroke: "var(--divider)", sw: 1.5 });
  const spread = Math.max(...dots.map((d) => Math.abs(d.dy))) + r;
  for (let t = low; t <= 100; t += 10) s += T(x(t), base + spread + 22, `${t}%`, { size: 16, anchor: "middle", mono: true, fill: "var(--faint)" });
  const median = ranked[Math.floor(ranked.length / 2)].match;
  s += L(x(median), base - spread - 6, x(median), base + spread + 4, { stroke: "var(--muted)", sw: 1.5, dash: "4 4" });
  s += T(x(median) - 10, base - spread - 8, `Typical ${({ WR: "receiver", RB: "back", TE: "tight end", QB: "quarterback" })[p.pos]} ${median}%`, { size: 16, anchor: "end", fill: "var(--muted)" });
  const topIds = new Set(top.map((e) => e.row[0]));
  const faceR = 28, faceY = fr.top + 18;
  const spots = top.map((e) => x(e.match)).sort((a, b) => a - b);
  const minGap = 120;
  for (let i = spots.length - 2; i >= 0; i--) spots[i] = Math.min(spots[i], spots[i + 1] - minGap);
  for (let i = 1; i < spots.length; i++) spots[i] = Math.max(spots[i], spots[i - 1] + minGap);
  const order = [...top].sort((a, b) => a.match - b.match).map((e, i) => ({ e, fx: Math.min(lx1 - 50, spots[i]) }));
  for (const { e, fx } of order) s += `<polyline points="${num(fx, 1)},${num(faceY + faceR + 42, 1)} ${num(fx, 1)},${num(faceY + faceR + 54, 1)} ${num(x(e.match), 1)},${num(base - 12, 1)}" fill="none" stroke="${ring}" stroke-opacity="0.7" stroke-width="2"/>`;
  for (const d of dots) s += C(d.px, base + d.dy, r, { fill: topIds.has(d.row[0]) ? ring : mix("var(--fg)", 40) });
  for (const { e, fx } of order) {
    s += face(e.row[0], fx, faceY, faceR, teamColor(e.row[2]), e.row[1]);
    s += T(fx, faceY + faceR + 22, fit(lastName(e.row[1]), 112, 16, 750), { size: 16, weight: 750, anchor: "middle" });
    s += T(fx, faceY + faceR + 40, `${e.match}%`, { size: 15, weight: 800, anchor: "middle", mono: true, fill: "var(--muted)" });
  }
  // The heat table: him and the five, every stat's percentile.
  const labels = SIM_LABELS[p.pos];
  const tx0 = pad, nameW = 330, ty0 = base + spread + 44;
  const cw = (w - pad - tx0 - nameW - 110) / labels.length;
  const rowH = Math.min(46, (fr.bottom - 12 - ty0 - 34) / 6);
  labels.forEach((lb, k) => { s += T(tx0 + nameW + cw * k + cw / 2, ty0 + 20, lb, { size: 15, weight: 750, anchor: "middle", fill: "var(--faint)" }); });
  s += T(w - pad - 50, ty0 + 20, "MATCH", { size: 14, weight: 750, anchor: "middle", fill: "var(--faint)", ls: 1 });
  [{ row: mine, match: null }, ...top].forEach((e, i) => {
    const cy = ty0 + 34 + i * rowH + rowH / 2;
    if (i === 0) s += R(tx0 - 10, cy - rowH / 2 + 2, w - pad * 2 + 20, rowH - 4, { rx: 12, fill: mix(ring, 14), stroke: mix(ring, 40), sw: 1.5 });
    s += T(tx0 + 4, cy + 7, fit(`${e.row[1]}`, nameW - 70, 19, i === 0 ? 800 : 650), { size: 19, weight: i === 0 ? 800 : 650 });
    s += T(tx0 + nameW - 14, cy + 6, e.row[2], { size: 15, anchor: "end", mono: true, fill: "var(--muted)" });
    e.row[3].forEach((pc, k) => {
      const cx = tx0 + nameW + cw * k;
      s += R(cx + 3, cy - rowH / 2 + 5, cw - 6, rowH - 10, { rx: 8, fill: heatFill(pc) });
      s += T(cx + cw / 2, cy + 6, pc == null ? "-" : pc, { size: 17, weight: 750, anchor: "middle", mono: true });
    });
    s += T(w - pad - 50, cy + 7, e.match == null ? "" : `${e.match}%`, { size: 19, weight: 800, anchor: "middle", mono: true });
  });
  s += T(pad, fr.bottom + 4, `Percentiles among qualified ${posWord(p.pos)} this season. Closeness is 100 minus the root mean square of the gaps, every stat weighted the same`, { size: 15, fill: "var(--faint)" });
  return wrapCard(fr, s);
}
