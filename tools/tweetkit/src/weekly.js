// C: weekly recurring cards.
const median = (xs) => { const a = xs.filter((v) => v != null).sort((p, q) => p - q); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };

/** Push overlapping markers apart, each tethered to its anchor. */
function relax(items, { r, bounds, iterations = 120 }) {
  for (const it of items) { it.x = it.ax; it.y = it.ay; }
  for (let k = 0; k < iterations; k++) {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        const need = (a.r ?? r) + (b.r ?? r);
        const d = Math.hypot(dx, dy) || 0.01;
        if (d < need) {
          const push = (need - d) / 2;
          dx /= d; dy /= d;
          a.x -= dx * push; a.y -= dy * push; b.x += dx * push; b.y += dy * push;
        }
      }
    }
    for (const it of items) {
      it.x += (it.ax - it.x) * 0.04; it.y += (it.ay - it.y) * 0.04;
      if (bounds) { it.x = Math.max(bounds.x0, Math.min(bounds.x1, it.x)); it.y = Math.max(bounds.y0, Math.min(bounds.y1, it.y)); }
    }
  }
  return items;
}

function axisTicks(lo, hi, step) {
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

// C1 ------------------------------------------------------------ Landscape
function cardLandscape(_, opts = {}) {
  const picked = new Set(opts.hl || []);
  const wk = DATA.recap_week;
  const fr = frame(1600, 900, { kicker: `Through Week ${wk}`, title: "NFL team landscape", subtitle: "Offensive EPA per play versus defensive EPA per play" });
  const { pad, w } = fr;
  const teams = DATA.landscape;
  const xs = teams.map((t) => t.off[0]), ys = teams.map((t) => t.def[0]);
  const xr = [Math.min(...xs) - 0.03, Math.max(...xs) + 0.03], yr = [Math.min(...ys) - 0.03, Math.max(...ys) + 0.03];
  const px0 = pad + 70, px1 = w - pad - 10, py0 = fr.top + 6, py1 = fr.bottom - 50;
  const x = lin(xr[0], xr[1], px0, px1);
  const y = lin(yr[0], yr[1], py0, py1); // lower EPA allowed sits higher
  let s = "";
  const mx = DATA.league_means.off, my = DATA.league_means.def;
  s += R(x(mx), py0, px1 - x(mx), y(my) - py0, { fill: mix("var(--pos)", 6) });
  s += R(px0, y(my), x(mx) - px0, py1 - y(my), { fill: mix("var(--neg)", 6) });
  for (const v of axisTicks(xr[0], xr[1], 0.1)) {
    s += L(x(v), py0, x(v), py1, { stroke: "var(--divider)" }) + T(x(v), py1 + 30, signed(v, 1), { size: 18, anchor: "middle", mono: true, fill: "var(--faint)" });
  }
  for (const v of axisTicks(yr[0], yr[1], 0.1)) {
    s += L(px0, y(v), px1, y(v), { stroke: "var(--divider)" }) + T(px0 - 12, y(v) + 6, signed(v, 1), { size: 18, anchor: "end", mono: true, fill: "var(--faint)" });
  }
  s += L(x(mx), py0, x(mx), py1, { stroke: "var(--plot-rule)", dash: "8 7", sw: 1.5 }) + L(px0, y(my), px1, y(my), { stroke: "var(--plot-rule)", dash: "8 7", sw: 1.5 });
  s += T((px0 + px1) / 2, py1 + 62, "Offense: EPA per play →", { size: 19, weight: 650, anchor: "middle", fill: "var(--muted)" });
  s += `<text transform="translate(${pad + 8},${(py0 + py1) / 2}) rotate(-90)" text-anchor="middle" font-size="19" font-weight="650" fill="var(--muted)">Defense: EPA per play allowed (better ↑)</text>`;
  const size = 58;
  const items = teams.map((t) => ({ t, ax: x(t.off[0]), ay: y(t.def[0]), r: size * 0.42 }));
  relax(items, { r: size * 0.42, bounds: { x0: px0 + size / 2, x1: px1 - size / 2, y0: py0 + size / 2, y1: py1 - size / 2 }, iterations: 80 });
  for (const it of items) {
    if (Math.hypot(it.x - it.ax, it.y - it.ay) > 10) s += L(it.ax, it.ay, it.x, it.y, { stroke: "var(--muted)", sw: 1.2 }) + C(it.ax, it.ay, 3, { fill: "var(--muted)" });
    const on = !picked.size || picked.has(it.t.team);
    s += on ? logo(it.t.team, it.x - size / 2, it.y - size / 2, size) : `<g opacity="0.22">${logo(it.t.team, it.x - size / 2, it.y - size / 2, size)}</g>`;
  }
  for (const it of items) {
    const t = it.t, tip = [TEAMS[t.team]?.name || t.team, `Offense: ${signed(t.off[0], 2)} EPA per play (${ord(t.off[1])})`, `Defense: ${signed(t.def[0], 2)} allowed (${ord(t.def[1])})`].join("|");
    s += `<rect class="hit" x="${num(it.x - size / 2, 1)}" y="${num(it.y - size / 2, 1)}" width="${size}" height="${size}" fill="transparent" data-pid="${t.team}" data-tip="${esc(tip)}"/>`;
  }
  const boxes = items.map((it) => [it.x - size / 2, it.y - size / 2, it.x + size / 2, it.y + size / 2]);
  s += quadrantLabels({ px0, px1, py0, py1, mx: x(mx), my: y(my), boxes, labels: [
    ["Good offense, good defense", mix("var(--pos)", 72, "var(--fg)")], ["Bad offense, good defense"],
    ["Good offense, bad defense"], ["Bad offense, bad defense", mix("var(--neg)", 72, "var(--fg)")]] });
  return wrapCard(fr, s);
}

/**
 * The four quadrant labels (top right, top left, bottom right, bottom left), each at
 * the first of four spots in its quadrant that no marker covers.
 */
function quadrantLabels({ px0, px1, py0, py1, mx, my, boxes, labels, size = 20 }) {
  let out = "";
  const spots = [
    [[px1 - 14, py0 + 30, "end"], [px1 - 14, my - 16, "end"], [mx + 14, py0 + 30, "start"], [mx + 14, my - 16, "start"]],
    [[px0 + 14, py0 + 30, "start"], [px0 + 14, my - 16, "start"], [mx - 14, py0 + 30, "end"], [mx - 14, my - 16, "end"]],
    [[px1 - 14, py1 - 16, "end"], [px1 - 14, my + 34, "end"], [mx + 14, py1 - 16, "start"], [mx + 14, my + 34, "start"]],
    [[px0 + 14, py1 - 16, "start"], [px0 + 14, my + 34, "start"], [mx - 14, py1 - 16, "end"], [mx - 14, my + 34, "end"]],
  ];
  labels.forEach((label, i) => {
    if (!label) return;
    const [text, tone] = label;
    const w = textWidth(text, size, 750);
    const hits = (x, y, anchor) => {
      const x0 = anchor === "end" ? x - w : x, x1 = x0 + w, y0 = y - size, y1 = y + 6;
      return boxes.filter(([a, b, c, d]) => a < x1 && c > x0 && b < y1 && d > y0).length;
    };
    const best = spots[i].map((spot) => [spot, hits(...spot)]).sort((p, q) => p[1] - q[1])[0][0];
    out += T(best[0], best[1], text, { size, weight: 750, anchor: best[2], fill: tone ?? "var(--muted)" });
  });
  return out;
}

// C2 ------------------------------------------------------- Implied totals
function slateOffenses() {
  const out = [];
  for (const pv of DATA.previews) {
    const h = pv.header, [a, hm] = pvSides(pv);
    out.push({ team: a, opp: hm, home: false, implied: h.away_implied, spread: h.spread_line == null ? null : h.spread_line, total: h.total_line, pv, fav: h.favorite });
    out.push({ team: hm, opp: a, home: true, implied: h.home_implied, spread: h.spread_line, total: h.total_line, pv, fav: h.favorite });
  }
  return out;
}
function cardImplied() {
  const wk = DATA.preview_week;
  const fr = frame(1200, 1500, { kicker: `Week ${wk}`, title: `Week ${wk} implied team totals`, subtitle: "Points each offense is expected to score, from the spread and the total" });
  const { pad, w } = fr;
  const rows = slateOffenses().filter((r) => r.implied != null).sort((a, b) => b.implied - a.implied);
  const playing = new Set(rows.map((r) => r.team));
  const byes = Object.keys(TEAMS).filter((t) => !playing.has(t) && DATA.landscape.some((l) => l.team === t)).sort();
  let y = fr.top - 6;
  const rowH = (fr.bottom - y - 50) / rows.length;
  const bx0 = pad + 290, bx1 = w - pad - 200;
  const max = Math.ceil(Math.max(...rows.map((r) => r.implied)) / 5) * 5;
  const x = lin(0, max, bx0, bx1);
  let s = "";
  for (let v = 10; v <= max; v += 5) s += L(x(v), y, x(v), y + rowH * rows.length, { stroke: "var(--divider)" }) + T(x(v), y + rowH * rows.length + 22, v, { size: 16, anchor: "middle", mono: true, fill: "var(--faint)" });
  s += T(w - pad - 112, y - 4, "LINE", { size: 15, weight: 700, anchor: "middle", fill: "var(--faint)" }) + T(w - pad, y - 4, "O/U", { size: 15, weight: 700, anchor: "end", fill: "var(--faint)" });
  rows.forEach((r, i) => {
    const cy = y + i * rowH + rowH / 2 + 4;
    const color = teamColor(r.team);
    s += T(pad + 20, cy + 7, i + 1, { size: 18, weight: 700, anchor: "middle", mono: true, fill: "var(--faint)" });
    s += logo(r.team, pad + 44, cy - 17, 34);
    s += T(pad + 90, cy + 8, r.team, { size: 22, weight: 800 });
    s += T(pad + 160, cy + 8, `${r.home ? "vs" : "@"} ${r.opp}`, { size: 19, weight: 500, fill: "var(--muted)" });
    s += R(bx0, cy - rowH * 0.32, x(r.implied) - bx0, rowH * 0.64, { rx: 6, fill: color, opacity: 0.85 });
    s += T(x(r.implied) + 10, cy + 8, implied(r.implied), { size: 21, weight: 800, mono: true });
    const line = r.fav == null ? "PK" : r.fav === r.team ? `−${Math.abs(r.spread)}` : `+${Math.abs(r.spread)}`;
    s += T(w - pad - 112, cy + 7, line, { size: 19, weight: 650, anchor: "middle", mono: true, fill: r.fav === r.team ? "var(--fg)" : "var(--muted)" });
    s += T(w - pad, cy + 7, r.total, { size: 19, weight: 500, anchor: "end", mono: true, fill: "var(--muted)" });
  });
  if (byes.length) s += T(pad, fr.bottom - 2, `Byes: ${byes.join(", ")}`, { size: 19, fill: "var(--muted)" });
  return wrapCard(fr, s);
}

// C3 ------------------------------------------------------- Matchup map
function cardMatchupMap() {
  const wk = DATA.preview_week;
  const fr = frame(1200, 1500, { kicker: `Week ${wk} · PPR`, title: `Week ${wk} matchups by position`, subtitle: "Fantasy points per game the opponent allows to each position. Green: allows the most." });
  const { pad, w } = fr;
  const rows = slateOffenses().filter((r) => r.implied != null).sort((a, b) => b.implied - a.implied);
  let y = fr.top + 4;
  const positions = ["QB", "RB", "WR", "TE"];
  const lead = 290, cw = (w - pad * 2 - lead) / positions.length;
  let s = "";
  positions.forEach((p, i) => { s += T(pad + lead + cw * i + cw / 2, y, p, { size: 20, weight: 800, anchor: "middle", fill: posColor(p) }); });
  s += T(pad + 220, y, "IMPLIED", { size: 14, weight: 700, anchor: "end", fill: "var(--faint)" });
  y += 16;
  const rowH = (fr.bottom - y - 40) / rows.length;
  rows.forEach((r, i) => {
    const ry = y + i * rowH;
    const cy = ry + rowH / 2;
    s += logo(r.team, pad, cy - 16, 32);
    s += T(pad + 42, cy + 7, r.team, { size: 20, weight: 800 });
    s += T(pad + 104, cy + 7, `${r.home ? "vs" : "@"} ${r.opp}`, { size: 18, fill: "var(--muted)" });
    s += T(pad + 220, cy + 7, implied(r.implied), { size: 18, weight: 650, anchor: "end", mono: true, fill: "var(--muted)" });
    positions.forEach((p, pi) => {
      const cell = r.pv.pa.defenses?.[r.opp]?.[p];
      const cx = pad + lead + cw * pi;
      if (!cell) return;
      const color = rankColor(cell.rank, cell.teams);
      s += R(cx + 4, ry + 3, cw - 8, rowH - 6, { rx: 8, fill: mix(color, 34) });
      s += T(cx + cw / 2 - 8, cy + 7, num(cell.points_allowed, 1), { size: 19, weight: 750, anchor: "end", mono: true });
      s += T(cx + cw / 2 + 4, cy + 7, ord(cell.rank), { size: 16, weight: 650, mono: true, fill: mix(color, 55, "var(--fg)") });
    });
  });
  const basis = DATA.previews[0]?.pa?.basis;
  s += T(pad, fr.bottom - 2, `Rank of 32, 1st allows the most. Allowed through Week ${basis?.weeks ?? DATA.recap_week}. Sorted by implied total.`, { size: 18, fill: "var(--muted)" });
  return wrapCard(fr, s);
}

// C4 -------------------------------------------------------- Week's best
function shortLine(p, pos) {
  // Rushing in, the line counts every touchdown once: "144 pass, 32 rush, 4 TD".
  if (pos === "QB") return p.rushing_yards >= 20 || p.rushing_tds
    ? `${p.passing_yards} pass, ${p.rushing_yards} rush, ${p.passing_tds + p.rushing_tds} TD`
    : `${p.passing_yards} yds, ${p.passing_tds} TD`;
  if (pos === "RB") return `${p.carries}-${p.rushing_yards}${p.rushing_tds ? `-${p.rushing_tds}` : ""}, ${p.receptions} rec`;
  return `${p.receptions}-${p.receiving_yards}${p.receiving_tds ? `-${p.receiving_tds}` : ""} on ${p.targets} tgt`;
}
function cardWeekTop() {
  const wk = DATA.recap_week;
  const fr = frame(1200, 1500, { kicker: `Week ${wk} · PPR`, title: `Week ${wk} top scorers`, subtitle: "The ten best fantasy weeks at each position" });
  const { pad, w } = fr;
  const positions = ["QB", "RB", "WR", "TE"];
  const gap = 18, cw = (w - pad * 2 - gap * 3) / 4;
  let s = "";
  const y0 = fr.top - 4;
  positions.forEach((pos, i) => {
    const x0 = pad + i * (cw + gap);
    s += R(x0, y0, cw, 6, { rx: 3, fill: posColor(pos) });
    s += T(x0, y0 + 40, pos, { size: 26, weight: 800, fill: posColor(pos) });
    const rows = (DATA.week_top[pos] || []).slice(0, 10);
    const rowH = (fr.bottom - y0 - 60) / 10;
    rows.forEach((p, r) => {
      const ry = y0 + 58 + r * rowH;
      const cy = ry + rowH / 2;
      if (r % 2 === 0) s += R(x0 - 6, ry + 2, cw + 12, rowH - 4, { rx: 14, fill: "var(--panel)" });
      s += face(p.player_id, x0 + 26, cy, 24, teamColor(p.team_abbreviation), p.name);
      const nm = fitSize(lastName(p.name), cw - 62 - 76, [20, 18, 16], 700);
      s += T(x0 + 60, cy - 8, nm.text, { size: nm.size, weight: 700 });
      const ln = fitSize(`${p.team_abbreviation} · ${shortLine(p, pos)}`, cw - 62, [15, 14, 13]);
      s += T(x0 + 60, cy + 18, ln.text, { size: ln.size, fill: "var(--muted)" });
      s += T(x0 + cw - 4, cy - 6, num(p.fantasy_points), { size: 22, weight: 800, anchor: "end", mono: true });
    });
  });
  return wrapCard(fr, s);
}

// C5 ----------------------------------------------------- Risers and fallers
function driver(m) {
  if (m.position === "RB") {
    const dc = (m.c1 ?? 0) - (m.c0 ?? 0), dt = (m.t1 ?? 0) - (m.t0 ?? 0);
    return Math.abs(dc) >= Math.abs(dt) * 1.5 ? `Carry share ${pct(m.c0)} → ${pct(m.c1)}` : `Target share ${pct(m.t0)} → ${pct(m.t1)}`;
  }
  return `Target share ${pct(m.t0)} → ${pct(m.t1)}${Math.abs((m.s1 ?? 0) - (m.s0 ?? 0)) >= 0.1 ? `, snaps ${pct(m.s0)} → ${pct(m.s1)}` : ""}`;
}
function cardRisers() {
  const wk = DATA.recap_week;
  const fr = frame(1200, 1500, { kicker: `Through Week ${wk} · PPR`, title: "Usage risers and fallers", subtitle: `Expected points per game, Weeks 1-${wk - 3} against Weeks ${wk - 2}-${wk}. Games cut short are left out.` });
  const { pad, w } = fr;
  const up = DATA.risers.slice(0, 6), down = DATA.fallers.slice(0, 6);
  const all = [...up, ...down];
  const max = Math.ceil(Math.max(...all.map((m) => Math.max(m.x0, m.x1))) / 5) * 5;
  const ax0 = 520, ax1 = w - pad - 130;
  const x = lin(0, max, ax0, ax1);
  let s = "", y = fr.top - 4;
  const rowH = (fr.bottom - y - 2 * 56) / all.length;
  [[up, "Rising", "var(--pos)"], [down, "Falling", "var(--neg)"]].forEach(([list, label, tone]) => {
    s += T(pad, y + 30, label, { size: 26, weight: 800, fill: mix(tone, 72, "var(--fg)") });
    for (let v = 0; v <= max; v += 5) s += T(x(v), y + 30, v, { size: 15, anchor: "middle", mono: true, fill: "var(--faint)" });
    y += 50;
    for (let v = 0; v <= max; v += 5) s += L(x(v), y, x(v), y + rowH * list.length, { stroke: "var(--divider)" });
    list.forEach((m, i) => {
      const cy = y + i * rowH + rowH / 2;
      s += face(m.player_id, pad + 28, cy, 26, teamColor(m.team), m.name);
      s += T(pad + 66, cy - 6, fit(m.name, ax0 - pad - 90, 21, 700), { size: 21, weight: 700 });
      const dl = fitSize(`${m.position} · ${m.team} · ${driver(m)}`, ax0 - pad - 84, [15, 14, 13]);
      s += T(pad + 66, cy + 20, dl.text, { size: dl.size, fill: "var(--muted)" });
      const a = x(m.x0), b = x(m.x1);
      s += L(a, cy, b + (b > a ? -12 : 12), cy, { stroke: mix(tone, 80, "var(--fg)"), sw: 5, cap: "round" });
      s += `<path d="M${b},${cy}L${b + (b > a ? -16 : 16)},${cy - 10}L${b + (b > a ? -16 : 16)},${cy + 10}Z" fill="${mix(tone, 80, "var(--fg)")}"/>`;
      s += C(a, cy, 7, { fill: "var(--card)", stroke: "var(--muted)", sw: 3 });
      s += T(a + (b > a ? -14 : 14), cy + 6, num(m.x0), { size: 15, weight: 600, anchor: b > a ? "end" : "start", mono: true, fill: "var(--muted)" });
      s += T(b + (b > a ? 12 : -12), cy - 14, num(m.x1), { size: 16, weight: 800, anchor: b > a ? "start" : "end", mono: true });
      s += T(w - pad, cy + 8, signed(m.x1 - m.x0), { size: 24, weight: 800, anchor: "end", mono: true, fill: mix(tone, 72, "var(--fg)") });
    });
    y += rowH * list.length + 6;
  });
  return wrapCard(fr, s);
}

// C6 ------------------------------------------------------ Backfield work
function cardBackfield(_, opts = {}) {
  const wk = DATA.recap_week;
  const pool = DATA.rb_work;
  const fr = frame(1600, 900, { kicker: `Weeks 1-${wk}`, title: "Running back workload", subtitle: "Share of team carries against share of team targets" });
  const s = scatterPlot(fr, {
    points: pool.map((p) => ({ id: p.player_id, x: p.rush_attempt_share, y: p.target_share, name: p.name, team: p.team_abbreviation, face: p.player_id, color: teamColor(p.team_abbreviation) })),
    highlight: opts.hl ?? defaultBackfield(), xstep: 0.1, ystep: 0.05, xfmt: pct, yfmt: pct,
    yr: [0, Math.ceil(Math.max(...pool.map((p) => p.target_share)) * 20) / 20],
    refX: median(pool.map((p) => p.rush_attempt_share)), refY: median(pool.map((p) => p.target_share)),
    xlabel: "Carry share \u2192", ylabel: "Target share \u2192",
    key: `Medians of the ${pool.length} backs with 3+ games and 6+ expected points per game`,
    quadrants: [["Carries and targets", mix("var(--pos)", 72, "var(--fg)")], ["Pass-game backs"], ["Early-down backs"], ["Part-time"]],
  });
  return wrapCard(fr, s);
}
const defaultBackfield = () => [...DATA.rb_work].sort((a, b) => b.expected_fantasy_ppg - a.expected_fantasy_ppg).slice(0, 20).map((p) => p.player_id);

// C7 ---------------------------------------------------- Targets per route
function cardRoutes(_, opts = {}) {
  const wk = DATA.recap_week;
  const pool = DATA.routes_pool;
  const fr = frame(1600, 900, { kicker: `Weeks 1-${wk} \u00b7 Receivers`, title: "Who is earning targets", subtitle: "Route participation against targets per route run" });
  const s = scatterPlot(fr, {
    points: pool.map((p) => ({ id: p.player_id, x: p.route_participation, y: p.targets_per_route_run, name: p.name, team: p.team_abbreviation, face: p.player_id, color: teamColor(p.team_abbreviation) })),
    highlight: opts.hl ?? defaultRoutes(), xstep: 0.1, ystep: 0.05, xfmt: pct, yfmt: pct,
    xr: [0.5, 1], refX: median(pool.map((p) => p.route_participation)), refY: median(pool.map((p) => p.targets_per_route_run)),
    xlabel: "Route participation \u2192", ylabel: "Targets per route run \u2192",
    key: `Medians of the ${pool.length} receivers with 50+ routes and 50%+ route participation`,
    quadrants: [["Every route, targets", mix("var(--pos)", 72, "var(--fg)")], ["Part-time, targets"], ["Every route, few targets"], ["Part-time, few targets"]],
  });
  return wrapCard(fr, s);
}
function defaultRoutes() {
  const pool = DATA.routes_pool;
  const top = (key) => [...pool].sort((a, b) => b[key] - a[key]).slice(0, 8).map((p) => p.player_id);
  return [...new Set([...top("targets_per_route_run"), ...top("fantasy_points")])];
}

// C8 -------------------------------------------------- Points against expected
const XVA_POS = { RB: "running backs", WR: "receivers", TE: "tight ends" };
function cardExpected(_, opts = {}) {
  const wk = DATA.recap_week;
  const pos = opts.pos || "WR";
  const pool = DATA.xva_pool[pos];
  const fr = frame(1600, 900, { kicker: `Weeks 1-${wk} \u00b7 PPR`, title: `Points against expected: ${XVA_POS[pos]}`, subtitle: "Points per game against expected points per game. Above the line: scoring more than his work predicts." });
  const s = scatterPlot(fr, {
    points: pool.map((p) => ({ id: p.player_id, x: p.expected_fantasy_ppg, y: p.fantasy_ppg, name: p.name, team: p.team_abbreviation, face: p.player_id, color: teamColor(p.team_abbreviation) })),
    highlight: opts.hl ?? defaultExpected(pos), xstep: 5, ystep: 5, xfmt: (v) => num(v, 0), yfmt: (v) => num(v, 0), xtip: (v) => num(v, 1), ytip: (v) => num(v, 1), diagonal: true,
    xlabel: "Expected points per game \u2192", ylabel: "Points per game \u2192",
    key: `Dashed: points equal to expected. ${pool.length} qualified ${XVA_POS[pos]} with 5+ expected points per game`,
    quadrants: [null, ["Scoring above his work", mix("var(--pos)", 72, "var(--fg)")], ["Scoring below his work", mix("var(--neg)", 72, "var(--fg)")], null],
  });
  return wrapCard(fr, s);
}
function defaultExpected(pos) {
  const pool = DATA.xva_pool[pos].filter((p) => p.expected_fantasy_ppg >= 8);
  const gap = (p) => p.fantasy_ppg - p.expected_fantasy_ppg;
  const over = [...pool].sort((a, b) => gap(b) - gap(a)).slice(0, 6), under = [...pool].sort((a, b) => gap(a) - gap(b)).slice(0, 6);
  const top = [...pool].sort((a, b) => b.expected_fantasy_ppg - a.expected_fantasy_ppg).slice(0, 4);
  return [...new Set([...over, ...under, ...top].map((p) => p.player_id))];
}

// C9 ----------------------------------------------------- Weekly finishes
function cardFinishes(_, opts = {}) {
  const wk = DATA.recap_week;
  const pos = opts.pos || "WR";
  const rows = DATA.finishes[pos];
  const rowH = 40, top = 268;
  const h = Math.max(1500, top + rows.length * rowH + 60 + 120);
  const fr = frame(1200, h, { kicker: `Weeks 1-${wk} \u00b7 PPR`, title: `Weekly finishes: ${pos}`, subtitle: `The top ${rows.length} ${pos}s in total points and where they finished each week` });
  const { pad, w } = fr;
  const weeks = Array.from({ length: wk }, (_, i) => i + 1);
  const totalX = w - pad, cx0 = 520, cw = (totalX - 110 - cx0) / weeks.length;
  let s = "", y = top - 22;
  weeks.forEach((week, i) => { s += T(cx0 + cw * i + cw / 2, y, `W${week}`, { size: 16, weight: 700, anchor: "middle", fill: "var(--faint)" }); });
  s += T(totalX, y, "TOTAL", { size: 15, weight: 700, anchor: "end", fill: "var(--faint)" });
  rows.forEach((p, i) => {
    const cy = top + i * rowH + rowH / 2;
    if (i % 2 === 0) s += R(pad - 10, cy - rowH / 2 + 2, w - pad * 2 + 20, rowH - 4, { rx: 10, fill: "var(--panel)" });
    s += T(pad + 22, cy + 6, i + 1, { size: 16, weight: 700, anchor: "end", mono: true, fill: "var(--faint)" });
    s += face(p.player_id, pad + 50, cy, 15, teamColor(p.team), p.name);
    s += T(pad + 74, cy + 7, fit(p.name, 300, 19, 650), { size: 19, weight: 650 });
    s += T(cx0 - 24, cy + 6, p.team || "", { size: 15, weight: 700, anchor: "end", fill: "var(--muted)" });
    weeks.forEach((week, k) => {
      const cell = p.weeks[week];
      const cx = cx0 + cw * k + cw / 2;
      if (cell) s += chip(cell[0], pos, cx, cy, { size: 15, h: 26, w: cw - 12 });
      else s += T(cx, cy + 5, (DATA.byes[p.team] || []).includes(week) ? "BYE" : "-", { size: 13, weight: 700, anchor: "middle", fill: "var(--faint)" });
    });
    s += T(totalX, cy + 7, num(p.total), { size: 19, weight: 800, anchor: "end", mono: true });
  });
  s += T(pad, fr.bottom - 2, "Colours follow a 12-team league's starting lineup: green starts, yellow is the flex, red sits.", { size: 16, fill: "var(--muted)" });
  return wrapCard(fr, s);
}

// C10 to C13 ---------------------------------------------- The Scatter page's charts
// The app's Scatter page (frontend/src/constants/scatters.js), as tweet cards: one card
// per position, the question as the title, its axes, bubble size and corner names.
// [label, tick format, value format]
const SM = {
  expected_fantasy_ppg: ["Expected points per game", (v) => num(v, 0), (v) => num(v, 1)],
  fantasy_ppg: ["Points per game", (v) => num(v, 0), (v) => num(v, 1)],
  adot: ["Average depth of target", (v) => num(v, 0), (v) => num(v, 1)],
  target_share: ["Target share", (v) => pct(v), (v) => pct(v, 1)],
  yards_per_route_run: ["Yards per route run", (v) => num(v, 1), (v) => num(v, 2)],
  targets_per_route_run: ["Targets per route run", (v) => pct(v), (v) => pct(v, 1)],
  red_zone_targets: ["Red zone targets", (v) => num(v, 0), (v) => num(v, 0)],
  receiving_tds: ["Receiving TDs", (v) => num(v, 0), (v) => num(v, 0)],
  route_participation: ["Route participation", (v) => pct(v), (v) => pct(v, 1)],
  cpoe: ["Completion % over expected", (v) => signed(v, 0), (v) => signed(v, 1)],
  epa_per_play: ["EPA per play", (v) => signed(v, 2), (v) => signed(v, 2)],
  attempts: ["Pass attempts", (v) => num(v, 0), (v) => num(v, 0)],
  ngs_pass_intended_air_yards: ["Average depth of throw", (v) => num(v, 0), (v) => num(v, 1)],
  rush_attempt_share: ["Carry share", (v) => pct(v), (v) => pct(v, 1)],
  rush_att_inside_5: ["Carries inside the 5", (v) => num(v, 0), (v) => num(v, 0)],
  rushing_tds: ["Rushing TDs", (v) => num(v, 0), (v) => num(v, 0)],
  rush_yac_per_att: ["Yards after contact per carry", (v) => num(v, 1), (v) => num(v, 2)],
  ngs_rush_yards_over_expected_per_att: ["Rush yards over expected per carry", (v) => signed(v, 1), (v) => signed(v, 2)],
};
const XVA = (id) => ({ id, label: "Expected vs actual PPG", question: "Who is scoring what his opportunity was worth?", x: "expected_fantasy_ppg", y: "fantasy_ppg", identity: true,
  corners: { topLeft: "Scoring above his opportunity", bottomRight: "Opportunity says more is coming" } });
const RECEIVER_SCATTERS = (p) => [
  { id: `${p}-adot`, label: "aDOT vs target share", question: "Deep threat or high-volume underneath target?", x: "adot", y: "target_share", size: "fantasy_ppg", corners: { topLeft: "Volume underneath", topRight: "Volume downfield" } },
  XVA(`${p}-expected`),
  { id: `${p}-yprr`, label: "Target share vs YPRR", question: "Who earns targets, and who does the most with them?", x: "target_share", y: "yards_per_route_run", size: "fantasy_ppg", corners: { topRight: "Volume and efficiency", bottomRight: "Volume, less efficient", topLeft: "Efficient in a smaller role" } },
  { id: `${p}-tprr`, label: "TPRR vs YPRR", question: "Who wins his routes, and turns that into yards?", x: "targets_per_route_run", y: "yards_per_route_run", corners: { topRight: "Open often, productive", bottomLeft: "Rarely the read" } },
  { id: `${p}-red-zone`, label: "Red zone targets vs TDs", question: "Are his touchdowns backed by red-zone targets?", x: "red_zone_targets", y: "receiving_tds", corners: { topLeft: "Touchdowns without the red-zone work", bottomRight: "Red-zone work, touchdowns to come" } },
  { id: `${p}-part-time`, label: "Route % vs TPRR", question: "Who earns targets when he is out there?", x: "route_participation", y: "targets_per_route_run", corners: { topLeft: "Part-time, earning targets", topRight: "Full-time and earning targets" } },
];
const SCATTERS = {
  QB: [
    { id: "qb-cpoe", label: "CPOE vs EPA per play", question: "Who completes more than expected, and who adds value per play?", x: "cpoe", y: "epa_per_play", size: "attempts", corners: { topRight: "Accurate and efficient", bottomRight: "Accurate, less efficient", topLeft: "Efficient, less accurate", bottomLeft: "Neither" } },
    XVA("qb-expected"),
    { id: "qb-depth", label: "Depth vs CPOE", question: "Who throws deep without giving up accuracy?", x: "ngs_pass_intended_air_yards", y: "cpoe", size: "attempts", corners: { topRight: "Deep and accurate", bottomLeft: "Short and inaccurate" } },
  ],
  RB: [
    { id: "rb-role", label: "Carry share vs route %", question: "Who gets the carries and stays on the field on passing downs?", x: "rush_attempt_share", y: "route_participation", size: "fantasy_ppg", corners: { topRight: "Three-down back", bottomRight: "Early-down back", topLeft: "Passing-down back" } },
    XVA("rb-expected"),
    { id: "rb-goal-line", label: "Carries inside the 5 vs TDs", question: "Are his touchdowns coming from goal-line work?", x: "rush_att_inside_5", y: "rushing_tds", corners: { topLeft: "Scoring without goal-line carries", bottomRight: "Goal-line carries, touchdowns to come" } },
    { id: "rb-contact", label: "Yards after contact vs RYOE", question: "Who creates yards on his own?", x: "rush_yac_per_att", y: "ngs_rush_yards_over_expected_per_att", corners: { topRight: "Creates his own yards", bottomLeft: "Needs the blocking" } },
    { id: "rb-receiving", label: "Target share vs YPRR", question: "Which backs earn targets and do something with them?", x: "target_share", y: "yards_per_route_run", size: "fantasy_ppg", corners: { topRight: "Real receiving role" } },
  ],
  WR: RECEIVER_SCATTERS("wr"),
  TE: RECEIVER_SCATTERS("te"),
};
const POS_PLURAL = { QB: "quarterbacks", RB: "running backs", WR: "receivers", TE: "tight ends" };
const scatterPreset = (pos, id) => SCATTERS[pos].find((s) => s.id === id) ?? SCATTERS[pos][0];
/** The players a chart plots: the top N qualified at the position by points, with both axes. */
// Quarterbacks also need 15 pass attempts a game: games played alone qualifies a backup
// with one throw, whose CPOE (-77) squashes every starter into a corner.
const QB_ATTEMPTS_PER_GAME = 15;
function scatterRows(pos, preset, cap) {
  const rows = DATA.scatter_pool[pos].filter((r) => r[preset.x] != null && r[preset.y] != null
    && (pos !== "QB" || (r.attempts || 0) >= QB_ATTEMPTS_PER_GAME * (r.games_played || 1)));
  return cap === "all" ? rows : rows.slice(0, Number(cap) || 50);
}
/** Faces by default: the eight with the most points and the six furthest from the middle. */
function defaultScatterFaces(pos, opts) {
  const preset = scatterPreset(pos, opts.chart);
  const rows = scatterRows(pos, preset, opts.cap);
  if (!rows.length) return [];
  const xs = rows.map((r) => r[preset.x]), ys = rows.map((r) => r[preset.y]);
  const sx = (Math.max(...xs) - Math.min(...xs)) || 1, sy = (Math.max(...ys) - Math.min(...ys)) || 1;
  const mx = median(xs), my = median(ys);
  const far = [...rows].sort((a, b) => preset.identity
    ? Math.abs(b.fantasy_ppg - b.expected_fantasy_ppg) - Math.abs(a.fantasy_ppg - a.expected_fantasy_ppg)
    : Math.hypot((b[preset.x] - mx) / sx, (b[preset.y] - my) / sy) - Math.hypot((a[preset.x] - mx) / sx, (a[preset.y] - my) / sy));
  return [...new Set([...rows.slice(0, 8), ...far.slice(0, 6)].map((r) => r.player_id))];
}
function cardScatter(pos, opts) {
  const wk = DATA.recap_week;
  const preset = scatterPreset(pos, opts.chart);
  const rows = scatterRows(pos, preset, opts.cap);
  const [xl, xfmt, xtip] = SM[preset.x], [yl, yfmt, ytip] = SM[preset.y];
  const who = (opts.cap === "all" ? `all ${rows.length} qualified ${POS_PLURAL[pos]}` : `the top ${rows.length} ${POS_PLURAL[pos]} in points`)
    + (pos === "QB" ? ` with ${QB_ATTEMPTS_PER_GAME}+ attempts a game` : "");
  const fr = frame(1600, 900, { kicker: `Weeks 1-${wk} · ${POS_PLURAL[pos]}`, title: preset.question, subtitle: `${xl} against ${lowerFirst(yl)}${preset.size ? `. Dot size: ${lowerFirst(SM[preset.size][0])}` : ""}` });
  const c = preset.corners || {};
  const xs = rows.map((r) => r[preset.x]), ys = rows.map((r) => r[preset.y]);
  const s = scatterPlot(fr, {
    points: rows.map((r) => ({ id: r.player_id, x: r[preset.x], y: r[preset.y], z: preset.size ? r[preset.size] : null, name: r.name, team: r.team_abbreviation, face: r.player_id, color: teamColor(r.team_abbreviation) })),
    highlight: opts.hl ?? defaultScatterFaces(pos, opts), xstep: "auto", ystep: "auto", xfmt, yfmt, xtip, ytip,
    zlabel: preset.size ? SM[preset.size][0] : null, ztip: preset.size ? SM[preset.size][2] : null,
    diagonal: !!preset.identity, refX: preset.identity ? null : median(xs), refY: preset.identity ? null : median(ys),
    xlabel: `${xl} →`, ylabel: `${yl} →`,
    key: preset.identity ? `Dashed: scoring exactly as expected. ${who[0].toUpperCase()}${who.slice(1)}` : `Dashed: medians of ${who}`,
    quadrants: [c.topRight ? [c.topRight, mix("var(--pos)", 72, "var(--fg)")] : null, c.topLeft ? [c.topLeft] : null, c.bottomRight ? [c.bottomRight] : null, c.bottomLeft ? [c.bottomLeft, mix("var(--neg)", 72, "var(--fg)")] : null],
  });
  return wrapCard(fr, s);
}
