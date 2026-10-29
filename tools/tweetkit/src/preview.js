// B: game preview cards.
const pvSides = (pv) => [pv.header.away.abbreviation, pv.header.home.abbreviation];
const pvTitle = (pv) => { const [a, h] = pvSides(pv); return `${nickname(a)} at ${nickname(h)}`; };
const pvWhen = (pv) => { const k = kickoff(pv.header); return `${k.day}, ${k.date} · ${k.time} · ${pv.header.stadium || ""}`; };
const fmtStat = (v, f) => (v == null ? "-" : f === "pct1" ? pct(v, 1) : f === "sgn2" ? signed(v, 2) : f === "num2" ? num(v, 2) : f === "num0" ? num(v, 0) : num(v, 1));
function matchupTone(m) {
  if (!m) return null;
  if (m.rank <= 8) return { label: "Soft", tone: "var(--pos)" };
  if (m.rank >= 25) return { label: "Tough", tone: "var(--neg)" };
  return { label: "Neutral", tone: null };
}
function matchupPill(m, x, cy, o = {}) {
  const t = matchupTone(m);
  if (!t) return { svg: T(x, cy + 6, "-", { size: 18, anchor: o.anchor, fill: "var(--faint)" }), w: 0 };
  return pill(`${t.label} · ${ord(m.rank)}`, x, cy, { size: o.size ?? 17, tone: t.tone, anchor: o.anchor });
}
const lineText = (h) => (h.favorite ? `${h.favorite} −${Math.abs(h.spread_line)}` : h.spread_line === 0 ? "Pick'em" : "No line");

// B1 --------------------------------------------------------------- Matchup
function cardMatchup(pv) {
  const [away, home] = pvSides(pv);
  const h = pv.header;
  const fr = frame(1200, 1500, { kicker: `${h.week_label} preview`, title: pvTitle(pv), subtitle: pvWhen(pv) });
  const colors = gameColors(away, home);
  const { pad, w } = fr;
  let s = "", y = fr.top;
  // Band
  const bandH = 236;
  s += R(pad, y, w - pad * 2, bandH, { rx: 26, fill: "var(--panel)" });
  [away, home].forEach((team, i) => {
    const side = i ? h.home : h.away;
    const left = i === 0;
    const lx = left ? pad + 34 : w - pad - 34 - 128;
    s += logo(team, lx, y + 30, 128);
    const tx = left ? lx + 152 : lx - 24;
    s += T(tx, y + 84, nickname(team), { size: 38, weight: 750, anchor: left ? "start" : "end" });
    s += T(tx, y + 118, `${side.record || ""}${side.rest_days ? ` · ${side.rest_days} days rest` : ""}`, { size: 20, anchor: left ? "start" : "end", fill: "var(--muted)" });
    const imp = left ? h.away_implied : h.home_implied;
    s += T(tx, y + 192, implied(imp), { size: 54, weight: 800, anchor: left ? "start" : "end", mono: true, fill: teamText(colors[team]) });
    const rank = pv.slate.implied_rank?.[team];
    s += T(tx + (left ? 1 : -1) * (textWidth(implied(imp), 54, 800, true) + 14), y + 190, `implied · ${ord(rank)} of ${pv.slate.offenses}`, { size: 18, anchor: left ? "start" : "end", fill: "var(--muted)" });
  });
  s += T(w / 2, y + 86, lineText(h), { size: 30, weight: 800, anchor: "middle", mono: true });
  s += T(w / 2, y + 120, `O/U ${h.total_line}`, { size: 24, weight: 650, anchor: "middle", mono: true, fill: "var(--muted)" });
  y += bandH + 26;
  // Implied split
  const total = (h.away_implied || 0) + (h.home_implied || 0);
  if (total) {
    const bw = w - pad * 2, aw = (bw * h.away_implied) / total;
    s += R(pad, y, aw - 3, 24, { rx: 8, fill: colors[away] }) + R(pad + aw + 3, y, bw - aw - 3, 24, { rx: 8, fill: colors[home] });
    y += 58;
    const facts = [
      pv.slate.total_rank === 1 ? `Highest total of the week's ${pv.slate.games} games` : `${ord(pv.slate.total_rank)} highest total of ${pv.slate.games} games`,
      h.home_win_chance != null ? `Win chance ${home} ${pct(h.home_win_chance)}, ${away} ${pct(1 - h.home_win_chance)}` : "",
      h.div_game ? "Division game" : "",
    ].filter(Boolean);
    s += T(pad, y, facts.join("   ·   "), { size: 20, weight: 550, fill: "var(--muted)" });
    y += 50;
  }
  // Form
  s += T(pad, y, "Last five", { size: 25, weight: 750 });
  y += 20;
  [away, home].forEach((team) => {
    const games = (pv.form[team] || []).slice(-5);
    s += logo(team, pad, y + 8, 44);
    const bx0 = pad + 70, bw = (w - pad - bx0 - 4 * 12) / 5;
    games.forEach((gm, i) => {
      const bx = bx0 + i * (bw + 12);
      const tone = gm.result === "W" ? "var(--pos)" : gm.result === "L" ? "var(--neg)" : "var(--muted)";
      s += R(bx, y + 4, bw, 64, { rx: 14, fill: mix(tone, 12), stroke: mix(tone, 30), sw: 1.5 });
      s += T(bx + 14, y + 28, `W${gm.week} ${gm.home ? "vs" : "@"} ${gm.opponent}`, { size: 16, weight: 650, fill: "var(--muted)" });
      s += T(bx + 14, y + 55, `${gm.result} ${gm.points_for}-${gm.points_against}`, { size: 21, weight: 800, mono: true, fill: mix(tone, 70, "var(--fg)") });
    });
    y += 80;
  });
  y += 40;
  // Matchups by position: each offense against the other defense.
  s += T(pad, y, "Matchups by position", { size: 25, weight: 750 }) + T(w - pad, y, "PPR points allowed per game, rank of 32: 1st allows the most", { size: 18, anchor: "end", fill: "var(--muted)" });
  y += 22;
  [away, home].forEach((team, i) => {
    s += positionTiles(pv, team, i ? away : home, pad, y, w - pad * 2, 138, colors);
    y += 156;
  });
  // Where the edges are: each offense's passing and running against the other defense.
  y += 26;
  s += T(pad, y, "Unit against unit", { size: 25, weight: 750 }) + T(w - pad, y, "Season rank of 32, the edge to the better ranked", { size: 18, anchor: "end", fill: "var(--muted)" });
  y += 14;
  const rh = Math.min(54, (fr.bottom - y) / 4);
  [[away, home], [home, away]].flatMap(([team, opp]) => [["p_epa", `${team} passing vs ${opp} pass defense`, team, opp], ["r_epa", `${team} running vs ${opp} run defense`, team, opp]])
    .forEach(([id, label, team, opp], i) => {
      const cy = y + i * rh + rh / 2;
      if (i % 2 === 0) s += R(pad - 10, cy - rh / 2 + 2, w - pad * 2 + 20, rh - 4, { rx: 12, fill: "var(--panel)" });
      s += edgeRow(pad, w - pad, cy, { id, label, team, opp, colors, logos: true });
    });
  return wrapCard(fr, s);
}
/** One offense's four matchups: the points the other defense allows each position, ranked. */
function positionTiles(pv, team, opp, x0, y0, W, H, colors) {
  const labelW = 150, gap = 14;
  let s = logo(team, x0, y0 + H / 2 - 46, 52);
  s += T(x0, y0 + H / 2 + 34, `${team} offense`, { size: 18, weight: 750, fill: teamText(colors[team]) });
  s += T(x0, y0 + H / 2 + 58, `vs ${opp} defense`, { size: 16, fill: "var(--muted)" });
  const tw = (W - labelW - gap * 3) / 4;
  ["QB", "RB", "WR", "TE"].forEach((pos, k) => {
    const m = pv.pa.defenses[opp]?.[pos], avg = pv.pa.league[pos];
    const tx = x0 + labelW + k * (tw + gap);
    const color = m ? rankColor(m.rank, m.teams) : "var(--faint)";
    s += R(tx, y0, tw, H, { rx: 18, fill: mix(color, 13, "var(--card)"), stroke: mix(color, 34), sw: 1.5 });
    s += T(tx + 18, y0 + 32, pos, { size: 18, weight: 800, fill: posColor(pos) });
    if (!m) return;
    const tone = matchupTone(m);
    s += T(tx + tw - 18, y0 + 32, tone.label, { size: 16, weight: 750, anchor: "end", fill: mix(color, 62, "var(--fg)") });
    s += T(tx + 18, y0 + H * 0.5 + 16, ord(m.rank), { size: 40, weight: 800, mono: true, fill: mix(color, 55, "var(--fg)") });
    s += T(tx + 18, y0 + H - 18, `${num(m.points_allowed)} a game`, { size: 16, weight: 600, mono: true, fill: "var(--muted)" });
    if (avg) s += T(tx + tw - 18, y0 + H - 18, `${signed((m.points_allowed / avg - 1) * 100, 0)}%`, { size: 16, weight: 750, anchor: "end", mono: true, fill: mix(color, 62, "var(--fg)") });
  });
  return s;
}

