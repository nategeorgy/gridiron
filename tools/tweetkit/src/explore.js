// F: league cards and the site's Explore charts. None of them is about fantasy points:
// the passing network, target analysis, league leaders, the race, and team charts.

// ------------------------------------------------------------- timeframes
// Every timeframe control offers the same windows (pull.timeframes): the season, the last
// 4, 3 and 2 weeks, and the newest week. Cards built from sums (networks, targets,
// leaders) add the weeks up here; the others read a window the API computed.
const weeksLabel = (weeks) => (weeks.length === 1 ? `Week ${weeks[0]}` : `Weeks ${weeks[0]}-${weeks[weeks.length - 1]}`);
const tfWeeks = (key) => DATA.windows[key] || DATA.windows.season;
const TF_OPTIONS = Object.keys(DATA.windows).map((key) => [key,
  key === "season" ? `Season (${weeksLabel(DATA.windows[key])})` : key === "last1" ? `${weeksLabel(DATA.windows[key])} only` : `Last ${key.slice(4)} weeks (${weeksLabel(DATA.windows[key])})`]);
const tfControl = (extra = {}) => ({ key: "tf", type: "select", label: "Timeframe", options: TF_OPTIONS, defaults: () => "season", ...extra });

/** Text with a ring of the card colour behind it, so it reads over lines and faces. */
const haloT = (x, y, text, o = {}) => T(x, y, text, o).replace("<text ", `<text stroke="var(--card)" stroke-width="${o.halo ?? 5}" stroke-linejoin="round" paint-order="stroke" `);
/** The site's EPA tint (utils/explore.js): neutral at zero, saturating by ±span. */
function epaColor(epa, span = 0.5) {
  if (epa == null) return mix("var(--fg)", 30);
  const strength = Math.min(100, Math.round((Math.abs(epa) / span) * 100));
  return `color-mix(in srgb, ${epa >= 0 ? "var(--pos)" : "var(--neg)"} ${strength}%, color-mix(in srgb, var(--fg) 34%, var(--card)))`;
}
const DEPTH_NAMES = [["Behind", "under 0"], ["Short", "0-9 yds"], ["Intermediate", "10-19 yds"], ["Deep", "20+ yds"]];
const DEPTH_FILL = [0, 1, 2, 3].map((i) => `var(--depth${i})`);

/** A receiver tally ([targets, catches, yards, TDs, INTs, first downs, EPA, air yards, charted, l, m, r, d0-d3]) as an object. */
function tallyObject(t, extra = {}) {
  const [targets, receptions, yards, touchdowns, interceptions, first_downs, epa, air_yards, charted, l0, l1, l2, d0, d1, d2, d3] = t;
  return { ...extra, targets, receptions, yards, touchdowns, interceptions, first_downs, epa, air_yards, charted,
    locations: [l0, l1, l2], depth: [d0, d1, d2, d3], adot: charted ? air_yards / charted : null, epa_per_target: targets ? epa / targets : null };
}
const addInto = (acc, t) => { t.forEach((v, i) => { acc[i] = (acc[i] || 0) + v; }); return acc; };

// ------------------------------------------------------------- passing network
/** One passer's network over some weeks and one situation, summed from the weekly pulls. */
function windowNetwork(pid, weeks, situation = "all") {
  const net = DATA.networks[pid];
  if (!net) return null;
  const sums = new Map();
  const line = [0, 0, 0, 0, 0];
  let games = 0;
  for (const week of weeks) {
    const slot = net.w[week];
    if (!slot) continue;
    if (slot.all?.line?.[1]) { games += 1; addInto(line, slot.all.line); }
    for (const [rid, ...t] of slot[situation]?.rec || []) {
      const key = rid ?? "-";
      if (!sums.has(key)) sums.set(key, { rid, t: [] });
      addInto(sums.get(key).t, t);
    }
  }
  const receivers = [...sums.values()].map(({ rid, t }) => tallyObject(t, { player_id: rid, name: rid ? DATA.people[rid]?.[0] ?? "Unknown" : "Untracked", position: rid ? DATA.people[rid]?.[1] : null }))
    .sort((a, b) => b.targets - a.targets);
  return { pid, name: net.n, team: net.t, line, games, receivers };
}
/** The site's shapeNetwork: the top `limit` named receivers, the rest folded into one row. */
function shapeNet(receivers, limit) {
  const total = receivers.reduce((a, r) => a + r.targets, 0);
  const rate = (r) => ({ ...r, share: total ? r.targets / total : 0, lean: (r.locations[2] - r.locations[0]) / Math.max(1, r.locations[0] + r.locations[1] + r.locations[2]) });
  const named = receivers.filter((r) => r.player_id).map(rate);
  const shown = named.slice(0, limit);
  const rest = [...named.slice(limit), ...receivers.filter((r) => !r.player_id)];
  let others = null;
  if (rest.length) {
    const t = rest.reduce((acc, r) => addInto(acc, [r.targets, r.receptions, r.yards, r.touchdowns, r.interceptions, r.first_downs, r.epa, r.air_yards, r.charted, ...r.locations, ...r.depth]), []);
    others = { ...tallyObject(t, { name: "Everyone else", others: true }), share: total ? t[0] / total : 0 };
  }
  return { total, shown, others };
}

/**
 * The network on a field (components/explore/NetworkChart.jsx, field layout): height is
 * each receiver's average depth of target to scale, left to right is the side he is
 * targeted on more, spread evenly, line width is targets and colour EPA per target.
 */
