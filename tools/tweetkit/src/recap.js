// A: game recap cards, one per recap tab worth tweeting.
const sidesOf = (g) => [g.header.away.abbreviation, g.header.home.abbreviation];
const scoreTitle = (g) => {
  const { away, home } = g.header;
  const [w, l] = away.score > home.score ? [away, home] : [home, away];
  return `${nickname(w.abbreviation)} ${w.score}, ${nickname(l.abbreviation)} ${l.score}`;
};
const venueLine = (g) => { const k = kickoff(g.header); return `${g.header.stadium || ""} · ${k.day}, ${k.date}`; };
const finalWord = (g) => (g.header.overtime ? "Final/OT" : "Final");
const periodName = (q, n) => (q >= 5 ? (n > 5 ? `OT${q - 4}` : "OT") : `Q${q}`);

/** Win probability: home's side above the middle in its colour, away's below. */
function wpChart(g, x0, y0, W, H, o = {}) {
  const [away, home] = sidesOf(g);
  const colors = gameColors(away, home);
  const series = g.wp.series;
  const end = Math.max(g.wp.end, 3600);
  const pad = { l: o.left ?? 92, r: 10, t: 14, b: 40 };
  const x = lin(0, end, x0 + pad.l, x0 + W - pad.r);
  const y = lin(0, 1, y0 + H - pad.b, y0 + pad.t);
  const mid = y(0.5);
  const pts = [[x(0), y(g.wp.pregame ?? series[0][1])], ...series.map(([t, v]) => [x(t), y(v)])];
  const area = `${pathOf(pts)}L${x(series[series.length - 1][0]).toFixed(1)},${mid}L${x(0)},${mid}Z`;
  const top = nextId("wt"), bot = nextId("wb");
  const fs = o.font ?? 18;
  let s = `<clipPath id="${top}"><rect x="${x0}" y="${y0}" width="${W}" height="${mid - y0}"/></clipPath><clipPath id="${bot}"><rect x="${x0}" y="${mid}" width="${W}" height="${y0 + H - mid}"/></clipPath>`;
  for (const v of [0.25, 0.75]) s += L(x0 + pad.l, y(v), x0 + W - pad.r, y(v));
  const quarters = [["1st", 0, 900], ["2nd", 900, 1800], ["3rd", 1800, 2700], ["4th", 2700, 3600]];
  if (end > 3600) quarters.push(["OT", 3600, end]);
  for (const [label, a, b] of quarters) {
    if (a > 0) s += L(x(a), y0 + pad.t, x(a), y0 + H - pad.b, { dash: "4 5" });
    s += T((x(a) + x(Math.min(b, end))) / 2, y0 + H - 10, label, { size: fs, weight: 600, anchor: "middle", fill: "var(--faint)" });
  }
  const logoSize = o.logo ?? 40;
  s += logo(home, x0 + 4, y0 + pad.t, logoSize) + logo(away, x0 + 4, y0 + H - pad.b - logoSize, logoSize);
  s += T(x0 + pad.l - 10, mid + 6, "50%", { size: fs - 2, anchor: "end", fill: "var(--faint)" });
  s += `<path d="${area}" fill="${colors[home]}" fill-opacity="0.7" clip-path="url(#${top})"/>`;
  s += `<path d="${area}" fill="${colors[away]}" fill-opacity="0.7" clip-path="url(#${bot})"/>`;
  s += L(x0 + pad.l, mid, x0 + W - pad.r, mid, { stroke: "var(--plot-rule)", sw: 1.5 });
  s += `<path d="${pathOf(pts)}" fill="none" stroke="var(--fg)" stroke-width="${o.stroke ?? 2.6}" stroke-linejoin="round"/>`;
  for (const sc of g.scoring) {
    const isHome = sc.team === home, yy = isHome ? y0 + pad.t - 4 : y0 + H - pad.b + 4, cx = x(sc.elapsed ?? 0), k = o.tri ?? 7;
    s += `<path d="M${cx - k},${yy}L${cx + k},${yy}L${cx},${yy + (isHome ? 1.6 * k : -1.6 * k)}Z" fill="${colors[sc.team]}" stroke="var(--card)" stroke-width="1"/>`;
  }
  const n = o.numbered ?? 0, placed = [], r = o.markerR ?? 16;
  g.swings.slice(0, n).forEach((sw, i) => {
    const cx = x(sw.elapsed), natural = y(sw.home_wp);
    // Nudge one way only (toward the middle), a bounded number of times: flipping
    // direction at the 50% line can bounce between two markers forever.
    let cy = natural;
    const step = natural > mid ? -(r * 2.2) : r * 2.2;
    for (let k = 0; k < 8 && placed.some(([px, py]) => Math.abs(px - cx) < r * 2.1 && Math.abs(py - cy) < r * 2.1); k++) cy += step;
    placed.push([cx, cy]);
    if (Math.abs(cy - natural) > 2) s += L(cx, natural, cx, cy, { stroke: "var(--fg)", sw: 1.5 });
    s += C(cx, cy, r, { fill: "var(--card)", stroke: "var(--fg)", sw: 2.4 }) + T(cx, cy + r * 0.38, i + 1, { size: r * 1.05, weight: 800, anchor: "middle" });
  });
  return s;
}

function linescore(g, x0, y0, w, o = {}) {
  const [away, home] = sidesOf(g);
  const per = g.header.periods || ["1", "2", "3", "4"];
  const cols = per.map((p, i) => periodName(i + 1, per.length)).concat(["T"]);
  const cw = o.cw ?? 74, rh = o.rh ?? 46, lead = w - cw * cols.length;
  let s = "";
  cols.forEach((c, i) => { s += T(x0 + lead + cw * i + cw / 2, y0 + 22, c, { size: 18, weight: 700, anchor: "middle", fill: "var(--faint)" }); });
  [away, home].forEach((team, r) => {
    const side = r ? g.header.home : g.header.away;
    const yy = y0 + 36 + r * rh;
    s += L(x0, yy, x0 + w, yy, { stroke: "var(--rule)" });
    s += logo(team, x0, yy + 7, rh - 14) + T(x0 + rh + 4, yy + rh / 2 + 8, team, { size: 23, weight: 700 });
    const vals = [...(side.linescore || []), side.score];
    vals.forEach((v, i) => {
      const last = i === vals.length - 1;
      s += T(x0 + lead + cw * i + cw / 2, yy + rh / 2 + 9, v ?? "-", { size: last ? 26 : 23, weight: last ? 800 : 600, anchor: "middle", mono: true, fill: last ? "var(--fg)" : "var(--muted)" });
    });
  });
  return s;
}

