// E: team cards. Each takes a team abbreviation.
const teamFmt = (v, fmt) => (v == null ? "-" : fmt === "pct1" ? pct(v, 1) : fmt === "pct0" ? pct(v, 0) : fmt === "sgn2" ? signed(v, 2)
  : fmt === "sgn1" ? signed(v, 1) : fmt === "pp1" ? `${signed(v, 1)}` : fmt === "num2" ? num(v, 2) : num(v, 1));
const teamStat = (t, id, side = "o") => t.stats[id]?.[side] ?? null; // [value, rank]
const recordText = (r) => `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ""}`;
const teamWeeks = (abbr) => Array.from({ length: thru(abbr) }, (_, i) => i + 1);

function teamHead(t, fr, kicker) {
  const { pad, w } = fr;
  const info = TEAMS[t.team];
  let s = mark(w - pad - 46 * MARK_ASPECT, pad - 4, 46);
  s += logo(t.team, pad, 54, 150);
  s += T(pad + 180, 96, kicker.toUpperCase(), { size: 18, weight: 750, fill: "var(--accent-text)", ls: 2 });
  s += T(pad + 180, 150, fit(info?.name || t.team, w - pad * 2 - 300, 52, 800), { size: 52, weight: 800 });
  s += T(pad + 180, 192, [recordText(t.record), info?.div].filter(Boolean).join(" · "), { size: 23, fill: "var(--muted)" });
  return s;
}

// E1 ------------------------------------------------------------- Team profile
function cardTeamProfile(abbr) {
  const t = DATA.teams_cards[abbr];
  const meta = DATA.team_metric_meta;
  const ROWS = ["suc", "p_epa", "r_epa", "explosive", "pts_drive", "rz_td", "d3", "tov_g"];
  const TEND = ["pass_rate", "n_pass", "proe", "sec_snap", "plays_g", "adot"];
  const TEND_LABEL = { pass_rate: "Pass rate", n_pass: "Neutral pass rate", proe: "Pass over expected", sec_snap: "Seconds per snap", plays_g: "Plays per game", adot: "Air yards per pass" };
  const ROW_LABEL = { suc: "Success rate", p_epa: "EPA per dropback", r_epa: "EPA per designed run", explosive: "Explosive play rate", pts_drive: "Points per drive", rz_td: "Red zone TD rate", d3: "Third down rate", tov_g: "Turnovers per game" };
  const rowH = 48;
  const top = 236;
  const end = top + 158 + 46 + 40 + ROWS.length * rowH + 40 + 158 + 30 + 158 + 40 + 134;
  const h = Math.max(1500, end + 120);
  const fr = frame(1200, h, { noHeader: true });
  const { pad, w } = fr;
  let s = teamHead(t, fr, `${DATA.season} through Week ${thru(t.team)}`);
  let y = top;
  const cell = (label, id, side) => {
    const v = teamStat(t, id, side);
    return { label, value: teamFmt(v?.[0], meta[id]?.fmt), chip: (cx, cy) => rankChip(v?.[1], 32, cx, cy) };
  };
  s += tileGroups(pad, y, w - pad * 2, [
    { label: "Points per game", cells: [cell("Scored", "ppg", "o"), cell("Allowed", "ppg", "d"), cell("Margin", "pdiff", "o")] },
    { label: "EPA per play", cells: [cell("Offense", "epa", "o"), cell("Defense", "epa", "d"), cell("Net", "net_epa", "o")] },
  ]).svg;
  y += 158 + 46;
  s += T(pad, y, "Offense", { size: 25, weight: 750 }) + T(w - pad, y, "Defense", { size: 25, weight: 750, anchor: "end" });
  s += T(w / 2, y, "Rank of 32, 1st is best", { size: 17, anchor: "middle", fill: "var(--muted)" });
  y += 16;
  ROWS.forEach((id, i) => {
    const ry = y + i * rowH, cy = ry + rowH / 2;
    if (i % 2 === 0) s += R(pad, ry + 2, w - pad * 2, rowH - 4, { rx: 12, fill: "var(--panel)" });
    s += T(w / 2, cy + 7, ROW_LABEL[id], { size: 20, weight: 600, anchor: "middle", fill: "var(--muted)" });
    const o = teamStat(t, id, "o"), d = teamStat(t, id, "d");
    s += rankChip(o?.[1], 32, pad + 52, cy) + T(pad + 108, cy + 8, teamFmt(o?.[0], meta[id]?.fmt), { size: 23, weight: 700, mono: true });
    s += rankChip(d?.[1], 32, w - pad - 52, cy) + T(w - pad - 108, cy + 8, teamFmt(d?.[0], meta[id]?.fmt), { size: 23, weight: 700, mono: true, anchor: "end" });
  });
  y += ROWS.length * rowH + 40;
  s += tileGroups(pad, y, w - pad * 2, [{ label: "How they play (1st: the most)", cells: TEND.map((id) => cell(TEND_LABEL[id], id, "o")) }]).svg;
  y += 158 + 30;
  s += tileGroups(pad, y, w - pad * 2, [
    { label: "Fantasy points per game scored", cells: ["QB", "RB", "WR", "TE"].map((p) => cell(p, `fp_${p}`, "o")) },
    { label: "Allowed", cells: ["QB", "RB", "WR", "TE"].map((p) => cell(p, `fp_${p}`, "d")) },
  ]).svg;
  y += 158 + 40;
  s += T(pad, y, "Top fantasy scorers", { size: 25, weight: 750 }) + T(w - pad, y, "PPR points per game, rank at the position", { size: 17, anchor: "end", fill: "var(--muted)" });
  y += 18;
  const cw = (w - pad * 2) / t.top.length;
  t.top.forEach((p, i) => {
    const x0 = pad + i * cw;
    s += R(x0 + 4, y, cw - 8, 112, { rx: 18, fill: "var(--panel)" });
    s += face(p.player_id, x0 + 46, y + 56, 28, teamColor(abbr), p.name);
    s += T(x0 + 84, y + 34, fit(lastName(p.name), cw - 96, 19, 700), { size: 19, weight: 700 });
    s += T(x0 + 84, y + 62, `${num(p.fantasy_ppg)} PPG`, { size: 17, mono: true, fill: "var(--muted)" });
    s += p.rank ? chip(p.rank, p.position, x0 + 84 + 28, y + 88, { size: 13, h: 22, w: 56 }) : T(x0 + 84, y + 94, p.position, { size: 15, weight: 700, fill: posColor(p.position) });
  });
  return wrapCard(fr, s);
}