function networkField(x0, y0, W, H, net, shown, o = {}) {
  const NEAR = -7, FAR = 26;
  const bandW = o.bands === false ? 0 : 128;
  const left = x0 + 50, right = x0 + W - bandW, top = y0 + 6, bottom = y0 + H - 6;
  const fy = (d) => bottom - (d - NEAR) * ((bottom - top) / (FAR - NEAR));
  const nameSize = o.name ?? 18, subSize = o.sub ?? 15;
  let s = "";
  [[NEAR, 0], [0, 10], [10, 20], [20, FAR]].forEach(([a, b], i) => {
    s += R(left, fy(b), right - left, fy(a) - fy(b), { fill: mix("var(--fg)", i % 2 ? 4 : 1.8) });
    if (bandW) s += T(right + 16, (fy(a) + fy(b)) / 2 - 3, DEPTH_NAMES[i][0].toUpperCase(), { size: 14, weight: 750, fill: "var(--muted)", ls: 1.2 })
      + T(right + 16, (fy(a) + fy(b)) / 2 + 17, DEPTH_NAMES[i][1], { size: 14, mono: true, fill: "var(--faint)" });
  });
  for (const yd of [-5, 5, 10, 15, 20, 25]) s += L(left, fy(yd), right, fy(yd)) + T(left - 10, fy(yd) + 5, yd > 0 ? `+${yd}` : yd, { size: 14, anchor: "end", mono: true, fill: "var(--faint)" });
  s += L(left, fy(0), right, fy(0), { stroke: "var(--plot-rule)", sw: 2 }) + T(left - 10, fy(0) + 5, "LOS", { size: 14, weight: 750, anchor: "end", fill: "var(--muted)" });
  if (!shown.length) return s + T((left + right) / 2, (top + bottom) / 2, "No targets in these weeks", { size: 22, anchor: "middle", fill: "var(--faint)" });
  const most = Math.max(1, ...shown.map((r) => r.targets));
  const k = o.scale ?? 1;
  const P = { x: (left + right) / 2, y: fy(-4.4), r: 38 * k };
  const lx0 = left + 26, lx1 = right - 26;
  const order = [...shown].sort((a, b) => a.lean - b.lean);
  const nodes = order.map((r, i) => ({
    r, x: lx0 + (i + 0.5) * ((lx1 - lx0) / order.length), y: fy(Math.max(-3, Math.min(FAR - 1.5, r.adot ?? 0))),
    rad: (17 + 21 * Math.sqrt(r.targets / most)) * k, width: (3 + 17 * (r.targets / most)) * k,
  }));
  const label = (n) => lastName(n.r.name), sub = (n) => `${n.r.targets} · ${Math.round(n.r.share * 100)}%`;
  const gap = nameSize + 3;
  const box = (n) => {
    const half = Math.max(n.rad, textWidth(label(n), nameSize, 700) / 2 + 5, textWidth(sub(n), subSize, 500, true) / 2 + 5);
    return { x0: n.x - half, x1: n.x + half, y0: n.y - n.rad, y1: n.y + n.rad + gap * 2 + 6, half };
  };
  // The site's spread: push apart any faces or labels that touch, horizontally only.
  for (let pass = 0; pass < 300; pass++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = box(nodes[i]), b = box(nodes[j]);
        const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        if (ox > -6 && oy > -2) {
          const push = (ox + 6) / 2 + 0.5;
          const [l, r] = nodes[i].x <= nodes[j].x ? [nodes[i], nodes[j]] : [nodes[j], nodes[i]];
          l.x -= push; r.x += push; moved = true;
        }
      }
    }
    // Keep every face and label off the quarterback: step it clear to whichever side it is on.
    const pb = { x0: P.x - P.r - 8, x1: P.x + P.r + 8, y0: P.y - P.r - 6, y1: P.y + P.r + gap + 6 };
    for (const n of nodes) {
      const b = box(n);
      if (b.x1 > pb.x0 && b.x0 < pb.x1 && b.y1 > pb.y0 && b.y0 < pb.y1) { n.x = n.x < P.x ? pb.x0 - b.half - 1 : pb.x1 + b.half + 1; moved = true; }
      n.x = Math.max(left + 4 + b.half, Math.min(right - 4 - b.half, n.x));
    }
    if (!moved) break;
  }
  const bend = (bottom - top) / 640;
  for (const n of nodes) {
    s += `<path d="M${num(P.x, 1)},${num(P.y - P.r, 1)} C${num(P.x, 1)},${num(P.y - 110 * bend, 1)} ${num(n.x, 1)},${num(n.y + 120 * bend, 1)} ${num(n.x, 1)},${num(n.y, 1)}" fill="none" stroke="${epaColor(n.r.epa_per_target)}" stroke-width="${num(n.width, 1)}" stroke-linecap="round" opacity="0.92"/>`;
  }
  for (const n of nodes) s += face(n.r.player_id, n.x, n.y, n.rad, posColor(n.r.position || "WR"), n.r.name);
  for (const n of nodes) {
    s += haloT(n.x, n.y + n.rad + gap, label(n), { size: nameSize, weight: 700, anchor: "middle" });
    s += haloT(n.x, n.y + n.rad + gap * 2, sub(n), { size: subSize, anchor: "middle", mono: true, fill: "var(--muted)" });
  }
  s += face(net.pid, P.x, P.y, P.r, posColor("QB"), net.name);
  s += haloT(P.x, P.y + P.r + gap + 2, lastName(net.name), { size: nameSize + 1, weight: 800, anchor: "middle" });
  // Hover: each receiver's numbers.
  for (const n of nodes) {
    const r = n.r;
    const tip = [`${r.name} (${r.position ?? ""})`, `Targets: ${r.targets} (${pct(r.share)})`, `Catches: ${r.receptions}, ${r.yards} yards, ${r.touchdowns} TD`,
      `aDOT: ${r.adot == null ? "-" : num(r.adot, 1)}`, `EPA per target: ${signed(r.epa_per_target, 2)}`].join("|");
    s += `<circle class="hit" cx="${num(n.x, 1)}" cy="${num(n.y, 1)}" r="${num(n.rad + 3, 1)}" fill="transparent" data-tip="${esc(tip)}"/>`;
  }
  return s;
}
/** The key for a network: line width, the EPA ramp, and what height means. */
function networkKey(x, cy, o = {}) {
  let s = T(x, cy + 6, "Line width: targets", { size: 17, fill: "var(--muted)" });
  let at = x + textWidth("Line width: targets", 17) + 34;
  s += T(at, cy + 6, "Colour: EPA per target", { size: 17, fill: "var(--muted)" });
  at += textWidth("Colour: EPA per target", 17) + 14;
  const id = nextId("eg");
  s += `<defs><linearGradient id="${id}"><stop offset="0" stop-color="${epaColor(-0.5)}"/><stop offset="0.5" stop-color="${epaColor(0)}"/><stop offset="1" stop-color="${epaColor(0.5)}"/></linearGradient></defs>`;
  s += R(at, cy - 6, 110, 12, { rx: 6, fill: `url(#${id})` });
  s += T(at + 120, cy + 6, "−0.5 to +0.5", { size: 16, mono: true, fill: "var(--faint)" });
  if (o.height !== false) s += T(at + 250, cy + 6, "Height: average depth of target", { size: 17, fill: "var(--muted)" });
  return s;
}

// F1 -------------------------------------------------------------- Passing network
const SITUATION_OPTIONS = [["all", "All targets"], ["red_zone", "Red zone"], ["late_downs", "3rd and 4th down"]];
const SITUATION_WORDS = { all: "", red_zone: "In the red zone", late_downs: "On 3rd and 4th down" };
const networkPassers = () => Object.entries(DATA.networks).map(([pid, n]) => ({ id: pid, name: n.n, team: n.t,
  targets: Object.values(n.w).reduce((a, slot) => a + (slot.all?.line?.[1] ?? 0), 0) }))
  .filter((p) => DATA.passers.includes(p.id)).sort((a, b) => b.targets - a.targets);