// B2 ------------------------------------------------------ Fantasy matchup
function cardPreviewFantasy(pv) {
  const [away, home] = pvSides(pv);
  const h = pv.header;
  const fr = frame(1200, 1500, { kicker: `${h.week_label} preview · PPR`, title: `${pvTitle(pv)}: fantasy matchup`, subtitle: "Points per game, expected points per game, and each week's finish" });
  const colors = gameColors(away, home);
  const { pad, w } = fr;
  let s = "", y = fr.top - 4;
  const weeks = (pv.players[away]?.[0]?.weeks || pv.players[home]?.[0]?.weeks || []).map((wk) => wk.week);
  const cx0 = 610, cw = 60;
  const colPPG = 470, colX = 558;
  s += T(colPPG, y + 10, "PPG", { size: 15, weight: 700, anchor: "end", fill: "var(--faint)" });
  s += T(colX, y + 10, "xPPG", { size: 15, weight: 700, anchor: "end", fill: "var(--faint)" });
  weeks.forEach((wk, i) => { s += T(cx0 + i * cw + cw / 2, y + 10, `W${wk}`, { size: 15, weight: 700, anchor: "middle", fill: "var(--faint)" }); });
  s += T(w - pad, y + 10, "MATCHUP", { size: 15, weight: 700, anchor: "end", fill: "var(--faint)" });
  y += 28;
  const lists = [away, home].map((team) => (pv.players[team] || []).filter((p) => p.games >= 2 && (p.position !== "QB" || p.fantasy_ppg > 5))
    .sort((a, b) => b.fantasy_ppg - a.fantasy_ppg).slice(0, 6));
  const rowH = Math.min(76, (fr.bottom - y - 2 * 62 - 70) / (lists[0].length + lists[1].length));
  [away, home].forEach((team, ti) => {
    const opp = ti ? away : home;
    s += logo(team, pad, y + 6, 40) + T(pad + 52, y + 36, `${TEAMS[team].name}`, { size: 25, weight: 750 });
    s += T(w - pad, y + 34, `vs ${opp} defense`, { size: 17, anchor: "end", fill: "var(--muted)" });
    y += 60;
    lists[ti].forEach((p, i) => {
      const mid = y + i * rowH + rowH / 2;
      if (i % 2 === 0) s += R(pad - 10, y + i * rowH + 2, w - pad * 2 + 20, rowH - 4, { rx: 14, fill: "var(--panel)" });
      s += face(p.player_id, pad + 24, mid, 23, colors[team], p.name);
      s += T(pad + 60, mid + 8, fit(p.name, 270, 22, 700), { size: 22, weight: 700 });
      s += T(pad + 60 + Math.min(270, textWidth(p.name, 22, 700)) + 10, mid + 8, p.position, { size: 15, weight: 700, fill: posColor(p.position) });
      s += T(colPPG, mid + 8, num(p.fantasy_ppg), { size: 23, weight: 800, anchor: "end", mono: true });
      s += T(colX, mid + 8, num(p.expected_fantasy_ppg), { size: 21, weight: 600, anchor: "end", mono: true, fill: "var(--muted)" });
      p.weeks.forEach((wk, wi) => {
        const cx = cx0 + wi * cw + cw / 2;
        if (wk.bye) s += T(cx, mid + 6, "BYE", { size: 14, weight: 700, anchor: "middle", fill: "var(--faint)" });
        else if (!wk.played) s += T(cx, mid + 6, "-", { size: 16, anchor: "middle", fill: "var(--faint)" });
        else s += chip(wk.position_rank, p.position, cx, mid, { size: 14, h: 26, w: 54 });
      });
      s += matchupPill(p.matchup, w - pad, mid, { anchor: "end", size: 16 }).svg;
    });
    y += rowH * lists[ti].length + 26;
  });
  const lg = "Matchup: rank of 32 in fantasy points allowed to the position, 1st allows the most. Soft: top 8. Tough: bottom 8.";
  s += T(pad, fr.bottom - 4, fit(lg, w - pad * 2, 17), { size: 17, fill: "var(--muted)" });
  return wrapCard(fr, s);
}

// B3 ---------------------------------------------------------- Tale of the tape
// Offense against offense on the left, defense against defense on the right: each row is
// one stat's rank track, both teams on it, the line in the colour of the one ranked higher.
const TAPE_ROWS = [["ppg", "Points per game", "Points allowed"], ["epa", "EPA per play"], ["suc", "Success rate"], ["p_epa", "EPA per dropback"],
  ["r_epa", "EPA per run"], ["explosive", "Explosive rate"], ["pts_drive", "Points per drive"], ["rz_td", "Red zone TD rate"],
  ["d3", "Third down rate"], ["sack_rate", "Sack rate"]];
