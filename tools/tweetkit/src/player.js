// D: player reply cards. Every card takes one player id, so swapping the player is
// the only input.
const n0 = (v) => num(v, 0), n1 = (v) => num(v, 1), n2 = (v) => num(v, 2), s1 = (v) => signed(v, 1), s2 = (v) => signed(v, 2), p0 = (v) => pct(v, 0), p1 = (v) => pct(v, 1);
// D1's rows and tiles, per position, as Nate set them on 2026-10-21. Labels are his words.
const STAT = {
  fantasy_ppg: ["PPR points per game", n1],
  target_share: ["Target share", p0], route_participation: ["Route participation", p0],
  yards_per_reception: ["Yards per reception", n1], yards_per_target: ["Yards per target", n1],
  targets_per_route_run: ["Targets per route run", p0], yards_per_route_run: ["Yards per route run", n2],
  fantasy_points_per_route_run: ["Points per route run", n2], adot: ["Average depth of target", n1],
  air_yards: ["Air yards", n0], air_yards_share: ["Air yards share", p0], red_zone_targets: ["Red zone targets", n0],
  receiving_epa: ["Receiving EPA", s1],
  rush_attempt_share: ["Rush share", p0], rush_att_inside_5: ["Carries inside the 5", n0],
  yards_per_carry: ["Yards per carry", n1], fantasy_points_per_carry: ["Points per carry", n2],
  ngs_rush_yards_over_expected_per_att: ["Rushing yards over expected per carry", s2],
  rush_ybc_per_att: ["Yards before contact per carry", n1], rush_yac_per_att: ["Yards after contact per carry", n1],
  rushing_epa: ["Rushing EPA", s1], epa: ["EPA total", s1],
  completion_pct: ["Completion %", p1], passer_rating: ["Passer rating", n1], yards_per_attempt: ["Yards per attempt", n1],
  yards_per_completion: ["Yards per completion", n1], ngs_pass_intended_air_yards: ["aDOT", n1],
  rushing_yards_per_game: ["Rushing yards per game", n1], rushing_tds: ["Rushing TDs", n0],
  ngs_pass_aggressiveness: ["Aggressiveness", p1], bad_throw_rate: ["Bad throw %", p1], cpoe: ["CPOE", s1],
  epa_per_play: ["EPA per play", s2],
};
const STAT_LABEL = { RB: { route_participation: "Route share" } };
const PCT_LIST = {
  QB: ["fantasy_ppg", "completion_pct", "passer_rating", "yards_per_attempt", "yards_per_completion", "ngs_pass_intended_air_yards",
    "rushing_yards_per_game", "rushing_tds", "ngs_pass_aggressiveness", "bad_throw_rate", "cpoe", "epa_per_play", "epa"],
  RB: ["fantasy_ppg", "rush_attempt_share", "target_share", "route_participation", "rush_att_inside_5", "red_zone_targets",
    "yards_per_carry", "fantasy_points_per_carry", "targets_per_route_run", "ngs_rush_yards_over_expected_per_att",
    "rush_ybc_per_att", "rush_yac_per_att", "rushing_epa", "receiving_epa", "epa"],
  WR: ["fantasy_ppg", "target_share", "route_participation", "yards_per_reception", "yards_per_target", "targets_per_route_run",
    "yards_per_route_run", "fantasy_points_per_route_run", "adot", "air_yards", "air_yards_share", "red_zone_targets", "receiving_epa"],
};
PCT_LIST.TE = PCT_LIST.WR;
// D1's top row in labelled groups: [group, [[label, stat, format], ...]]. Seven numbers for a
// back read cleanly as Fantasy points | Rushing | Receiving rather than seven loose tiles.
const TILE_GROUPS = {
  QB: [["Fantasy points", [["Per game", "fantasy_ppg", n1], ["Total", "fantasy_points", n1]]],
    ["Passing", [["Yards", "passing_yards", n0], ["TDs", "passing_tds", n0], ["INTs", "interceptions", n0]]]],
  RB: [["Fantasy points", [["Per game", "fantasy_ppg", n1], ["Total", "fantasy_points", n1]]],
    ["Rushing", [["Yards", "rushing_yards", n0], ["TDs", "rushing_tds", n0]]],
    ["Receiving", [["Receptions", "receptions", n0], ["Yards", "receiving_yards", n0], ["TDs", "receiving_tds", n0]]]],
  WR: [["Fantasy points", [["Per game", "fantasy_ppg", n1], ["Total", "fantasy_points", n1]]],
    ["Receiving", [["Receptions", "receptions", n0], ["Yards", "receiving_yards", n0], ["TDs", "receiving_tds", n0]]]],
};
TILE_GROUPS.TE = TILE_GROUPS.WR;
// D8 and D9, the real-life cards: no fantasy points. The rows mirror NFL_PERCENTILES in pull.py.
Object.assign(STAT, {
  catch_rate: ["Catch rate", p1], receiving_first_downs: ["Receiving first downs", n0], yards_after_catch: ["Yards after catch", n0],
  ngs_rec_yac_above_expectation: ["YAC over expected, per catch", s1], ngs_rec_separation: ["Average separation, yards", n1],
  rec_broken_tackles: ["Broken tackles", n0], receiving_drop_rate: ["Drop rate", p1], passing_first_downs: ["Passing first downs", n0],
  ngs_pass_time_to_throw: ["Time to throw, seconds", n2], pressure_rate: ["Pressure rate", p1], sacks_suffered: ["Sacks taken", n0], sack_rate: ["Sack %", p1],
  rush_broken_tackles: ["Broken tackles", n0], rushing_first_downs: ["Rushing first downs", n0], fumbles_lost: ["Fumbles lost", n0],
});
const NFL_PCT_LIST = {
  QB: ["epa", "epa_per_play", "cpoe", "completion_pct", "yards_per_attempt", "passer_rating", "ngs_pass_intended_air_yards",
    "passing_first_downs", "ngs_pass_time_to_throw", "ngs_pass_aggressiveness", "bad_throw_rate", "pressure_rate", "sack_rate",
    "rushing_yards_per_game"],
  RB: ["yards_per_carry", "rushing_yards_per_game", "ngs_rush_yards_over_expected_per_att", "rush_ybc_per_att", "rush_yac_per_att", "rush_broken_tackles",
    "rushing_first_downs", "rushing_epa", "target_share", "yards_per_route_run", "receiving_epa", "fumbles_lost"],
  WR: ["catch_rate", "yards_per_reception", "yards_per_target", "yards_per_route_run", "targets_per_route_run", "adot", "receiving_first_downs",
    "yards_after_catch", "ngs_rec_yac_above_expectation", "ngs_rec_separation", "rec_broken_tackles", "receiving_drop_rate", "receiving_epa"],
};
NFL_PCT_LIST.TE = NFL_PCT_LIST.WR;
// [label, stat, format, name on the head to head]
const NFL_TILES = {
  QB: [["Passing", [["Comp %", "completion_pct", p1, "Completion %"], ["Yards", "passing_yards", n0, "Passing yards"], ["TDs", "passing_tds", n0, "Passing TDs"],
    ["INTs", "interceptions", n0, "Interceptions"], ["Rating", "passer_rating", n1, "Passer rating"]]],
    ["Rushing", [["Yards", "rushing_yards", n0, "Rushing yards"], ["TDs", "rushing_tds", n0, "Rushing TDs"]]]],
  RB: [["Rushing", [["Carries", "carries", n0, "Carries"], ["Yards", "rushing_yards", n0, "Rushing yards"], ["Per carry", "yards_per_carry", n1, "Yards per carry"],
    ["TDs", "rushing_tds", n0, "Rushing TDs"]]],
    ["Receiving", [["Catches", "receptions", n0, "Receptions"], ["Yards", "receiving_yards", n0, "Receiving yards"], ["TDs", "receiving_tds", n0, "Receiving TDs"]]]],
  WR: [["Receiving", [["Targets", "targets", n0, "Targets"], ["Catches", "receptions", n0, "Receptions"], ["Yards", "receiving_yards", n0, "Receiving yards"],
    ["Per catch", "yards_per_reception", n1, "Yards per catch"], ["TDs", "receiving_tds", n0, "Receiving TDs"]]]],
};
NFL_TILES.TE = NFL_TILES.WR;
const CARD_MODES = {
  fantasy: { tiles: TILE_GROUPS, list: PCT_LIST, tag: " \u00b7 PPR" },
  nfl: { tiles: NFL_TILES, list: NFL_PCT_LIST, tag: "" },
};
/** One game in a few words, and the number to draw it by (yards). */
function gameNumbers(pos, g) {
  if (pos === "QB") return { value: g.passing_yards || 0, line: `${g.passing_tds || 0} TD, ${g.interceptions || 0} INT` };
  if (pos === "RB") return { value: (g.rushing_yards || 0) + (g.receiving_yards || 0), parts: [g.rushing_yards || 0, g.receiving_yards || 0], line: `${g.carries || 0} car, ${g.receptions || 0} rec`, short: `${g.carries || 0} car` };
  return { value: g.receiving_yards || 0, line: `${g.receptions || 0}/${g.targets || 0}` };
}
const gameTds = (g) => (g.passing_tds || 0) + (g.rushing_tds || 0) + (g.receiving_tds || 0);
const POS_NAME = { QB: "quarterbacks", RB: "running backs", WR: "receivers", TE: "tight ends" };
const height = (inches) => (inches ? `${Math.floor(inches / 12)}-${inches % 12}` : "");
const draftLine = (d) => (!d?.draft_year ? "Undrafted" : d.draft_round ? `${d.draft_year} Round ${d.draft_round}, Pick ${d.draft_pick}` : `${d.draft_year} draft`);