function cardNetwork(_, opts = {}) {
  const pid = DATA.networks[opts.qb] ? opts.qb : networkPassers()[0].id;
  const weeks = tfWeeks(opts.tf);
  const net = windowNetwork(pid, weeks, opts.sit || "all");
  const { shown, others, total } = shapeNet(net.receivers, Number(opts.top) || 8);
  const team = net.team;
  const fr = frame(1600, 900, {
    kicker: [weeksLabel(weeks), SITUATION_WORDS[opts.sit || "all"]].filter(Boolean).join(" · "),
    title: `${net.name}: passing network`, subtitle: "Where his targets go: each receiver's share, depth and side of the field",
    headshot: { pid, name: net.name, ring: teamColor(team) },
  });
  const { pad, w } = fr;
  const fieldW = 900;
  let s = networkField(pad - 6, fr.top, fieldW, fr.bottom - fr.top - 40, net, shown);
  s += networkKey(pad + 44, fr.bottom - 8, { height: false });
  // Side panel: the passer's line, then every receiver's numbers.
  const sx = pad + fieldW + 24, sw = w - pad - sx;
  s += R(sx, fr.top - 6, sw, fr.bottom - fr.top + 6, { rx: 24, fill: "var(--panel)" });
  let y = fr.top + 26;
  const [cmp, att, yards, tdsN, ints] = net.line;
  const lineText = (opts.sit || "all") === "all"
    ? [[`${cmp}/${att}`, "Comp/Att"], [yards.toLocaleString(), "Yards"], [tdsN, "TD"], [ints, "INT"]]
    : [[total, "Targets"], [net.receivers.reduce((a, r) => a + r.receptions, 0), "Catches"], [net.receivers.reduce((a, r) => a + r.touchdowns, 0), "TD"], [net.receivers.reduce((a, r) => a + r.interceptions, 0), "INT"]];
  const cw = (sw - 40) / 4;
  lineText.forEach(([v, k], i) => {
    s += T(sx + 20 + cw * i + cw / 2, y + 22, v, { size: String(v).length > 6 ? 24 : 28, weight: 800, anchor: "middle", mono: true });
    s += T(sx + 20 + cw * i + cw / 2, y + 48, k.toUpperCase(), { size: 13, weight: 750, anchor: "middle", fill: "var(--faint)", ls: 1.1 });
  });
  y += 84;
  s += L(sx + 20, y, sx + sw - 20, y, { stroke: "var(--rule)" });
  y += 30;
  const cols = [["TGT", sw - 262], ["YDS", sw - 190], ["TD", sw - 128], ["EPA/T", sw - 22]];
  cols.forEach(([k, cx]) => { s += T(sx + cx, y, k, { size: 13, weight: 750, anchor: "end", fill: "var(--faint)", ls: 1 }); });
  y += 14;
  const rows = [...shown, ...(others ? [others] : [])];
  const nameW = sw - 262 - 50 - 64, topShare = Math.max(1e-6, ...rows.map((r) => r.share));
  const rowH = Math.min(56, (fr.bottom - y - 8) / Math.max(1, rows.length));
  rows.forEach((r, i) => {
    const cy = y + i * rowH + rowH / 2;
    if (r.others) s += C(sx + 38, cy, 15, { fill: "var(--chip)", stroke: "var(--border-strong)", sw: 2 }) + T(sx + 38, cy + 5, "+", { size: 18, weight: 800, anchor: "middle", fill: "var(--muted)" });
    else s += face(r.player_id, sx + 38, cy, 16, posColor(r.position || "WR"), r.name);
    s += T(sx + 64, cy - 2, fit(r.others ? r.name : lastName(r.name), nameW, 18, 700), { size: 18, weight: 700 });
    const bw = (nameW - 44) * (r.share / topShare);
    s += R(sx + 64, cy + 8, bw, 7, { rx: 3.5, fill: teamColor(team) });
    s += T(sx + 64 + bw + 6, cy + 15, pct(r.share), { size: 13, weight: 600, mono: true, fill: "var(--muted)" });
    s += T(sx + cols[0][1], cy + 6, r.targets, { size: 19, weight: 800, anchor: "end", mono: true });
    s += T(sx + cols[1][1], cy + 6, r.yards, { size: 19, weight: 600, anchor: "end", mono: true });
    s += T(sx + cols[2][1], cy + 6, r.touchdowns, { size: 19, weight: 600, anchor: "end", mono: true });
    s += T(sx + cols[3][1], cy + 6, signed(r.epa_per_target, 2), { size: 18, weight: 700, anchor: "end", mono: true, fill: mix(epaColor(r.epa_per_target), 70, "var(--fg)") });
  });
  return wrapCard(fr, s);
}

