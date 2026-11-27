// The Highlighted Viz options (November 2026) as cards: every touchdown on a field (A13 a
// game, C14 the week, E5 a team's season), the start map (C15) and the rank race (C16).
// Mockups: https://claude.ai/artifact/JwXNiAPFvEZK37dUiuG4gY

// ------------------------------------------------------------- touchdowns
// DATA.touchdowns is one array per play under DATA.td_keys (build_data.py), from the
// API's /explore/touchdowns: offensive touchdowns only, with the yard line the play
// started on, who scored, and for a pass who threw it and how far it travelled.
const TD = DATA.touchdowns.map((row) => Object.fromEntries(DATA.td_keys.map((key, i) => [key, row[i]])));
const tdName = (pid) => DATA.td_people[pid]?.n ?? DATA.players[pid]?.name ?? "Unknown";
const TD_PASS = "var(--series-1)", TD_RUSH = "var(--series-2)";
const TURF = mix("#1d7a4c", 13, "var(--card)"), TURF_EZ = mix("#1d7a4c", 25, "var(--card)");
const TURF_LINE = mix("var(--fg)", 11), TURF_NUM = mix("var(--fg)", 24);
const tdKind = (t) => (t.kind === "pass" ? TD_PASS : TD_RUSH);
const gameTeams = (gameId) => gameId.split("_").slice(2);

function tdTip(t) {
  const who = t.kind === "pass" ? `${shortName(tdName(t.passer_id))} to ${shortName(tdName(t.scorer_id))}` : `${tdName(t.scorer_id)} run`;
  const [away, home] = gameTeams(t.game_id);
  const how = t.kind === "pass" && t.air_yards != null ? [`${t.air_yards} yds in the air, ${t.yards_after_catch ?? 0} after the catch`]
    : t.kind === "rush" && t.gap ? [t.gap[0].toUpperCase() + t.gap.slice(1)] : [];
  return [`${who}, ${t.from} yds`, `${t.team} · ${away} at ${home} · Week ${t.week}`, `${t.quarter > 4 ? "OT" : `Q${t.quarter}`} ${t.clock}`, ...how].join("|");
}

/**
 * Every touchdown as an arc from the yard line the play started on to the goal line, passes
 * above the field's middle and runs below, on a field running left to right. `box` is the
 * field's rectangle; `color(t)` colours an arc; `faces` are the touchdowns that get a face at
 * the top of their arc, `label(t)` the line under it.
 */
function tdField(box, tds, { color = tdKind, faces = [], label = null, r = 22 } = {}) {
  const maxFrom = Math.max(10, ...tds.map((t) => t.from ?? 0));
  const far = Math.max(25, Math.ceil((maxFrom + 4) / 5) * 5);
  const x = lin(far, -10, box.x0, box.x1);
  const mid = (box.y0 + box.y1) / 2;
  let s = R(box.x0, box.y0, x(0) - box.x0, box.y1 - box.y0, { rx: 16, fill: TURF });
  s += R(x(0), box.y0, box.x1 - x(0), box.y1 - box.y0, { rx: 16, fill: TURF_EZ }) + R(x(0), box.y0, 18, box.y1 - box.y0, { fill: TURF_EZ });
  for (let v = far; v > 0; v -= 5) s += L(x(v), box.y0, x(v), box.y1, { stroke: TURF_LINE, sw: v % 10 ? 1.2 : 2.2 });
  s += L(box.x0, mid, x(0), mid, { stroke: TURF_NUM, sw: 1.5 }) + L(x(0), box.y0, x(0), box.y1, { stroke: TURF_NUM, sw: 5 });
  for (let v = 10; v <= far; v += 10) {
    for (const yy of [box.y0 + 32, box.y1 - 14]) s += T(x(v), yy, v <= 50 ? v : 100 - v, { size: 24, weight: 800, anchor: "middle", mono: true, fill: TURF_NUM });
  }
  s += `<text transform="translate(${num(x(-5), 1)},${num(mid, 1)}) rotate(90)" text-anchor="middle" dy="8" font-size="20" font-weight="800" letter-spacing="9" font-family="${MONO}" fill="${TURF_NUM}">END ZONE</text>`;
  s += T(box.x0 + 18, mid - 14, "PASSES", { size: 15, weight: 800, ls: 1.6, fill: mix(TD_PASS, 70, "var(--fg)") });
  s += T(box.x0 + 18, mid + 28, "RUNS", { size: 15, weight: 800, ls: 1.6, fill: mix(TD_RUSH, 70, "var(--fg)") });
  const room = (box.y1 - box.y0) / 2 - 50;
  const want = new Set(faces);
  const tops = [];
  let hits = "";
  for (const t of [...tds].sort((a, b) => b.from - a.from)) {
    const sign = t.kind === "pass" ? -1 : 1;
    const x0 = x(t.from), x1 = x(0);
    const jitter = 0.9 + ((t.play_id * 37) % 100) / 1000;
    const h = Math.max(9, room * (t.from / maxFrom) * jitter);
    const c = mid + (4 / 3) * h * sign;
    const d = `M${num(x0, 1)},${num(mid, 1)} C${num(x0, 1)},${num(c, 1)} ${num(x1, 1)},${num(c, 1)} ${num(x1, 1)},${num(mid, 1)}`;
    const col = color(t);
    s += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${t.from >= 20 ? 4.5 : 3.2}" stroke-linecap="round" opacity="0.92"/>`;
    s += C(x0, mid, 5.5, { fill: col, stroke: "var(--card)", sw: 2 });
    hits += `<path class="hit" d="${d}" fill="none" stroke="transparent" stroke-width="16" data-tip="${esc(tdTip(t))}"/>`;
    if (want.has(t)) tops.push({ t, sign, ax: (x0 + x1) / 2, ay: mid + sign * h * 1.0, col });
  }
  relax(tops, { r: r + 8, bounds: { x0: box.x0 + r + 4, x1: x(0) - r - 4, y0: box.y0 + r + 6, y1: box.y1 - r - 6 }, iterations: 160 });
  // Names go on the first side of the face that hits neither another face nor a name.
  const taken = tops.map((it) => [it.x - r - 3, it.y - r - 3, it.x + r + 3, it.y + r + 3]);
  const clear = ([a, b, c, d]) => a >= box.x0 && c <= box.x1 && b >= box.y0 - 30 && d <= box.y1 && !taken.some(([e, f, g, h]) => a < g && c > e && b < h && d > f);
  let names = "";
  for (const it of tops) {
    if (Math.hypot(it.x - it.ax, it.y - it.ay) > 6) s += L(it.ax, it.ay, it.x, it.y, { stroke: it.col, sw: 2 });
    s += face(it.t.scorer_id, it.x, it.y, r, it.col, tdName(it.t.scorer_id));
    hits += `<circle class="hit" cx="${num(it.x, 1)}" cy="${num(it.y, 1)}" r="${r + 3}" fill="transparent" data-tip="${esc(tdTip(it.t))}"/>`;
  }
  for (const it of tops) {
    const text = label ? label(it.t) : null;
    if (!text) continue;
    const tw = textWidth(text, 15, 700) + 12, th = 21;
    const vertical = it.sign < 0 ? [it.y - r - th - 5, it.y + r + 5] : [it.y + r + 5, it.y - r - th - 5];
    const spots = [[it.x - tw / 2, vertical[0]], [it.x - r - 6 - tw, it.y - th / 2], [it.x + r + 6, it.y - th / 2], [it.x - tw / 2, vertical[1]]];
    const spot = spots.find(([lx, ly]) => clear([lx, ly, lx + tw, ly + th]));
    if (!spot) continue;
    taken.push([spot[0], spot[1], spot[0] + tw, spot[1] + th]);
    names += R(spot[0], spot[1], tw, th, { rx: 6, fill: "var(--card)", opacity: 0.9 }) + T(spot[0] + tw / 2, spot[1] + 16, text, { size: 15, weight: 700, anchor: "middle" });
  }
  return s + names + hits;
}
const tdLegend = (x, y) => legendRow(x, y, [
  [(cx, cy) => L(cx - 10, cy, cx + 10, cy, { stroke: TD_PASS, sw: 4, cap: "round" }), "Pass, above the line"],
  [(cx, cy) => L(cx - 10, cy, cx + 10, cy, { stroke: TD_RUSH, sw: 4, cap: "round" }), "Run, below it"],
  [(cx, cy) => C(cx, cy, 6, { fill: "var(--muted)" }), "Where the play started"],
], 18).svg;