/** Every week through the newest, played or not: { week, log, bye }. */
function weekSlots(p) {
  const team = p.team;
  const byes = DATA.byes[team] || [];
  const out = [];
  for (let wk = 1; wk <= thru(team); wk++) {
    const log = p.log.find((g) => g.week === wk) || null;
    out.push({ week: wk, log, bye: !log && byes.includes(wk) });
  }
  return out;
}
const homeAway = (g) => (g.game_id.endsWith(`_${g.team_abbreviation}`) ? "vs" : "@");
const tierFill = { top: mix("var(--pos)", 78, "var(--card)"), starter: mix("var(--pos)", 44, "var(--card)"), flex: mix("var(--warn)", 52, "var(--card)"), outside: mix("var(--neg)", 46, "var(--card)"), far: mix("var(--neg)", 72, "var(--card)") };

function playerHead(p, fr, o = {}) {
  // Face, name, and the bio line, drawn under the frame's own header area.
  const { pad, w } = fr;
  const color = teamColor(p.team);
  const r = o.r ?? 100, cx = pad + r + 4, cy = (o.top ?? 70) + r;
  let s = face(p.id, cx, cy, r, color, p.name);
  const tx = cx + r + 40;
  s += T(tx, cy - 28, fit(p.name, w - tx - 220, 56, 800), { size: 56, weight: 800 });
  const pos = pill(p.pos, tx, cy + 18, { size: 20, tone: posColor(p.pos), weight: 800 });
  s += pos.svg;
  s += logo(p.team, tx + pos.w + 16, cy + 1, 34);
  s += T(tx + pos.w + 60, cy + 26, `${TEAMS[p.team]?.name || p.team}${p.number ? `  #${p.number}` : ""}`, { size: 24, weight: 600 });
  const bio = [p.age ? `Age ${Math.floor(p.age)}` : "", [height(p.height), p.weight ? `${p.weight}` : ""].filter(Boolean).join(", "), draftLine(p.draft), p.college?.split(";")[0]].filter(Boolean).join(" · ");
  s += T(tx, cy + 70, fit(bio, w - tx - pad, 21), { size: 21, fill: "var(--muted)" });
  return s;
}

// D1 ----------------------------------------------------------- Profile
function cardProfile(pid, opts = {}, mode = "fantasy") {
  const p = DATA.players[pid];
  const ss = p.season;
  const M = CARD_MODES[mode];
  const list = M.list[p.pos];
  // The card is 1200x1500 when the rows fit at 50px or more; a long list (backs have 15)
  // grows the card rather than shrinking the type.
  const tilesH = 158;
  const fixed = 326 + tilesH + 68 + 28 + (mode === "nfl" ? 180 : 96) + 120;
  const rowH = Math.max(50, Math.min(56, (1500 - fixed) / list.length));
  const h = Math.max(1500, Math.round(fixed + rowH * list.length));
  const fr = frame(1200, h, { noHeader: true });
  const { pad, w } = fr;
  let s = mark(w - pad - 46 * MARK_ASPECT, pad - 4, 46);
  s += playerHead(p, fr, { top: 66 });
  let y = 304;
  s += T(pad, y, `${DATA.season} through Week ${thru(p.team)}${M.tag} \u00b7 ${ss.games_played} games`.toUpperCase(), { size: 18, weight: 750, fill: "var(--accent-text)", ls: 2 });
  y += 22;
  s += tileGroups(pad, y, w - pad * 2, M.tiles[p.pos].map(([label, cells]) => ({
    label,
    cells: cells.map(([cellLabel, id, f]) => ({ label: cellLabel, value: ss[id] == null ? "-" : f(ss[id]), chip: (cx, cy) => chip(p.ranks[id], p.pos, cx, cy, { size: 16, h: 28, w: 62 }) })),
  }))).svg;
  y += tilesH + 50;
  s += T(pad, y, `Percentile among ${POS_NAME[p.pos]}`, { size: 25, weight: 750 });
  s += T(w - pad, y, "Qualified players, this season", { size: 17, anchor: "end", fill: "var(--muted)" });
  y += 18;
  const bx0 = 560, bx1 = w - pad - 30;
  list.forEach((id, i) => {
    const cy = y + i * rowH + rowH / 2;
    const [label, f] = STAT[id];
    const v = ss[id], pc = p.pct[id];
    if (i % 2 === 0) s += R(pad - 10, cy - rowH / 2 + 3, w - pad * 2 + 20, rowH - 6, { rx: 14, fill: "var(--panel)" });
    const lb = fitSize(STAT_LABEL[p.pos]?.[id] ?? label, bx0 - pad - 130, [21, 19, 17], 600);
    s += T(pad, cy + 7, lb.text, { size: lb.size, weight: 600, fill: "var(--muted)" });
    s += T(bx0 - 30, cy + 8, v == null ? "-" : f(v), { size: 22, weight: 800, anchor: "end", mono: true });
    s += L(bx0, cy, bx1, cy, { stroke: "var(--rule)", sw: 8, cap: "round" });
    if (pc != null) {
      const bx = lin(0, 100, bx0, bx1)(pc);
      const color = pctColor(pc);
      s += L(bx0, cy, bx, cy, { stroke: color, sw: 8, cap: "round" });
      s += C(bx, cy, 20, { fill: mix(color, 30, "var(--card)"), stroke: color, sw: 3 });
      s += T(bx, cy + 7, pc, { size: 18, weight: 800, anchor: "middle", mono: true });
    } else s += T(bx1, cy + 7, "Not ranked", { size: 16, anchor: "end", fill: "var(--faint)" });
  });
  y += list.length * rowH + 28;
  const slots = weekSlots(p);
  const cw = (w - pad * 2 - 190) / slots.length;
  if (mode === "nfl") return wrapCard(fr, s + gameStrip(p, slots, pad + 190, y, cw, 180));
  s += T(pad, y + 52, "Weekly finish", { size: 22, weight: 750 });
  const typical = slots.find((sl) => sl.log?.typical);
  if (typical) s += T(pad, y + 80, `W${typical.week}: in a typical week`, { size: 15, fill: "var(--faint)" });
  slots.forEach((sl, i) => {
    const cx = pad + 190 + cw * i + cw / 2;
    s += T(cx, y + 18, `W${sl.week}`, { size: 15, weight: 700, anchor: "middle", fill: "var(--faint)" });
    if (sl.log) {
      s += chip(sl.log.position_rank, p.pos, cx, y + 46, { size: 17, h: 30, w: cw - 18 });
      s += T(cx, y + 82, n1(sl.log.fantasy_points), { size: 17, weight: 700, anchor: "middle", mono: true, fill: "var(--muted)" });
    } else s += T(cx, y + 52, sl.bye ? "BYE" : "DNP", { size: 16, weight: 700, anchor: "middle", fill: "var(--faint)" });
  });
  return wrapCard(fr, s);
}

// D2 ----------------------------------------------------------- Game log
function cardGameLog(pid) {
  const p = DATA.players[pid];
  const slots = weekSlots(p);
  const typical = slots.find((sl) => sl.log?.typical);
  const fr = frame(1600, 900, { kicker: `${DATA.season} · PPR`, title: `${p.name}: week by week`, subtitle: `Fantasy points each week. Line: expected points. Chip: finish at the position${typical ? ` (W${typical.week}: in a typical week)` : ""}.` });
  const { pad, w } = fr;
  const panelW = 340;
  const px0 = pad + 56, px1 = w - pad - panelW - 120;
  const py0 = fr.top + 24, py1 = fr.bottom - 150;
  const vals = slots.flatMap((sl) => (sl.log ? [sl.log.fantasy_points, sl.log.expected_fantasy_points] : []));
  const max = Math.max(20, Math.ceil(Math.max(...vals) / 10) * 10);
  const y = lin(0, max, py1, py0);
  const slotW = (px1 - px0) / slots.length;
  let s = "";
  for (let v = 0; v <= max; v += 10) s += L(px0, y(v), px1, y(v), { stroke: v ? "var(--divider)" : "var(--plot-rule)", sw: v ? 1 : 1.5 }) + T(px0 - 12, y(v) + 6, v, { size: 18, anchor: "end", mono: true, fill: "var(--faint)" });
  const ppg = p.season.fantasy_ppg;
  s += L(px0, y(ppg), px1, y(ppg), { stroke: "var(--muted)", dash: "8 7", sw: 1.6 });
  s += T(px1 + 10, y(ppg) - 4, "Avg", { size: 16, weight: 700, fill: "var(--muted)" }) + T(px1 + 10, y(ppg) + 18, n1(ppg), { size: 17, weight: 800, mono: true, fill: "var(--muted)" });
  const usageKey = p.pos === "RB" ? ["rush_attempt_share", "Carries"] : p.pos === "QB" ? null : ["target_share", "Targets"];
  slots.forEach((sl, i) => {
    const cx = px0 + slotW * i + slotW / 2;
    const bw = Math.min(110, slotW * 0.58);
    s += T(cx, py1 + 34, `W${sl.week}`, { size: 19, weight: 750, anchor: "middle", fill: "var(--faint)" });
    if (!sl.log) {
      s += T(cx, py1 - 16, sl.bye ? "BYE" : "DNP", { size: 18, weight: 750, anchor: "middle", fill: "var(--faint)" });
      return;
    }
    const g = sl.log;
    s += T(cx, py1 + 62, `${homeAway(g)} ${g.opponent_abbreviation}`, { size: 18, weight: 600, anchor: "middle", fill: "var(--muted)" });
    const t = tier(g.position_rank, p.pos);
    s += R(cx - bw / 2, y(Math.max(0, g.fantasy_points)), bw, py1 - y(Math.max(0, g.fantasy_points)), { rx: 8, fill: tierFill[t] });
    if (g.expected_fantasy_points != null) s += L(cx - bw / 2 - 12, y(g.expected_fantasy_points), cx + bw / 2 + 12, y(g.expected_fantasy_points), { stroke: "var(--fg)", sw: 4, cap: "round" });
    const top = Math.min(y(g.fantasy_points), g.expected_fantasy_points != null ? y(g.expected_fantasy_points) : 1e9);
    s += T(cx, top - 14, n1(g.fantasy_points), { size: 22, weight: 800, anchor: "middle", mono: true });
    s += chip(g.position_rank, p.pos, cx, py1 + 92, { size: 16, h: 28 });
    const usage = usageKey ? `${pct(g[usageKey[0]])} ${usageKey[1] === "Carries" ? "car" : "tgt"}` : `${g.attempts} att`;
    const ul = fitSize(`${pct(g.snap_share)} snaps · ${usage}`, slotW - 6, [16, 15, 14]);
    s += T(cx, py1 + 132, ul.text, { size: ul.size, anchor: "middle", fill: "var(--muted)" });
  });
  // Side panel
  const sx = w - pad - panelW;
  s += R(sx, fr.top - 10, panelW, fr.bottom - fr.top + 10, { rx: 24, fill: "var(--panel)" });
  s += face(p.id, sx + panelW / 2, fr.top + 80, 66, teamColor(p.team), p.name);
  s += T(sx + panelW / 2, fr.top + 186, `${p.pos} · ${p.team}`, { size: 20, weight: 700, anchor: "middle", fill: "var(--muted)" });
  const played = slots.filter((sl) => sl.log);
  const tops = played.filter((sl) => sl.log.position_rank <= 12).length;
  const best = played.reduce((a, b) => (b.log.fantasy_points > (a?.log.fantasy_points ?? -1) ? b : a), null);
  const facts = [
    ["Points per game", n1(ppg), p.ranks.fantasy_ppg],
    ["Expected per game", n1(p.season.expected_fantasy_ppg), p.ranks.expected_fantasy_ppg],
    [`Top-12 weeks`, `${tops} of ${played.length}`, null],
    ["Best week", best ? `${n1(best.log.fantasy_points)}, W${best.week}` : "-", null],
  ];
  facts.forEach(([k, v, rank], i) => {
    const fy = fr.top + 232 + i * 80;
    s += T(sx + 28, fy, k.toUpperCase(), { size: 14, weight: 750, fill: "var(--faint)", ls: 1.2 });
    s += T(sx + 28, fy + 40, v, { size: 30, weight: 800, mono: true });
    if (rank) s += chip(rank, p.pos, sx + panelW - 60, fy + 28, { size: 16, h: 28 });
  });
  return wrapCard(fr, s);
}

// D3 ------------------------------------------------------------- Usage
function cardUsage(pid) {
  const p = DATA.players[pid];
  const qb = p.pos === "QB";
  const fr = frame(1600, 900, {
    kicker: `${DATA.season} · Usage`, title: `${p.name}: usage by week`, headshot: { pid: p.id, name: p.name, ring: teamColor(p.team) },
    subtitle: qb ? "Pass attempts and carries each week" : p.pos === "RB" ? "Share of the team's snaps, carries and targets each week" : "Share of the team's snaps, routes, targets and air yards each week",
  });
  const { pad, w } = fr;
  const slots = weekSlots(p);
  const series = qb
    ? [["attempts", "Pass attempts", "var(--series-1)"], ["carries", "Carries", "var(--series-4)"]]
    : p.pos === "RB"
      ? [["snap_share", "Snap share", "var(--muted)"], ["rush_attempt_share", "Carry share", "var(--series-1)"], ["target_share", "Target share", "var(--series-2)"]]
      : [["snap_share", "Snap share", "var(--muted)"], ["route_participation", "Route participation", "var(--series-1)"], ["target_share", "Target share", "var(--series-2)"], ["air_yards_share", "Air yards share", "var(--series-3)"]];
  const rowsT = qb
    ? [["passing_yards", "Pass yards", (v) => v, "var(--series-1)"], ["passing_tds", "Pass TDs", (v) => v, "var(--series-1)"], ["rushing_yards", "Rush yards", (v) => v, "var(--series-4)"], ["rushing_tds", "Rush TDs", (v) => v, "var(--series-4)"]]
    : series.map(([key, label, color]) => [key, label, (v) => pct(v), color]);
  const tableRows = rowsT.length;
  const tableH = 48 + tableRows * 42;
  const px0 = pad + 250, px1 = w - pad - 20, py0 = fr.top + 40, py1 = fr.bottom - tableH - 30;
  const x = (i) => px0 + ((i + 0.5) * (px1 - px0)) / slots.length;
  const max = qb ? Math.ceil(Math.max(...slots.flatMap((sl) => (sl.log ? [sl.log.attempts, sl.log.carries] : [0]))) / 10) * 10 : 1;
  const y = lin(0, max, py1, py0);
  let s = legendRow(pad, fr.top + 6, series.map(([, label, color]) => [(cx, cy) => (qb ? R(cx - 9, cy - 9, 18, 18, { rx: 4, fill: color }) : L(cx - 12, cy, cx + 12, cy, { stroke: color, sw: 5, cap: "round" })), label]), 19).svg;
  const step = qb ? 10 : 0.25;
  for (let v = 0; v <= max + 1e-9; v += step) s += L(px0, y(v), px1, y(v), { stroke: v ? "var(--divider)" : "var(--plot-rule)" }) + T(px0 - 12, y(v) + 6, qb ? v : pct(v), { size: 17, anchor: "end", mono: true, fill: "var(--faint)" });
  slots.forEach((sl, i) => {
    s += T(x(i), py1 + 30, `W${sl.week}`, { size: 18, weight: 750, anchor: "middle", fill: "var(--faint)" });
    if (!sl.log) s += T(x(i), py1 - 16, sl.bye ? "BYE" : "DNP", { size: 17, weight: 750, anchor: "middle", fill: "var(--faint)" });
  });
  if (qb) {
    const bw = Math.min(56, (px1 - px0) / slots.length / 3);
    slots.forEach((sl, i) => {
      if (!sl.log) return;
      series.forEach(([key, , color], k) => {
        const v = sl.log[key] ?? 0, bx = x(i) + (k ? 6 : -bw - 6);
        s += R(bx, y(v), bw, py1 - y(v), { rx: 6, fill: color, opacity: 0.88 }) + T(bx + bw / 2, y(v) - 10, v, { size: 18, weight: 800, anchor: "middle", mono: true });
      });
    });
  } else {
    series.forEach(([key, , color]) => {
      let seg = [];
      const flush = () => { if (seg.length > 1) s += `<path d="${pathOf(seg)}" fill="none" stroke="${color}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>`; seg = []; };
      slots.forEach((sl, i) => { if (sl.log && sl.log[key] != null) seg.push([x(i), y(sl.log[key])]); else flush(); });
      flush();
      slots.forEach((sl, i) => { if (sl.log && sl.log[key] != null) s += C(x(i), y(sl.log[key]), 8, { fill: color, stroke: "var(--card)", sw: 2.5 }); });
    });
  }
  // Table
  let ty = fr.bottom - tableH + 10;
  s += L(pad, ty + 4, w - pad, ty + 4, { stroke: "var(--rule)" });
  rowsT.forEach(([key, label, f, color], r) => {
    const ry = ty + 26 + r * 42;
    s += R(pad, ry - 18, 8, 22, { rx: 3, fill: color }) + T(pad + 20, ry, label, { size: 18, weight: 650, fill: "var(--muted)" });
    slots.forEach((sl, i) => { s += T(x(i), ry, sl.log && sl.log[key] != null ? f(sl.log[key]) : "-", { size: 19, weight: 700, anchor: "middle", mono: true }); });
  });
  return wrapCard(fr, s);
}

// D5 ------------------------------------------------- Every target / every run
function hash01(i, salt) { const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453; return v - Math.floor(v); }
function cardTargets(pid) {
  const p = DATA.players[pid];
  if (p.pos === "RB") return cardRuns(pid);
  const qb = p.pos === "QB";
  const fr = frame(1200, 1500, { kicker: `${DATA.season} · Weeks 1-${thru(p.team)}`, title: `${p.name}: every ${qb ? "throw" : "target"}`, subtitle: qb ? "Each targeted pass by depth past the line of scrimmage and side of the field" : "Each target by depth past the line of scrimmage and side of the field" });
  const { pad, w } = fr;
  const color = teamColor(p.team);
  const throws = p.targets.filter((t) => t[1] != null && t[2]);
  const deep = Math.max(40, Math.ceil(Math.max(0, ...throws.map((t) => t[1])) / 10) * 10);
  const fx0 = pad, fx1 = w - pad, fy0 = fr.top + 50, fy1 = fr.bottom - 230;
  const y = lin(-10, deep, fy1, fy0);
  let s = "";
  const items = [
    [(cx, cy) => C(cx, cy, 10, { fill: color, stroke: color, sw: 2 }), qb ? "Complete" : "Catch"],
    [(cx, cy) => C(cx, cy, 10, { fill: "var(--card)", stroke: color, sw: 2.5 }), "Incomplete"],
    [(cx, cy) => C(cx, cy, 10, { fill: color }) + C(cx, cy, 16, { stroke: "var(--fg)", sw: 3 }), "Touchdown"],
    [(cx, cy) => L(cx - 8, cy - 8, cx + 8, cy + 8, { stroke: "var(--neg)", sw: 4, cap: "round" }) + L(cx - 8, cy + 8, cx + 8, cy - 8, { stroke: "var(--neg)", sw: 4, cap: "round" }), "Interception"],
  ];
  s += legendRow(pad, fr.top + 8, items, 19).svg;
  s += R(fx0, fy0, fx1 - fx0, fy1 - fy0, { rx: 18, fill: "var(--panel)" });
  for (let v = -10; v <= deep; v += 5) {
    const major = v % 10 === 0;
    s += L(fx0, y(v), fx1, y(v), { stroke: v === 0 ? "var(--accent)" : major ? "var(--rule)" : "var(--divider)", sw: v === 0 ? 3 : 1.2 });
    if (major && v > 0) s += T(fx0 + 16, y(v) + 24, `${v}`, { size: 18, weight: 700, mono: true, fill: "var(--faint)" });
  }
  s += T(fx0 + 16, y(0) - 10, "LOS", { size: 17, weight: 800, fill: "var(--accent-text)" });
  const third = (fx1 - fx0) / 3;
  for (const k of [1, 2]) s += L(fx0 + third * k, fy0, fx0 + third * k, fy1, { stroke: "var(--rule)", dash: "6 8" });
  ["Left", "Middle", "Right"].forEach((side, k) => { s += T(fx0 + third * k + third / 2, fy1 + 30, side, { size: 19, weight: 700, anchor: "middle", fill: "var(--muted)" }); });
  const cols = { left: 0, middle: 1, right: 2 };
  throws.forEach((t, i) => {
    const [, ay, loc, comp, td, int] = t;
    const cx = fx0 + third * cols[loc] + third * (0.12 + 0.76 * hash01(i, 1));
    const cy = y(Math.max(-9, Math.min(deep, ay + (hash01(i, 2) - 0.5) * 0.9)));
    if (int) s += L(cx - 9, cy - 9, cx + 9, cy + 9, { stroke: "var(--neg)", sw: 4, cap: "round" }) + L(cx - 9, cy + 9, cx + 9, cy - 9, { stroke: "var(--neg)", sw: 4, cap: "round" });
    else {
      if (td) s += C(cx, cy, 17, { stroke: "var(--fg)", sw: 3 });
      s += C(cx, cy, 10, { fill: comp ? color : "var(--card)", stroke: color, sw: comp ? 1.5 : 2.5, opacity: comp ? 0.92 : 1 });
    }
  });
  const sum = p.tsum, avg = p.tavg;
  const tiles = qb
    ? [["Passes", n0(sum.targets)], ["Completions", n0(sum.receptions)], ["Yards", n0(sum.yards)], ["TDs", n0(sum.touchdowns)], ["INTs", n0(sum.interceptions)], ["aDOT", n1(sum.adot), avg.adot != null ? `QBs ${n1(avg.adot)}` : ""]]
    : [["Targets", n0(sum.targets)], ["Catches", n0(sum.receptions)], ["Yards", n0(sum.yards)], ["TDs", n0(sum.touchdowns)], ["aDOT", n1(sum.adot), avg.adot != null ? `${p.pos}s ${n1(avg.adot)}` : ""], ["EPA / target", s2(sum.epa_per_target), avg.epa_per_target != null ? `${p.pos}s ${s2(avg.epa_per_target)}` : ""]];
  const tw = (w - pad * 2 - 5 * 14) / 6, ty = fr.bottom - 150;
  tiles.forEach(([k, v, note], i) => {
    const tx = pad + i * (tw + 14);
    s += R(tx, ty, tw, 140, { rx: 20, fill: "var(--panel)" });
    s += T(tx + tw / 2, ty + 36, k.toUpperCase(), { size: 14, weight: 750, anchor: "middle", fill: "var(--faint)", ls: 1.1 });
    s += T(tx + tw / 2, ty + 88, v, { size: 38, weight: 800, anchor: "middle", mono: true });
    if (note) s += T(tx + tw / 2, ty + 120, note, { size: 15, anchor: "middle", fill: "var(--muted)" });
  });
  return wrapCard(fr, s);
}

const LANES = [["le", "Left end"], ["lt", "Left tackle"], ["lg", "Left guard"], ["mid", "Middle"], ["rg", "Right guard"], ["rt", "Right tackle"], ["re", "Right end"]];
function cardRuns(pid) {
  const p = DATA.players[pid];
  const fr = frame(1200, 1500, { kicker: `${DATA.season} · Weeks 1-${thru(p.team)}`, title: `${p.name}: every carry`, subtitle: "Designed runs by gap, and how each one ended. Tick: running backs on average." });
  const { pad, w } = fr;
  const runs = p.runs;
  const color = teamColor(p.team);
  let s = "", y = fr.top + 10;
  const lanes = LANES.map(([id, label]) => ({ id, label, me: runs.lanes.find((l) => l.lane === id), avg: runs.avg.lanes.find((l) => l.lane === id) }));
  const cw = (w - pad * 2) / lanes.length;
  const maxShare = Math.max(...lanes.map((l) => Math.max((l.me?.carries ?? 0) / runs.carries, (l.avg?.carries ?? 0) / runs.avg.carries)));
  const barTop = y + 40, barBottom = y + 500;
  const h = lin(0, maxShare, 0, barBottom - barTop);
  s += T(pad, y + 4, "Share of carries by gap", { size: 24, weight: 750 });
  lanes.forEach((l, i) => {
    const cx = pad + cw * i + cw / 2;
    const share = (l.me?.carries ?? 0) / runs.carries, avgShare = (l.avg?.carries ?? 0) / runs.avg.carries;
    s += R(cx - cw * 0.3, barBottom - h(share), cw * 0.6, h(share), { rx: 8, fill: color, opacity: 0.88 });
    s += L(cx - cw * 0.38, barBottom - h(avgShare), cx + cw * 0.38, barBottom - h(avgShare), { stroke: "var(--fg)", sw: 4, cap: "round" });
    s += T(cx, barBottom - Math.max(h(share), h(avgShare)) - 14, pct(share), { size: 22, weight: 800, anchor: "middle", mono: true });
    s += T(cx, barBottom + 34, l.label.split(" ")[0], { size: 17, weight: 700, anchor: "middle", fill: "var(--muted)" });
    s += T(cx, barBottom + 56, l.label.split(" ")[1] || "", { size: 17, weight: 700, anchor: "middle", fill: "var(--muted)" });
    const ypc = l.me && l.me.carries ? l.me.yards / l.me.carries : null;
    s += T(cx, barBottom + 98, ypc == null ? "-" : n1(ypc), { size: 24, weight: 800, anchor: "middle", mono: true });
    s += T(cx, barBottom + 122, `${l.me?.carries ?? 0} car`, { size: 15, anchor: "middle", fill: "var(--faint)" });
  });
  s += T(pad, barBottom + 98, "YPC", { size: 15, weight: 750, fill: "var(--faint)" });
  y = barBottom + 180;
  s += T(pad, y, "How each carry ended", { size: 24, weight: 750 });
  y += 24;
  const kinds = [["stuffed", "Stuffed (0 or less)", "var(--neg)"], ["short", "1-3 yards", "var(--warn)"], ["medium", "4-9 yards", "var(--series-1)"], ["explosive", "10+ yards", "var(--pos)"]];
  const rowsO = [["him", lastName(p.name), runs.outcomes, runs.carries], ["avg", "RB average", runs.avg.outcomes, runs.avg.carries]];
  const bx0 = pad + 200, bx1 = w - pad;
  rowsO.forEach(([, label, o, total], r) => {
    const ry = y + r * 90;
    s += T(pad, ry + 44, label, { size: 21, weight: 700, fill: r ? "var(--muted)" : "var(--fg)" });
    let at = bx0;
    kinds.forEach(([k, , c]) => {
      const share = (o[k] ?? 0) / total, ww = (bx1 - bx0) * share;
      s += R(at + 2, ry + 10, Math.max(0, ww - 4), 54, { rx: 10, fill: mix(c, r ? 34 : 70, "var(--card)") });
      if (ww > 60) s += T(at + ww / 2, ry + 45, pct(share), { size: 19, weight: 800, anchor: "middle", mono: true });
      at += ww;
    });
  });
  y += 2 * 90 + 20;
  s += legendRow(bx0, y, kinds.map(([, label, c]) => [(cx, cy) => R(cx - 9, cy - 9, 18, 18, { rx: 4, fill: mix(c, 70, "var(--card)") }), label]), 18).svg;
  const sm = [["Carries", n0(runs.carries)], ["Yards per carry", n1(runs.carries ? (p.season.rushing_yards || 0) / Math.max(1, p.season.carries) : null)], ["Rushing TDs", n0(p.season.rushing_tds)], ["Carry share", pct(p.season.rush_attempt_share)]];
  const tw = (w - pad * 2 - 3 * 14) / 4, ty = fr.bottom - 140;
  sm.forEach(([k, v], i) => {
    const tx = pad + i * (tw + 14);
    s += R(tx, ty, tw, 130, { rx: 20, fill: "var(--panel)" });
    s += T(tx + tw / 2, ty + 38, k.toUpperCase(), { size: 14, weight: 750, anchor: "middle", fill: "var(--faint)", ls: 1.1 });
    s += T(tx + tw / 2, ty + 96, v, { size: 40, weight: 800, anchor: "middle", mono: true });
  });
  return wrapCard(fr, s);
}

// D6 ------------------------------------------------------------ Head to head
/** The default opponent: the next player at his position by total points. */
function defaultRival(pid) {
  const p = DATA.players[pid];
  const same = Object.values(DATA.players).filter((o) => o.pos === p.pos).sort((a, b) => b.season.fantasy_points - a.season.fantasy_points);
  const i = same.findIndex((o) => o.id === pid);
  return (same[i + 1] ?? same[i - 1])?.id;
}
function cardH2H(pid, opts = {}, mode = "fantasy") {
  const a = DATA.players[pid];
  const b = DATA.players[opts.vs] && DATA.players[opts.vs].pos === a.pos ? DATA.players[opts.vs] : DATA.players[defaultRival(pid)];
  const M = CARD_MODES[mode];
  const skip = opts.skip || [];
  const list = (opts.list ?? M.list[a.pos]).filter((id) => !skip.includes(id));
  const tiles = M.tiles[a.pos].flatMap(([, cells]) => cells).filter(([, id]) => !skip.includes(id));
  const rowH = 48, top = 380;
  const h = Math.max(1500, top + (tiles.length + list.length) * rowH + 70 + 120);
  const fr = frame(1200, h, { noHeader: true });
  const { pad, w } = fr;
  const ca = opts.colors?.[a.team] ?? teamColor(a.team), cb = opts.colors?.[b.team] ?? teamColor(b.team);
  let s = mark(w / 2 - 23 * MARK_ASPECT, pad - 6, 46);
  s += T(w / 2, 136, (opts.kicker ?? `Head to head · ${DATA.season} through Week ${thru(a.team, b.team)}${M.tag}`).toUpperCase(), { size: 17, weight: 750, anchor: "middle", fill: "var(--accent-text)", ls: 1.8 });
  [[a, ca, true], [b, cb, false]].forEach(([p, color, left]) => {
    const cx = left ? pad + 96 : w - pad - 96;
    s += face(p.id, cx, 250, 86, color, p.name);
    const tx = left ? pad + 206 : w - pad - 206;
    const nm = fitSize(p.name, 330, [34, 30, 27], 800);
    s += T(tx, 238, nm.text, { size: nm.size, weight: 800, anchor: left ? "start" : "end" });
    s += T(tx, 274, `${p.pos} · ${TEAMS[p.team]?.name || p.team}`, { size: 19, anchor: left ? "start" : "end", fill: "var(--muted)" });
    s += T(tx, 302, `${p.season.games_played} games`, { size: 17, anchor: left ? "start" : "end", fill: "var(--faint)" });
  });
  s += T(w / 2, 262, "vs", { size: 26, weight: 700, anchor: "middle", fill: "var(--faint)" });
  const mid = w / 2, labelW = 300, barMax = 210;
  const lv = mid - labelW / 2 - barMax - 16, rv = mid + labelW / 2 + barMax + 16;
  let y = top;
  const row = (i, label, va, vb, better, extra) => {
    const cy = y + i * rowH + rowH / 2;
    if (i % 2 === 0) s += R(pad - 10, cy - rowH / 2 + 3, w - pad * 2 + 20, rowH - 6, { rx: 12, fill: "var(--panel)" });
    const lb = fitSize(label, labelW - 10, [19, 17, 15], 600);
    s += T(mid, cy + 6, lb.text, { size: lb.size, weight: 600, anchor: "middle", fill: "var(--muted)" });
    // The better number is bold and bright, the other muted: a team colour would read as good or bad.
    s += T(pad + 6, cy + 8, va, { size: 21, weight: better === "a" ? 800 : 500, mono: true, fill: better === "b" ? "var(--muted)" : "var(--fg)" });
    s += T(w - pad - 6, cy + 8, vb, { size: 21, weight: better === "b" ? 800 : 500, anchor: "end", mono: true, fill: better === "a" ? "var(--muted)" : "var(--fg)" });
    if (extra) s += extra(cy);
  };
  // The headline numbers, each side's rank beside it.
  tiles.forEach(([label, id, f, full], i) => {
    const va = a.season[id], vb = b.season[id], ra = a.ranks[id], rb = b.ranks[id];
    const better = ra != null && rb != null && ra !== rb ? (ra < rb ? "a" : "b") : null;
    const group = M.tiles[a.pos].find(([, cells]) => cells.some((c) => c[1] === id))[0];
    const name = full ?? { fantasy_ppg: "Points per game", fantasy_points: "Total points", receptions: "Receptions", interceptions: "Interceptions" }[id]
      ?? `${group} ${label === "TDs" ? "TDs" : label.toLowerCase()}`;
    row(i, name, va == null ? "-" : f(va), vb == null ? "-" : f(vb), better, (cy) =>
      chip(ra, a.pos, mid - labelW / 2 - 50, cy, { size: 15, h: 26, w: 60 }) + chip(rb, b.pos, mid + labelW / 2 + 50, cy, { size: 15, h: 26, w: 60 }));
  });
  y += tiles.length * rowH + 24;
  s += T(mid, y + 4, `PERCENTILE AMONG ${POS_NAME[a.pos].toUpperCase()}`, { size: 15, weight: 750, anchor: "middle", fill: "var(--faint)", ls: 1.6 });
  y += 14;
  list.forEach((id, i) => {
    const [label, f] = STAT[id];
    const pa = a.pct[id], pb = b.pct[id];
    const better = pa != null && pb != null && pa !== pb ? (pa > pb ? "a" : "b") : null;
    row(i, STAT_LABEL[a.pos]?.[id] ?? label, a.season[id] == null ? "-" : f(a.season[id]), b.season[id] == null ? "-" : f(b.season[id]), better, (cy) => {
      let out = "";
      for (const [pc, dir, color] of [[pa, -1, ca], [pb, 1, cb]]) {
        if (pc == null) continue;
        const x0 = mid + dir * (labelW / 2), x1 = x0 + dir * barMax * (pc / 100);
        out += L(x0, cy, x0 + dir * barMax, cy, { stroke: "var(--rule)", sw: 7, cap: "round" });
        out += L(x0, cy, x1, cy, { stroke: pctColor(pc), sw: 7, cap: "round" });
        out += C(x1, cy, 16, { fill: mix(pctColor(pc), 30, "var(--card)"), stroke: pctColor(pc), sw: 2.5 }) + T(x1, cy + 6, pc, { size: 15, weight: 800, anchor: "middle", mono: true });
      }
      return out;
    });
  });
  return wrapCard(fr, s);
}

// D7 ------------------------------------------------------ Points by source
// PPR, as the site prices it: 0.04 a passing yard, 4 a passing TD, 0.1 a rushing or
// receiving yard, 6 a rushing or receiving TD, 1 a catch, -2 an interception or lost fumble.
const SOURCES = [["yards", "Yards", "var(--series-1)"], ["catches", "Catches", "var(--series-3)"], ["tds", "Touchdowns", "var(--series-4)"]];
function pointSources(g) {
  const yards = (g.passing_yards || 0) * 0.04 + (g.rushing_yards || 0) * 0.1 + (g.receiving_yards || 0) * 0.1;
  const catches = g.receptions || 0;
  const turnovers = -2 * ((g.interceptions || 0) + (g.fumbles_lost || 0));
  // Whatever the components miss (two-point conversions) belongs with the scoring plays.
  const tds = (g.fantasy_points ?? 0) - yards - catches - turnovers;
  return { yards, catches, tds, turnovers };
}
function cardSources(pid) {
  const p = DATA.players[pid];
  const fr = frame(1600, 900, { kicker: `${DATA.season} · PPR`, title: `${p.name}: where the points come from`, subtitle: "Each week's points by source. Line: expected points.", headshot: { pid: p.id, name: p.name, ring: teamColor(p.team) } });
  const { pad, w } = fr;
  const slots = weekSlots(p);
  const panelW = 330;
  const px0 = pad + 56, px1 = w - pad - panelW - 40, py0 = fr.top + 30, py1 = fr.bottom - 90;
  const parts = slots.map((sl) => (sl.log ? pointSources(sl.log) : null));
  const hi = Math.max(20, ...slots.map((sl, i) => (sl.log ? Math.max(sl.log.fantasy_points, sl.log.expected_fantasy_points ?? 0, parts[i].yards + parts[i].catches + Math.max(0, parts[i].tds)) : 0)));
  const lo = Math.min(0, ...parts.filter(Boolean).map((pt) => pt.turnovers + Math.min(0, pt.tds)));
  const max = Math.ceil(hi / 10) * 10, min = Math.floor(lo / 5) * 5;
  const y = lin(min, max, py1, py0);
  const slotW = (px1 - px0) / slots.length;
  let s = legendRow(px0, fr.top + 2, [...SOURCES.map(([, label, color]) => [(cx, cy) => R(cx - 9, cy - 9, 18, 18, { rx: 4, fill: color }), label]),
    [(cx, cy) => R(cx - 9, cy - 9, 18, 18, { rx: 4, fill: "var(--neg)" }), "Turnovers"]], 18).svg;
  for (let v = min; v <= max; v += v < 0 ? 5 : 10) s += L(px0, y(v), px1, y(v), { stroke: v === 0 ? "var(--plot-rule)" : "var(--divider)", sw: v === 0 ? 1.5 : 1 }) + T(px0 - 12, y(v) + 6, v, { size: 17, anchor: "end", mono: true, fill: "var(--faint)" });
  slots.forEach((sl, i) => {
    const cx = px0 + slotW * i + slotW / 2, bw = Math.min(96, slotW * 0.56);
    s += T(cx, py1 + 30, `W${sl.week}`, { size: 18, weight: 750, anchor: "middle", fill: "var(--faint)" });
    if (!sl.log) { s += T(cx, y(0) - 14, sl.bye ? "BYE" : "DNP", { size: 17, weight: 750, anchor: "middle", fill: "var(--faint)" }); return; }
    s += T(cx, py1 + 56, `${homeAway(sl.log)} ${sl.log.opponent_abbreviation}`, { size: 16, anchor: "middle", fill: "var(--muted)" });
    let at = 0;
    for (const [key, , color] of SOURCES) {
      const v = Math.max(0, parts[i][key]);
      if (v > 0.05) s += R(cx - bw / 2, y(at + v), bw, y(at) - y(at + v), { fill: color, opacity: 0.92 });
      at += v;
    }
    const neg = parts[i].turnovers + Math.min(0, parts[i].tds);
    if (neg < -0.05) s += R(cx - bw / 2, y(0), bw, y(neg) - y(0), { fill: "var(--neg)", opacity: 0.85 });
    if (sl.log.expected_fantasy_points != null) s += L(cx - bw / 2 - 12, y(sl.log.expected_fantasy_points), cx + bw / 2 + 12, y(sl.log.expected_fantasy_points), { stroke: "var(--fg)", sw: 4, cap: "round" });
    s += T(cx, Math.min(y(at), sl.log.expected_fantasy_points != null ? y(sl.log.expected_fantasy_points) : 1e9) - 12, num(sl.log.fantasy_points), { size: 20, weight: 800, anchor: "middle", mono: true });
  });
  // Side panel: the season's points by source.
  const sx = w - pad - panelW;
  s += R(sx, fr.top - 10, panelW, fr.bottom - fr.top + 10, { rx: 24, fill: "var(--panel)" });
  const total = parts.filter(Boolean).reduce((acc, pt) => ({ yards: acc.yards + pt.yards, catches: acc.catches + pt.catches, tds: acc.tds + pt.tds, turnovers: acc.turnovers + pt.turnovers }), { yards: 0, catches: 0, tds: 0, turnovers: 0 });
  const sum = (p.season.fantasy_points ?? 0) || 1;
  s += T(sx + 28, fr.top + 30, "SEASON", { size: 14, weight: 750, fill: "var(--faint)", ls: 1.2 });
  s += T(sx + 28, fr.top + 78, num(p.season.fantasy_points), { size: 44, weight: 800, mono: true }) + T(sx + 28 + textWidth(num(p.season.fantasy_points), 44, 800, true) + 12, fr.top + 76, "points", { size: 18, fill: "var(--muted)" });
  [...SOURCES, ["turnovers", "Turnovers", "var(--neg)"]].forEach(([key, label, color], k) => {
    const ry = fr.top + 130 + k * 92;
    const v = total[key];
    s += R(sx + 28, ry - 16, 16, 16, { rx: 4, fill: color }) + T(sx + 54, ry, label, { size: 19, weight: 650 });
    s += T(sx + panelW - 28, ry, num(v), { size: 22, weight: 800, anchor: "end", mono: true });
    const share = Math.max(0, v / sum);
    s += R(sx + 28, ry + 18, panelW - 56, 10, { rx: 5, fill: "var(--rule)" }) + R(sx + 28, ry + 18, (panelW - 56) * Math.min(1, share), 10, { rx: 5, fill: color });
    if (key !== "turnovers") s += T(sx + 28, ry + 50, `${pct(share)} of his points`, { size: 16, fill: "var(--muted)" });
  });
  return wrapCard(fr, s);
}

// D8, D9 -------------------------------------------------- The real-life versions
const cardProfileNfl = (pid, opts) => cardProfile(pid, opts, "nfl");
const cardH2HNfl = (pid, opts) => cardH2H(pid, opts, "nfl");
/** Each week as a small bar of yards, the number over it, the opponent and his line under it. */
function gameStrip(p, slots, x0, y, cw, h) {
  const pad = x0 - 190;
  let s = T(pad, y + 28, "Game by game", { size: 22, weight: 750 });
  s += T(pad, y + 54, p.pos === "QB" ? "Passing yards" : p.pos === "RB" ? "Scrimmage yards" : "Receiving yards", { size: 16, fill: "var(--muted)" });
  const color = teamColor(p.team);
  const max = Math.max(1, ...slots.map((sl) => (sl.log ? gameNumbers(p.pos, sl.log).value : 0)));
  const base = y + h - 50, top = y + 36;
  slots.forEach((sl, i) => {
    const cx = x0 + cw * i + cw / 2;
    s += T(cx, y + 14, `W${sl.week}`, { size: 15, weight: 700, anchor: "middle", fill: "var(--faint)" });
    if (!sl.log) { s += T(cx, base - 6, sl.bye ? "BYE" : "DNP", { size: 15, weight: 700, anchor: "middle", fill: "var(--faint)" }); return; }
    const gn = gameNumbers(p.pos, sl.log);
    const bh = (base - top - 22) * (gn.value / max), bw = Math.min(54, cw - 22);
    if (gn.parts) {
      const rush = (base - top - 22) * (gn.parts[0] / max);
      s += R(cx - bw / 2, base - rush, bw, rush, { rx: 4, fill: color }) + R(cx - bw / 2, base - bh, bw, bh - rush, { rx: 4, fill: mix(color, 45, "var(--card)") });
    } else s += R(cx - bw / 2, base - bh, bw, bh, { rx: 5, fill: color, opacity: 0.9 });
    s += T(cx, base - bh - 8, gn.value, { size: 18, weight: 800, anchor: "middle", mono: true });
    const tds = gameTds(sl.log);
    s += T(cx, base + 22, `${homeAway(sl.log)} ${sl.log.opponent_abbreviation}`, { size: 14, weight: 650, anchor: "middle", fill: "var(--muted)" });
    const words = p.pos === "QB" ? gn.line : `${gn.short ?? gn.line}${tds ? `, ${tds} TD` : ""}`;
    s += T(cx, base + 42, fit(words, cw - 8, 13, 500, true), { size: 13, anchor: "middle", mono: true, fill: tds ? "var(--accent-text)" : "var(--faint)" });
  });
  return s;
}

// D10 ------------------------------------------------------------ Game by game
function cardGameLogNfl(pid) {
  const p = DATA.players[pid];
  const pos = p.pos;
  const fr = frame(1600, 900, { kicker: `${DATA.season} · ${pos} · ${TEAMS[p.team]?.name || p.team}`, title: `${p.name}: game by game`,
    subtitle: pos === "QB" ? "Passing yards each game, with touchdowns and interceptions" : pos === "RB" ? "Rushing and receiving yards each game, with touchdowns" : "Receiving yards each game, with catches, targets and touchdowns",
    headshot: { pid: p.id, name: p.name, ring: teamColor(p.team) } });
  const { pad, w } = fr;
  const slots = weekSlots(p);
  const panelW = 330;
  const px0 = pad + 56, px1 = w - pad - panelW - 40, py0 = fr.top + 34, py1 = fr.bottom - 120;
  const color = teamColor(p.team);
  const vals = slots.map((sl) => (sl.log ? gameNumbers(pos, sl.log) : null));
  const top = Math.max(20, ...vals.filter(Boolean).map((v) => v.value));
  const step = niceStep(0, top, 5), ymax = Math.ceil(top / step) * step;
  const y = lin(0, ymax, py1, py0);
  const slotW = (px1 - px0) / slots.length;
  let s = "";
  if (pos === "RB") s += legendRow(px0, fr.top + 2, [[(cx, cy) => R(cx - 9, cy - 9, 18, 18, { rx: 4, fill: color }), "Rushing"], [(cx, cy) => R(cx - 9, cy - 9, 18, 18, { rx: 4, fill: mix(color, 45, "var(--card)") }), "Receiving"]], 18).svg;
  for (let v = 0; v <= ymax; v += step) s += L(px0, y(v), px1, y(v), { stroke: v ? "var(--divider)" : "var(--plot-rule)", sw: v ? 1 : 1.5 }) + T(px0 - 12, y(v) + 6, v, { size: 17, anchor: "end", mono: true, fill: "var(--faint)" });
  const played = vals.filter(Boolean);
  const avg = played.reduce((a, v) => a + v.value, 0) / Math.max(1, played.length);
  s += L(px0, y(avg), px1, y(avg), { stroke: "var(--muted)", dash: "8 7", sw: 1.6 }) + T(px1 + 10, y(avg) - 4, "Avg", { size: 15, weight: 700, fill: "var(--muted)" }) + T(px1 + 10, y(avg) + 16, num(avg, 0), { size: 16, weight: 800, mono: true, fill: "var(--muted)" });
  slots.forEach((sl, i) => {
    const cx = px0 + slotW * i + slotW / 2, bw = Math.min(100, slotW * 0.56);
    s += T(cx, py1 + 30, `W${sl.week}`, { size: 18, weight: 750, anchor: "middle", fill: "var(--faint)" });
    if (!sl.log) { s += T(cx, py1 - 14, sl.bye ? "BYE" : "DNP", { size: 17, weight: 750, anchor: "middle", fill: "var(--faint)" }); return; }
    const g = sl.log, gn = vals[i];
    if (gn.parts) s += R(cx - bw / 2, y(gn.parts[0]), bw, py1 - y(gn.parts[0]), { rx: 6, fill: color }) + R(cx - bw / 2, y(gn.value), bw, y(gn.parts[0]) - y(gn.value), { rx: 6, fill: mix(color, 45, "var(--card)") });
    else s += R(cx - bw / 2, y(gn.value), bw, py1 - y(gn.value), { rx: 8, fill: color, opacity: 0.9 });
    s += T(cx, y(gn.value) - 12, gn.value, { size: 22, weight: 800, anchor: "middle", mono: true });
    const tds = gameTds(g);
    if (tds) s += pill(`${tds} TD`, cx, y(gn.value) - 48, { size: 14, tone: "var(--pos)", anchor: "middle" }).svg;
    const res = DATA.results[g.team_abbreviation]?.[sl.week];
    s += T(cx, py1 + 56, `${homeAway(g)} ${g.opponent_abbreviation}`, { size: 17, weight: 650, anchor: "middle", fill: "var(--muted)" });
    if (res) s += T(cx, py1 + 78, `${res[2] > res[3] ? "W" : res[2] < res[3] ? "L" : "T"} ${res[2]}-${res[3]}`, { size: 15, weight: 700, anchor: "middle", mono: true, fill: res[2] > res[3] ? mix("var(--pos)", 72, "var(--fg)") : res[2] < res[3] ? mix("var(--neg)", 72, "var(--fg)") : "var(--muted)" });
    s += T(cx, py1 + 100, fit(pos === "QB" ? `${g.completions}/${g.attempts}, ${g.interceptions} INT` : gn.line, slotW - 6, 15), { size: 15, anchor: "middle", mono: true, fill: "var(--faint)" });
  });
  // Side panel: the season line with ranks among the position.
  const sx = w - pad - panelW;
  s += R(sx, fr.top - 10, panelW, fr.bottom - fr.top + 10, { rx: 24, fill: "var(--panel)" });
  s += T(sx + 28, fr.top + 26, `SEASON · ${p.season.games_played} GAMES`, { size: 14, weight: 750, fill: "var(--faint)", ls: 1.2 });
  const cells = NFL_TILES[pos].flatMap(([, c]) => c).slice(0, 7);
  const rowH = Math.min(92, (fr.bottom - fr.top - 50) / cells.length);
  cells.forEach(([, id, f, full], k) => {
    const ry = fr.top + 50 + k * rowH;
    s += T(sx + 28, ry + 20, full.toUpperCase(), { size: 13, weight: 750, fill: "var(--faint)", ls: 1.1 });
    s += T(sx + 28, ry + 56, p.season[id] == null ? "-" : f(p.season[id]), { size: 30, weight: 800, mono: true });
    if (p.ranks[id]) s += chip(p.ranks[id], pos, sx + panelW - 56, ry + 46, { size: 15, h: 28 });
  });
  return wrapCard(fr, s);
}