// E2 --------------------------------------------------------- Share of the work
function cardTeamShare(abbr) {
  const t = DATA.teams_cards[abbr];
  const fr = frame(1600, 900, { kicker: `${TEAMS[abbr]?.name || abbr} · Weeks 1-${thru(abbr)}`, title: "Who gets the work", subtitle: "Each week's share of the team's targets and carries" });
  const { pad, w } = fr;
  const weeks = teamWeeks(abbr);
  // One colour per player across both panels, so a back in both reads as one person.
  const order = [...new Map([...t.share.tgt.slice(0, 4), ...t.share.car.slice(0, 3)].map((p) => [p.player_id, p])).values()];
  const palette = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--muted)", "var(--faint)"];
  const colorOf = Object.fromEntries(order.map((p, i) => [p.player_id, palette[i]]));
  const panelW = (w - pad * 2 - 60) / 2;
  let s = "";
  [["tgt", "Targets", t.share.tgt.slice(0, 4)], ["car", "Carries", t.share.car.slice(0, 3)]].forEach(([key, title, players], pi) => {
    const x0 = pad + pi * (panelW + 60);
    s += T(x0, fr.top + 4, title, { size: 24, weight: 750 });
    // Legend: faces with names
    let lx = x0;
    players.forEach((p) => {
      s += face(p.player_id, lx + 14, fr.top + 44, 14, colorOf[p.player_id], p.name) + R(lx + 34, fr.top + 37, 12, 12, { rx: 3, fill: colorOf[p.player_id] });
      const nm = lastName(p.name);
      s += T(lx + 52, fr.top + 50, nm, { size: 16, weight: 650 });
      lx += 66 + textWidth(nm, 16, 650);
    });
    const py0 = fr.top + 80, py1 = fr.bottom - 40;
    const y = lin(0, 1, py1, py0);
    const cw = (panelW - 50) / weeks.length;
    for (const v of [0, 0.25, 0.5, 0.75, 1]) s += T(x0 + 38, y(v) + 6, pct(v), { size: 15, anchor: "end", mono: true, fill: "var(--faint)" });
    weeks.forEach((week, i) => {
      const cx = x0 + 50 + i * cw, bw = cw - 14;
      s += T(cx + cw / 2 - 7, py1 + 26, `W${week}`, { size: 16, weight: 700, anchor: "middle", fill: "var(--faint)" });
      const shares = players.map((p) => [p, p[key][week]]);
      if (shares.every(([, v]) => v == null)) {
        s += R(cx, py0, bw, py1 - py0, { rx: 8, stroke: "var(--rule)", sw: 1.5, dash: "5 5" }) + T(cx + bw / 2, (py0 + py1) / 2, "BYE", { size: 15, weight: 700, anchor: "middle", fill: "var(--faint)" });
        return;
      }
      let at = 0;
      for (const [p, v] of shares) {
        if (!v) continue;
        s += R(cx, y(at + v), bw, y(at) - y(at + v) - 1.5, { fill: colorOf[p.player_id] });
        if (y(at) - y(at + v) > 24) s += T(cx + bw / 2, (y(at) + y(at + v)) / 2 + 6, pct(v), { size: 15, weight: 800, anchor: "middle", mono: true, fill: inkOnToken(colorOf[p.player_id]) });
        at += v;
      }
      if (at < 0.999) s += R(cx, y(1), bw, y(at) - y(1), { fill: "var(--panel)" });
    });
    s += T(x0 + panelW, py0 - 8, "Grey: everyone else", { size: 15, anchor: "end", fill: "var(--faint)" });
  });
  return wrapCard(fr, s);
}
/** Ink for a percentage printed on a series fill: dark on the light series, light on the rest. */
const inkOnToken = (token) => (token.includes("series-4") || token.includes("series-3") || token.includes("faint") ? "#0b0d12" : "#ffffff");