// A1 ---------------------------------------------------------------- Final
function cardFinal(g) {
  const fr = frame(1200, 1500, { kicker: `${g.header.week_label} · ${finalWord(g)}`, title: scoreTitle(g), subtitle: venueLine(g) });
  const [away, home] = sidesOf(g);
  const colors = gameColors(away, home);
  const { pad, w } = fr;
  let s = "", y = fr.top;
  // Scoreboard
  const bandH = 200;
  s += R(pad, y, w - pad * 2, bandH, { rx: 26, fill: "var(--panel)" });
  const winner = g.header.away.score > g.header.home.score ? away : home;
  [away, home].forEach((team, i) => {
    const side = i ? g.header.home : g.header.away;
    const left = i === 0;
    const lx = left ? pad + 34 : w - pad - 34 - 124;
    s += logo(team, lx, y + 38, 124);
    const tx = left ? lx + 148 : lx - 24;
    s += T(tx, y + 92, nickname(team), { size: 38, weight: 750, anchor: left ? "start" : "end" });
    s += T(tx, y + 128, side.record || "", { size: 22, weight: 500, anchor: left ? "start" : "end", fill: "var(--muted)", mono: true });
    s += T(left ? w / 2 - 60 : w / 2 + 60, y + 134, side.score, { size: 104, weight: 800, anchor: left ? "end" : "start", mono: true, fill: team === winner ? "var(--fg)" : "var(--faint)" });
  });
  s += T(w / 2, y + 108, finalWord(g).toUpperCase(), { size: 17, weight: 750, anchor: "middle", fill: "var(--faint)", ls: 1.5 });
  y += bandH + 30;
  // Linescore + line result
  s += linescore(g, pad, y, 560);
  const lr = g.header.line_result;
  const fav = g.header.favorite;
  const facts = [
    ["Line", fav ? `${fav} −${Math.abs(g.header.spread_line)}` : "Pick'em"],
    ["Total", `${g.header.total_line}`],
    ["Covered", lr ? (lr.push ? "Push" : lr.covered) : "-"],
    ["Result", lr ? `${lr.over_under === "over" ? "Over" : lr.over_under === "under" ? "Under" : "Push"}, ${lr.total_points} pts` : "-"],
  ];
  facts.forEach(([k, v], i) => {
    const fx = pad + 640 + (i % 2) * 230, fy = y + 18 + Math.floor(i / 2) * 64;
    s += T(fx, fy + 12, k.toUpperCase(), { size: 15, weight: 700, fill: "var(--faint)", ls: 1.4 });
    s += T(fx, fy + 44, v, { size: 26, weight: 700 });
  });
  y += 36 + 46 * 2 + 44;
  // Win probability
  s += T(pad, y, "Win probability", { size: 25, weight: 750 });
  const flow = g.flow || {};
  s += T(w - pad, y, `Lead changes ${flow.lead_changes ?? 0} · Biggest lead ${away} ${flow.largest_lead?.[away] ?? 0}, ${home} ${flow.largest_lead?.[home] ?? 0}`, { size: 19, anchor: "end", fill: "var(--muted)" });
  y += 16;
  s += wpChart(g, pad, y, w - pad * 2, 300, { numbered: 0, logo: 40, font: 18 });
  y += 300 + 50;
  // Top fantasy scorers
  s += T(pad, y, "Top fantasy scorers", { size: 25, weight: 750 });
  s += T(w - pad, y, "PPR · finish among the week's players at his position", { size: 18, anchor: "end", fill: "var(--muted)" });
  y += 26;
  const colW = (w - pad * 2 - 28) / 2;
  [away, home].forEach((team, i) => {
    const x0 = pad + i * (colW + 28);
    const rows = g.players.filter((p) => p.team === team).sort((a, b) => b.fantasy_points - a.fantasy_points).slice(0, 3);
    rows.forEach((p, r) => {
      const ry = y + r * 122;
      s += R(x0, ry, colW, 108, { rx: 20, fill: "var(--panel)" });
      s += face(p.player_id, x0 + 54, ry + 54, 36, colors[team], p.name);
      s += T(x0 + 104, ry + 46, fit(p.name, colW - 230, 24, 700), { size: 24, weight: 700 });
      s += T(x0 + 104, ry + 78, fit(`${p.position} · ${statLine(p, true)}`, colW - 220, 17, 500), { size: 17, fill: "var(--muted)" });
      s += T(x0 + colW - 22, ry + 52, num(p.fantasy_points), { size: 34, weight: 800, anchor: "end", mono: true });
      s += chip(p.position_rank, p.position, x0 + colW - 62, ry + 80, { size: 16, h: 26 });
    });
  });
  return wrapCard(fr, s);
}

// A2 ------------------------------------------------------- Fantasy box score
function cardBox(g) {
  const fr = frame(1200, 1500, { kicker: `${g.header.week_label} · PPR`, title: `${scoreTitle(g)}: fantasy points`, subtitle: "Bar: points this game. Tick: his average coming in." });
  const [away, home] = sidesOf(g);
  const colors = gameColors(away, home);
  const { pad, w } = fr;
  let s = "", y = fr.top - 6;
  const per = (team) => g.players.filter((p) => p.team === team && (p.targets + p.carries + p.attempts) > 0)
    .sort((a, b) => b.fantasy_points - a.fantasy_points).slice(0, 7);
  const lists = [per(away), per(home)];
  const top = Math.max(25, Math.ceil(Math.max(...lists.flat().map((p) => Math.max(p.fantasy_points, p.average_coming_in || 0))) / 5) * 5);
  const bx0 = 560, bx1 = 900;
  const x = lin(0, top, bx0, bx1);
  const rowH = Math.min(78, (fr.bottom - y - 26 - 2 * 82) / (lists[0].length + lists[1].length));
  s += T(bx0, y + 10, "0", { size: 15, anchor: "middle", fill: "var(--faint)", mono: true });
  for (let v = 10; v <= top; v += 10) s += T(x(v), y + 10, v, { size: 15, anchor: "middle", fill: "var(--faint)", mono: true });
  s += T(976, y + 10, "PPR", { size: 15, weight: 700, anchor: "end", fill: "var(--faint)" });
  s += T(1040, y + 10, "FINISH", { size: 15, weight: 700, anchor: "middle", fill: "var(--faint)" });
  s += T(w - pad, y + 10, "VS AVG", { size: 15, weight: 700, anchor: "end", fill: "var(--faint)" });
  y += 26;
  [away, home].forEach((team, ti) => {
    const side = ti ? g.header.home : g.header.away;
    s += logo(team, pad, y + 6, 40) + T(pad + 52, y + 36, `${TEAMS[team].name}`, { size: 25, weight: 750 }) +
      T(pad + 52 + textWidth(TEAMS[team].name, 25, 750) + 14, y + 36, side.score, { size: 25, weight: 750, mono: true, fill: "var(--muted)" });
    y += 58;
    for (let v = 0; v <= top; v += 10) s += L(x(v), y, x(v), y + rowH * lists[ti].length, { stroke: "var(--divider)" });
    lists[ti].forEach((p, i) => {
      const mid = y + i * rowH + rowH / 2;
      if (i) s += L(pad, y + i * rowH, w - pad, y + i * rowH, { stroke: "var(--divider)" });
      s += face(p.player_id, pad + 26, mid, 24, colors[team], p.name);
      s += T(pad + 64, mid - 4, fit(p.name, 300, 22, 700), { size: 22, weight: 700 });
      s += T(pad + 64 + Math.min(300, textWidth(p.name, 22, 700)) + 10, mid - 4, p.position, { size: 15, weight: 700, fill: posColor(p.position) });
      s += T(pad + 64, mid + 22, fit(statLine(p), bx0 - pad - 84, 16, 500), { size: 16, fill: "var(--muted)" });
      s += R(bx0, mid - 12, Math.max(3, x(Math.max(0, p.fantasy_points)) - bx0), 24, { rx: 6, fill: colors[team], opacity: 0.88 });
      const has = p.games_coming_in > 0 && p.average_coming_in != null;
      if (has) s += R(x(Math.max(0, p.average_coming_in)) - 2.5, mid - 18, 5, 36, { rx: 2.5, fill: "var(--fg)" });
      s += T(976, mid + 8, num(p.fantasy_points), { size: 24, weight: 800, anchor: "end", mono: true });
      s += chip(p.position_rank, p.position, 1040, mid, { size: 16, h: 28 });
      if (has) {
        const d = p.fantasy_points - p.average_coming_in;
        s += T(w - pad, mid + 7, signed(d), { size: 20, weight: 700, anchor: "end", mono: true, fill: mix(d >= 0 ? "var(--pos)" : "var(--neg)", 72, "var(--fg)") });
      } else s += T(w - pad, mid + 6, "1st game", { size: 15, anchor: "end", fill: "var(--faint)" });
    });
    y += rowH * lists[ti].length + 24;
  });
  return wrapCard(fr, s);
}