// F2 -------------------------------------------------------------- Target analysis
const TA_GROUPS = [["WR", "Receivers"], ["TE", "Tight ends"], ["RB", "Running backs"], ["WR,TE", "Receivers and tight ends"], ["WR,TE,RB", "Receivers, tight ends and backs"]];
const TA_NOUN = { WR: "receivers", TE: "tight ends", RB: "running backs", "WR,TE": "receivers and tight ends", "WR,TE,RB": "pass catchers" };
const TA_MINIMUMS = [4, 8, 12, 25, 50, 75, 100];
const TA_SORTS = { adot: ["aDOT", (p) => p.adot ?? -99], targets: ["targets", (p) => p.targets], deep: ["deep share", (p) => (p.charted ? p.depth[3] / p.charted : 0)], catch: ["catch rate", (p) => (p.targets ? p.receptions / p.targets : 0)] };
/** The site's default minimum: about three targets a week (backs half that). */
const taDefaultMin = (opts) => String([...TA_MINIMUMS].reverse().find((m) => m <= tfWeeks(opts.tf).length * (opts.grp === "RB" ? 1.5 : 3)) ?? 4);
/** Every receiver's targets over some weeks, summed, with his histogram. */
function windowTargets(weeks) {
  const out = [];
  for (const [pid, e] of Object.entries(DATA.receivers)) {
    let t = null;
    const hist = new Array(56).fill(0);
    for (const week of weeks) {
      const row = e.w[week];
      if (!row) continue;
      t = addInto(t || [], row.slice(0, 16));
      for (const [i, c] of row[16]) hist[i] += c;
    }
    if (t && t[0]) out.push(tallyObject(t, { player_id: pid, name: e.n, position: e.pos, team: e.t, hist }));
  }
  return out;
}
/** The site's air-yard curve: a Gaussian-smoothed share of targets at each yard, -10 to 40. */
function airCurve(hist, sigma = 2.6) {
  const total = hist.reduce((a, c) => a + c, 0) || 1;
  const curve = [];
  for (let x = -10; x <= 40; x++) {
    let v = 0;
    hist.forEach((c, i) => { if (c) v += c * Math.exp(-0.5 * ((x - Math.min(40, i - 10)) / sigma) ** 2); });
    curve.push(v / total);
  }
  return curve;
}
function cardTargetAnalysis(_, opts = {}) {
  const weeks = tfWeeks(opts.tf);
  const grp = opts.grp || "WR";
  const positions = grp.split(",");
  const min = Number(opts.min || taDefaultMin(opts));
  const all = windowTargets(weeks);
  const [sortLabel, sortKey] = TA_SORTS[opts.sort] || TA_SORTS.adot;
  const list = all.filter((p) => positions.includes(p.position) && p.targets >= min).sort((a, b) => sortKey(b) - sortKey(a));
  const n = Math.min(Number(opts.n) || 20, list.length);
  const rows = list.slice(0, n);
  const ridge = opts.view === "ridge";
  // The position average: every target to the position in these weeks, whatever the minimum.
  const avgs = positions.map((pos) => {
    const t = all.filter((p) => p.position === pos).reduce((acc, p) => addInto(acc, [p.targets, p.receptions, p.yards, p.touchdowns, p.interceptions, p.first_downs, p.epa, p.air_yards, p.charted, ...p.locations, ...p.depth]), []);
    const hist = new Array(56).fill(0);
    for (const p of all) if (p.position === pos) p.hist.forEach((c, i) => { hist[i] += c; });
    return tallyObject(t, { name: `${pos} average`, position: pos, avg: true, hist });
  });
  const rowH = 50, head = 46;
  const top = 214;
  const h = Math.max(1500, Math.round(top + head + (rows.length + avgs.length) * rowH + 24 + 70 + 120));
  const fr = frame(1200, h, {
    kicker: `${weeksLabel(weeks)} · ${min}+ targets`,
    title: ridge ? `Air yards per target: ${TA_NOUN[grp]}` : `Where ${TA_NOUN[grp]} are targeted`,
    subtitle: ridge ? `Each curve is his share of targets at each depth. Tick: his aDOT. Sorted by ${sortLabel}.` : `Share of targets at each depth past the line of scrimmage. Sorted by ${sortLabel}.`,
  });
  const { pad, w } = fr;
  let s = "";
  let y = fr.top;
  const bx0 = pad + 470, bx1 = w - pad - 196;
  const colTgt = pad + 396, colAdot = pad + 452, colDeep = w - pad - 98, colCatch = w - pad;
  const hd = (x, text, anchor = "end") => T(x, y + 14, text, { size: 14, weight: 750, anchor, fill: "var(--faint)", ls: 1.1 });
  s += hd(pad + 26, "#") + hd(pad + 50, "PLAYER", "start") + hd(colTgt, "TGT") + hd(colAdot, "ADOT") + hd(colDeep, "20+ %") + hd(colCatch, "CATCH %");
  if (ridge) {
    const xr = lin(-10, 40, bx0 + 4, bx1 - 4);
    for (const yd of [-10, 0, 10, 20, 30, 40]) s += T(xr(yd), y + 14, yd > 0 ? `+${yd}` : yd, { size: 13, weight: 600, anchor: "middle", mono: true, fill: "var(--faint)" });
  } else {
    let at = bx0;
    DEPTH_NAMES.forEach(([name], i) => {
      const it = legendItem(at, y + 9, (cx, cy) => R(cx - 8, cy - 8, 16, 16, { rx: 4, fill: DEPTH_FILL[i] }), name, 14);
      s += it.svg; at += it.w + 8;
    });
  }
  y += head;
  const curves = ridge ? [...rows, ...avgs].map((p) => airCurve(p.hist)) : [];
  const cmax = Math.max(1e-6, ...curves.flat());
  const drawRow = (p, i, cy, curve) => {
    let out = "";
    if (p.avg) out += T(pad + 50, cy + 7, p.name, { size: 19, weight: 750, fill: "var(--muted)" });
    else {
      out += T(pad + 26, cy + 6, i + 1, { size: 16, weight: 700, anchor: "end", mono: true, fill: "var(--faint)" });
      out += face(p.player_id, pad + 60, cy, 19, teamColor(p.team), p.name);
      out += T(pad + 90, cy - 1, fit(p.name, 250, 19, 700), { size: 19, weight: 700 });
      out += T(pad + 90, cy + 19, `${p.position} · ${p.team}`, { size: 14, weight: 600, fill: "var(--muted)" });
    }
    out += T(colTgt, cy + 7, p.targets, { size: 19, weight: 650, anchor: "end", mono: true });
    out += T(colAdot, cy + 7, p.adot == null ? "-" : num(p.adot, 1), { size: 19, weight: 800, anchor: "end", mono: true });
    if (ridge) {
      const xr = lin(-10, 40, bx0 + 4, bx1 - 4);
      const base = cy + rowH / 2 - 6, peak = rowH * 1.25;
      out += L(xr(0), cy - rowH / 2 + 4, xr(0), base, { stroke: "var(--plot-rule)", opacity: 0.5 }) + L(xr(20), cy - rowH / 2 + 4, xr(20), base, { stroke: "var(--divider)" });
      const pts = curve.map((v, k) => [xr(k - 10), base - (v / cmax) * peak]);
      out += `<path d="${pathOf(pts)}L${num(xr(40), 1)},${num(base, 1)}L${num(xr(-10), 1)},${num(base, 1)}Z" fill="${mix("var(--series-1)", p.avg ? 18 : 32)}"/>`;
      out += `<path d="${pathOf(pts)}" fill="none" stroke="${p.avg ? "var(--muted)" : "var(--series-1)"}" stroke-width="2.2" stroke-linejoin="round"/>`;
      if (p.adot != null) out += L(xr(p.adot), base - 10, xr(p.adot), base + 4, { stroke: "var(--fg)", sw: 3, cap: "round" });
    } else {
      let at = bx0;
      p.depth.forEach((c, k) => {
        const share = p.charted ? c / p.charted : 0, ww = (bx1 - bx0) * share;
        if (ww > 0.5) out += R(at + 1, cy - 15, Math.max(0, ww - 2), 30, { rx: 5, fill: DEPTH_FILL[k], opacity: p.avg ? 0.6 : 1 });
        // The ramp runs dark to light in the dark theme and light to dark in the light one.
        const light = theme() === "dark" ? k >= 2 : k === 0;
        if (ww > 40) out += T(at + ww / 2, cy + 6, pct(share), { size: 14, weight: 750, anchor: "middle", mono: true, fill: light ? "#0b1426" : "#ffffff" });
        at += ww;
      });
    }
    out += T(colDeep, cy + 7, pct(p.charted ? p.depth[3] / p.charted : 0), { size: 18, weight: 650, anchor: "end", mono: true });
    out += T(colCatch, cy + 7, pct(p.targets ? p.receptions / p.targets : 0), { size: 18, weight: 650, anchor: "end", mono: true });
    return out;
  };
  rows.forEach((p, i) => {
    const cy = y + i * rowH + rowH / 2;
    if (i % 2 === 0) s += R(pad - 10, cy - rowH / 2 + 2, w - pad * 2 + 20, rowH - 4, { rx: 12, fill: "var(--panel)" });
    s += drawRow(p, i, cy, curves[i]);
  });
  y += rows.length * rowH + 12;
  s += L(pad, y, w - pad, y, { stroke: "var(--rule)" });
  avgs.forEach((p, i) => { s += drawRow(p, i, y + 12 + i * rowH + rowH / 2, curves[rows.length + i]); });
  if (!rows.length) s += T(w / 2, fr.top + 200, `No ${TA_NOUN[grp]} have ${min} targets in these weeks`, { size: 22, anchor: "middle", fill: "var(--faint)" });
  s += T(pad, fr.bottom - 2, `Average: every target thrown to the position in these weeks. ${list.length} ${TA_NOUN[grp]} have ${min}+ targets.`, { size: 16, fill: "var(--muted)" });
  return wrapCard(fr, s);
}