// A13 ----------------------------------------------------- A game's touchdowns
function cardTdGame(g) {
  const h = g.header, away = h.away.abbreviation, home = h.home.abbreviation;
  const tds = TD.filter((t) => t.game_id === g.id);
  const cols = gameColors(away, home);
  const fr = frame(1600, 900, {
    kicker: `Week ${h.week} · every touchdown`, title: `${nickname(away)} at ${nickname(home)}`,
    subtitle: `${tds.length} offensive touchdown${tds.length === 1 ? "" : "s"}.`,
  });
  const { pad, w } = fr;
  const side = 270;
  const box = { x0: pad, x1: w - pad - side - 24, y0: fr.top + 4, y1: fr.bottom - 44 };
  let s = tds.length ? tdField(box, tds, { color: (t) => cols[t.team], faces: tds, label: (t) => `${lastName(tdName(t.scorer_id))} ${t.from}`, r: 21 })
    : T((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, "No offensive touchdowns", { size: 26, anchor: "middle", fill: "var(--muted)" });
  s += legendRow(box.x0, fr.bottom - 12, [
    ...[away, home].map((t) => [(cx, cy) => L(cx - 10, cy, cx + 10, cy, { stroke: cols[t], sw: 5, cap: "round" }), nickname(t)]),
    [(cx, cy) => L(cx - 10, cy, cx + 10, cy, { stroke: "var(--muted)", sw: 2 }), "Passes above the line, runs below"],
  ], 18).svg;
  // Every touchdown in game order.
  const lx = w - pad - side;
  s += T(lx, box.y0 + 14, "ALL TOUCHDOWNS", { size: 15, weight: 800, fill: "var(--faint)", ls: 1.6 });
  const rows = [...tds].sort((a, b) => a.quarter - b.quarter || b.clock.localeCompare(a.clock));
  const rowH = Math.min(54, (box.y1 - box.y0 - 36) / Math.max(1, rows.length));
  rows.slice(0, 14).forEach((t, i) => {
    const y = box.y0 + 38 + i * rowH;
    s += logo(t.team, lx, y + 2, 26);
    s += T(lx + 36, y + 12, `${t.quarter > 4 ? "OT" : `Q${t.quarter}`} ${t.clock}`, { size: 13, weight: 650, mono: true, fill: "var(--faint)" });
    const what = t.kind === "pass" ? `${lastName(tdName(t.scorer_id))}, ${t.from}-yd catch` : `${lastName(tdName(t.scorer_id))}, ${t.from}-yd run`;
    s += T(lx + 36, y + 31, fit(what, side - 38, 17, 700), { size: 17, weight: 700 });
  });
  return wrapCard(fr, s);
}

// C14 ------------------------------------------------------- The week's touchdowns
function cardTdWeek() {
  const wk = DATA.recap_week;
  const tds = TD.filter((t) => t.week === wk);
  const n = tds.length, passes = tds.filter((t) => t.kind === "pass").length;
  const close = tds.filter((t) => t.from <= 10).length;
  const longest = [...tds].sort((a, b) => b.from - a.from)[0];
  const fr = frame(1600, 900, {
    kicker: `Week ${wk}`, title: `All ${n} Week ${wk} touchdowns`,
    subtitle: `${passes} passing, ${n - passes} rushing, each from the yard line the play started on. The longest: ${longest ? `${tdName(longest.scorer_id)}, ${longest.from} yds` : "none"}.`,
  });
  const { pad, w } = fr;
  const side = 240;
  const box = { x0: pad, x1: w - pad - side - 30, y0: fr.top + 4, y1: fr.bottom - 44 };
  // Faces on the eight longest from 30+, names on the four longest; hover names the rest.
  const long = [...tds].filter((t) => t.from >= 30).sort((a, b) => b.from - a.from).slice(0, 8);
  const named = new Set(long.slice(0, 4));
  let s = tdField(box, tds, { faces: long, label: (t) => (named.has(t) ? `${lastName(tdName(t.scorer_id))} ${t.from}` : null), r: 20 });
  s += tdLegend(box.x0, fr.bottom - 12);
  const lx = w - pad - side;
  s += T(lx, box.y0 + 14, "FROM INSIDE THE 10", { size: 15, weight: 800, fill: "var(--faint)", ls: 1.6 });
  s += T(lx, box.y0 + 76, close, { size: 64, weight: 800, mono: true }) + T(lx + textWidth(close, 64, 800, true) + 12, box.y0 + 76, `of ${n}`, { size: 24, weight: 650, fill: "var(--muted)" });
  const bins = [["Inside the 5", (t) => t.from <= 5], ["6 to 10", (t) => t.from > 5 && t.from <= 10], ["11 to 19", (t) => t.from > 10 && t.from < 20], ["20 or more", (t) => t.from >= 20]];
  const most = Math.max(1, ...bins.map(([, f]) => tds.filter(f).length));
  bins.forEach(([label, f], i) => {
    const y = box.y0 + 120 + i * 36, c = tds.filter(f).length;
    s += T(lx, y + 6, label, { size: 17, fill: "var(--muted)" });
    s += R(lx + 108, y - 7, 96, 14, { rx: 4, fill: "var(--divider)" }) + R(lx + 108, y - 7, (96 * c) / most, 14, { rx: 4, fill: "var(--accent)" });
    s += T(w - pad, y + 7, c, { size: 18, weight: 800, anchor: "end", mono: true });
  });
  return wrapCard(fr, s);
}

// E5 ------------------------------------------------------- A team's season, by scorer
function cardTdTeam(team) {
  const tds = TD.filter((t) => t.team === team);
  const counts = {};
  for (const t of tds) counts[t.scorer_id] = (counts[t.scorer_id] || 0) + 1;
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1] || tdName(a[0]).localeCompare(tdName(b[0])));
  const named = ranked.slice(0, 5).map(([pid]) => pid);
  const colorOf = (pid) => { const i = named.indexOf(pid); return i < 0 ? "var(--faint)" : `var(--series-${i + 1})`; };
  const n = tds.length, passes = tds.filter((t) => t.kind === "pass").length;
  const weeks = [...new Set(tds.map((t) => t.week))];
  const last = Math.max(DATA.through?.[team] ?? DATA.recap_week, ...weeks);
  const fr = frame(1600, 900, {
    kicker: `${DATA.season} · Weeks 1-${last}`, title: `Every ${nickname(team)} touchdown`,
    subtitle: `${n} offensive touchdowns, ${passes} passing and ${n - passes} rushing, each from the yard line the play started on. Coloured by who scored.`,
  });
  const { pad, w } = fr;
  const side = 360;
  const box = { x0: pad, x1: w - pad - side - 30, y0: fr.top + 4, y1: fr.bottom - 44 };
  const longest = [...tds].sort((a, b) => b.from - a.from).slice(0, 3).filter((t) => t.from >= 15);
  let s = n ? tdField(box, tds, { color: (t) => colorOf(t.scorer_id), faces: longest, label: (t) => `${lastName(tdName(t.scorer_id))} ${t.from}`, r: 20 })
    : T((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, "No offensive touchdowns yet", { size: 26, anchor: "middle", fill: "var(--muted)" });
  s += T(box.x0, fr.bottom - 6, "Passes above the line, runs below. Faces: the longest three.", { size: 17, fill: "var(--muted)" });
  const lx = w - pad - side;
  s += T(lx, box.y0 + 14, "WHO SCORED", { size: 15, weight: 800, fill: "var(--faint)", ls: 1.6 });
  const rowH = 70;
  named.forEach((pid, i) => {
    const y = box.y0 + 60 + i * rowH;
    const mine = tds.filter((t) => t.scorer_id === pid);
    const rec = mine.filter((t) => t.kind === "pass").length;
    s += L(lx, y + 30, lx + 32, y + 30, { stroke: colorOf(pid), sw: 6, cap: "round" });
    s += face(pid, lx + 16, y, 22, colorOf(pid), tdName(pid));
    s += T(lx + 52, y - 2, fit(tdName(pid), side - 120, 20, 750), { size: 20, weight: 750 });
    const split = [rec ? `${rec} receiving` : "", mine.length - rec ? `${mine.length - rec} rushing` : ""].filter(Boolean).join(", ");
    s += T(lx + 52, y + 20, split, { size: 15, weight: 600, fill: "var(--muted)" });
    s += T(w - pad, y + 8, mine.length, { size: 30, weight: 800, anchor: "end", mono: true });
  });
  const rest = ranked.slice(5).reduce((sum, [, c]) => sum + c, 0);
  if (rest) {
    const y = box.y0 + 60 + named.length * rowH;
    s += L(lx, y, lx + 32, y, { stroke: "var(--faint)", sw: 6, cap: "round" });
    s += T(lx + 52, y + 7, `Everyone else (${ranked.length - 5})`, { size: 19, weight: 650, fill: "var(--muted)" }) + T(w - pad, y + 9, rest, { size: 26, weight: 800, anchor: "end", mono: true, fill: "var(--muted)" });
  }
  return wrapCard(fr, s);
}