/** Rank tracks for both teams, last on the left and 1st on the right. rows: [{label, a: [value, rank], b: [value, rank], fmt}]. */
function rankTracks(x0, y0, W, H, rows, teams, colors, n, o = {}) {
  const [ta, tb] = teams;
  const labelW = o.labelW ?? 214, valW = 76;
  const tx0 = x0 + labelW, tx1 = x0 + W - valW * 2 - 12;
  const x = lin(n, 1, tx0 + 18, tx1 - 18);
  let s = T(tx0 + 18, y0 - 6, o.worst ?? `${ord(n)}`, { size: 15, weight: 700, fill: "var(--faint)" }) + T(tx1 - 18, y0 - 6, o.best ?? "1st", { size: 15, weight: 700, anchor: "end", fill: "var(--faint)" });
  [ta, tb].forEach((team, k) => { s += logo(team, tx1 + 12 + valW * k + valW / 2 - 14, y0 - 30, 28); });
  const rowH = H / rows.length;
  rows.forEach((row, i) => {
    const cy = y0 + i * rowH + rowH / 2;
    if (i % 2 === 0) s += R(x0 - 10, cy - rowH / 2 + 2, W + 20, rowH - 4, { rx: 12, fill: "var(--panel)" });
    const lb = fitSize(row.label, labelW - 12, [19, 18, 17, 16], 600);
    s += T(x0, cy + 7, lb.text, { size: lb.size, weight: 600, fill: "var(--muted)" });
    s += L(tx0 + 18, cy, tx1 - 18, cy, { stroke: "var(--rule)", sw: 6, cap: "round" });
    const ra = row.a?.[1], rb = row.b?.[1];
    if (ra != null && rb != null) {
      const lead = ra < rb ? ta : rb < ra ? tb : null;
      s += L(x(ra), cy, x(rb), cy, { stroke: lead ? colors[lead] : "var(--muted)", sw: 6, cap: "round", opacity: 0.85 });
      const close = Math.abs(x(ra) - x(rb)) < 34;
      for (const [team, r, dy] of [[tb, rb, close ? 11 : 0], [ta, ra, close ? -11 : 0]]) {
        s += C(x(r), cy + dy, 17, { fill: "var(--card)", stroke: colors[team], sw: 2.5 }) + logo(team, x(r) - 13, cy + dy - 13, 26);
      }
    }
    [[ta, row.a, ra != null && rb != null && ra < rb], [tb, row.b, ra != null && rb != null && rb < ra]].forEach(([team, v, better], k) => {
      const cx = tx1 + 12 + valW * k + valW / 2;
      s += T(cx, cy - 1, v ? ord(v[1]) : "-", { size: 19, weight: better ? 800 : 600, anchor: "middle", mono: true, fill: better ? teamText(colors[team]) : "var(--fg)" });
      if (v && row.fmt) s += T(cx, cy + 18, teamFmt(v[0], row.fmt), { size: 13, weight: 500, anchor: "middle", mono: true, fill: "var(--faint)" });
    });
  });
  return s;
}
function cardTape(pv) {
  const [away, home] = pvSides(pv);
  const fr = frame(1600, 900, { kicker: `${pv.header.week_label} preview`, title: pvTitle(pv), subtitle: `Offense against offense, defense against defense. Season ranks of ${pv.teams_ranked}, the best on the right.` });
  const colors = gameColors(away, home);
  const { pad, w } = fr;
  const panelW = (w - pad * 2 - 56) / 2;
  let s = "";
  [["o", "Offense"], ["d", "Defense"]].forEach(([side, title], pi) => {
    const x0 = pad + pi * (panelW + 56);
    const y = fr.top - 6;
    s += T(x0, y + 28, title, { size: 27, weight: 800 });
    const rows = TAPE_ROWS.map(([id, label, labelD]) => {
      const t = pv.tape.find((r) => r.id === id);
      return t && { label: side === "d" && labelD ? labelD : label, a: t[side]?.[away], b: t[side]?.[home], fmt: t.fmt };
    }).filter(Boolean);
    s += rankTracks(x0, y + 84, panelW, fr.bottom - y - 84, rows, [away, home], colors, pv.teams_ranked);
  });
  s += L(w / 2, fr.top + 20, w / 2, fr.bottom, { stroke: "var(--rule)" });
  return wrapCard(fr, s);
}

// B4 ------------------------------------------------------------ Usage trends
function cardPreviewUsage(pv) {
  const [away, home] = pvSides(pv);
  const fr = frame(1600, 900, { kicker: `${pv.header.week_label} preview`, title: `${pvTitle(pv)}: usage by week`, subtitle: "Target share for receivers and tight ends, carry share for backs. Small: snap share." });
  const colors = gameColors(away, home);
  const { pad, w } = fr;
  const panelW = (w - pad * 2 - 50) / 2;
  let s = "";
  [away, home].forEach((team, pi) => {
    const x0 = pad + pi * (panelW + 50);
    let y = fr.top - 6;
    s += logo(team, x0, y, 40) + T(x0 + 50, y + 30, TEAMS[team].name, { size: 24, weight: 750, fill: teamText(colors[team]) });
    y += 56;
    const rows = (pv.players[team] || []).filter((p) => p.position !== "QB" && p.games >= 2).sort((a, b) => b.expected_fantasy_ppg - a.expected_fantasy_ppg).slice(0, 6);
    const weeks = rows[0]?.weeks.map((wk) => wk.week) || [];
    const nameW = 230, seasonW = 92;
    const cw = (panelW - nameW - seasonW) / weeks.length;
    weeks.forEach((wk, i) => { s += T(x0 + nameW + cw * i + cw / 2, y + 4, `W${wk}`, { size: 16, weight: 700, anchor: "middle", fill: "var(--faint)" }); });
    s += T(x0 + panelW - seasonW / 2, y + 4, "Season", { size: 16, weight: 700, anchor: "middle", fill: "var(--faint)" });
    y += 18;
    const rowH = Math.min(86, (fr.bottom - y) / Math.max(rows.length, 1));
    rows.forEach((p, ri) => {
      const ry = y + ri * rowH;
      const key = p.position === "RB" ? "rush_attempt_share" : "target_share";
      const max = p.position === "RB" ? 0.8 : 0.35;
      s += face(p.player_id, x0 + 22, ry + rowH / 2, 20, colors[team], p.name);
      s += T(x0 + 52, ry + rowH / 2 - 2, fit(lastName(p.name), nameW - 60, 20, 700), { size: 20, weight: 700 });
      s += T(x0 + 52, ry + rowH / 2 + 22, p.position === "RB" ? "RB · carries" : `${p.position} · targets`, { size: 15, fill: posColor(p.position) });
      p.weeks.forEach((wk, i) => {
        const cx = x0 + nameW + cw * i;
        if (wk.bye || !wk.played) {
          s += R(cx + 3, ry + 4, cw - 6, rowH - 8, { rx: 10, stroke: "var(--rule)", sw: 1.5, dash: "4 4" });
          s += T(cx + cw / 2, ry + rowH / 2 + 6, wk.bye ? "BYE" : "-", { size: 14, weight: 700, anchor: "middle", fill: "var(--faint)" });
          return;
        }
        const v = wk[key] ?? 0;
        s += R(cx + 3, ry + 4, cw - 6, rowH - 8, { rx: 10, fill: mix(colors[team], Math.round(10 + 48 * Math.min(1, v / max)), "var(--card)") });
        s += T(cx + cw / 2, ry + rowH / 2 + 2, pct(v), { size: 20, weight: 800, anchor: "middle", mono: true });
        s += T(cx + cw / 2, ry + rowH / 2 + 22, pct(wk.snap_share), { size: 14, weight: 600, anchor: "middle", mono: true, fill: "var(--fg)", opacity: 0.72 });
      });
      s += T(x0 + panelW - seasonW / 2, ry + rowH / 2 + 2, pct(p[key]), { size: 21, weight: 800, anchor: "middle", mono: true });
      s += T(x0 + panelW - seasonW / 2, ry + rowH / 2 + 22, pct(p.snap_share), { size: 14, weight: 600, anchor: "middle", mono: true, fill: "var(--muted)" });
    });
  });
  return wrapCard(fr, s);
}