// A3 ------------------------------------------------------ Win probability
function cardWp(g) {
  const fr = frame(1600, 900, { kicker: `${g.header.week_label} · Win probability`, title: scoreTitle(g), subtitle: "Chance to win after every play, starting from the line. Numbered: the biggest swings." });
  const [away, home] = sidesOf(g);
  const colors = gameColors(away, home);
  const { pad, w } = fr;
  const listW = 470;
  const chartW = w - pad * 2 - listW - 40;
  const y = fr.top - 4;
  const H = fr.bottom - y;
  let s = wpChart(g, pad, y, chartW, H, { numbered: 5, logo: 52, font: 21, left: 108, markerR: 19, tri: 9, stroke: 3 });
  const lx = pad + chartW + 40;
  s += T(lx, y + 18, "BIGGEST SWINGS", { size: 17, weight: 750, fill: "var(--faint)", ls: 1.6 });
  const swings = g.swings.slice(0, 5);
  const rowH = Math.min(112, (H - 40) / swings.length);
  swings.forEach((sw, i) => {
    const ry = y + 44 + i * rowH;
    s += C(lx + 20, ry + 26, 19, { fill: "var(--card)", stroke: "var(--fg)", sw: 2.4 }) + T(lx + 20, ry + 34, i + 1, { size: 20, weight: 800, anchor: "middle" });
    const gain = sw.team === home ? sw.home_delta : -sw.home_delta;
    s += T(lx + 54, ry + 22, `${periodName(sw.quarter, (g.header.periods || []).length)} ${String(sw.clock || "").replace(/^0/, "")} · ${sw.team}`, { size: 18, weight: 700, fill: teamText(colors[sw.team]) });
    s += T(lx + listW, ry + 22, `${signed(Math.abs(gain) * 100, 0)}%`, { size: 20, weight: 800, anchor: "end", mono: true, fill: teamText(colors[sw.team]) });
    s += T(lx + 54, ry + 54, fit(sw.text, listW - 54, 21, 600), { size: 21, weight: 600 });
    s += T(lx + 54, ry + 82, `${sw.team} win chance ${pct(sw.team === home ? sw.home_wp : 1 - sw.home_wp)}`, { size: 17, fill: "var(--muted)" });
  });
  return wrapCard(fr, s);
}

// A4 ------------------------------------------------------ Who got the ball
function cardTouches(g) {
  const [away, home] = sidesOf(g);
  const fr = frame(1600, 900, { kicker: `${g.header.week_label} · Every target and carry`, title: `${nickname(away)} at ${nickname(home)}`, subtitle: "Each player's targets and carries on the game clock" });
  const colors = gameColors(away, home);
  const { pad, w } = fr;
  const byId = Object.fromEntries(g.players.map((p) => [p.player_id, p]));
  const end = Math.max(g.wp.end, 3600);
  const nx0 = pad, tx0 = pad + 300, tx1 = w - pad - 250;
  const x = lin(0, end, tx0, tx1);
  let y = fr.top - 6;
  // Legend
  const items = [
    [(cx, cy) => C(cx, cy, 8, { fill: "var(--card)", stroke: "var(--muted)", sw: 2 }), "Target"],
    [(cx, cy) => C(cx, cy, 8, { fill: "var(--muted)", stroke: "var(--muted)", sw: 2 }), "Catch"],
    [(cx, cy) => R(cx - 8, cy - 8, 16, 16, { rx: 3, fill: mix("var(--muted)", 56, "var(--card)"), stroke: "var(--muted)", sw: 1.5 }), "Carry"],
    [(cx, cy) => C(cx, cy, 8, { fill: "var(--muted)" }) + C(cx, cy, 13, { stroke: "var(--accent)", sw: 2.5 }), "Touchdown"],
  ];
  const lw = legendRow(0, 0, items, 18).w;
  let s = legendRow(w - pad - lw, fr.top - 70, items, 18).svg;
  const quarters = [[1, 0, 900], [2, 900, 1800], [3, 1800, 2700], [4, 2700, 3600]];
  if (end > 3600) quarters.push([5, 3600, end]);
  const blocks = [away, home].map((team) => {
    const counts = {};
    for (const t of g.touches) if (byId[t.player]?.team === team) counts[t.player] = (counts[t.player] || 0) + 1;
    return { team, rows: Object.keys(counts).filter((id) => counts[id] >= 2).sort((a, b) => counts[b] - counts[a]).slice(0, 5).map((id) => byId[id]) };
  });
  const totalRows = blocks.reduce((n, b) => n + b.rows.length, 0);
  const rowH = Math.min(52, (fr.bottom - y - 40 - 2 * 48) / totalRows);
  const plotTop = y + 30, plotBottom = plotTop + 2 * 48 + totalRows * rowH;
  quarters.forEach(([q, a, b], i) => {
    if (i % 2 === 1) s += R(x(a), plotTop, x(Math.min(b, end)) - x(a), plotBottom - plotTop, { fill: mix("var(--fg)", 4) });
    s += T((x(a) + x(Math.min(b, end))) / 2, y + 16, periodName(q, quarters.length), { size: 19, weight: 700, anchor: "middle", fill: "var(--faint)" });
  });
  y = plotTop;
  for (const { team, rows } of blocks) {
    s += logo(team, nx0, y + 10, 32) + T(nx0 + 42, y + 34, TEAMS[team].name, { size: 22, weight: 750, fill: teamText(colors[team]) });
    y += 48;
    rows.forEach((p) => {
      const cy = y + rowH / 2;
      s += L(tx0, cy, tx1, cy, { stroke: "var(--divider)" });
      s += face(p.player_id, nx0 + 20, cy, 18, colors[team], p.name);
      s += T(nx0 + 48, cy + 7, fit(p.name, 240, 20, 650), { size: 20, weight: 650 });
      const mine = g.touches.filter((t) => t.player === p.player_id);
      const tg = mine.filter((t) => t.kind === "target").length;
      const k = Math.min(9, rowH * 0.18);
      mine.forEach((t) => {
        const cx = x(t.t);
        if (t.td) s += C(cx, cy, k + 6, { stroke: "var(--accent)", sw: 2.8 });
        s += t.kind === "target" ? C(cx, cy, k, { fill: t.caught ? colors[team] : "var(--card)", stroke: colors[team], sw: 2.2 })
          : R(cx - k, cy - k, k * 2, k * 2, { rx: 3, fill: mix(colors[team], 56, "var(--card)"), stroke: colors[team], sw: 1.6 });
      });
      s += `<text x="${tx1 + 24}" y="${cy + 7}" font-size="19" font-family="${MONO}" fill="var(--muted)"><tspan font-weight="800" fill="var(--fg)">${tg}</tspan> tgt <tspan font-weight="800" fill="var(--fg)">${mine.length - tg}</tspan> car</text>`;
      s += T(w - pad, cy + 7, num(p.fantasy_points), { size: 20, weight: 800, anchor: "end", mono: true });
      y += rowH;
    });
  }
  s += T(w - pad, plotTop + 20, "PPR", { size: 15, weight: 700, anchor: "end", fill: "var(--faint)" });
  return wrapCard(fr, s);
}