// C15 ------------------------------------------------------------- Start map
// Each player's season PPG against what this week's opponent has allowed to his position
// per game, above or below the league's average. Allowed comes from DATA.allowed (every
// QB, RB, WR and TE line against each defense, by week), the same sums B9 to B13 read.
const START_DEPTH = { QB: 28, RB: 40, WR: 56, TE: 22 };
function startOpponents() {
  const out = {};
  for (const pv of DATA.previews) {
    const h = pv.header, a = h.away.abbreviation, hm = h.home.abbreviation;
    out[a] = { opp: hm, home: false, implied: h.away_implied };
    out[hm] = { opp: a, home: true, implied: h.home_implied };
  }
  return out;
}
function allowedPerGame(pos) {
  const per = {};
  for (const [defense, weeks] of Object.entries(DATA.allowed)) {
    const vals = Object.values(weeks).map((byPos) => byPos[pos]?.[0] ?? 0);
    if (vals.length) per[defense] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  const league = Object.values(per).reduce((a, b) => a + b, 0) / Math.max(1, Object.keys(per).length);
  const order = Object.keys(per).sort((a, b) => per[b] - per[a]);
  return { per, league, rank: Object.fromEntries(order.map((d, i) => [d, i + 1])), of: order.length };
}
function startRows(pos) {
  const opp = startOpponents();
  const { per, league, rank, of } = allowedPerGame(pos);
  const rows = Object.values(DATA.players).filter((p) => {
    if (p.pos !== pos || (p.season.games_played ?? 0) < 4 || !opp[p.team]) return false;
    // A player who sat out his team's latest game is left off until the injury report is in.
    const teamPlayed = DATA.results[p.team]?.[DATA.recap_week];
    return !teamPlayed || p.log.some((g) => g.week === DATA.recap_week);
  }).map((p) => {
    const o = opp[p.team];
    return { id: p.id, name: p.name, team: p.team, ppg: p.season.fantasy_ppg, g: p.season.games_played, opp: o.opp, home: o.home,
      implied: o.implied, allow: per[o.opp], rank: rank[o.opp], of, delta: per[o.opp] - league };
  }).filter((r) => r.allow != null).sort((a, b) => b.ppg - a.ppg).slice(0, START_DEPTH[pos]);
  return { rows, league };
}
function defaultStartFaces(pos) {
  const { rows } = startRows(pos);
  const top = rows.slice(0, pos === "WR" || pos === "RB" ? 10 : 8);
  const soft = rows.slice(0, pos === "WR" || pos === "RB" ? 24 : 12).sort((a, b) => b.allow - a.allow).slice(0, 4);
  return [...new Set([...top, ...soft].map((r) => r.id))];
}
function cardStartMap(_, opts = {}) {
  const pos = opts.pos || "WR";
  const { rows } = startRows(pos);
  const fr = frame(1600, 900, {
    kicker: `Week ${DATA.preview_week} · PPR · ${POS_PLURAL[pos]}`, title: `Week ${DATA.preview_week} Matchups`,
    subtitle: "Season PPG against what their opponent allows per game",
  });
  const color = (r) => (r.rank <= 8 ? "var(--pos)" : r.rank > r.of - 8 ? "var(--neg)" : "var(--muted)");
  const ppgs = rows.map((r) => r.ppg).sort((a, b) => a - b);
  return wrapCard(fr, scatterPlot(fr, {
    points: rows.map((r) => ({
      id: r.id, x: r.ppg, y: r.delta, name: r.name, face: r.id, team: r.team, color: color(r),
      tip: [`${r.name} (${r.team})`, `${r.home ? "vs" : "at"} ${r.opp}, Week ${DATA.preview_week}`, `Season PPG: ${num(r.ppg, 1)} in ${r.g} games`,
        `${r.opp} allows ${num(r.allow, 1)} to ${pos}s (${ord(r.rank)} most)`, `Implied team total: ${r.implied == null ? "no line" : implied(r.implied)}`],
    })),
    xstep: "auto", ystep: "auto", xfmt: (v) => num(v, 0), yfmt: (v) => signed(v, 0), xtip: (v) => num(v, 1), ytip: (v) => signed(v, 1),
    xlabel: "Season PPG →", ylabel: `${pos}s: opponent allows vs average ↑`, refX: ppgs[ppgs.length >> 1], refY: 0,
    quadrants: [["High scorer in a plus matchup", mix("var(--pos)", 72, "var(--fg)")], ["Low scorer in a plus matchup"], ["High scorer in a tougher matchup"], ["Low scorer in a tougher matchup", mix("var(--neg)", 72, "var(--fg)")]],
    highlight: opts.hl ?? defaultStartFaces(pos), r: 24,
  }));
}

// C16 -------------------------------------------------------------- Rank race
// The site's Rank Race (the home page, November 2026): the position's leaders and where each
// ranked in season points after every week, from /stats/rank-race. A week's rank counts
// everyone at the position who had played by then. Pick names to colour, and one to spotlight.
const RACE_CAP = 25;
const raceRows = (o) => (DATA.rank_race[o.pos || "WR"]?.rows || []).slice(0, Number(o.n) || 12);
function raceStory(rows, weeks) {
  const last = weeks.length - 1;
  const leader = rows[0];
  let since = last;
  while (since > 0 && leader.r[since - 1] === 1) since--;
  const climb = rows.slice(1).map((row) => {
    const early = row.r.slice(0, Math.max(1, last - 2)).filter((v) => v != null);
    const worst = early.length ? Math.max(...early) : row.r[last];
    return { row, worst, week: weeks[row.r.indexOf(worst)], gain: worst - row.r[last] };
  }).sort((a, b) => b.gain - a.gain)[0];
  return { leader, since: weeks[since], climb };
}
function defaultRaceHl(o) {
  const rows = raceRows(o);
  if (!rows.length) return [];
  const { leader, climb } = raceStory(rows, DATA.rank_race[o.pos || "WR"].weeks);
  return [leader.id, ...(climb && climb.gain > 0 ? [climb.row.id] : [])];
}
const bump = (pts) => pts.map(([x, y], i) => (i ? `C${num((pts[i - 1][0] + x) / 2, 1)},${num(pts[i - 1][1], 1)} ${num((pts[i - 1][0] + x) / 2, 1)},${num(y, 1)} ${num(x, 1)},${num(y, 1)}` : `M${num(x, 1)},${num(y, 1)}`)).join(" ");
function cardRankRace(_, opts = {}) {
  const pos = opts.pos || "WR";
  const race = DATA.rank_race[pos];
  const rows = raceRows(opts);
  const weeks = race.weeks, last = weeks.length - 1;
  const hl = (opts.hl ?? defaultRaceHl(opts)).filter((id) => rows.some((r) => r.id === id));
  const spot = rows.find((r) => r.id === opts.spot) || null;
  const fr = frame(1600, 900, { kicker: `${DATA.season} · Weeks ${weeks[0]}-${weeks[last]} · PPR`, title: "Season-Long Ranking" });
  const { pad, w } = fr;
  const px0 = pad + 74, px1 = w - pad - 330, py0 = fr.top + 18, py1 = fr.bottom - 44;
  const x = lin(0, last, px0 + 16, px1);
  const y = lin(1, RACE_CAP, py0, py1);
  const clamp = (v) => Math.min(v, RACE_CAP);
  let s = "";
  for (const v of [1, ...BANDS[pos].filter((b) => b < RACE_CAP)]) {
    s += L(px0, y(v), px1 + 20, y(v), { stroke: "var(--divider)" }) + T(px0 - 14, y(v) + 6, `${pos}${v}`, { size: 17, weight: 650, anchor: "end", mono: true, fill: "var(--faint)" });
  }
  s += R(px0, y(RACE_CAP) - 16, px1 + 20 - px0, 32, { rx: 8, fill: "var(--panel)" }) + T(px0 - 14, y(RACE_CAP) + 6, `${RACE_CAP}+`, { size: 17, weight: 650, anchor: "end", mono: true, fill: "var(--faint)" });
  weeks.forEach((wk, i) => { s += T(x(i), py1 + 40, `W${wk}`, { size: 17, weight: 700, anchor: "middle", fill: "var(--faint)" }); });
  const colorOf = (row) => (spot === row ? "var(--accent)" : hl.includes(row.id) ? `var(--series-${(hl.indexOf(row.id) % 5) + 1})` : "var(--muted)");
  const weight = (row) => (spot === row ? 3 : hl.includes(row.id) ? 2 : 1);
  const fade = (row) => (spot ? (spot === row ? 1 : hl.includes(row.id) ? 0.55 : 0.22) : hl.includes(row.id) ? 1 : 0.5);
  let hits = "";
  for (const row of [...rows].sort((a, b) => weight(a) - weight(b))) {
    const col = colorOf(row), k = weight(row);
    const pts = row.r.map((v, i) => (v == null ? null : [x(i), y(clamp(v))]));
    const firstIdx = pts.findIndex(Boolean);
    s += `<g opacity="${fade(row)}"><path d="${bump(pts.slice(firstIdx))}" fill="none" stroke="${col}" stroke-width="${[0, 3, 5, 7][k]}" stroke-linecap="round"/>`;
    row.r.forEach((v, i) => {
      if (v == null) return;
      const rr = k === 3 ? 17 : k === 2 ? 15 : 10.5, cx = x(i), cy = y(clamp(v));
      s += C(cx, cy, rr, { fill: "var(--card)", stroke: col, sw: k > 1 ? 3 : 2, dash: v >= RACE_CAP ? "4 3" : null });
      s += T(cx, cy + (v > 99 ? 4 : k > 1 ? 5.5 : 4.5), v, { size: v > 99 ? 10.5 : k > 1 ? 16 : 12.5, weight: 800, anchor: "middle", mono: true, fill: k > 1 ? "var(--fg)" : "var(--muted)" });
      hits += `<circle class="hit" cx="${num(cx, 1)}" cy="${num(cy, 1)}" r="${rr + 3}" fill="transparent" data-pid="${esc(row.id)}" data-tip="${esc(`${row.n} (${row.t})|After Week ${weeks[i]}: ${pos}${v}|${num(row.c[i], 1)} pts`)}"/>`;
    });
    s += "</g>";
  }
  // End labels, spaced so they never overlap, each tied back to its last dot.
  const ends = rows.map((row) => ({ row, ay: y(clamp(row.r[last] ?? RACE_CAP)) })).sort((a, b) => a.ay - b.ay);
  const gap = Math.min(52, (py1 - py0 + 30) / Math.max(1, ends.length));
  ends.forEach((it, i) => { it.y = Math.max(it.ay, i ? ends[i - 1].y + gap : py0 - 8); });
  const over = ends.length ? ends[ends.length - 1].y - (py1 + 8) : 0;
  if (over > 0) ends.forEach((it) => { it.y -= over; });
  for (let i = ends.length - 2; i >= 0; i--) ends[i].y = Math.min(ends[i].y, ends[i + 1].y - gap);
  const lx = px1 + 70;
  const fr2 = Math.min(21, gap / 2 - 3);
  for (const it of ends) {
    const col = colorOf(it.row), k = weight(it.row);
    s += `<g opacity="${spot && spot !== it.row ? 0.6 : 1}">`;
    s += `<path d="M${num(x(last) + 18, 1)},${num(it.ay, 1)} C${num(x(last) + 36, 1)},${num(it.ay, 1)} ${num(lx - 40, 1)},${num(it.y, 1)} ${num(lx - fr2 - 4, 1)},${num(it.y, 1)}" fill="none" stroke="${col}" stroke-width="1.5"/>`;
    s += face(it.row.id, lx, it.y, fr2, col, it.row.n);
    s += T(lx + fr2 + 12, it.y - 2, fit(it.row.n, w - pad - lx - fr2 - 12, k > 1 ? 19 : 17, 750), { size: k > 1 ? 19 : 17, weight: 750 });
    s += T(lx + fr2 + 12, it.y + 17, `${num(it.row.c[last], 1)} pts · ${it.row.t}`, { size: 14, weight: 650, mono: true, fill: "var(--muted)" });
    s += "</g>";
  }
  return wrapCard(fr, s + hits);
}

// C17 ---------------------------------------------------------- Shootout meter
// The home page's Shootout Meter (November 2026): next week's slate on one scale, each game
// a line between its two teams' implied totals, sorted by the total.
const kickoffEt = (h) => {
  const day = new Date(`${h.game_date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" });
  if (!h.kickoff_time) return day;
  const [hh, mm] = String(h.kickoff_time).split(":").map(Number);
  return `${day} ${((hh + 11) % 12) + 1}:${String(mm).padStart(2, "0")}`;
};
function slateTeams() {
  return DATA.previews.filter((pv) => pv.header.away_implied != null && pv.header.home_implied != null);
}
function cardShootout() {
  const games = slateTeams().map((pv) => pv.header).sort((a, b) => b.total_line - a.total_line);
  const imps = games.flatMap((h) => [h.away_implied, h.home_implied]);
  const avg = imps.reduce((a, b) => a + b, 0) / Math.max(1, imps.length);
  const top = games[0];
  const fr = frame(1600, 900, {
    kicker: `Week ${DATA.preview_week} · implied team totals`, title: `Week ${DATA.preview_week} shootout meter`,
    subtitle: top ? `Each game a line between its two teams' implied totals, by the total. ${nickname(top.away.abbreviation)} at ${nickname(top.home.abbreviation)} leads at ${top.total_line}.` : "No lines yet.",
  });
  const { pad, w } = fr;
  const x0 = pad, x1 = w - pad;
  const y0 = fr.top + 30, rowH = Math.min(44, (fr.bottom - y0) / Math.max(1, games.length));
  const lo = Math.floor(Math.min(...imps) - 1.5), hi = Math.ceil(Math.max(...imps) + 1.5);
  const kx = 120, tx = 70;
  const x = lin(lo, hi, x0 + kx + 24, x1 - tx - 24);
  let s = "";
  const step = hi - lo > 14 ? 4 : 2;
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) s += L(x(v), y0 - 8, x(v), y0 + games.length * rowH, { stroke: "var(--divider)" }) + T(x(v), y0 - 14, v, { size: 16, anchor: "middle", mono: true, fill: "var(--faint)" });
  s += L(x(avg), y0 - 8, x(avg), y0 + games.length * rowH, { stroke: "var(--plot-rule)", dash: "6 6", sw: 1.5 });
  s += T(x1, y0 - 14, "TOTAL", { size: 14, weight: 800, anchor: "end", fill: "var(--faint)", ls: 1.4 });
  games.forEach((h, i) => {
    const cy = y0 + i * rowH + rowH / 2;
    const a = h.away.abbreviation, hm = h.home.abbreviation;
    const cols = gameColors(a, hm);
    if (i < 3) s += R(x0, cy - rowH / 2 + 3, x1 - x0, rowH - 6, { rx: 10, fill: mix("var(--pos)", 8) });
    s += T(x0 + 12, cy + 6, kickoffEt(h), { size: 16, weight: 600, fill: "var(--faint)" });
    const xa = x(h.away_implied), xh = x(h.home_implied);
    s += L(xa, cy, xh, cy, { stroke: "var(--muted)", sw: 4, cap: "round", opacity: 0.45 });
    const fav = h.home_implied >= h.away_implied ? hm : a;
    for (const [team, cx, other] of [[a, xa, xh], [hm, xh, xa]]) {
      const r = team === fav ? 19 : 16;
      s += C(cx, cy, r + 1, { fill: "var(--card)", stroke: cols[team], sw: 3 }) + logo(team, cx - r + 3, cy - r + 3, (r - 3) * 2);
      const out = cx >= other ? 1 : -1;
      s += T(cx + out * (r + 8), cy + 6, implied(team === a ? h.away_implied : h.home_implied), { size: 17, weight: 800, mono: true, anchor: out > 0 ? "start" : "end" });
    }
    s += T(x1, cy + 7, h.total_line, { size: 21, weight: 800, anchor: "end", mono: true });
    s += `<rect class="hit" x="${num(x0, 1)}" y="${num(cy - rowH / 2, 1)}" width="${num(x1 - x0, 1)}" height="${num(rowH, 1)}" fill="transparent" data-tip="${esc([`${nickname(a)} at ${nickname(hm)}`, `${a} ${implied(h.away_implied)}, ${hm} ${implied(h.home_implied)} implied`, `Total ${h.total_line}`].join("|"))}"/>`;
  });
  return wrapCard(fr, s);
}