// E3 ------------------------------------------------------------- EPA by game
function cardTeamTrend(abbr) {
  const t = DATA.teams_cards[abbr];
  const color = teamColor(abbr);
  const fr = frame(1600, 900, { kicker: `${TEAMS[abbr]?.name || abbr} · Weeks 1-${thru(abbr)}`, title: "EPA per play, game by game", subtitle: "Offense, and what the defense allowed (lower is better). Band: the league's middle half." });
  const { pad, w } = fr;
  const panelW = (w - pad * 2 - 60) / 2;
  let s = "";
  [["off", "Offense"], ["def", "Defense"]].forEach(([key, title], pi) => {
    const x0 = pad + pi * (panelW + 60);
    const rows = (t.trend[key] || []).filter((r) => r.value != null);
    const all = rows.flatMap((r) => [r.value, r.league_q25, r.league_q75]).filter((v) => v != null);
    const max = Math.max(0.3, Math.ceil(Math.max(...all.map(Math.abs)) * 10) / 10);
    const py0 = fr.top + 40, py1 = fr.bottom - 74, lx0 = x0 + 60, lx1 = x0 + panelW - 10;
    const weeks = rows.map((r) => r.week);
    const x = weeks.length > 1 ? lin(weeks[0], weeks[weeks.length - 1], lx0 + 30, lx1 - 30) : () => (lx0 + lx1) / 2;
    const y = lin(-max, max, py1, py0);
    s += T(x0, fr.top + 8, title, { size: 24, weight: 750 });
    if (rows.length > 1) s += `<path d="${pathOf(rows.map((r) => [x(r.week), y(r.league_q75)]))}L${rows.slice().reverse().map((r) => `${x(r.week).toFixed(1)},${y(r.league_q25).toFixed(1)}`).join("L")}Z" fill="var(--panel)"/>`;
    for (const v of [-max, -max / 2, 0, max / 2, max]) s += L(lx0, y(v), lx1, y(v), { stroke: v === 0 ? "var(--plot-rule)" : "var(--divider)" }) + T(lx0 - 10, y(v) + 6, signed(v, 2), { size: 16, anchor: "end", mono: true, fill: "var(--faint)" });
    if (rows.length > 1) s += `<path d="${pathOf(rows.map((r) => [x(r.week), y(r.value)]))}" fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round"/>`;
    rows.forEach((r) => {
      const good = key === "off" ? r.value > 0 : r.value < 0;
      s += C(x(r.week), y(r.value), 9, { fill: color, stroke: "var(--card)", sw: 2.5 });
      s += T(x(r.week), y(r.value) + (r.value >= 0 ? -16 : 28), signed(r.value, 2), { size: 15, weight: 700, anchor: "middle", mono: true, fill: mix(good ? "var(--pos)" : "var(--neg)", 70, "var(--fg)") });
      s += T(x(r.week), py1 + 28, `W${r.week} ${r.home ? "vs" : "@"} ${r.opponent}`, { size: 15, weight: 700, anchor: "middle", fill: "var(--muted)" });
      const won = r.points_for > r.points_against, tied = r.points_for === r.points_against;
      s += T(x(r.week), py1 + 50, `${won ? "W" : tied ? "T" : "L"} ${r.points_for}-${r.points_against}`, { size: 15, weight: 700, anchor: "middle", mono: true, fill: mix(won ? "var(--pos)" : tied ? "var(--muted)" : "var(--neg)", 70, "var(--fg)") });
    });
  });
  return wrapCard(fr, s);
}