// A5 ------------------------------------------------------------ Team stats
function cardTeamStats(g) {
  const [away, home] = sidesOf(g);
  const n = g.ranks.teams;
  const fr = frame(1200, 1500, { kicker: g.header.week_label, title: `${scoreTitle(g)}: team stats`, subtitle: `Chip: rank among the ${n} teams that played in ${g.header.week_label}` });
  const colors = gameColors(away, home);
  const { pad, w } = fr;
  const b = g.box, rk = g.ranks.metrics;
  const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
  const frac = (a, t) => `${a ?? 0}/${t ?? 0}`;
  const rows = [
    ["Total yards", (t) => num(b[t].yards, 0), null, (t) => b[t].yards],
    ["Yards per play", (t) => num(b[t].yards_per_play, 1), null, (t) => b[t].yards_per_play],
    ["EPA per play", (t) => signed(b[t].epa_per_play, 2), "epa", (t) => b[t].epa_per_play],
    ["Success rate", (t) => pct(b[t].success_rate, 0), "suc", (t) => b[t].success_rate],
    ["EPA per dropback", (t) => signed(b[t].epa_per_dropback, 2), "p_epa", (t) => b[t].epa_per_dropback],
    ["EPA per designed run", (t) => signed(b[t].epa_per_run, 2), "r_epa", (t) => b[t].epa_per_run],
    ["Explosive plays", (t) => num(b[t].explosive_plays, 0), "explosive", (t) => b[t].explosive_plays],
    ["Third down", (t) => frac(b[t].third_down_conversions, b[t].third_down_attempts), "d3", (t) => b[t].third_down_conversions / Math.max(1, b[t].third_down_attempts)],
    ["Red zone TDs", (t) => frac(b[t].red_zone_tds, b[t].red_zone_trips), "rz_td", (t) => b[t].red_zone_tds / Math.max(1, b[t].red_zone_trips)],
    ["Points per drive", (t) => num(b[t].points_per_drive, 2), "pts_drive", (t) => b[t].points_per_drive],
    ["Turnovers", (t) => num(b[t].turnovers, 0), null, (t) => -b[t].turnovers],
    ["Time of possession", (t) => mmss(b[t].time_of_possession), null, (t) => b[t].time_of_possession],
  ];
  let y = fr.top;
  let s = "";
  // Team heads
  [away, home].forEach((team, i) => {
    const left = i === 0;
    s += logo(team, left ? pad : w - pad - 64, y, 64);
    s += T(left ? pad + 80 : w - pad - 80, y + 44, TEAMS[team].name, { size: 27, weight: 750, anchor: left ? "start" : "end", fill: teamText(colors[team]) });
  });
  y += 92;
  const rowH = 68;
  rows.forEach(([label, fmt, rankKey, cmp], i) => {
    const ry = y + i * rowH;
    if (i % 2 === 0) s += R(pad, ry, w - pad * 2, rowH, { rx: 14, fill: "var(--panel)" });
    const better = cmp(away) === cmp(home) ? null : cmp(away) > cmp(home) ? away : home;
    s += T(w / 2, ry + rowH / 2 + 8, label, { size: 21, weight: 600, anchor: "middle", fill: "var(--muted)" });
    [away, home].forEach((team, ti) => {
      const left = ti === 0;
      const vx = left ? pad + 124 : w - pad - 124;
      s += T(vx, ry + rowH / 2 + 10, fmt(team), { size: 28, weight: better === team ? 800 : 600, anchor: left ? "start" : "end", mono: true, fill: better === team ? teamText(colors[team]) : "var(--fg)" });
      if (rankKey && rk[rankKey]?.[team]) {
        const rank = rk[rankKey][team][1];
        const label = ord(rank);
        const cw = 70, cx = left ? pad + 20 + cw / 2 : w - pad - 20 - cw / 2;
        s += R(cx - cw / 2, ry + rowH / 2 - 15, cw, 30, { rx: 9, fill: mix(rankColor(rank, n), 26) });
        s += T(cx, ry + rowH / 2 + 7, label, { size: 17, weight: 700, anchor: "middle", mono: true, fill: mix(rankColor(rank, n), 62, "var(--fg)") });
      }
    });
  });
  y += rows.length * rowH + 44;
  // EPA per play by quarter
  s += T(pad, y, "EPA per play by quarter", { size: 25, weight: 750 });
  y += 20;
  const quarters = [...new Set([away, home].flatMap((t) => (g.epa_q[t] || []).map((r) => r.quarter)))].sort((a, b2) => a - b2);
  const cols = quarters.length + 1, labelW = 200, cw = (w - pad * 2 - labelW) / cols;
  [...quarters.map((q) => periodName(q, quarters.length)), "Game"].forEach((c, i) => { s += T(pad + labelW + cw * i + cw / 2, y + 26, c, { size: 18, weight: 700, anchor: "middle", fill: "var(--faint)" }); });
  y += 40;
  const leagueEpa = g.league?.epa_per_play ?? 0;
  [away, home].forEach((team) => {
    const rowsQ = g.epa_q[team] || [];
    const plays = rowsQ.reduce((a, r) => a + r.plays, 0), epa = rowsQ.reduce((a, r) => a + r.epa, 0);
    const vals = [...quarters.map((q) => { const r = rowsQ.find((x) => x.quarter === q); return r && r.plays ? r.epa / r.plays : null; }), plays ? epa / plays : null];
    s += logo(team, pad, y + 10, 36) + T(pad + 48, y + 36, team, { size: 22, weight: 750 });
    vals.forEach((v, i) => {
      const cx = pad + labelW + cw * i;
      const t = v == null ? null : Math.max(-1, Math.min(1, (v - leagueEpa) / 0.5));
      const tone = t == null ? "var(--panel)" : t >= 0 ? mix("var(--pos)", Math.round(t * 46)) : mix("var(--neg)", Math.round(-t * 46));
      s += R(cx + 4, y + 4, cw - 8, 50, { rx: 10, fill: tone });
      s += T(cx + cw / 2, y + 38, v == null ? "-" : signed(v, 2), { size: 22, weight: i === vals.length - 1 ? 800 : 650, anchor: "middle", mono: true });
    });
    y += 60;
  });
  return wrapCard(fr, s);
}