// F3 -------------------------------------------------------------- League leaders
// A weekly line: [att, cmp, pass yds, pass TD, INT, car, rush yds, rush TD, tgt, rec, rec yds, rec TD, fumbles lost].
const LEADER_STATS = {
  pass_yds: { label: "Passing yards", v: (t) => t[2], pos: ["QB"], line: (t) => `${t[1]}/${t[0]} · ${t[3]} TD · ${t[4]} INT` },
  pass_td: { label: "Passing TDs", v: (t) => t[3], pos: ["QB"], line: (t) => `${t[2].toLocaleString()} yds · ${t[4]} INT` },
  rush_yds: { label: "Rushing yards", v: (t) => t[6], line: (t) => `${t[5]} car · ${num(t[6] / Math.max(1, t[5]), 1)} avg · ${t[7]} TD` },
  rush_td: { label: "Rushing TDs", v: (t) => t[7], line: (t) => `${t[5]} car · ${t[6]} yds` },
  rec_yds: { label: "Receiving yards", v: (t) => t[10], line: (t) => `${t[9]} rec on ${t[8]} tgt · ${t[11]} TD` },
  receptions: { label: "Receptions", v: (t) => t[9], line: (t) => `${t[8]} tgt · ${t[10]} yds` },
  targets: { label: "Targets", v: (t) => t[8], line: (t) => `${t[9]} rec · ${t[10]} yds` },
  rec_td: { label: "Receiving TDs", v: (t) => t[11], line: (t) => `${t[9]} rec · ${t[10]} yds` },
  scrim: { label: "Scrimmage yards", v: (t) => t[6] + t[10], line: (t) => `${t[6]} rush · ${t[10]} rec` },
  total_td: { label: "Rushing and receiving TDs", v: (t) => t[7] + t[11], line: (t) => `${t[7]} rush · ${t[11]} rec` },
  ypc: { label: "Yards per carry", v: (t) => (t[5] ? t[6] / t[5] : null), rate: true, min: [6.25, "carries"], fmt: (v) => num(v, 2), line: (t) => `${t[5]} car · ${t[6]} yds` },
  ypt: { label: "Yards per target", v: (t) => (t[8] ? t[10] / t[8] : null), rate: true, min: [5, "targets"], fmt: (v) => num(v, 2), line: (t) => `${t[8]} tgt · ${t[10]} yds` },
  cmp_pct: { label: "Completion %", v: (t) => (t[0] ? t[1] / t[0] : null), rate: true, pos: ["QB"], min: [14, "attempts"], fmt: (v) => pct(v, 1), line: (t) => `${t[1]}/${t[0]} · ${t[2].toLocaleString()} yds` },
  ypa: { label: "Yards per attempt", v: (t) => (t[0] ? t[2] / t[0] : null), rate: true, pos: ["QB"], min: [14, "attempts"], fmt: (v) => num(v, 2), line: (t) => `${t[0]} att · ${t[2].toLocaleString()} yds` },
};
const LEADER_OPTIONS = Object.entries(LEADER_STATS).map(([k, v]) => [k, v.label]);
const POS_FILTER = [["all", "All positions"], ["QB", "QB"], ["RB", "RB"], ["WR", "WR"], ["TE", "TE"]];
/** Every player's line summed over some weeks: [{ id, name, pos, team, games, t }]. */
function windowLines(weeks) {
  const out = [];
  for (const [pid, e] of Object.entries(DATA.weekly_lines)) {
    let t = null, games = 0;
    for (const week of weeks) if (e.w[week]) { t = addInto(t || [], e.w[week]); games += 1; }
    if (t) out.push({ id: pid, name: e.n, pos: e.pos, team: e.t, games, t });
  }
  return out;
}
const teamGames = (team, weeks) => Math.max(1, weeks.filter((wk) => DATA.results[team]?.[wk]).length);
function leaderRows(opts) {
  const stat = LEADER_STATS[opts.stat] || LEADER_STATS.rec_yds;
  const weeks = tfWeeks(opts.tf);
  const perGame = opts.per === "game" && !stat.rate;
  let rows = windowLines(weeks).filter((p) => (!stat.pos || stat.pos.includes(p.pos)) && (opts.pos === "all" || !opts.pos || p.pos === opts.pos));
  // Rates need a sample: so many per team game in the window, the way the NFL qualifies its leaders.
  if (stat.min) rows = rows.filter((p) => ({ carries: p.t[5], targets: p.t[8], attempts: p.t[0] })[stat.min[1]] >= stat.min[0] * teamGames(p.team, weeks));
  rows = rows.map((p) => ({ ...p, value: stat.v(p.t) == null ? null : perGame ? stat.v(p.t) / p.games : stat.v(p.t) })).filter((p) => p.value != null && p.value > 0);
  return { stat, weeks, perGame, rows: rows.sort((a, b) => b.value - a.value) };
}
function cardLeaders(_, opts = {}) {
  const { stat, weeks, perGame, rows: all } = leaderRows(opts);
  const n = Math.min(Number(opts.n) || 15, all.length);
  const rows = all.slice(0, n);
  const posWord = opts.pos && opts.pos !== "all" ? ` among ${POS_PLURAL[opts.pos]}` : "";
  const top = 214, rowH = Math.max(66, Math.min(84, (1500 - top - 150) / Math.max(1, n)));
  const h = Math.max(1500, Math.round(top + n * rowH + 30 + 120));
  const fmt = stat.fmt ?? ((v) => (perGame ? num(v, 1) : Math.round(v).toLocaleString()));
  const fr = frame(1200, h, { kicker: `${weeksLabel(weeks)}${perGame ? " · Per game" : ""}`, title: `${stat.label}${perGame ? " per game" : ""}: leaders${posWord}`,
    subtitle: stat.min ? `Minimum ${stat.min[0]} ${stat.min[1]} per team game` : `The top ${n}${posWord}, ${weeks.length === 1 ? "this week" : "over these weeks"}` });
  const { pad, w } = fr;
  const max = Math.max(...rows.map((p) => p.value), 1e-6);
  const bx0 = pad + 430, bx1 = w - pad - 120;
  let s = "";
  rows.forEach((p, i) => {
    const cy = fr.top + i * rowH + rowH / 2;
    const color = teamColor(p.team);
    if (i % 2 === 0) s += R(pad - 10, cy - rowH / 2 + 3, w - pad * 2 + 20, rowH - 6, { rx: 16, fill: "var(--panel)" });
    s += T(pad + 28, cy + 8, i + 1, { size: 22, weight: 800, anchor: "end", mono: true, fill: i < 3 ? "var(--fg)" : "var(--faint)" });
    s += face(p.id, pad + 74, cy, 26, color, p.name);
    s += T(pad + 114, cy - 3, fit(p.name, bx0 - pad - 160, 22, 750), { size: 22, weight: 750 });
    s += T(pad + 114, cy + 22, fit(`${p.pos} · ${p.team} · ${stat.line(p.t)}${perGame ? ` · ${p.games} g` : ""}`, bx0 - pad - 130, 15), { size: 15, fill: "var(--muted)" });
    const bw = (bx1 - bx0) * (p.value / max);
    s += R(bx0, cy - 15, bw, 30, { rx: 8, fill: color, opacity: 0.88 });
    s += logo(p.team, bx0 + 6, cy - 12, 24);
    s += T(bx0 + bw + 12, cy + 9, fmt(p.value), { size: 25, weight: 800, mono: true });
  });
  if (!rows.length) s += T(w / 2, fr.top + 200, "No players in these weeks", { size: 22, anchor: "middle", fill: "var(--faint)" });
  return wrapCard(fr, s);
}