// B6 ------------------------------------------------------------- EPA by game
function cardTrend(pv) {
  const [away, home] = pvSides(pv);
  const colors = gameColors(away, home);
  const fr = frame(1600, 900, { kicker: `${pv.header.week_label} preview`, title: `${pvTitle(pv)}: EPA by game`, subtitle: "Offense: EPA per play. Defense: EPA per play allowed, lower is better. Band: the league's middle half." });
  const { pad, w } = fr;
  const panelW = (w - pad * 2 - 60) / 2;
  let s = legendRow(w - pad - 400, fr.top - 66, [away, home].map((t) => [(cx, cy) => L(cx - 12, cy, cx + 12, cy, { stroke: colors[t], sw: 5, cap: "round" }), TEAMS[t].name]), 18).svg;
  [["off", "Offense"], ["def", "Defense"]].forEach(([key, title], pi) => {
    const x0 = pad + pi * (panelW + 60);
    const series = [away, home].map((t) => ({ t, rows: (pv.trend[t]?.[key] || []).filter((r) => r.value != null) }));
    const weeks = [...new Set(series.flatMap((sr) => sr.rows.map((r) => r.week)))].sort((a, b) => a - b);
    const all = series.flatMap((sr) => sr.rows.flatMap((r) => [r.value, r.league_q25, r.league_q75])).filter((v) => v != null);
    const max = Math.max(0.3, Math.ceil(Math.max(...all.map(Math.abs)) * 10) / 10);
    const py0 = fr.top + 40, py1 = fr.bottom - 70, lx0 = x0 + 60, lx1 = x0 + panelW - 10;
    const x = weeks.length > 1 ? lin(weeks[0], weeks[weeks.length - 1], lx0 + 24, lx1 - 24) : () => (lx0 + lx1) / 2;
    const y = lin(-max, max, py1, py0);
    s += T(x0, fr.top + 8, title, { size: 24, weight: 750 });
    const band = series.find((sr) => sr.rows.length)?.rows ?? [];
    if (band.length > 1) s += `<path d="${pathOf(band.map((r) => [x(r.week), y(r.league_q75)]))}L${band.slice().reverse().map((r) => `${x(r.week).toFixed(1)},${y(r.league_q25).toFixed(1)}`).join("L")}Z" fill="var(--panel)"/>`;
    for (const v of [-max, -max / 2, 0, max / 2, max]) s += L(lx0, y(v), lx1, y(v), { stroke: v === 0 ? "var(--plot-rule)" : "var(--divider)" }) + T(lx0 - 10, y(v) + 6, signed(v, 2), { size: 16, anchor: "end", mono: true, fill: "var(--faint)" });
    series.forEach(({ t, rows }, k) => {
      if (rows.length > 1) s += `<path d="${pathOf(rows.map((r) => [x(r.week), y(r.value)]))}" fill="none" stroke="${colors[t]}" stroke-width="4" stroke-linejoin="round"/>`;
      rows.forEach((r) => { s += C(x(r.week), y(r.value), 7, { fill: colors[t], stroke: "var(--card)", sw: 2 }); });
      weeks.forEach((week) => {
        const r = rows.find((row) => row.week === week);
        if (r) s += T(x(week), py1 + 30 + k * 22, `${r.home ? "" : "@"}${r.opponent}`, { size: 15, weight: 700, anchor: "middle", fill: teamText(colors[t]) });
      });
    });
    weeks.forEach((week) => { s += T(x(week), py0 - 8, `W${week}`, { size: 15, weight: 700, anchor: "middle", fill: "var(--faint)" }); });
  });
  return wrapCard(fr, s);
}

// B7 ---------------------------------------------------------- Quarterback matchup
/** Each team's quarterback: the one with the most games, then the most points. */
function pvQbs(pv) {
  return pvSides(pv).map((team) => (pv.players[team] || []).filter((p) => p.position === "QB").sort((a, b) => b.games - a.games || b.fantasy_points - a.fantasy_points)[0]?.player_id);
}
/** Every quarterback with a season line, most dropbacks first, for B7's pickers. */
const qbPool = () => Object.values(DATA.players).filter((p) => p.pos === "QB")
  .sort((a, b) => (b.season.attempts ?? 0) - (a.season.attempts ?? 0)).map((p) => ({ id: p.id, name: p.name, team: p.team }));
// B7's percentile rows, Nate's order. Its top rows are D9's without the rushing totals.
const QB_MATCHUP_PCT = ["epa", "epa_per_play", "cpoe", "completion_pct", "yards_per_attempt", "yards_per_completion", "passer_rating",
  "ngs_pass_intended_air_yards", "ngs_pass_time_to_throw", "ngs_pass_aggressiveness", "bad_throw_rate", "pressure_rate", "sack_rate",
  "rushing_yards_per_game"];
/** This game's quarterbacks by default; either picker swaps in any other. */
function cardQbMatchup(pv, opts = {}) {
  const [qa, qb] = pvQbs(pv);
  const a = opts.qb1 || qa, b = opts.qb2 || qb;
  if (!DATA.players[a] || !DATA.players[b] || a === b) {
    const fr = frame(1200, 1500, { kicker: `${pv.header.week_label} preview`, title: `${pvTitle(pv)}: quarterbacks` });
    return wrapCard(fr, T(fr.pad, fr.top + 40, a === b ? "Pick two different quarterbacks." : "One of these quarterbacks has too few games for a season line.", { size: 22, fill: "var(--faint)" }));
  }
  const thisGame = a === qa && b === qb;
  const kicker = thisGame ? `${pv.header.week_label} preview · Quarterbacks` : `Quarterbacks · ${DATA.season} through Week ${DATA.recap_week}`;
  const ta = DATA.players[a].team, tb = DATA.players[b].team;
  return cardH2HNfl(a, { vs: b, kicker, list: QB_MATCHUP_PCT, skip: ["rushing_yards", "rushing_tds"], colors: ta === tb ? { [ta]: teamColor(ta) } : gameColors(ta, tb) });
}

// B8 ---------------------------------------------------------- How they play
const STYLE_ROWS = {
  Offense: [["pass_rate", "o", "Pass rate"], ["proe", "o", "Pass rate over expected"], ["plays_g", "o", "Plays per game"], ["sec_snap", "o", "Pace, seconds per snap"],
    ["motion", "o", "Motion rate"], ["pa", "o", "Play action rate"], ["screen", "o", "Screen rate"], ["adot", "o", "Air yards per attempt"], ["two_back", "o", "2-back rate"]],
  Defense: [["blitz", "d", "Blitz rate"], ["rushers", "d", "Pass rushers per dropback"], ["box8", "d", "Stacked box rate"], ["pass_rate", "d", "Pass rate faced"],
    ["proe", "d", "Pass rate over expected faced"], ["plays_g", "d", "Plays faced per game"]],
};
function cardStyle(pv) {
  const [away, home] = pvSides(pv);
  const fr = frame(1600, 900, { kicker: `${pv.header.week_label} preview`, title: `${pvTitle(pv)}: how they play`, subtitle: `Tendencies, not grades. Rank of ${pv.teams_ranked}: the most on the right, and on pace the fastest.` });
  const colors = gameColors(away, home);
  const { pad, w } = fr;
  const panelW = (w - pad * 2 - 56) / 2;
  const all = [...pv.tendencies, ...(pv.defense_tendencies || [])];
  let s = "";
  Object.entries(STYLE_ROWS).forEach(([title, list], pi) => {
    const x0 = pad + pi * (panelW + 56);
    const y = fr.top - 6;
    s += T(x0, y + 28, title, { size: 27, weight: 800 });
    const rows = list.map(([id, side, label]) => {
      const t = all.find((r) => r.id === id && r[side] && Object.keys(r[side]).length);
      return t && { label, a: t[side][away], b: t[side][home], fmt: t.fmt };
    }).filter((r) => r && (r.a || r.b));
    const H = Math.min(fr.bottom - y - 84, rows.length * 62);
    s += rankTracks(x0, y + 84, panelW, H, rows, [away, home], colors, pv.teams_ranked, { best: "Most", worst: "Least", labelW: 282 });
  });
  s += L(w / 2, fr.top + 20, w / 2, fr.bottom, { stroke: "var(--rule)" });
  return wrapCard(fr, s);
}