// A6 ------------------------------------------------------------- Drive chart
const DRIVE_SHORT = { Touchdown: "TD", "Field goal": "FG", "Missed field goal": "Missed FG", Turnover: "Turnover", "Turnover on downs": "Downs", "End of half": "Half", "End of game": "End", "Opp touchdown": "Opp TD", Punt: "Punt", Safety: "Safety" };
function cardDrives(g) {
  const [away, home] = sidesOf(g);
  const fr = frame(1200, 1500, { kicker: `${g.header.week_label} · Every possession`, title: `${nickname(away)} at ${nickname(home)}`, subtitle: "Each drive from where it started toward the end zone. Solid: points." });
  const colors = gameColors(away, home);
  const { pad, w } = fr;
  const drives = g.drives;
  const periods = (g.header.periods || []).length;
  const lead = 150, tail = 290;
  const x = lin(0, 100, pad + lead, w - pad - tail);
  let y = fr.top + 6;
  const rowH = Math.min(54, (fr.bottom - y - 40) / drives.length);
  let s2 = R(x(100), y + 18, x(106) - x(100), rowH * drives.length + 8, { fill: mix("var(--accent)", 14) });
  for (let yard = 10; yard < 100; yard += 10) {
    s2 += L(x(yard), y + 18, x(yard), y + 26 + rowH * drives.length, { stroke: yard === 50 ? "var(--plot-rule)" : "var(--divider)" });
    s2 += T(x(yard), y + 8, yard <= 50 ? yard : 100 - yard, { size: 15, anchor: "middle", mono: true, fill: "var(--faint)" });
  }
  s2 += T(x(103), y + 8, "END ZONE", { size: 12, weight: 700, anchor: "middle", fill: "var(--accent-text)" });
  let quarter = 0;
  drives.forEach((d, i) => {
    const ry = y + 22 + i * rowH, cy = ry + rowH / 2;
    if (d.quarter !== quarter && i) s2 += L(pad, ry, w - pad, ry, { stroke: "var(--rule)" });
    quarter = d.quarter;
    const color = colors[d.team];
    const scored = d.result === "Touchdown" || d.result === "Field goal";
    const start = x(d.start ?? 0), finish = x(d.result === "Touchdown" ? 100 : d.end ?? d.start ?? 0);
    s2 += logo(d.team, pad, cy - 14, 28);
    s2 += T(pad + 36, cy + 6, `${periodName(d.quarter, periods)} ${String(d.clock ?? "").replace(/^0/, "")}`, { size: 16, weight: 600, mono: true, fill: "var(--muted)" });
    s2 += R(Math.min(start, finish), cy - rowH * 0.27, Math.max(4, Math.abs(finish - start)), rowH * 0.54, { rx: 6, fill: scored ? color : mix(color, 14, "var(--card)"), stroke: color, sw: 2 });
    s2 += C(start, cy, 4, { fill: "var(--fg)" });
    // A game's last drive comes through as "End of half" too.
    const label = d.result === "End of half" && d.quarter >= 4 ? "End" : DRIVE_SHORT[d.result] ?? d.result ?? "";
    s2 += T(x(106) + 14, cy + 6, label, { size: 17, weight: scored ? 800 : 600, fill: scored ? "var(--fg)" : "var(--muted)" });
    s2 += T(w - pad, cy + 6, `${d.plays} pl, ${d.yards} yd`, { size: 15, anchor: "end", mono: true, fill: "var(--faint)" });
  });
  s2 += T(pad, fr.bottom - 2, "Right: plays and yards on the drive. Yard lines count up to midfield and back down.", { size: 16, fill: "var(--muted)" });
  return wrapCard(fr, s2);
}

// A7 ----------------------------------------------------- Points against expected
function cardGameExpected(g, opts = {}) {
  const [away, home] = sidesOf(g);
  const colors = gameColors(away, home);
  const fr = frame(1600, 900, { kicker: `${g.header.week_label} · PPR`, title: `${scoreTitle(g)}: points against expected`, subtitle: "Each player's points against what his targets and carries were worth" });
  const pool = g.players.filter((p) => (p.expected_fantasy_points ?? 0) >= 1 || p.fantasy_points >= 1);
  const s = scatterPlot(fr, {
    points: pool.map((p) => ({ id: p.player_id, x: p.expected_fantasy_points ?? 0, y: p.fantasy_points, name: p.name, face: p.player_id, color: colors[p.team] })),
    highlight: opts.hl ?? defaultGameExpected(g), xstep: 5, ystep: 5, xfmt: (v) => num(v, 0), yfmt: (v) => num(v, 0), diagonal: true,
    xlabel: "Expected points →", ylabel: "Points →", r: 27,
    key: `Dashed: points equal to expected. ${nickname(away)} and ${nickname(home)} in their colours`,
    quadrants: [null, ["Beat his expected", mix("var(--pos)", 72, "var(--fg)")], ["Fell short", mix("var(--neg)", 72, "var(--fg)")], null],
  });
  return wrapCard(fr, s);
}
function defaultGameExpected(g) {
  const [away, home] = sidesOf(g);
  const top = (team) => g.players.filter((p) => p.team === team).sort((a, b) => b.fantasy_points - a.fantasy_points).slice(0, 4);
  const short = [...g.players].sort((a, b) => (a.fantasy_points - (a.expected_fantasy_points ?? 0)) - (b.fantasy_points - (b.expected_fantasy_points ?? 0))).slice(0, 2);
  return [...new Set([...top(away), ...top(home), ...short].map((p) => p.player_id))];
}

// A8 ------------------------------------------------------------ Score and scoring plays
function cardScoreFlow(g) {
  const [away, home] = sidesOf(g);
  const colors = gameColors(away, home);
  const fr = frame(1600, 900, { kicker: `${g.header.week_label} · ${finalWord(g)}`, title: scoreTitle(g), subtitle: "The score through the game, and every scoring play" });
  const { pad, w } = fr;
  const end = Math.max(g.wp.end, 3600);
  const plays = [...g.scoring].sort((a, b) => (a.elapsed ?? 0) - (b.elapsed ?? 0));
  const final = { [away]: g.header.away.score, [home]: g.header.home.score };
  const px0 = pad + 56, px1 = w - pad - 150, py0 = fr.top + 10, py1 = fr.top + 330;
  const top = Math.max(7, ...Object.values(final));
  const step = niceStep(0, top, 4), ymax = Math.ceil(top / step) * step;
  const x = lin(0, end, px0, px1), y = lin(0, ymax, py1, py0);
  let s = "";
  const quarters = [[1, 0, 900], [2, 900, 1800], [3, 1800, 2700], [4, 2700, 3600]];
  if (end > 3600) quarters.push([5, 3600, end]);
  quarters.forEach(([q, a, b], i) => {
    if (i % 2 === 1) s += R(x(a), py0, x(Math.min(b, end)) - x(a), py1 - py0, { fill: mix("var(--fg)", 4) });
    s += T((x(a) + x(Math.min(b, end))) / 2, py1 + 28, periodName(q, quarters.length), { size: 17, weight: 700, anchor: "middle", fill: "var(--faint)" });
  });
  for (let v = 0; v <= ymax; v += step) s += L(px0, y(v), px1, y(v), { stroke: v ? "var(--divider)" : "var(--plot-rule)" }) + T(px0 - 12, y(v) + 6, v, { size: 16, anchor: "end", mono: true, fill: "var(--faint)" });
  // Each team's score as a step line, then numbered markers where it changed.
  for (const team of [away, home]) {
    const key = team === home ? "home_score" : "away_score";
    let at = 0;
    const pts = [[x(0), y(0)]];
    for (const p of plays) { pts.push([x(p.elapsed), y(at)]); at = p[key]; pts.push([x(p.elapsed), y(at)]); }
    pts.push([x(end), y(at)]);
    s += `<path d="${pathOf(pts)}" fill="none" stroke="${colors[team]}" stroke-width="5" stroke-linejoin="round"/>`;
    s += logo(team, px1 + 18, y(at) - 22, 44) + T(px1 + 72, y(at) + 11, at, { size: 32, weight: 800, mono: true, fill: teamText(colors[team]) });
  }
  plays.forEach((p, i) => {
    const key = p.team === home ? "home_score" : "away_score";
    const cx = x(p.elapsed), cy = y(p[key]);
    s += C(cx, cy, 13, { fill: colors[p.team], stroke: "var(--card)", sw: 2.5 }) + T(cx, cy + 5, i + 1, { size: 14, weight: 800, anchor: "middle", fill: inkOn(colors[p.team]) });
  });
  // The list, in two columns.
  const ly = py1 + 64, perCol = Math.ceil(plays.length / 2) || 1;
  const rowH = Math.min(46, (fr.bottom - ly) / perCol), colW = (w - pad * 2 - 40) / 2;
  plays.forEach((p, i) => {
    const col = Math.floor(i / perCol), row = i % perCol;
    const x0 = pad + col * (colW + 40), cy = ly + row * rowH + rowH / 2;
    s += C(x0 + 14, cy, 13, { fill: colors[p.team] }) + T(x0 + 14, cy + 5, i + 1, { size: 14, weight: 800, anchor: "middle", fill: inkOn(colors[p.team]) });
    s += T(x0 + 38, cy + 6, `${periodName(p.quarter, (g.header.periods || []).length)} ${String(p.clock ?? "").replace(/^0/, "")}`, { size: 15, weight: 600, mono: true, fill: "var(--muted)" });
    s += logo(p.team, x0 + 124, cy - 13, 26);
    s += T(x0 + 160, cy + 6, fit(p.text, colW - 160 - 100, 17, 600), { size: 17, weight: 600 });
    s += T(x0 + colW, cy + 6, `${p.away_score}-${p.home_score}`, { size: 17, weight: 800, anchor: "end", mono: true });
  });
  s += T(w - pad, ly - 26, `Score: ${away}-${home}`, { size: 15, weight: 650, anchor: "end", fill: "var(--faint)" });
  return wrapCard(fr, s);
}