// F4 -------------------------------------------------------------- The race
function cardRace(_, opts = {}) {
  const stat = LEADER_STATS[opts.stat] || LEADER_STATS.rec_yds;
  const W = DATA.recap_week;
  const weeks = Array.from({ length: W }, (_, i) => i + 1);
  const rows = leaderRows({ stat: opts.stat, tf: "season", pos: opts.pos }).rows.slice(0, Number(opts.n) || 8);
  const posWord = opts.pos && opts.pos !== "all" ? `, ${POS_PLURAL[opts.pos]}` : "";
  const fr = frame(1600, 900, { kicker: `${DATA.season} · Weeks 1-${W}`, title: `The ${lowerFirst(stat.label)} race${posWord}`, subtitle: `Season total after each week, the top ${rows.length}. Flat steps are byes and missed games.` });
  const { pad, w } = fr;
  const px0 = pad + 70, px1 = w - pad - 330, py0 = fr.top + 14, py1 = fr.bottom - 46;
  const series = rows.map((p) => {
    const e = DATA.weekly_lines[p.id];
    let run = 0;
    return { p, pts: [[0, 0], ...weeks.map((wk) => { run += e.w[wk] ? stat.v(e.w[wk]) : 0; return [wk, run]; })] };
  });
  const top = Math.max(1, ...series.map((sr) => sr.pts[sr.pts.length - 1][1]));
  const step = niceStep(0, top, 9);
  const ymax = Math.ceil(top / step) * step;
  const x = lin(0, W, px0, px1), y = lin(0, ymax, py1, py0);
  let s = "";
  for (let v = 0; v <= ymax + 1e-9; v += step) s += L(px0, y(v), px1, y(v), { stroke: v ? "var(--divider)" : "var(--plot-rule)", sw: v ? 1 : 1.5 }) + T(px0 - 12, y(v) + 6, Math.round(v).toLocaleString(), { size: 17, anchor: "end", mono: true, fill: "var(--faint)" });
  for (const wk of [0, ...weeks]) s += T(x(wk), py1 + 30, wk ? `W${wk}` : "Start", { size: 17, weight: 700, anchor: "middle", fill: "var(--faint)" });
  // Lines, leader last so it sits on top; distinct team colours where two share one.
  const colors = {};
  series.forEach(({ p }, i) => { colors[p.id] = Object.values(colors).includes(teamColor(p.team)) ? `var(--series-${(i % 5) + 1})` : teamColor(p.team); });
  [...series].reverse().forEach(({ p, pts }, k) => {
    const lead = k === series.length - 1;
    s += `<path d="${pathOf(pts.map(([a, b]) => [x(a), y(b)]))}" fill="none" stroke="${colors[p.id]}" stroke-width="${lead ? 6 : 4}" stroke-linejoin="round" stroke-linecap="round" opacity="${lead ? 1 : 0.85}"/>`;
    pts.slice(1).forEach(([a, b]) => { s += C(x(a), y(b), lead ? 6 : 4.5, { fill: colors[p.id], stroke: "var(--card)", sw: 1.5 }); });
  });
  // End labels, nudged apart vertically and tied back to the line's end.
  const items = series.map(({ p, pts }) => ({ p, ax: x(W), ay: y(pts[pts.length - 1][1]), v: pts[pts.length - 1][1] }));
  const gap = 46;
  items.sort((a, b) => a.ay - b.ay);
  items.forEach((it, i) => { it.y = Math.max(it.ay, i ? items[i - 1].y + gap : py0); });
  const over = items.length ? items[items.length - 1].y - (py1 - 10) : 0;
  if (over > 0) items.forEach((it) => { it.y -= over; });
  for (let i = items.length - 2; i >= 0; i--) items[i].y = Math.min(items[i].y, items[i + 1].y - gap);
  for (const it of items) {
    const lx = px1 + 76;
    s += `<path d="M${num(it.ax, 1)},${num(it.ay, 1)} L${num(it.ax + 12, 1)},${num(it.ay, 1)} L${num(lx - 26, 1)},${num(it.y, 1)}" fill="none" stroke="${colors[it.p.id]}" stroke-width="2" stroke-linejoin="round"/>`;
    s += face(it.p.id, lx, it.y, 20, colors[it.p.id], it.p.name);
    s += T(lx + 30, it.y - 2, fit(lastName(it.p.name), 150, 19, 750), { size: 19, weight: 750 });
    s += T(lx + 30, it.y + 18, `${it.p.team}`, { size: 14, weight: 650, fill: "var(--muted)" });
    s += T(w - pad, it.y + 7, Math.round(it.v).toLocaleString(), { size: 22, weight: 800, anchor: "end", mono: true });
  }
  return wrapCard(fr, s);
}