// ------------------------------------------------------------ matchup environment
// What each defense has allowed, from DATA.allowed: every QB, RB, WR and TE line against it,
// summed by week and position. Every rank here is for the offense: 1st is the softest
// matchup, the defense that allows the most (or, for sacks and picks, the fewest).
const AK = Object.fromEntries(DATA.allowed_keys.map((k, i) => [k, i]));
function allowedBy(def, pos) {
  const weeks = Object.keys(DATA.results[def] || {}).map(Number).sort((a, b) => a - b);
  const sum = DATA.allowed_keys.map(() => 0);
  const games = weeks.map((week) => {
    const row = DATA.allowed[def]?.[week]?.[pos];
    if (row) DATA.allowed_keys.forEach((_, i) => { sum[i] += row[i]; });
    const [opp, home] = DATA.results[def][week];
    return { week, opp, home, row };
  });
  return { n: weeks.length, sum, games };
}
const av = (a, key) => a.sum[AK[key]];
const per = (num0, den) => (den ? num0 / den : null);
// [label, value from allowedBy, format, 1 when more is softer (-1 when fewer is)]
const ALLOWED_STATS = {
  pts: ["PPR points per game", (a) => per(av(a, "fantasy_points"), a.n), "num1", 1],
  xpts: ["Expected points per game", (a) => per(av(a, "expected_fantasy_points"), a.n), "num1", 1],
  pyds: ["Passing yards per game", (a) => per(av(a, "passing_yards"), a.n), "num1", 1],
  ptd: ["Passing TDs per game", (a) => per(av(a, "passing_tds"), a.n), "num2", 1],
  ypa: ["Yards per attempt", (a) => per(av(a, "passing_yards"), av(a, "attempts")), "num1", 1],
  cmp: ["Completion %", (a) => per(av(a, "completions"), av(a, "attempts")), "pct1", 1],
  ints: ["Interceptions per game", (a) => per(av(a, "interceptions"), a.n), "num2", -1],
  sack: ["Sack %", (a) => per(av(a, "sacks_suffered"), av(a, "attempts") + av(a, "sacks_suffered")), "pct1", -1],
  qbrun: ["QB rushing yards per game", (a) => per(av(a, "rushing_yards"), a.n), "num1", 1],
  car: ["Carries per game", (a) => per(av(a, "carries"), a.n), "num1", 1],
  ryds: ["Rushing yards per game", (a) => per(av(a, "rushing_yards"), a.n), "num1", 1],
  ypc: ["Yards per carry", (a) => per(av(a, "rushing_yards"), av(a, "carries")), "num2", 1],
  rtd: ["Rushing TDs per game", (a) => per(av(a, "rushing_tds"), a.n), "num2", 1],
  tgt: ["Targets per game", (a) => per(av(a, "targets"), a.n), "num1", 1],
  recyds: ["Receiving yards per game", (a) => per(av(a, "receiving_yards"), a.n), "num1", 1],
  rectd: ["Receiving TDs per game", (a) => per(av(a, "receiving_tds"), a.n), "num2", 1],
  ypt: ["Yards per target", (a) => per(av(a, "receiving_yards"), av(a, "targets")), "num1", 1],
  catch: ["Catch rate", (a) => per(av(a, "receptions"), av(a, "targets")), "pct1", 1],
  yac: ["YAC per catch", (a) => per(av(a, "yards_after_catch"), av(a, "receptions")), "num1", 1],
};
// Team stats on the defense's side, from the season window: [label, metric]. Their ranks are
// 1st = best defense, so they are turned over to read 1st = softest like the rest.
const DEF_TEAM_STATS = { p_epa: "EPA per dropback", r_epa: "EPA per designed run", x_pass: "Explosive pass rate", x_run: "Explosive run rate", stuff: "Stuff rate" };
const MATCHUP_ROWS = {
  QB: ["pts", "pyds", "ptd", "ypa", "cmp", "p_epa", "sack", "ints", "qbrun"],
  RB: ["pts", "ryds", "ypc", "rtd", "r_epa", "stuff", "x_run", "tgt", "recyds"],
  WR: ["pts", "tgt", "recyds", "rectd", "ypt", "catch", "yac", "p_epa", "x_pass"],
};
MATCHUP_ROWS.TE = MATCHUP_ROWS.WR;
const DEFENSES = () => Object.keys(DATA.results).filter((t) => Object.keys(DATA.results[t]).length);
const softCache = {};
/** One stat for one defense at one position: { value, rank (1 = softest), n, avg }. */
function softStat(def, pos, id) {
  if (DEF_TEAM_STATS[id]) {
    const m = DATA.team_windows.season[id]?.d;
    const v = m?.[def];
    const n = m ? Object.keys(m).length : 32;
    return v && { value: v[0], rank: n + 1 - v[1], n, avg: DATA.team_windows.season[id].d_mean, fmt: DATA.team_window_meta[id]?.fmt };
  }
  const key = `${pos}|${id}`;
  if (!softCache[key]) {
    const [, value, , dir] = ALLOWED_STATS[id];
    const vals = Object.fromEntries(DEFENSES().map((t) => [t, value(allowedBy(t, pos))]).filter(([, v]) => v != null));
    const list = Object.values(vals);
    softCache[key] = { vals, list, dir, avg: list.reduce((a, b) => a + b, 0) / Math.max(1, list.length) };
  }
  const c = softCache[key], v = c.vals[def];
  if (v == null) return null;
  return { value: v, rank: 1 + c.list.filter((o) => (o - v) * c.dir > 1e-9).length, n: c.list.length, avg: c.avg, fmt: ALLOWED_STATS[id][2] };
}
const softLabel = (id) => DEF_TEAM_STATS[id] ?? ALLOWED_STATS[id][0];

/** One defense's rank tracks, the toughest on the left and the softest (1st) on the right. */
function softTracks(x0, y0, W, rows, def, o = {}) {
  const labelW = o.labelW ?? 280, valW = 250, rowH = o.rowH ?? 52;
  const tx0 = x0 + labelW, tx1 = x0 + W - valW;
  const vx = x0 + W - 150, rx = x0 + W - 102;
  let s = T(tx0 + 20, y0 - 10, "Toughest", { size: 15, weight: 700, fill: "var(--faint)" }) + T(tx1 - 20, y0 - 10, "Softest", { size: 15, weight: 700, anchor: "end", fill: "var(--faint)" });
  s += T(vx, y0 - 10, "ALLOWED", { size: 13, weight: 750, anchor: "end", fill: "var(--faint)", ls: 1 }) + T(rx, y0 - 10, "RANK", { size: 13, weight: 750, anchor: "middle", fill: "var(--faint)", ls: 1 });
  s += T(x0 + W, y0 - 10, "LEAGUE", { size: 13, weight: 750, anchor: "end", fill: "var(--faint)", ls: 1 });
  rows.forEach((row, i) => {
    const cy = y0 + i * rowH + rowH / 2;
    if (i % 2 === 0) s += R(x0 - 10, cy - rowH / 2 + 2, W + 20, rowH - 4, { rx: 12, fill: "var(--panel)" });
    const lb = fitSize(row.label, labelW - 14, [19, 18, 17, 16], 600);
    s += T(x0, cy + 7, lb.text, { size: lb.size, weight: 600, fill: "var(--muted)" });
    s += L(tx0 + 20, cy, tx1 - 20, cy, { stroke: "var(--rule)", sw: 6, cap: "round" });
    if (!row.stat) return;
    const { value, rank, n, avg, fmt } = row.stat;
    const x = lin(n, 1, tx0 + 20, tx1 - 20)(rank), color = rankColor(rank, n);
    s += L(tx0 + 20, cy, x, cy, { stroke: color, sw: 6, cap: "round" });
    s += C(x, cy, 18, { fill: "var(--card)", stroke: color, sw: 3 }) + logo(def, x - 13, cy - 13, 26);
    s += T(vx, cy + 8, teamFmt(value, fmt), { size: 21, weight: 800, anchor: "end", mono: true }) + rankChip(rank, n, rx, cy, { w: 62, h: 28, size: 15 });
    s += T(x0 + W, cy + 7, teamFmt(avg, fmt), { size: 16, weight: 500, anchor: "end", mono: true, fill: "var(--faint)" });
  });
  return s;
}
/** Each game the defense played: the points it allowed to a position, its expected points, and the top scorer. */
function allowedByWeek(x0, y0, W, H, def, pos, o = {}) {
  const a = allowedBy(def, pos);
  const avgPts = softStat(def, pos, "pts")?.avg;
  const games = a.games.filter((g) => g.row);
  const top = Math.max(10, ...games.map((g) => Math.max(g.row[AK.fantasy_points], g.row[AK.expected_fantasy_points])));
  const step = niceStep(0, top, 4), ymax = Math.ceil(top / step) * step;
  // Headroom over the tallest bar for its number and the top scorer's name.
  const py0 = y0 + 100, py1 = y0 + H - 64, px0 = x0 + 44;
  const y = lin(0, ymax, py1, py0);
  const cw = (x0 + W - px0) / Math.max(1, a.games.length);
  let s = "";
  for (let v = 0; v <= ymax; v += step) s += L(px0, y(v), x0 + W, y(v), { stroke: v ? "var(--divider)" : "var(--plot-rule)" }) + T(px0 - 10, y(v) + 6, v, { size: 15, anchor: "end", mono: true, fill: "var(--faint)" });
  const color = o.color ?? posColor(pos);
  if (avgPts != null) s += L(px0, y(avgPts), x0 + W, y(avgPts), { stroke: "var(--accent)", sw: 2, dash: "9 6" });
  a.games.forEach((g, i) => {
    const cx = px0 + cw * i + cw / 2, bw = Math.min(70, cw * 0.56);
    s += logo(g.opp, cx - 15, py1 + 10, 30);
    s += T(cx, py1 + 58, `W${g.week}`, { size: 14, weight: 700, anchor: "middle", fill: "var(--faint)" });
    if (!g.row) return;
    const pts = g.row[AK.fantasy_points], xp = g.row[AK.expected_fantasy_points], best = g.row[DATA.allowed_keys.length];
    s += R(cx - bw / 2, y(pts), bw, py1 - y(pts), { rx: 6, fill: mix(color, 72, "var(--card)") });
    s += L(cx - bw / 2 - 6, y(xp), cx + bw / 2 + 6, y(xp), { stroke: "var(--fg)", sw: 2.5, dash: "5 4" });
    const label = Math.min(y(pts), y(xp));
    s += haloT(cx, label - 10, num(pts), { size: 18, weight: 800, anchor: "middle", mono: true });
    if (best && o.names !== false) s += haloT(cx, label - 32, fit(`${lastName(best[1])} ${num(best[3])}`, cw - 6, 13, 600), { size: 13, weight: 600, anchor: "middle", fill: "var(--muted)" });
  });
  return s;
}

