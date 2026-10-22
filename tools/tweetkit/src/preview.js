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
  s += T(pad, y, "Last five", { size: 25, weight: 750 }) + T(w - pad, y, "Result, then against the spread and the total", { size: 18, anchor: "end", fill: "var(--muted)" });
  y += 20;
  [away, home].forEach((team) => {
    const games = (pv.form[team] || []).slice(-5);
    s += logo(team, pad, y + 14, 44);
    const bx0 = pad + 70, bw = (w - pad - bx0 - 4 * 12) / 5;
    games.forEach((gm, i) => {
      const bx = bx0 + i * (bw + 12);
      const tone = gm.result === "W" ? "var(--pos)" : gm.result === "L" ? "var(--neg)" : "var(--muted)";
      s += R(bx, y + 6, bw, 88, { rx: 14, fill: mix(tone, 12), stroke: mix(tone, 30), sw: 1.5 });
      s += T(bx + 14, y + 30, `W${gm.week} ${gm.home ? "vs" : "@"} ${gm.opponent}`, { size: 16, weight: 650, fill: "var(--muted)" });
      s += T(bx + 14, y + 57, `${gm.result} ${gm.points_for}-${gm.points_against}`, { size: 21, weight: 800, mono: true, fill: mix(tone, 70, "var(--fg)") });
      const ats = { W: "Covered", L: "No cover", P: "Push" }[gm.cover], ou = { O: "over", U: "under", P: "push" }[gm.over_under];
      if (ats) s += T(bx + 14, y + 82, `${ats}${ou ? `, ${ou}` : ""}`, { size: 15, weight: 600, fill: "var(--faint)" });
    });
    y += 104;
  });
  y += 34;
  // Players to watch
  s += T(pad, y, "Players to watch", { size: 25, weight: 750 }) + T(w - pad, y, "PPR points per game · matchup: rank of 32 in points allowed", { size: 18, anchor: "end", fill: "var(--muted)" });
  y += 22;
  const colW = (w - pad * 2 - 28) / 2;
  const left = fr.bottom - y;
  const per = Math.min(4, Math.floor((left - 40) / 100));
  [away, home].forEach((team, i) => {
    const x0 = pad + i * (colW + 28);
    const rows = (pv.players[team] || []).filter((p) => p.games >= 2).sort((a, b) => b.fantasy_ppg - a.fantasy_ppg).slice(0, per);
    rows.forEach((p, r) => {
      const ry = y + r * 102;
      s += R(x0, ry, colW, 90, { rx: 20, fill: "var(--panel)" });
      s += face(p.player_id, x0 + 48, ry + 45, 32, colors[team], p.name);
      s += T(x0 + 92, ry + 38, fit(p.name, colW - 220, 22, 700), { size: 22, weight: 700 });
      s += T(x0 + 92, ry + 68, `${p.position} · ${num(p.fantasy_ppg)} PPG`, { size: 17, fill: "var(--muted)" });
      s += matchupPill(p.matchup, x0 + colW - 18, ry + 45, { anchor: "end", size: 16 }).svg;
    });
  });
  // Last meeting
  const last = pv.meetings?.[0];
  if (last) {
    const yy = fr.bottom - 6;
    const win = last.winner, lose = win === last.home ? last.away : last.home;
    const ws = win === last.home ? last.home_score : last.away_score, ls = win === last.home ? last.away_score : last.home_score;
    const top = last.top?.[0];
    s += T(pad, yy, `Last meeting: ${last.week_label}, ${last.season}. ${win} ${ws}, ${lose} ${ls}${top ? `. Top scorer ${top.name}, ${num(top.fantasy_points)}` : ""}`, { size: 19, fill: "var(--muted)" });
  }
  return wrapCard(fr, s);
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
function cardTape(pv) {
  const [away, home] = pvSides(pv);
  const fr = frame(1600, 900, { kicker: `${pv.header.week_label} preview`, title: pvTitle(pv), subtitle: `Each offense against the defense it faces. Season ranks of ${pv.teams_ranked}, 1st is best.` });
  const colors = gameColors(away, home);
  const { pad, w } = fr;
  const ids = ["epa", "suc", "p_epa", "r_epa", "explosive", "pts_drive", "rz_td", "d3", "sack_rate"];
  const short = { epa: "EPA per play", suc: "Success rate", p_epa: "EPA per dropback", r_epa: "EPA per run", explosive: "Explosive rate", pts_drive: "Points per drive", rz_td: "Red zone TD rate", d3: "Third down rate", sack_rate: "Sack rate" };
  const rows = ids.map((id) => pv.tape.find((t) => t.id === id)).filter(Boolean);
  const panelW = (w - pad * 2 - 50) / 2;
  const n = pv.teams_ranked;
  let s = "";
  [[away, home], [home, away]].forEach(([off, def], pi) => {
    const x0 = pad + pi * (panelW + 50);
    let y = fr.top - 6;
    s += logo(off, x0, y, 40) + T(x0 + 50, y + 30, `${off} offense`, { size: 24, weight: 750, fill: teamText(colors[off]) });
    const vw = textWidth(`${off} offense`, 24, 750);
    s += T(x0 + 50 + vw + 14, y + 30, "vs", { size: 20, fill: "var(--faint)" });
    s += logo(def, x0 + 50 + vw + 48, y, 40) + T(x0 + 50 + vw + 98, y + 30, `${def} defense`, { size: 24, weight: 750, fill: teamText(colors[def]) });
    y += 64;
    const labelW = 200, tx0 = x0 + labelW, tx1 = x0 + panelW - 150;
    const x = lin(1, n, tx0 + 18, tx1 - 18);
    s += T(tx0 + 18, y - 6, "Best", { size: 15, weight: 700, fill: "var(--faint)" }) + T(tx1 - 18, y - 6, "Worst", { size: 15, weight: 700, anchor: "end", fill: "var(--faint)" });
    s += T(tx1 + 74, y - 6, off, { size: 15, weight: 700, anchor: "middle", fill: "var(--faint)" }) + T(tx1 + 136, y - 6, def, { size: 15, weight: 700, anchor: "middle", fill: "var(--faint)" });
    const rowH = (fr.bottom - y) / rows.length;
    rows.forEach((row, i) => {
      const cy = y + i * rowH + rowH / 2;
      const o = row.o[off], d = row.d[def];
      s += T(x0, cy + 7, short[row.id] || row.label, { size: 20, weight: 600, fill: "var(--muted)" });
      s += L(tx0 + 18, cy, tx1 - 18, cy, { stroke: "var(--rule)", sw: 6, cap: "round" });
      if (o && d) {
        const edge = o[1] < d[1] ? off : d[1] < o[1] ? def : null;
        s += L(x(o[1]), cy, x(d[1]), cy, { stroke: edge ? colors[edge] : "var(--muted)", sw: 6, cap: "round", opacity: 0.85 });
        const close = Math.abs(x(o[1]) - x(d[1])) < 34;
        for (const [team, r, dy] of [[def, d[1], close ? 11 : 0], [off, o[1], close ? -11 : 0]]) {
          s += C(x(r), cy + dy, 17, { fill: "var(--card)", stroke: colors[team], sw: 2.5 }) + logo(team, x(r) - 13, cy + dy - 13, 26);
        }
      }
      s += T(tx1 + 74, cy + 7, o ? ord(o[1]) : "-", { size: 19, weight: 700, anchor: "middle", mono: true, fill: o && d && o[1] < d[1] ? teamText(colors[off]) : "var(--fg)" });
      s += T(tx1 + 136, cy + 7, d ? ord(d[1]) : "-", { size: 19, weight: 700, anchor: "middle", mono: true, fill: o && d && d[1] < o[1] ? teamText(colors[def]) : "var(--fg)" });
    });
  });
  s += L(w / 2, fr.top + 40, w / 2, fr.bottom, { stroke: "var(--rule)" });
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