// E4 ------------------------------------------------------ Red zone pecking order
function cardTeamRedZone(abbr) {
  const t = DATA.teams_cards[abbr];
  const fr = frame(1600, 900, { kicker: `${TEAMS[abbr]?.name || abbr} · Weeks 1-${thru(abbr)}`, title: "Red zone pecking order", subtitle: "Targets and carries inside the opponent's 20" });
  const { pad, w } = fr;
  const rows = t.redzone.map((p) => ({ ...p, tg: p.red_zone_targets || 0, ca: p.red_zone_rush_attempts || 0 }));
  const total = rows.reduce((a, p) => a + p.tg + p.ca, 0) || 1;
  const max = Math.max(...rows.map((p) => p.tg + p.ca), 1);
  const bx0 = pad + 340, bx1 = w - pad - 260;
  const x = lin(0, Math.ceil(max / 5) * 5, bx0, bx1);
  let s = legendRow(w - pad - 300, fr.top - 66, [[(cx, cy) => R(cx - 9, cy - 9, 18, 18, { rx: 4, fill: "var(--series-1)" }), "Carries"], [(cx, cy) => R(cx - 9, cy - 9, 18, 18, { rx: 4, fill: "var(--series-2)" }), "Targets"]], 18).svg;
  const y0 = fr.top + 20;
  const rowH = Math.min(70, (fr.bottom - y0 - 10) / Math.max(rows.length, 1));
  for (let v = 5; v <= Math.ceil(max / 5) * 5; v += 5) s += L(x(v), y0 - 6, x(v), y0 + rowH * rows.length) + T(x(v), y0 - 12, v, { size: 15, anchor: "middle", mono: true, fill: "var(--faint)" });
  s += T(bx1 + 120, y0 - 12, "SHARE", { size: 14, weight: 700, anchor: "middle", fill: "var(--faint)" });
  s += T(w - pad, y0 - 12, "INSIDE 10", { size: 14, weight: 700, anchor: "end", fill: "var(--faint)" });
  rows.forEach((p, i) => {
    const cy = y0 + i * rowH + rowH / 2;
    s += face(p.player_id, pad + 24, cy, 22, teamColor(abbr), p.name);
    s += T(pad + 58, cy + 2, fit(p.name, 260, 21, 700), { size: 21, weight: 700 });
    s += T(pad + 58, cy + 24, p.position, { size: 15, weight: 700, fill: posColor(p.position) });
    const bh = rowH * 0.5;
    if (p.ca) s += R(x(0), cy - bh / 2, x(p.ca) - x(0), bh, { fill: "var(--series-1)" });
    if (p.tg) s += R(x(p.ca), cy - bh / 2, x(p.ca + p.tg) - x(p.ca), bh, { fill: "var(--series-2)" });
    const parts = [p.ca ? `${p.ca} car` : "", p.tg ? `${p.tg} tgt` : ""].filter(Boolean).join(", ");
    s += T(x(p.ca + p.tg) + 12, cy + 7, parts, { size: 17, weight: 650, mono: true, fill: "var(--muted)" });
    s += T(bx1 + 120, cy + 8, pct((p.tg + p.ca) / total), { size: 21, weight: 800, anchor: "middle", mono: true });
    s += T(w - pad, cy + 8, p.rush_att_inside_10 ?? "-", { size: 19, weight: 600, anchor: "end", mono: true, fill: "var(--muted)" });
  });
  return wrapCard(fr, s);
}