// C18 ---------------------------------------------- Every game's win probability
// Every game of the recap week as the winner's chance of winning, kickoff to final, in grey;
// a highlighted team's game is drawn from that team's side, in its colour, with its logo.
function weekWpGames() {
  return DATA.recaps.filter((g) => g.header.week === DATA.recap_week && g.wp?.series?.length).map((g) => {
    const { away, home } = g.header;
    const homeWon = (home.score ?? 0) > (away.score ?? 0);
    const series = [[0, g.wp.pregame ?? g.wp.series[0][1]], ...g.wp.series.map(([t, v]) => [t, v])];
    series[series.length - 1] = [series[series.length - 1][0], homeWon ? 1 : 0];
    const winnerWp = series.map(([t, v]) => [t, homeWon ? v : 1 - v]);
    return { g, away: away.abbreviation, home: home.abbreviation, winner: homeWon ? home.abbreviation : away.abbreviation,
      loser: homeWon ? away.abbreviation : home.abbreviation, series, homeWon, low: Math.min(...winnerWp.map((p) => p[1])), end: Math.max(g.wp.end, 3600) };
  });
}
const wpTeamPool = () => weekWpGames().flatMap((d) => [d.winner, d.loser]).sort().map((t) => ({ id: t, name: TEAMS[t]?.name || t, team: "" }));
const defaultWpTeams = () => weekWpGames().sort((a, b) => a.low - b.low).slice(0, 3).map((d) => d.winner);
function cardWpAll(_, opts = {}) {
  const games = weekWpGames();
  const hl = (opts.hl ?? defaultWpTeams()).filter((t) => games.some((d) => d.winner === t || d.loser === t));
  const drama = [...games].sort((a, b) => a.low - b.low);
  const fr = frame(1600, 900, {
    kicker: `Week ${DATA.recap_week} · win probability`, title: `Week ${DATA.recap_week} Win Probabilities`,
  });
  const { pad, w } = fr;
  const side = 380;
  const x0 = pad + 66, x1 = w - pad - side - 40, y0 = fr.top + 10, y1 = fr.bottom - 40;
  const end = Math.max(3600, ...games.map((d) => d.end));
  const x = lin(0, end, x0, x1), y = lin(0, 1, y1, y0);
  let s = "";
  for (const v of [0, 0.25, 0.5, 0.75, 1]) s += L(x0, y(v), x1, y(v), { stroke: v === 0.5 ? "var(--plot-rule)" : "var(--divider)", dash: v === 0.5 ? "6 6" : null }) + T(x0 - 12, y(v) + 6, `${v * 100}%`, { size: 16, anchor: "end", mono: true, fill: "var(--faint)" });
  const quarters = [["1st", 0, 900], ["2nd", 900, 1800], ["3rd", 1800, 2700], ["4th", 2700, 3600]];
  if (end > 3600) quarters.push(["OT", 3600, end]);
  for (const [label, a, b] of quarters) {
    if (a > 0) s += L(x(a), y0, x(a), y1, { stroke: "var(--divider)" });
    s += T((x(a) + x(b)) / 2, y1 + 30, label, { size: 17, weight: 650, anchor: "middle", fill: "var(--faint)" });
  }
  const pathFor = (pts) => pathOf(pts.map(([t, v]) => [x(t), y(v)]));
  let hits = "";
  for (const d of games) {
    const picked = hl.includes(d.winner) || hl.includes(d.loser);
    const pts = d.series.map(([t, v]) => [t, d.homeWon ? v : 1 - v]);
    if (!picked) s += `<path d="${pathFor(pts)}" fill="none" stroke="var(--muted)" stroke-width="2" opacity="0.38" stroke-linejoin="round"/>`;
    hits += `<path class="hit" d="${pathFor(pts)}" fill="none" stroke="transparent" stroke-width="12" data-pid="${d.winner}" data-tip="${esc([`${nickname(d.away)} ${d.g.header.away.score}, ${nickname(d.home)} ${d.g.header.home.score}`, `${nickname(d.winner)} won; lowest chance ${Math.round(d.low * 100)}%`].join("|"))}"/>`;
  }
  for (const team of hl) {
    const d = games.find((g) => g.winner === team || g.loser === team);
    const colors = gameColors(d.away, d.home);
    const mine = d.series.map(([t, v]) => [t, team === d.home ? v : 1 - v]);
    s += `<path d="${pathFor(mine)}" fill="none" stroke="${colors[team]}" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    const low = mine.reduce((m, p) => (p[1] < m[1] ? p : m));
    const last = mine[mine.length - 1];
    if (team === d.winner) s += C(x(low[0]), y(low[1]), 7, { fill: colors[team], stroke: "var(--card)", sw: 2.5 }) + T(x(low[0]), y(low[1]) + 30, `${Math.round(low[1] * 100)}%`, { size: 16, weight: 800, anchor: "middle", mono: true, fill: teamText(colors[team]) });
    s += C(x(last[0]), y(last[1]), 18, { fill: "var(--card)", stroke: colors[team], sw: 3 }) + logo(team, x(last[0]) - 14, y(last[1]) - 14, 28);
  }
  // The games by how close the winner came to losing.
  const lx = w - pad - side;
  s += T(lx, fr.top + 14, "CLOSEST TO LOSING", { size: 15, weight: 800, fill: "var(--faint)", ls: 1.6 });
  const rowH = Math.min(70, (fr.bottom - fr.top - 30) / Math.min(8, drama.length));
  drama.slice(0, 8).forEach((d, i) => {
    const cy = fr.top + 50 + i * rowH;
    const on = hl.includes(d.winner) || hl.includes(d.loser);
    s += logo(d.winner, lx, cy - 18, 36);
    s += T(lx + 48, cy - 2, fit(`${nickname(d.away)} ${d.g.header.away.score}, ${nickname(d.home)} ${d.g.header.home.score}`, side - 130, 19, on ? 750 : 600), { size: 19, weight: on ? 750 : 600 });
    s += T(lx + 48, cy + 20, `${nickname(d.winner)} won`, { size: 15, fill: "var(--muted)" });
    s += T(w - pad, cy + 6, `${Math.round(d.low * 100)}%`, { size: 21, weight: 800, anchor: "end", mono: true });
  });
  return wrapCard(fr, s + hits);
}

// F7 -------------------------------------------------------------- Target share ring
// A quarterback's targets as a ring split by receiver (coloured by position), his face in
// the middle, and beside it every receiver's share as a bar with his yards, touchdowns and
// EPA per target. The home page mockup "Share Ring" (November 2026).
/** An annular sector from angle a0 to a1, clockwise from twelve o'clock. */
function ringSlice(cx, cy, r0, r1, a0, a1) {
  const at = (r, a) => `${num(cx + r * Math.sin(a), 1)},${num(cy - r * Math.cos(a), 1)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${at(r1, a0)} A${r1},${r1} 0 ${large} 1 ${at(r1, a1)} L${at(r0, a1)} A${r0},${r0} 0 ${large} 0 ${at(r0, a0)} Z`;
}
const receiverTipText = (r) => [`${r.name}${r.position ? ` (${r.position})` : ""}`, `Targets: ${r.targets} (${pct(r.share)})`, `Catches: ${r.receptions}, ${r.yards} yards, ${r.touchdowns} TD`,
  `aDOT: ${r.adot == null ? "-" : num(r.adot, 1)}`, `EPA per target: ${signed(r.epa_per_target, 2)}`].join("|");
/** An EPA per target value on a tinted chip, centred on cx. */
function epaChip(cx, cy, value, size = 16, label = "") {
  const text = `${signed(value, 2)}${label}`;
  const cw = textWidth(text, size, 800, true) + 20;
  return R(cx - cw / 2, cy - size * 0.95, cw, size * 1.9, { rx: 9, fill: mix(epaColor(value), 30) })
    + T(cx, cy + size * 0.36, text, { size, weight: 800, anchor: "middle", mono: true, fill: mix(epaColor(value), 60, "var(--fg)") });
}
function cardShareRing(_, opts = {}) {
  const pid = DATA.networks[opts.qb] ? opts.qb : networkPassers()[0].id;
  const weeks = tfWeeks(opts.tf);
  const net = windowNetwork(pid, weeks, "all");
  const { shown, others, total } = shapeNet(net.receivers, Number(opts.top) || 7);
  const [cmp, att, yards] = net.line;
  const fr = frame(1600, 900, { kicker: weeksLabel(weeks), title: `${net.name}: Target Distribution`, subtitle: `All ${total} targets, split by receiver` });
  const { pad, w } = fr;
  const H = fr.bottom - fr.top;
  const R1 = Math.min(300, H / 2 - 30), R0 = R1 * 0.6;
  const cx = pad + R1 + 30, cy = fr.top + H / 2 - 12;
  const rows = [...shown, ...(others ? [others] : [])];
  let s = "", faces = "", hits = "";
  let a = 0;
  for (const r of rows) {
    const span = (r.targets / Math.max(1, total)) * Math.PI * 2;
    const path = ringSlice(cx, cy, R0, R1, a, a + span);
    s += `<path d="${path}" fill="${r.others ? mix("var(--faint)", 35) : mix(posColor(r.position || "WR"), 82)}" stroke="var(--card)" stroke-width="5" stroke-linejoin="round"/>`;
    hits += `<path class="hit" d="${path}" fill="transparent"${r.player_id ? ` data-pid="${r.player_id}"` : ""} data-tip="${esc(r.others ? `${r.name}|Targets: ${r.targets} (${pct(r.share)})` : receiverTipText(r))}"/>`;
    const mid = a + span / 2;
    if (span > 0.2) {
      const lr = (R0 + R1) / 2 - (r.others ? 0 : 6);
      s += haloT(cx + lr * Math.sin(mid), cy - lr * Math.cos(mid) + 7, pct(r.share), { size: 19, weight: 800, anchor: "middle", mono: true, halo: 4 });
      if (!r.others) faces += face(r.player_id, cx + (R1 + 2) * Math.sin(mid), cy - (R1 + 2) * Math.cos(mid), 27, posColor(r.position || "WR"), r.name);
    }
    a += span;
  }
  const qr = R0 * 0.42;
  s += faces + face(pid, cx, cy - 30, qr, posColor("QB"), net.name);
  s += T(cx, cy + qr + 6, `${total} targets`, { size: 25, weight: 800, anchor: "middle", mono: true });
  s += T(cx, cy + qr + 34, `${cmp}/${att} · ${yards.toLocaleString()} yds`, { size: 17, anchor: "middle", fill: "var(--muted)" });
  const positions = [...new Set(shown.map((r) => r.position).filter(Boolean))].sort((p, q) => ["WR", "TE", "RB", "QB"].indexOf(p) - ["WR", "TE", "RB", "QB"].indexOf(q));
  s += legendRow(pad, fr.top + 4, positions.map((p) => [(x, y) => C(x, y, 8, { fill: mix(posColor(p), 82) }), p]), 17, 22).svg;

  // The table: receiver, share bar, yards, touchdowns, EPA per target.
  const tx = cx + R1 + 80, right = w - pad;
  const col = { yds: right - 196, td: right - 128, epa: right - 46 };
  const nameW = 310, bx = tx + 56 + nameW, barW = col.yds - 120 - bx;
  let y = fr.top + 18;
  [["RECEIVER", tx + 56, "start"], ["SHARE OF TARGETS", bx, "start"], ["YDS", col.yds, "end"], ["TD", col.td, "end"], ["EPA/T", col.epa, "middle"]]
    .forEach(([k, x, anchor]) => { s += T(x, y, k, { size: 13, weight: 750, anchor, fill: "var(--faint)", ls: 1.1 }); });
  y += 14;
  const rowH = Math.min(66, (fr.bottom - y) / Math.max(1, rows.length));
  const top = Math.max(1e-6, ...rows.map((r) => r.share));
  rows.forEach((r, i) => {
    const ry = y + i * rowH, my = ry + rowH / 2;
    s += L(tx, ry, right, ry, { stroke: "var(--rule)" });
    if (r.others) s += C(tx + 22, my, 18, { fill: "var(--chip)", stroke: "var(--border-strong)", sw: 2 }) + T(tx + 22, my + 6, "+", { size: 19, weight: 800, anchor: "middle", fill: "var(--muted)" });
    else s += face(r.player_id, tx + 22, my, 20, posColor(r.position || "WR"), r.name);
    s += T(tx + 56, my - (r.others ? -6 : 3), fit(r.others ? r.name : r.name, nameW, 19, 700), { size: 19, weight: 700, fill: r.others ? "var(--muted)" : "var(--fg)" });
    if (!r.others) s += T(tx + 56, my + 19, fit(`${r.receptions} reception${r.receptions === 1 ? "" : "s"} on ${r.targets} target${r.targets === 1 ? "" : "s"} · ${r.adot == null ? "-" : num(r.adot, 1)} aDOT`, nameW, 14.5), { size: 14.5, fill: "var(--muted)" });
    const bw = barW * (r.share / top);
    s += R(bx, my - 5, barW, 10, { rx: 5, fill: mix("var(--fg)", 8) });
    s += R(bx, my - 5, bw, 10, { rx: 5, fill: r.others ? "var(--faint)" : posColor(r.position || "WR") });
    s += T(bx + barW + 10, my + 6, pct(r.share), { size: 16, weight: 700, mono: true, fill: "var(--muted)" });
    s += T(col.yds, my + 7, r.yards.toLocaleString(), { size: 19, weight: 700, anchor: "end", mono: true });
    s += T(col.td, my + 7, r.touchdowns, { size: 19, weight: 600, anchor: "end", mono: true });
    if (!r.others && r.epa_per_target != null) s += epaChip(col.epa, my, r.epa_per_target);
    hits += `<rect class="hit" x="${num(tx, 1)}" y="${num(ry, 1)}" width="${num(right - tx, 1)}" height="${num(rowH, 1)}" fill="transparent"${r.player_id ? ` data-pid="${r.player_id}"` : ""} data-tip="${esc(r.others ? `${r.name}|Targets: ${r.targets} (${pct(r.share)})` : receiverTipText(r))}"/>`;
  });
  return wrapCard(fr, s + hits);
}

// F8 -------------------------------------------------------------- Lineup cards
// The quarterback and his top six receivers as cards in the team's colours: the face
// large, his share, his line, a heat grid of where he is targeted (four depths by three
// sides) and EPA per target. The home page mockup "Lineup Cards" (November 2026).
const HEAT_ROWS = [[3, "20+"], [2, "10"], [1, "0"], [0, "<0"]];
const SIDE_WORDS = ["left", "middle", "right"];
const DEPTH_WORDS = ["behind the line", "short", "intermediate", "deep"];
function cardLineupCards(_, opts = {}) {
  const pid = DATA.networks[opts.qb] ? opts.qb : networkPassers()[0].id;
  const weeks = tfWeeks(opts.tf);
  const net = windowNetwork(pid, weeks, "all");
  const { shown, total } = shapeNet(net.receivers, Number(opts.top) || 6);
  const [cmp, att, yards, tdsN, ints] = net.line;
  const team = net.team;
  const base = parseHex(TEAMS[team]?.color) ? TEAMS[team].color : "#30343c";
  const accent = teamColor(team);
  const fr = frame(1600, 900, { kicker: weeksLabel(weeks), title: `${net.name} by Pass Catcher`, subtitle: "Grid indicates target location" });
  const { pad, w } = fr;
  const sum = (key) => net.receivers.reduce((acc, r) => acc + (r[key] ?? 0), 0);
  const charted = sum("charted");
  const zones = net.receivers.reduce((acc, r) => (r.zones || []).reduce((z, v, i) => { z[i] += v; return z; }, acc), new Array(12).fill(0));
  const qbCard = { qb: true, player_id: pid, name: net.name, position: "QB", zones, targets: total, adot: charted ? sum("air_yards") / charted : null,
    epa_per_target: total ? sum("epa") / total : null, big: `${cmp}/${att}`, bigLabel: "COMPLETIONS", line: `${yards.toLocaleString()} yds · ${tdsN} TD · ${ints} INT` };
  const cards = [qbCard, ...shown.map((r) => ({ ...r, big: pct(r.share), bigLabel: "OF TARGETS",
    line: `${r.receptions}/${r.targets} · ${r.yards} yds${r.touchdowns ? ` · ${r.touchdowns} TD` : ""}` }))];
  const gap = 16;
  const cw = Math.min(260, (w - 2 * pad - gap * (cards.length - 1)) / cards.length);
  const x0 = (w - (cw * cards.length + gap * (cards.length - 1))) / 2;
  const y0 = fr.top - 4, ch = fr.bottom - y0, th = 236;
  const ink = inkOn(base);
  const pillInk = theme() === "dark" ? "#0b0d12" : "#ffffff";
  const grad = nextId("lg");
  let s = `<defs><linearGradient id="${grad}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${base}"/><stop offset="1" stop-color="${mix(base, 55, "var(--card)")}"/></linearGradient></defs>`;
  let hits = "";
  cards.forEach((c, i) => {
    const x = x0 + i * (cw + gap);
    const clip = nextId("lc");
    const topPath = `M${num(x, 1)},${num(y0 + 22, 1)} a22,22 0 0 1 22,-22 h${num(cw - 44, 1)} a22,22 0 0 1 22,22 v${th - 22} h${num(-cw, 1)} Z`;
    s += R(x, y0, cw, ch, { rx: 22, fill: "var(--panel)", stroke: c.qb ? mix(accent, 55) : "var(--rule)", sw: c.qb ? 2 : 1 });
    s += `<clipPath id="${clip}"><path d="${topPath}"/></clipPath><g clip-path="url(#${clip})">`;
    s += `<path d="${topPath}" fill="url(#${grad})"/>`;
    s += C(x + cw - 6, y0 + 10, 74, { fill: accent, opacity: c.qb ? 0.7 : 0.45 });
    const href = IMG[`p:${c.player_id}`];
    if (href) s += `<image href="${href}" x="${num(x + cw / 2 - 83, 1)}" y="${y0 + th - 166}" width="166" height="166" preserveAspectRatio="xMidYMid slice"/>`;
    else s += T(x + cw / 2, y0 + th - 60, initials(c.name), { size: 60, weight: 800, anchor: "middle", fill: ink, opacity: 0.5 });
    s += `</g>`;
    s += R(x + 12, y0 + 12, 44, 26, { rx: 13, fill: posColor(c.position || "WR") }) + T(x + 34, y0 + 30, c.position || "", { size: 14, weight: 800, anchor: "middle", mono: true, fill: pillInk });
    const bs = fitSize(c.big, cw - 76, [32, 28, 24], 800);
    s += T(x + cw - 14, y0 + 40, bs.text, { size: bs.size, weight: 800, anchor: "end", fill: ink });
    s += T(x + cw - 14, y0 + 58, c.bigLabel, { size: 11.5, weight: 750, anchor: "end", fill: ink, ls: 1, opacity: 0.8 });
    // Body: name, line, heat grid, aDOT and EPA per target.
    let y = y0 + th + 14;
    s += T(x + 14, y + 20, fit(c.name, cw - 28, 19, 750), { size: 19, weight: 750 });
    s += T(x + 14, y + 46, fit(c.line, cw - 28, 14.5, 500), { size: 14.5, fill: "var(--muted)" });
    y += 66;
    const z = c.zones || new Array(12).fill(0);
    const most = Math.max(1, ...z);
    const fy = y0 + ch - 26;
    const labelW = 30, cellGap = 4, cellW = (cw - 28 - labelW - cellGap * 2) / 3, rowH = Math.min(54, (fy - 52 - y) / 4);
    HEAT_ROWS.forEach(([d, label], row) => {
      const cy = y + row * rowH;
      s += T(x + 14, cy + rowH / 2 + 1, label, { size: 12.5, weight: 600, mono: true, fill: "var(--faint)" });
      for (let side = 0; side < 3; side += 1) {
        const v = z[d * 3 + side];
        const cx = x + 14 + labelW + side * (cellW + cellGap);
        s += R(cx, cy, cellW, rowH - 6, { rx: 7, fill: mix(accent, Math.round((v / most) * 85), mix("var(--fg)", 6)) });
        if (v) s += T(cx + cellW / 2, cy + rowH / 2 + 2, v, { size: 15, weight: 750, anchor: "middle", mono: true });
        hits += `<rect class="hit" x="${num(cx, 1)}" y="${num(cy, 1)}" width="${num(cellW, 1)}" height="${rowH - 6}" fill="transparent" data-tip="${esc(`${c.name}|${v} of ${c.targets} targets ${DEPTH_WORDS[d]}, ${SIDE_WORDS[side]}`)}"/>`;
      }
    });
    // aDOT and EPA per target, each a small label over its value.
    s += L(x + 14, fy - 40, x + cw - 14, fy - 40, { stroke: "var(--rule)" });
    s += T(x + 14, fy - 18, "ADOT", { size: 11.5, weight: 750, fill: "var(--faint)", ls: 1 });
    s += T(x + 14, fy + 6, c.adot == null ? "-" : num(c.adot, 1), { size: 18, weight: 800, mono: true });
    s += T(x + cw - 14, fy - 18, "EPA/T", { size: 11.5, weight: 750, anchor: "end", fill: "var(--faint)", ls: 1 });
    if (c.epa_per_target != null) {
      const chipW = textWidth(signed(c.epa_per_target, 2), 15, 800, true) + 20;
      s += epaChip(x + cw - 14 - chipW / 2, fy, c.epa_per_target, 15);
    }
    if (!c.qb) hits += `<rect class="hit" x="${num(x, 1)}" y="${num(y0, 1)}" width="${num(cw, 1)}" height="${th}" fill="transparent" data-pid="${c.player_id}" data-tip="${esc(receiverTipText(c))}"/>`;
  });
  return wrapCard(fr, s + hits);
}