// A9 ------------------------------------------------------------ NFL box score
function cardBoxNfl(g) {
  const [away, home] = sidesOf(g);
  const colors = gameColors(away, home);
  const by = (team) => g.players.filter((p) => p.team === team);
  const sections = (team) => [
    ["Passing", ["C/ATT", "YDS", "TD", "INT"], by(team).filter((p) => p.attempts > 0).sort((a, b) => b.attempts - a.attempts).slice(0, 2),
      (p) => [`${p.completions}/${p.attempts}`, p.passing_yards, p.passing_tds, p.interceptions]],
    ["Rushing", ["CAR", "YDS", "AVG", "TD"], by(team).filter((p) => p.carries > 0).sort((a, b) => b.rushing_yards - a.rushing_yards).slice(0, 4),
      (p) => [p.carries, p.rushing_yards, num(p.rushing_yards / p.carries, 1), p.rushing_tds]],
    ["Receiving", ["REC/TGT", "YDS", "AVG", "TD"], by(team).filter((p) => p.targets > 0).sort((a, b) => b.receiving_yards - a.receiving_yards || b.receptions - a.receptions).slice(0, 6),
      (p) => [`${p.receptions}/${p.targets}`, p.receiving_yards, p.receptions ? num(p.receiving_yards / p.receptions, 1) : "-", p.receiving_tds]],
  ];
  // Rows grow to fill a 1500 card, and the card grows past 1500 only when a team has more rows than fit.
  const headH = 44, top = 236, foot = 120 + 150;
  const maxRows = Math.max(...[away, home].map((team) => sections(team).reduce((a, [, , rows]) => a + Math.max(1, rows.length), 0)));
  const rowH = Math.max(46, Math.min(58, (1500 - top - foot - 80 - 3 * (headH + 18)) / maxRows));
  const h = Math.max(1500, Math.round(top + 80 + 3 * (headH + 18) + maxRows * rowH + foot));
  const fr = frame(1200, h, { kicker: `${g.header.week_label} · ${finalWord(g)}`, title: `${scoreTitle(g)}: box score`, subtitle: venueLine(g) });
  const { pad, w } = fr;
  const colW = (w - pad * 2 - 36) / 2;
  let s = "";
  [away, home].forEach((team, ti) => {
    const x0 = pad + ti * (colW + 36);
    let y = fr.top;
    s += R(x0, y, colW, 60, { rx: 16, fill: mix(colors[team], 16, "var(--card)") });
    s += logo(team, x0 + 14, y + 10, 40) + T(x0 + 64, y + 39, TEAMS[team].name, { size: 23, weight: 800, fill: teamText(colors[team]) });
    s += T(x0 + colW - 18, y + 41, ti ? g.header.home.score : g.header.away.score, { size: 30, weight: 800, anchor: "end", mono: true });
    y += 80;
    const cx = [colW - 222, colW - 144, colW - 74, colW - 12];
    for (const [title, heads, rows, vals] of sections(team)) {
      s += T(x0, y + 26, title, { size: 20, weight: 800 });
      heads.forEach((hd, k) => { s += T(x0 + cx[k], y + 26, hd, { size: 13, weight: 750, anchor: "end", fill: "var(--faint)", ls: 1 }); });
      y += headH;
      rows.forEach((p, r) => {
        const cy = y + r * rowH + rowH / 2;
        if (r % 2 === 0) s += R(x0 - 6, cy - rowH / 2 + 2, colW + 12, rowH - 4, { rx: 10, fill: "var(--panel)" });
        s += face(p.player_id, x0 + 18, cy, rowH > 52 ? 18 : 15, colors[team], p.name);
        s += T(x0 + 46, cy + 7, fit(shortName(p.name), cx[0] - 116, 19, 650), { size: 19, weight: 650 });
        vals(p).forEach((v, k) => { s += T(x0 + cx[k], cy + 7, v, { size: 19, weight: k === 1 ? 800 : 550, anchor: "end", mono: true }); });
      });
      if (!rows.length) s += T(x0, y + 24, "None", { size: 16, fill: "var(--faint)" });
      y += Math.max(1, rows.length) * rowH + 18;
    }
  });
  // The team box under both columns: yards, first downs, third downs, turnovers, possession.
  const b = g.box;
  const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
  const facts = [["Total yards", (t) => b[t].yards], ["First downs", (t) => b[t].first_downs], ["Third down", (t) => `${b[t].third_down_conversions}/${b[t].third_down_attempts}`],
    ["Turnovers", (t) => b[t].turnovers], ["Sacks taken", (t) => b[t].sacks], ["Possession", (t) => mmss(b[t].time_of_possession)]];
  const fy = fr.bottom - 100, fw = (w - pad * 2) / facts.length;
  s += L(pad, fy - 16, w - pad, fy - 16, { stroke: "var(--rule)" });
  facts.forEach(([k, f], i) => {
    const cx = pad + fw * i + fw / 2;
    s += T(cx, fy + 10, k.toUpperCase(), { size: 13, weight: 750, anchor: "middle", fill: "var(--faint)", ls: 1 });
    s += `<text x="${num(cx, 1)}" y="${num(fy + 50, 1)}" text-anchor="middle" font-size="21" font-weight="800" font-family="${MONO}"><tspan fill="${teamText(colors[away])}">${esc(f(away))}</tspan><tspan fill="var(--faint)" font-weight="500"> - </tspan><tspan fill="${teamText(colors[home])}">${esc(f(home))}</tspan></text>`;
  });
  return wrapCard(fr, s);
}