// B9 ------------------------------------------------------------- Player matchup
const previewPlayers = (pv) => pvSides(pv).flatMap((t) => (pv.players[t] || []).map((p) => ({ ...p, team: t })))
  .filter((p) => p.games >= 2).sort((a, b) => b.fantasy_ppg - a.fantasy_ppg);
const defaultMatchupPlayer = (pv) => (previewPlayers(pv).find((p) => p.position !== "QB") ?? previewPlayers(pv)[0])?.player_id;
function cardPlayerMatchup(pv, opts = {}) {
  const [away, home] = pvSides(pv);
  const all = previewPlayers(pv);
  const p = all.find((x) => x.player_id === opts.who) ?? all.find((x) => x.player_id === defaultMatchupPlayer(pv));
  const opp = p.team === away ? home : away, pos = p.position;
  const k = kickoff(pv.header);
  const rank = DATA.players[p.player_id]?.ranks?.fantasy_ppg;
  const fr = frame(1200, 1500, { kicker: `${pv.header.week_label} preview · ${p.team === away ? "at" : "vs"} ${opp}`, title: `${p.name}'s matchup`,
    subtitle: `${pos}${rank ?? ""} · ${num(p.fantasy_ppg)} PPR points per game · ${k.day} ${k.time}`, headshot: { pid: p.player_id, name: p.name, ring: teamColor(p.team) } });
  const { pad, w } = fr;
  let s = "", y = fr.top;
  // The verdict: where this defense ranks in points allowed to the position.
  const m = pv.pa.defenses[opp]?.[pos], lg = pv.pa.league[pos];
  const xp = softStat(opp, pos, "xpts");
  const color = m ? rankColor(m.rank, m.teams) : "var(--faint)";
  const bandH = 196;
  s += R(pad, y, w - pad * 2, bandH, { rx: 24, fill: mix(color, 10, "var(--card)"), stroke: mix(color, 32), sw: 1.5 });
  s += logo(opp, pad + 30, y + 30, 92);
  const tone = matchupTone(m);
  s += T(pad + 148, y + 70, tone ? `${tone.label} matchup` : "No matchup yet", { size: 44, weight: 800, fill: mix(color, 58, "var(--fg)") });
  if (m) {
    const said = fitSize(`${TEAMS[opp]?.name || opp} allow the ${m.rank === 1 ? "most" : `${ord(m.rank)} most`} PPR points to ${POS_PLURAL[pos]}`, w - pad * 2 - 148 - 170, [22, 20, 19], 600);
    s += T(pad + 148, y + 110, said.text, { size: said.size, weight: 600 });
    s += T(pad + 148, y + 144, `${num(m.points_allowed)} a game, league ${num(lg)} (${signed((m.points_allowed / lg - 1) * 100, 0)}%)`, { size: 20, mono: true, fill: "var(--muted)" });
    if (xp) s += T(pad + 148, y + 174, `Expected from the work they allow: ${num(xp.value)} a game, ${ord(xp.rank)}`, { size: 18, fill: "var(--faint)" });
    s += T(w - pad - 30, y + 74, ord(m.rank), { size: 64, weight: 800, anchor: "end", mono: true, fill: mix(color, 58, "var(--fg)") });
    s += T(w - pad - 30, y + 106, `of ${m.teams}`, { size: 18, weight: 650, anchor: "end", fill: "var(--muted)" });
  }
  y += bandH + 64;
  // The detail, ranked against every defense.
  s += T(pad, y, `What the ${nickname(opp)} allow to ${POS_PLURAL[pos]}`, { size: 25, weight: 750 });
  s += T(w - pad, y, "Rank of 32, 1st is the softest", { size: 17, anchor: "end", fill: "var(--muted)" });
  y += 48;
  const rows = MATCHUP_ROWS[pos].map((id) => ({ label: softLabel(id), stat: softStat(opp, pos, id) }));
  const rowH = 50;
  s += softTracks(pad, y, w - pad * 2, rows, opp, { rowH });
  y += rows.length * rowH + 52;
  // Game by game.
  s += T(pad, y, `${POS_PLURAL[pos][0].toUpperCase()}${POS_PLURAL[pos].slice(1)} against the ${nickname(opp)}, game by game`, { size: 25, weight: 750 });
  const avg = softStat(opp, pos, "pts")?.avg;
  s += legendRow(pad, y + 34, [[(cx, cy) => R(cx - 9, cy - 9, 18, 18, { rx: 4, fill: mix(posColor(pos), 72, "var(--card)") }), "PPR points allowed"],
    [(cx, cy) => L(cx - 11, cy, cx + 11, cy, { stroke: "var(--fg)", sw: 2.5, dash: "5 4" }), "Expected"],
    [(cx, cy) => L(cx - 11, cy, cx + 11, cy, { stroke: "var(--accent)", sw: 2.5, dash: "6 4" }), `League average, ${num(avg)}`]], 16).svg;
  s += allowedByWeek(pad, y + 6, w - pad * 2, fr.bottom - y - 6, opp, pos);
  return wrapCard(fr, s);
}

/**
 * One stat, offense against defense: each side's rank and value at its end, and between them
 * a bar from the middle toward whichever is ranked better, by how many places. Within three
 * places it is even. o.logos puts each team's logo outside its rank.
 */