// F5 -------------------------------------------------------------- Team rankings
// [option id, metric, side, label]; a side reads the team's own plays (o) or opponents' (d).
const TEAM_RANKINGS = [
  ["epa-o", "epa", "o", "Offense: EPA per play"], ["epa-d", "epa", "d", "Defense: EPA per play allowed"], ["net_epa-o", "net_epa", "o", "Net EPA per play"],
  ["ppg-o", "ppg", "o", "Points per game"], ["ppg-d", "ppg", "d", "Points allowed per game"], ["pdiff-o", "pdiff", "o", "Point differential per game"],
  ["suc-o", "suc", "o", "Offense: success rate"], ["suc-d", "suc", "d", "Defense: success rate allowed"],
  ["p_epa-o", "p_epa", "o", "Offense: EPA per dropback"], ["p_epa-d", "p_epa", "d", "Defense: EPA per dropback allowed"],
  ["r_epa-o", "r_epa", "o", "Offense: EPA per designed run"], ["r_epa-d", "r_epa", "d", "Defense: EPA per designed run allowed"],
  ["explosive-o", "explosive", "o", "Offense: explosive play rate"], ["explosive-d", "explosive", "d", "Defense: explosive plays allowed"],
  ["ypp-o", "ypp", "o", "Offense: yards per play"], ["ypp-d", "ypp", "d", "Defense: yards per play allowed"],
  ["pts_drive-o", "pts_drive", "o", "Offense: points per drive"], ["pts_drive-d", "pts_drive", "d", "Defense: points per drive allowed"],
  ["rz_td-o", "rz_td", "o", "Offense: red zone TD rate"], ["rz_td-d", "rz_td", "d", "Defense: red zone TD rate allowed"],
  ["d3-o", "d3", "o", "Offense: third down rate"], ["d3-d", "d3", "d", "Defense: third down rate allowed"],
  ["three_out-o", "three_out", "o", "Offense: three-and-out rate"], ["three_out-d", "three_out", "d", "Defense: three-and-out rate forced"],
  ["tov_g-o", "tov_g", "o", "Giveaways per game"], ["tov_g-d", "tov_g", "d", "Takeaways per game"],
  ["sack_rate-o", "sack_rate", "o", "Sack rate allowed"], ["sack_rate-d", "sack_rate", "d", "Defense: sack rate"],
  ["p_yds_g-o", "p_yds_g", "o", "Passing yards per game"], ["p_yds_g-d", "p_yds_g", "d", "Passing yards allowed per game"],
  ["r_yds_g-o", "r_yds_g", "o", "Rushing yards per game"], ["r_yds_g-d", "r_yds_g", "d", "Rushing yards allowed per game"],
  ["ypc-o", "ypc", "o", "Yards per carry"], ["ypc-d", "ypc", "d", "Yards per carry allowed"],
  ["cpoe-o", "cpoe", "o", "Completion % over expected"], ["adot-o", "adot", "o", "Air yards per attempt"], ["yac-o", "yac", "o", "YAC per completion"],
  ["x_pass-o", "x_pass", "o", "Explosive pass rate"], ["x_run-o", "x_run", "o", "Explosive run rate"], ["stuff-d", "stuff", "d", "Defense: stuff rate"],
  ["pass_rate-o", "pass_rate", "o", "Pass rate"], ["n_pass-o", "n_pass", "o", "Neutral pass rate"], ["proe-o", "proe", "o", "Pass rate over expected"],
  ["sec_snap-o", "sec_snap", "o", "Pace: seconds per snap, neutral"], ["plays_g-o", "plays_g", "o", "Plays per game"], ["start-o", "start", "o", "Starting field position"],
];
function cardTeamRankings(_, opts = {}) {
  const [, metric, side, label] = TEAM_RANKINGS.find((o) => o[0] === opts.m) || TEAM_RANKINGS[0];
  const weeks = tfWeeks(opts.tf);
  const win = DATA.team_windows[opts.tf || "season"] || DATA.team_windows.season;
  const meta = DATA.team_window_meta[metric];
  const vals = Object.entries(win[metric]?.[side] || {}).map(([team, [v, rank]]) => ({ team, v, rank })).filter((r) => r.v != null);
  const better = meta.better[side];
  vals.sort((a, b) => (better ? a.rank - b.rank : b.v - a.v));
  const mean = win[metric]?.[`${side}_mean`];
  const fr = frame(1200, 1500, { kicker: weeksLabel(weeks), title: label, subtitle: better ? "All 32 teams, best to worst. Dashed: league average." : "All 32 teams, most to least. Dashed: league average." });
  const { pad, w } = fr;
  const rowH = (fr.bottom - fr.top) / vals.length;
  const lo = Math.min(0, ...vals.map((r) => r.v)), hi = Math.max(0, ...vals.map((r) => r.v));
  const signedScale = lo < 0;
  const bx0 = pad + 300, bx1 = w - pad - 110;
  const x = signedScale ? lin(lo, hi, bx0, bx1) : lin(0, hi, bx0, bx1);
  const zero = x(0);
  let s = "";
  vals.forEach((r, i) => {
    const cy = fr.top + i * rowH + rowH / 2;
    if (i % 2 === 0) s += R(pad - 10, cy - rowH / 2 + 1, w - pad * 2 + 20, rowH - 2, { rx: 9, fill: "var(--panel)" });
    s += T(pad + 24, cy + 6, i + 1, { size: 16, weight: 700, anchor: "end", mono: true, fill: "var(--faint)" });
    s += logo(r.team, pad + 36, cy - 14, 28);
    const nm = fitSize(TEAMS[r.team]?.name || r.team, bx0 - pad - 96, [18, 17, 16, 15], 650);
    s += T(pad + 74, cy + 7, nm.text, { size: nm.size, weight: 650 });
    const a = Math.min(zero, x(r.v)), b = Math.max(zero, x(r.v));
    s += R(a, cy - rowH * 0.3, Math.max(2, b - a), rowH * 0.6, { rx: 5, fill: teamColor(r.team), opacity: 0.88 });
    const tone = better ? rankColor(r.rank) : "var(--fg)";
    // A negative value is written just right of zero, where its row is empty, so it never meets the names.
    s += T(r.v >= 0 ? b + 10 : zero + 10, cy + 7, teamFmt(r.v, meta.fmt), { size: 18, weight: 800, mono: true, fill: better ? mix(tone, 60, "var(--fg)") : "var(--fg)" });
  });
  if (signedScale) s += L(zero, fr.top, zero, fr.bottom, { stroke: "var(--plot-rule)", sw: 1.5 });
  if (mean != null) s += L(x(mean), fr.top - 4, x(mean), fr.bottom, { stroke: "var(--plot-rule)", dash: "8 7", sw: 1.5 });
  return wrapCard(fr, s);
}