/** Each team's main passer in a game: whoever threw the most. */
function mainPassers(g) {
  const out = {};
  for (const [team, ids] of Object.entries(g.passers)) {
    const rows = ids.map((id) => g.players.find((p) => p.player_id === id)).filter(Boolean).sort((a, b) => (b.attempts || 0) - (a.attempts || 0));
    if (rows[0]) out[team] = rows[0];
  }
  return out;
}
const passLine = (p) => `${p.completions}/${p.attempts}, ${p.passing_yards} yds, ${p.passing_tds} TD, ${p.interceptions} INT`;

// A10 ----------------------------------------------------------- Passing networks
function cardGameNetworks(g) {
  const [away, home] = sidesOf(g);
  const colors = gameColors(away, home);
  const qbs = mainPassers(g);
  const fr = frame(1600, 900, { kicker: `${g.header.week_label} · Passing networks`, title: `${nickname(away)} at ${nickname(home)}: where the ball went`, subtitle: "Each quarterback's targets by receiver: share, depth and side of the field" });
  const { pad, w } = fr;
  const panelW = (w - pad * 2 - 40) / 2;
  let s = "";
  [away, home].forEach((team, i) => {
    const x0 = pad + i * (panelW + 40);
    const qb = qbs[team];
    s += logo(team, x0, fr.top - 8, 36);
    if (!qb) { s += T(x0 + 46, fr.top + 18, "No passer", { size: 20, fill: "var(--faint)" }); return; }
    s += T(x0 + 46, fr.top + 18, qb.name, { size: 23, weight: 800, fill: teamText(colors[team]) });
    s += T(x0 + panelW, fr.top + 18, passLine(qb), { size: 17, anchor: "end", mono: true, fill: "var(--muted)" });
    const net = windowNetwork(qb.player_id, [g.header.week], "all");
    if (!net) return;
    const { shown } = shapeNet(net.receivers, 6);
    s += networkField(x0 - 8, fr.top + 36, panelW + 8, fr.bottom - fr.top - 80, net, shown, { bands: false, scale: 0.92, name: 17, sub: 14 });
  });
  s += networkKey(pad + 44, fr.bottom - 8);
  return wrapCard(fr, s);
}

// A11 ----------------------------------------------------------- Passing charts
function throwField(x0, y0, W, H, throws, color, o = {}) {
  const deep = Math.max(30, Math.ceil(Math.max(0, ...throws.map((t) => t[0] ?? 0)) / 10) * 10 + 5);
  const y = lin(-8, deep, y0 + H, y0);
  let s = R(x0, y0, W, H, { rx: 16, fill: "var(--panel)" });
  for (let v = -5; v <= deep; v += 5) {
    const major = v % 10 === 0;
    s += L(x0, y(v), x0 + W, y(v), { stroke: v === 0 ? "var(--accent)" : major ? "var(--rule)" : "var(--divider)", sw: v === 0 ? 3 : 1.2 });
    if (major && v > 0) s += T(x0 + 12, y(v) + 20, v, { size: 15, weight: 700, mono: true, fill: "var(--faint)" });
  }
  s += T(x0 + 12, y(0) - 8, "LOS", { size: 14, weight: 800, fill: "var(--accent-text)" });
  const third = W / 3;
  for (const k of [1, 2]) s += L(x0 + third * k, y0, x0 + third * k, y0 + H, { stroke: "var(--rule)", dash: "6 8" });
  if (o.sides !== false) ["Left", "Middle", "Right"].forEach((side, k) => { s += T(x0 + third * k + third / 2, y0 + H + 24, side, { size: 16, weight: 700, anchor: "middle", fill: "var(--muted)" }); });
  const cols = { left: 0, middle: 1, right: 2 };
  throws.filter((t) => t[0] != null && t[1]).forEach((t, i) => {
    const [ay, loc, comp, td, int] = t;
    const cx = x0 + third * cols[loc] + third * (0.14 + 0.72 * hash01(i, 3));
    const cy = y(Math.max(-7, Math.min(deep, ay + (hash01(i, 4) - 0.5) * 0.8)));
    if (int) s += L(cx - 9, cy - 9, cx + 9, cy + 9, { stroke: "var(--neg)", sw: 4, cap: "round" }) + L(cx - 9, cy + 9, cx + 9, cy - 9, { stroke: "var(--neg)", sw: 4, cap: "round" });
    else {
      if (td) s += C(cx, cy, 16, { stroke: "var(--fg)", sw: 3 });
      s += C(cx, cy, 10, { fill: comp ? color : "var(--card)", stroke: color, sw: comp ? 1.5 : 2.5 });
    }
  });
  return s;
}
const throwLegend = (x, cy, color) => legendRow(x, cy, [
  [(cx, c) => C(cx, c, 9, { fill: color, stroke: color, sw: 2 }), "Complete"],
  [(cx, c) => C(cx, c, 9, { fill: "var(--card)", stroke: color, sw: 2.5 }), "Incomplete"],
  [(cx, c) => C(cx, c, 8, { fill: color }) + C(cx, c, 13, { stroke: "var(--fg)", sw: 2.5 }), "Touchdown"],
  [(cx, c) => L(cx - 8, c - 8, cx + 8, c + 8, { stroke: "var(--neg)", sw: 4, cap: "round" }) + L(cx - 8, c + 8, cx + 8, c - 8, { stroke: "var(--neg)", sw: 4, cap: "round" }), "Interception"],
], 17).svg;
function cardGameThrows(g) {
  const [away, home] = sidesOf(g);
  const colors = gameColors(away, home);
  const qbs = mainPassers(g);
  const fr = frame(1600, 900, { kicker: `${g.header.week_label} · Every throw`, title: `${nickname(away)} at ${nickname(home)}: passing charts`, subtitle: "Each targeted pass by depth past the line and side of the field" });
  const { pad, w } = fr;
  const panelW = (w - pad * 2 - 40) / 2;
  let s = throwLegend(w - pad - 600, fr.top - 66, "var(--muted)");
  [away, home].forEach((team, i) => {
    const x0 = pad + i * (panelW + 40);
    const qb = qbs[team];
    s += logo(team, x0, fr.top - 8, 36);
    if (!qb) return;
    const throws = g.throws[qb.player_id] || [];
    const charted = throws.filter((t) => t[0] != null);
    const adot = charted.length ? charted.reduce((a, t) => a + t[0], 0) / charted.length : null;
    const deep = charted.filter((t) => t[0] >= 20);
    s += T(x0 + 46, fr.top + 18, qb.name, { size: 23, weight: 800, fill: teamText(colors[team]) });
    s += T(x0 + panelW, fr.top + 18, passLine(qb), { size: 17, anchor: "end", mono: true, fill: "var(--muted)" });
    s += throwField(x0, fr.top + 40, panelW, fr.bottom - fr.top - 110, throws, colors[team]);
    s += T(x0, fr.bottom - 6, `aDOT ${adot == null ? "-" : num(adot, 1)} · 20+ yards: ${deep.filter((t) => t[2]).length} of ${deep.length} complete`, { size: 17, weight: 650, fill: "var(--muted)" });
  });
  return wrapCard(fr, s);
}