function edgeRow(x0, x1, cy, o) {
  const { id, label, team, opp, colors } = o;
  const tw = DATA.team_windows.season, fmt = DATA.team_window_meta[id]?.fmt;
  const off = tw[id]?.o?.[team], def = tw[id]?.d?.[opp];
  const inset = o.logos ? 44 : 0, mid = (x0 + x1) / 2, half = (x1 - x0) / 2 - 220 - inset;
  let s = "";
  if (o.logos) s += logo(team, x0, cy - 16, 32) + logo(opp, x1 - 32, cy - 16, 32);
  s += rankChip(off?.[1], 32, x0 + inset + 40, cy, { w: 70, h: 32, size: 17 }) + T(x0 + inset + 88, cy + 8, teamFmt(off?.[0], fmt), { size: 20, weight: 700, mono: true });
  s += rankChip(def?.[1], 32, x1 - inset - 40, cy, { w: 70, h: 32, size: 17 }) + T(x1 - inset - 88, cy + 8, teamFmt(def?.[0], fmt), { size: 20, weight: 700, anchor: "end", mono: true });
  const by = cy + 13;
  s += T(mid, cy - 7, label, { size: 17, weight: 650, anchor: "middle", fill: "var(--muted)" });
  s += L(mid - half, by, mid + half, by, { stroke: "var(--rule)", sw: 7, cap: "round" });
  if (!off || !def) return s;
  const gap = def[1] - off[1];
  if (Math.abs(gap) <= 3) return s + R(mid - 30, by - 11, 60, 22, { rx: 11, fill: "var(--card)", stroke: "var(--rule)", sw: 1.5 }) + T(mid, by + 5, "Even", { size: 13, weight: 750, anchor: "middle", fill: "var(--muted)" });
  const lead = gap > 0 ? team : opp, xe = mid - (gap / 31) * half;
  s += L(mid, by, xe, by, { stroke: colors[lead], sw: 7, cap: "round" }) + C(mid, by, 5, { fill: "var(--plot-rule)" });
  return s + T(xe + (gap > 0 ? -12 : 12), by + 5, `Edge ${lead}`, { size: 14, weight: 800, anchor: gap > 0 ? "end" : "start", fill: teamText(colors[lead]) });
}

// B10 ------------------------------------------------------------- Team matchup
// Unit against unit: the offense's rank against the defense's rank in the same stat, with
// the edge to whichever is ranked better.
const UNIT_ROWS = [["p_epa", "Passing, EPA per dropback"], ["r_epa", "Running, EPA per designed run"], ["suc", "Success rate"],
  ["explosive", "Explosive play rate"], ["rz_td", "Red zone TD rate"], ["d3", "Third down rate"], ["sack_rate", "Sack rate"], ["tov_g", "Giveaways against takeaways"]];
const matchupSide = (pv, side) => {
  const [away, home] = pvSides(pv);
  return side === "home" ? home : side === "away" ? away : (pv.header.home_implied ?? 0) > (pv.header.away_implied ?? 0) ? home : away;
};
// Key players: who played the team's latest game, or a regular (4+ games) who missed it, by
// PPG. The latest game is what keeps a fill-in out once the starter is back.
function keyPlayers(pv, team) {
  const all = pv.players[team] || [];
  const last = Math.max(0, ...all.flatMap((p) => p.weeks.filter((w) => w.played).map((w) => w.week)));
  return all.filter((p) => (p.games >= 4 || p.weeks.some((w) => w.week === last && w.played)) && (p.position !== "QB" || p.fantasy_ppg > 5))
    .sort((a, b) => b.fantasy_ppg - a.fantasy_ppg);
}
const KEY_PLAYERS_MAX = 8;
function cardTeamMatchup(pv, opts = {}) {
  const [away, home] = pvSides(pv);
  const team = matchupSide(pv, opts.side);
  const opp = team === away ? home : away;
  const colors = gameColors(away, home);
  const imp = team === away ? pv.header.away_implied : pv.header.home_implied;
  const fr = frame(1200, 1500, { kicker: `${pv.header.week_label} preview · ${pvTitle(pv)}`, title: `${nickname(team)} offense vs ${nickname(opp)} defense`,
    subtitle: imp == null ? `${team} has no implied point total yet this week`
      : `${team} implied point total ${implied(imp)} (${ord(pv.slate.implied_rank?.[team])} of ${pv.slate.offenses} teams this week)` });
  const { pad, w } = fr;
  const tw = DATA.team_windows.season;
  let s = "", y = fr.top + 30;
  s += logo(team, pad, y - 34, 40) + T(pad + 48, y - 6, `${team} offense`, { size: 20, weight: 750, fill: teamText(colors[team]) });
  s += logo(opp, w - pad - 40, y - 34, 40) + T(w - pad - 48, y - 6, `${opp} defense`, { size: 20, weight: 750, anchor: "end", fill: teamText(colors[opp]) });
  s += T(w / 2, y - 6, "Rank of 32, 1st is best", { size: 16, anchor: "middle", fill: "var(--muted)" });
  y += 14;
  const rowH = 62;
  UNIT_ROWS.forEach(([id, label], i) => {
    const cy = y + i * rowH + rowH / 2;
    if (i % 2 === 0) s += R(pad - 10, cy - rowH / 2 + 2, w - pad * 2 + 20, rowH - 4, { rx: 14, fill: "var(--panel)" });
    s += edgeRow(pad, w - pad, cy, { id, label, team, opp, colors });
  });
  y += UNIT_ROWS.length * rowH + 56;
  s += T(pad, y, "By position", { size: 25, weight: 750 }) + T(w - pad, y, `PPR points the ${nickname(opp)} allow per game, 1st allows the most`, { size: 17, anchor: "end", fill: "var(--muted)" });
  y += 22;
  s += positionTiles(pv, team, opp, pad, y, w - pad * 2, 150, colors);
  y += 150 + 58;
  // The offense's players, each with his position's matchup.
  s += T(pad, y, "Key players", { size: 25, weight: 750 }) + T(w - pad, y, "PPR points per game, then his matchup", { size: 17, anchor: "end", fill: "var(--muted)" });
  y += 20;
  const roster = pv.players[team] || [];
  const list = (opts.who ?? keyPlayers(pv, team).slice(0, 6).map((p) => p.player_id)).map((id) => roster.find((p) => p.player_id === id)).filter(Boolean)
    .sort((a, b) => b.fantasy_ppg - a.fantasy_ppg).slice(0, KEY_PLAYERS_MAX);
  const colW = (w - pad * 2 - 24) / 2, cardH = Math.min(96, (fr.bottom - y - 8) / Math.max(3, Math.ceil(list.length / 2)) - 10);
  list.forEach((p, i) => {
    const x0 = pad + (i % 2) * (colW + 24), ry = y + Math.floor(i / 2) * (cardH + 10);
    s += R(x0, ry, colW, cardH, { rx: 18, fill: "var(--panel)" });
    s += face(p.player_id, x0 + 44, ry + cardH / 2, cardH * 0.34, colors[team], p.name);
    s += T(x0 + 88, ry + cardH / 2 - 4, fit(p.name, colW - 260, 21, 700), { size: 21, weight: 700 });
    s += T(x0 + 88, ry + cardH / 2 + 22, `${p.position} · ${num(p.fantasy_ppg)} PPG`, { size: 16, fill: "var(--muted)" });
    s += matchupPill(p.matchup, x0 + colW - 16, ry + cardH / 2, { anchor: "end", size: 16 }).svg;
  });
  return wrapCard(fr, s);
}