// F6 -------------------------------------------------------------- Team scatter
// Each axis is [metric, side, flip]: flip draws lower values further right or higher up,
// so the good corner is always top right where the metric has a better direction.
const TEAM_SCATTERS = [
  { id: "pass-run", label: "Passing vs running offense", title: "Who moves the ball, and how", x: ["p_epa", "o"], y: ["r_epa", "o"], xl: "EPA per dropback", yl: "EPA per designed run",
    q: ["Passes and runs well", "Runs well", "Passes well", "Struggles at both"] },
  { id: "def-pass-run", label: "Pass defense vs run defense", title: "Which defenses stop the pass, and which stop the run", x: ["p_epa", "d", true], y: ["r_epa", "d", true], xl: "EPA per dropback allowed (better →)", yl: "EPA per run allowed (better ↑)",
    q: ["Stops both", "Stops the run", "Stops the pass", "Stops neither"] },
  { id: "proe", label: "Pass rate over expected vs EPA per dropback", title: "Who throws more than expected, and does it work", x: ["proe", "o"], y: ["p_epa", "o"], xl: "Pass rate over expected", yl: "EPA per dropback",
    q: ["Throws more, and it works", "Runs more, passes well", "Throws more, and it doesn't work", "Runs more, passes poorly"] },
  { id: "points", label: "Points scored vs allowed", title: "Points scored against points allowed", x: ["ppg", "o"], y: ["ppg", "d", true], xl: "Points per game", yl: "Points allowed per game (better ↑)",
    q: ["Scores and stops", "Wins with defense", "Wins shootouts", "Neither"] },
  { id: "explosive", label: "Success rate vs explosive play rate", title: "Steady or explosive offenses", x: ["suc", "o"], y: ["explosive", "o"], xl: "Success rate", yl: "Explosive play rate",
    q: ["Steady and explosive", "Big plays, little else", "Steady, few big plays", "Neither"] },
  { id: "pace", label: "Pace vs neutral pass rate", title: "Who plays fast, and who throws", x: ["sec_snap", "o", true], y: ["n_pass", "o"], xl: "Seconds per snap, neutral (faster →)", yl: "Neutral pass rate",
    q: ["Fast and pass-heavy", "Slow and pass-heavy", "Fast and run-heavy", "Slow and run-heavy"] },
];
function cardTeamScatter(_, opts = {}) {
  const cfg = TEAM_SCATTERS.find((c) => c.id === opts.chart) || TEAM_SCATTERS[0];
  const picked = new Set(opts.hl || []);
  const weeks = tfWeeks(opts.tf);
  const win = DATA.team_windows[opts.tf || "season"] || DATA.team_windows.season;
  const read = ([m, side]) => win[m]?.[side] || {};
  const xs = read(cfg.x), ys = read(cfg.y);
  const teams = Object.keys(xs).filter((t) => xs[t]?.[0] != null && ys[t]?.[0] != null);
  const fr = frame(1600, 900, { kicker: weeksLabel(weeks), title: cfg.title, subtitle: `${cfg.xl.replace(/ \(.*\)$/, "")} against ${lowerFirst(cfg.yl.replace(/ \(.*\)$/, ""))}, all 32 teams` });
  const { pad, w } = fr;
  const fx = DATA.team_window_meta[cfg.x[0]].fmt, fy = DATA.team_window_meta[cfg.y[0]].fmt;
  const xv = teams.map((t) => xs[t][0]), yv = teams.map((t) => ys[t][0]);
  const padX = (Math.max(...xv) - Math.min(...xv)) * 0.06, padY = (Math.max(...yv) - Math.min(...yv)) * 0.08;
  const xr = [Math.min(...xv) - padX, Math.max(...xv) + padX], yr = [Math.min(...yv) - padY, Math.max(...yv) + padY];
  const px0 = pad + 80, px1 = w - pad - 10, py0 = fr.top + 6, py1 = fr.bottom - 50;
  const x = cfg.x[2] ? lin(xr[1], xr[0], px0, px1) : lin(xr[0], xr[1], px0, px1);
  const y = cfg.y[2] ? lin(yr[1], yr[0], py1, py0) : lin(yr[0], yr[1], py1, py0);
  let s = "";
  const xstep = niceStep(xr[0], xr[1], 6), ystep = niceStep(yr[0], yr[1], 5);
  for (const v of axisTicks(xr[0], xr[1], xstep)) s += L(x(v), py0, x(v), py1) + T(x(v), py1 + 30, teamFmt(v, fx), { size: 17, anchor: "middle", mono: true, fill: "var(--faint)" });
  for (const v of axisTicks(yr[0], yr[1], ystep)) s += L(px0, y(v), px1, y(v)) + T(px0 - 12, y(v) + 6, teamFmt(v, fy), { size: 17, anchor: "end", mono: true, fill: "var(--faint)" });
  const mx = median(xv), my = median(yv);
  s += L(x(mx), py0, x(mx), py1, { stroke: "var(--plot-rule)", dash: "8 7", sw: 1.5 }) + L(px0, y(my), px1, y(my), { stroke: "var(--plot-rule)", dash: "8 7", sw: 1.5 });
  s += T((px0 + px1) / 2, py1 + 62, cfg.xl.includes("→") ? cfg.xl : `${cfg.xl} →`, { size: 19, weight: 650, anchor: "middle", fill: "var(--muted)" });
  s += `<text transform="translate(${pad + 8},${(py0 + py1) / 2}) rotate(-90)" text-anchor="middle" font-size="19" font-weight="650" fill="var(--muted)">${esc(cfg.yl.includes("↑") ? cfg.yl : `${cfg.yl} →`)}</text>`;
  const size = 58;
  const items = teams.map((t) => ({ t, ax: x(xs[t][0]), ay: y(ys[t][0]), r: size * 0.42 }));
  relax(items, { r: size * 0.42, bounds: { x0: px0 + size / 2, x1: px1 - size / 2, y0: py0 + size / 2, y1: py1 - size / 2 }, iterations: 80 });
  for (const it of items) {
    if (Math.hypot(it.x - it.ax, it.y - it.ay) > 10) s += L(it.ax, it.ay, it.x, it.y, { stroke: "var(--muted)", sw: 1.2 }) + C(it.ax, it.ay, 3, { fill: "var(--muted)" });
    const on = !picked.size || picked.has(it.t);
    s += on ? logo(it.t, it.x - size / 2, it.y - size / 2, size) : `<g opacity="0.22">${logo(it.t, it.x - size / 2, it.y - size / 2, size)}</g>`;
  }
  for (const it of items) {
    const tip = [TEAMS[it.t]?.name || it.t, `${cfg.xl.replace(/ \(.*\)$/, "")}: ${teamFmt(xs[it.t][0], fx)} (${ord(xs[it.t][1])})`, `${cfg.yl.replace(/ \(.*\)$/, "")}: ${teamFmt(ys[it.t][0], fy)} (${ord(ys[it.t][1])})`].join("|");
    s += `<rect class="hit" x="${num(it.x - size / 2, 1)}" y="${num(it.y - size / 2, 1)}" width="${size}" height="${size}" fill="transparent" data-pid="${it.t}" data-tip="${esc(tip)}"/>`;
  }
  const boxes = items.map((it) => [it.x - size / 2, it.y - size / 2, it.x + size / 2, it.y + size / 2]);
  s += quadrantLabels({ px0, px1, py0, py1, mx: x(mx), my: y(my), boxes, labels: [
    [cfg.q[0], mix("var(--pos)", 72, "var(--fg)")], [cfg.q[1]], [cfg.q[2]], [cfg.q[3], mix("var(--neg)", 72, "var(--fg)")]] });
  s += T(px1, py0 + 2 - 14, "Dashed: league medians", { size: 16, anchor: "end", fill: "var(--faint)" });
  return wrapCard(fr, s);
}