// A12 ----------------------------------------------------------- Standout
/** A player's rank that week at his position for one weekly-line stat (1 = most), ties shared. */
function weekRank(pid, pos, value) {
  const week = DATA.recap_week;
  const me = DATA.weekly_lines[pid]?.w[week];
  if (!me) return null;
  const mine = value(me);
  if (!mine) return null;
  let better = 0;
  for (const e of Object.values(DATA.weekly_lines)) if (e.pos === pos && e.w[week] && value(e.w[week]) > mine) better += 1;
  return better + 1;
}
function defaultStandout(g) {
  return [...g.players].sort((a, b) => b.fantasy_points - a.fantasy_points)[0]?.player_id;
}
function cardStandout(g, opts = {}) {
  const p = g.players.find((x) => x.player_id === opts.who) || g.players.find((x) => x.player_id === defaultStandout(g));
  const [away, home] = sidesOf(g);
  const colors = gameColors(away, home);
  const team = p.team, opp = team === home ? away : home;
  const mine = team === home ? g.header.home.score : g.header.away.score, theirs = team === home ? g.header.away.score : g.header.home.score;
  const result = `${mine > theirs ? "W" : mine < theirs ? "L" : "T"} ${mine}-${theirs} ${team === home ? "vs" : "at"} ${TEAMS[opp]?.name || opp}`;
  const fr = frame(1600, 900, { kicker: `${g.header.week_label} · ${p.position} · ${TEAMS[team]?.name || team}`, title: p.name, subtitle: result, headshot: { pid: p.player_id, name: p.name, ring: colors[team] } });
  const { pad, w } = fr;
  const rank = (fn) => (cx, cy) => { const rk = weekRank(p.player_id, p.position, fn); return rk ? chip(rk, p.position, cx, cy, { size: 15, h: 26, w: 58 }) : ""; };
  const groups = [];
  if (p.attempts >= 5) groups.push({ label: "Passing", cells: [
    { label: "Comp/Att", value: `${p.completions}/${p.attempts}`, chip: rank((t) => t[1]) },
    { label: "Yards", value: String(p.passing_yards), chip: rank((t) => t[2]) },
    { label: "TD", value: String(p.passing_tds), chip: rank((t) => t[3]) },
    { label: "INT", value: String(p.interceptions) }] });
  if (p.carries >= (p.position === "QB" || p.position === "RB" ? 2 : 1) && (p.position === "RB" || p.rushing_yards >= 15 || p.rushing_tds)) groups.push({ label: "Rushing", cells: [
    { label: "Carries", value: String(p.carries), chip: rank((t) => t[5]) },
    { label: "Yards", value: String(p.rushing_yards), chip: rank((t) => t[6]) },
    { label: "TD", value: String(p.rushing_tds), chip: rank((t) => t[7]) }] });
  if (p.targets > 0 && p.position !== "QB") groups.push({ label: "Receiving", cells: [
    { label: "Rec/Tgt", value: `${p.receptions}/${p.targets}`, chip: rank((t) => t[9]) },
    { label: "Yards", value: String(p.receiving_yards), chip: rank((t) => t[10]) },
    { label: "TD", value: String(p.receiving_tds), chip: rank((t) => t[11]) }] });
  const cells = groups.reduce((a, gr) => a + gr.cells.length, 0);
  let s = tileGroups(pad, fr.top - 4, w - pad * 2, groups.slice(0, cells > 8 ? 2 : 3), { cellH: 136 }).svg;
  const y0 = fr.top + 196;
  s += T(w - pad, y0 - 18, `Chip: his rank among ${POS_PLURAL[p.position]} in ${g.header.week_label}`, { size: 16, anchor: "end", fill: "var(--muted)" });
  const color = colors[team];
  if (p.position === "QB") {
    // A quarterback's game is his throws.
    const throws = g.throws[p.player_id] || [];
    s += T(pad, y0 + 10, "Every throw", { size: 23, weight: 750 }) + throwLegend(pad + 200, y0 + 2, color);
    s += throwField(pad, y0 + 34, w - pad * 2, fr.bottom - y0 - 64, throws, color);
  } else {
    // Everyone else: each target and carry on the game clock, height the yards it gained.
    const mine = g.touches.filter((t) => t.player === p.player_id);
    const end = Math.max(g.wp.end, 3600);
    const px0 = pad + 60, px1 = w - pad - 10, py0 = y0 + 50, py1 = fr.bottom - 40;
    const top = Math.max(10, ...mine.map((t) => t.yards || 0)), bottom = Math.min(0, ...mine.map((t) => t.yards || 0));
    const step = niceStep(bottom, top, 4);
    const ylo = Math.floor(bottom / step) * step, yhi = Math.ceil(top / step) * step;
    const x = lin(0, end, px0, px1), y = lin(ylo, yhi, py1, py0);
    s += T(pad, y0 + 10, "Every touch", { size: 23, weight: 750 });
    s += legendRow(pad + 190, y0 + 2, [
      [(cx, cy) => C(cx, cy, 8, { fill: color, stroke: color, sw: 2 }), "Catch"], [(cx, cy) => C(cx, cy, 8, { fill: "var(--card)", stroke: color, sw: 2.5 }), "Incomplete"],
      [(cx, cy) => R(cx - 8, cy - 8, 16, 16, { rx: 3, fill: mix(color, 56, "var(--card)"), stroke: color, sw: 1.5 }), "Carry"], [(cx, cy) => C(cx, cy, 8, { fill: color }) + C(cx, cy, 13, { stroke: "var(--accent)", sw: 2.5 }), "Touchdown"]], 17).svg;
    const quarters = [[1, 0, 900], [2, 900, 1800], [3, 1800, 2700], [4, 2700, 3600]];
    if (end > 3600) quarters.push([5, 3600, end]);
    quarters.forEach(([q, a, b], i) => {
      if (i % 2 === 1) s += R(x(a), py0, x(Math.min(b, end)) - x(a), py1 - py0, { fill: mix("var(--fg)", 4) });
      s += T((x(a) + x(Math.min(b, end))) / 2, py1 + 28, periodName(q, quarters.length), { size: 16, weight: 700, anchor: "middle", fill: "var(--faint)" });
    });
    for (const v of axisTicks(ylo, yhi, step)) s += L(px0, y(v), px1, y(v), { stroke: v ? "var(--divider)" : "var(--plot-rule)", sw: v ? 1 : 1.5 }) + T(px0 - 10, y(v) + 5, v, { size: 15, anchor: "end", mono: true, fill: "var(--faint)" });
    s += `<text transform="translate(${pad + 6},${(py0 + py1) / 2}) rotate(-90)" text-anchor="middle" font-size="16" font-weight="650" fill="var(--muted)">Yards on the play</text>`;
    for (const t of mine) {
      const cx = x(t.t), v = t.kind === "target" && !t.caught ? 0 : t.yards || 0;
      if (v) s += L(cx, y(0), cx, y(v), { stroke: color, sw: 4, cap: "round", opacity: 0.55 });
      if (t.td) s += C(cx, y(v), 15, { stroke: "var(--accent)", sw: 3 });
      s += t.kind === "target" ? C(cx, y(v), 9, { fill: t.caught ? color : "var(--card)", stroke: color, sw: 2.5 })
        : R(cx - 9, y(v) - 9, 18, 18, { rx: 4, fill: mix(color, 56, "var(--card)"), stroke: color, sw: 1.8 });
      s += `<circle class="hit" cx="${num(cx, 1)}" cy="${num(y(v), 1)}" r="12" fill="transparent" data-tip="${esc([t.kind === "target" ? (t.caught ? "Catch" : "Incomplete") : "Carry", `${t.yards ?? 0} yards${t.td ? ", touchdown" : ""}`].join("|"))}"/>`;
    }
  }
  return wrapCard(fr, s);
}