// B11 ---------------------------------------------------------- Game environment
// The whole game: how big a game the market and both teams' habits make it, ranked against
// the week's other games, then every player on both sides by his production and his matchup.
// [label, value, format, short label for B12's strip]
const ENV_ROWS = [
  ["Over/under", (g) => g.header.total_line, (v) => num(v, 1), "Over/under"],
  ["Plays per game, both offenses", (g) => sumTeams(g, "plays_g", "o"), (v) => num(v, 1), "Plays per game"],
  ["Neutral pass rate, both offenses", (g) => meanTeams(g, "n_pass", "o"), (v) => pct(v, 1), "Neutral pass rate"],
  ["EPA per play, both offenses", (g) => meanTeams(g, "epa", "o"), (v) => signed(v, 2), "Offense EPA/play"],
  ["Points allowed per game, both defenses", (g) => sumTeams(g, "ppg", "d"), (v) => num(v, 1), "Points allowed"],
  ["Explosive play rate allowed, both", (g) => meanTeams(g, "explosive", "d"), (v) => pct(v, 1), "Explosives allowed"],
];
/** One ENV_ROWS stat for this game, ranked 1st (highest) among the week's games. */
function envRank(pv, value) {
  const vals = DATA.previews.map(value).filter((v) => Number.isFinite(v));
  const v = value(pv);
  return { v, rank: Number.isFinite(v) ? 1 + vals.filter((o) => o > v + 1e-9).length : null, n: vals.length };
}
const sumTeams = (g, id, side) => pvSides(g).reduce((a, t) => a + (DATA.team_windows.season[id]?.[side]?.[t]?.[0] ?? NaN), 0);
const meanTeams = (g, id, side) => sumTeams(g, id, side) / 2;
// Who makes the grid: the card's Min PPG and Min games controls, 4+ and 2+ unless changed.
const ENV_MIN_PPG = [0, 2, 4, 6, 8, 10, 12, 15];
const ENV_MIN_GAMES = [1, 2, 3, 4, 5];
const envMins = (opts = {}) => ({ ppg: Number(opts.minPpg ?? 4), games: Number(opts.minGames ?? 2) });
const envPoint = (pv, opts) => { const min = envMins(opts); return pvSides(pv).flatMap((t) => (pv.players[t] || []).filter((p) => p.games >= min.games && Number.isFinite(p.fantasy_ppg) && p.fantasy_ppg >= min.ppg).map((p) => {
  const opp = t === pv.header.away.abbreviation ? pv.header.home.abbreviation : pv.header.away.abbreviation;
  const m = pv.pa.defenses[opp]?.[p.position], lg = pv.pa.league[p.position];
  return { ...p, team: t, opp, y: m && lg ? m.points_allowed / lg - 1 : null };
})); };
const defaultEnvFaces = (pv, opts) => pvSides(pv).flatMap((t) => envPoint(pv, opts).filter((p) => p.team === t).sort((a, b) => b.fantasy_ppg - a.fantasy_ppg).slice(0, 4).map((p) => p.player_id));
// layout: "panel" (B11, the rankings in a column on the left), "strip" (B12, the rankings in
// one row under the title and the chart full width) or "chart" (B13, the chart alone).
function cardGameEnvironment(pv, opts = {}, layout = "panel") {
  const [away, home] = pvSides(pv);
  const colors = gameColors(away, home);
  const min = envMins(opts);
  const minLabel = [min.ppg ? `${min.ppg}+ PPG` : null, min.games > 1 ? `${min.games}+ games` : null].filter(Boolean).join(", ");
  const subtitle = { panel: "The game against the week's others, then every player by his points and his matchup",
    chart: "Every player on both teams by his points and his matchup" }[layout];
  const fr = frame(1600, 900, { kicker: `${pv.header.week_label} preview · PPR${minLabel ? ` · ${minLabel}` : ""}`, title: pvTitle(pv), subtitle });
  const { pad } = fr;
  let s = "", sub = fr;
  if (layout === "panel") {
    const panelW = 440;
    s += R(pad, fr.top - 10, panelW, fr.bottom - fr.top + 10, { rx: 24, fill: "var(--panel)" });
    s += T(pad + 26, fr.top + 24, "RANKING AMONGST THIS WEEK'S GAMES", { size: 14, weight: 750, fill: "var(--faint)", ls: 1.2 });
    const rowH = (fr.bottom - fr.top - 50) / ENV_ROWS.length;
    ENV_ROWS.forEach(([label, value, fmt], i) => {
      const ry = fr.top + 44 + i * rowH;
      const { v, rank, n } = envRank(pv, value);
      if (i) s += L(pad + 26, ry - 4, pad + panelW - 26, ry - 4, { stroke: "var(--divider)" });
      s += T(pad + 26, ry + 24, fit(label.toUpperCase(), panelW - 52, 13, 750), { size: 13, weight: 750, fill: "var(--faint)", ls: 1 });
      s += T(pad + 26, ry + 66, Number.isFinite(v) ? fmt(v) : "-", { size: 34, weight: 800, mono: true });
      if (rank) {
        const color = rankColor(rank, n);
        s += R(pad + panelW - 26 - 92, ry + 36, 92, 40, { rx: 10, fill: mix(color, 22) });
        s += T(pad + panelW - 26 - 46, ry + 63, ord(rank), { size: 20, weight: 800, anchor: "middle", mono: true, fill: mix(color, 62, "var(--fg)") });
      }
    });
    sub = { ...fr, pad: pad + panelW + 30, w: fr.w + panelW + 30 };
  }
  if (layout === "strip") {
    // A caption, then one tile per stat: its value and its rank among the week's games.
    const y0 = fr.top - 8, tileH = 74, gap = 12;
    const caption = ["RANKED AMONGST", "THIS WEEK'S GAMES"];
    const capW = Math.max(...caption.map((t) => textWidth(t, 13, 750) + t.length)) + 10;
    caption.forEach((t, i) => { s += T(pad, y0 + tileH / 2 - 4 + i * 20, t, { size: 13, weight: 750, fill: "var(--faint)", ls: 1 }); });
    const tileW = (fr.w - pad * 2 - capW - gap * ENV_ROWS.length) / ENV_ROWS.length;
    ENV_ROWS.forEach(([, value, fmt, short], i) => {
      const x0 = pad + capW + gap + i * (tileW + gap);
      const { v, rank, n } = envRank(pv, value);
      s += R(x0, y0, tileW, tileH, { rx: 16, fill: "var(--panel)" });
      s += T(x0 + 16, y0 + 25, fit(short.toUpperCase(), tileW - 32, 12, 750), { size: 12, weight: 750, fill: "var(--faint)", ls: 1 });
      s += T(x0 + 16, y0 + 59, Number.isFinite(v) ? fmt(v) : "-", { size: 27, weight: 800, mono: true });
      if (rank) {
        const color = rankColor(rank, n);
        s += R(x0 + tileW - 14 - 64, y0 + 35, 64, 30, { rx: 8, fill: mix(color, 22) });
        s += T(x0 + tileW - 14 - 32, y0 + 56, ord(rank), { size: 17, weight: 800, anchor: "middle", mono: true, fill: mix(color, 62, "var(--fg)") });
      }
    });
    sub = { ...fr, top: y0 + tileH + 26 };
  }
  const pts = envPoint(pv, opts).filter((p) => p.y != null);
  if (!pts.length) {
    s += T((sub.pad + fr.w - pad) / 2, (sub.top + fr.bottom) / 2, "No player clears the minimum", { size: 26, weight: 600, anchor: "middle", fill: "var(--muted)" });
    return wrapCard(fr, s);
  }
  s += scatterPlot(sub, {
    points: pts.map((p) => ({ id: p.player_id, x: p.fantasy_ppg, y: p.y, name: p.name, team: p.team, face: p.player_id, color: colors[p.team],
      tip: [`${p.name} (${p.team} ${p.position})`, `${num(p.fantasy_ppg)} PPG`, `${p.opp} allow ${signed(p.y * 100, 0)}% to ${p.position}s vs the league`] })),
    highlight: opts.hl ?? defaultEnvFaces(pv, opts),
    xstep: "auto", ystep: "auto", xfmt: (v) => num(v, 0), yfmt: (v) => `${signed(v * 100, 0)}%`,
    refY: 0, key: "League average",
    xlabel: "PPR points per game →", ylabel: "Points allowed to position for this matchup",
    quadrants: [["Producing, soft matchup", mix("var(--pos)", 72, "var(--fg)")], ["Soft matchup"], ["Producing, tough matchup"], ["Tough matchup", mix("var(--neg)", 72, "var(--fg)")]],
  });
  s += legendRow(sub.pad + 74, sub.top + 8, [away, home].map((t) => [(cx, cy) => C(cx, cy, 8, { fill: mix(colors[t], 50), stroke: colors[t], sw: 2 }), TEAMS[t].name]), 17).svg;
  return wrapCard(fr, s);
}
const cardGameEnvironmentStrip = (pv, opts) => cardGameEnvironment(pv, opts, "strip");
const cardGameEnvironmentChart = (pv, opts) => cardGameEnvironment(pv, opts, "chart");
