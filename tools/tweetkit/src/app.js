// The review page: pickers, per-card controls, theme, export, the lightbox, and the solo
// mode render.mjs drives.

// Pools and defaults for the controls under a card.
const posOf = (pid) => DATA.players[pid]?.pos;
const playerName = (pid) => DATA.players[pid]?.name ?? pid;
const POS_OPTIONS = [["RB", "Running backs"], ["WR", "Receivers"], ["TE", "Tight ends"]];
const FINISH_OPTIONS = [["QB", "Quarterbacks"], ["RB", "Running backs"], ["WR", "Receivers"], ["TE", "Tight ends"]];
const teamPool = () => DATA.landscape.map((t) => ({ id: t.team, name: TEAMS[t.team]?.name || t.team }));
const rows = (list) => list.map((p) => ({ id: p.player_id, name: p.name, team: p.team_abbreviation ?? p.team }));
const CAP_OPTIONS = [["25", "Top 25 in points"], ["50", "Top 50 in points"], ["100", "Top 100 in points"], ["all", "Every qualified player"]];
/**
 * A scatter's Faces control and its Numbers control: the players picked under Numbers get a
 * face and their actual values printed under it. Both draw from the same pool.
 */
const facesAndNumbers = (pool, defaults) => [
  { key: "hl", type: "highlight", label: "Faces", pool, defaults },
  { key: "nums", type: "numbers", label: "Numbers", pool, defaults: () => [] },
];
/** One card per position for the app's Scatter page charts. */
const scatterCard = (pos, id) => ({
  id, name: `${pos} scatter plots`, fn: (_, opts) => cardScatter(pos, opts), wide: true, isNew: true,
  note: `Every ${pos} chart on the site's Scatter page. Hover a dot to see who it is; click it for his face, again for his numbers, again to clear.`,
  controls: [
    { key: "chart", type: "select", label: "Chart", options: SCATTERS[pos].map((s) => [s.id, s.label]), defaults: () => SCATTERS[pos][0].id },
    { key: "cap", type: "select", label: "Players", options: CAP_OPTIONS, defaults: () => "50" },
    ...facesAndNumbers((_, o) => rows(scatterRows(pos, scatterPreset(pos, o.chart), o.cap)), (_, o) => defaultScatterFaces(pos, o)),
  ],
});

const GROUPS = {
  recap: [
    { id: "A1", name: "Final", fn: cardFinal, pick: true, note: "Score, line, win probability and each team's top three scorers. The one to post after every game." },
    { id: "A2", name: "Fantasy box score", fn: cardBox, note: "Everyone who touched the ball: points against his average coming in, and the week's finish." },
    { id: "A3", name: "Win probability", fn: cardWp, wide: true, note: "The game's swings, numbered and described. For close or wild games." },
    { id: "A4", name: "Who got the ball", fn: cardTouches, wide: true, pick: true, note: "Every target and carry on the game clock. Shows a backfield split or a receiver taking over." },
    { id: "A5", name: "Team stats", fn: cardTeamStats, pick: true, note: "The team box with each number ranked against the week, and EPA per play by quarter." },
    { id: "A6", name: "Drive chart", fn: cardDrives, isNew: true, note: "Every possession from where it started toward the end zone, with how it ended." },
    { id: "A7", name: "Points against expected", fn: cardGameExpected, wide: true, isNew: true, note: "Every player in the game: what he scored against what his work was worth.",
      controls: facesAndNumbers((g) => rows(g.players.map((p) => ({ ...p, team_abbreviation: p.team }))), (g) => defaultGameExpected(g)) },
    { id: "A8", name: "Every snap", fn: cardEverySnap, wide: true, isNew: true, note: "The EPA of every pass and run on the game clock, one lane per offense, with the four biggest plays numbered and described." },
    { id: "A9", name: "Passing charts", fn: cardPassingCharts, wide: true, isNew: true, note: "Both starting quarterbacks' targeted throws by depth and side, with their lines, depth of throw and EPA per target." },
  ],
  preview: [
    { id: "B1", name: "Matchup", fn: cardMatchup, note: "Line, implied totals, last five against the spread, four players to watch per side." },
    { id: "B2", name: "Fantasy matchup", fn: cardPreviewFantasy, pick: true, note: "Each skill player's PPG, expected PPG, weekly finishes and matchup grade." },
    { id: "B3", name: "Tale of the tape", fn: cardTape, wide: true, pick: true, note: "Both offenses side by side, then both defenses, rank against rank." },
    { id: "B4", name: "Usage by week", fn: cardPreviewUsage, wide: true, pick: true, note: "Target and carry share every week for each team's main pieces, with snap share under each." },
    { id: "B6", name: "EPA by game", fn: cardTrend, wide: true, isNew: true, note: "Both offenses and both defenses game by game this season, against the league's middle half." },
    { id: "B7", name: "How they play", fn: cardHowTheyPlay, wide: true, isNew: true, note: "Both teams' tendencies against the league: pass rate over expected, pace, motion, play action on offense; blitzes, rushers and stacked boxes on defense." },
  ],
  weekly: [
    { id: "C1", name: "Team landscape", fn: cardLandscape, wide: true, pick: true, note: "Offense against defense EPA for all 32 teams. Hover a logo for the numbers; click it (or pick it below) to highlight that team with its numbers and fade the rest.",
      controls: [{ key: "hl", type: "highlight", label: "Highlight", pool: teamPool, defaults: () => [] }] },
    { id: "C2", name: "Implied team totals", fn: cardImplied, note: "Every offense on the slate ranked by its implied total. Thursday, once lines settle." },
    { id: "C3", name: "Matchups by position", fn: cardMatchupMap, pick: true, note: "Points each opponent allows to QB, RB, WR and TE, for every offense on the slate." },
    { id: "C4", name: "Top scorers", fn: cardWeekTop, pick: true, note: "The week's top ten at each position. Monday night or Tuesday morning." },
    { id: "C5", name: "Usage risers and fallers", fn: cardRisers, pick: true, note: "Biggest moves in expected points per game, last three weeks against the three before. Full games only." },
    { id: "C6", name: "Running back workload", fn: cardBackfield, wide: true, pick: true, note: "Carry share against target share for every back.",
      controls: facesAndNumbers(() => rows(DATA.rb_work), () => defaultBackfield()) },
    { id: "C7", name: "Who is earning targets", fn: cardRoutes, wide: true, isNew: true, note: "Route participation against targets per route run for every receiver with 50+ routes.",
      controls: facesAndNumbers(() => rows(DATA.routes_pool), () => defaultRoutes()) },
    { id: "C8", name: "Points against expected", fn: cardExpected, wide: true, isNew: true, note: "Points per game against expected points per game, by position. Above the line is running hot.",
      controls: [
        { key: "pos", type: "select", label: "Position", options: POS_OPTIONS, defaults: () => "WR", resets: ["hl", "nums"] },
        ...facesAndNumbers((_, o) => rows(DATA.xva_pool[o.pos]), (_, o) => defaultExpected(o.pos)),
      ] },
    { id: "C9", name: "Weekly finishes", fn: cardFinishes, isNew: true, note: "A position's top scorers and where each finished every week, in starting-lineup colours.",
      controls: [{ key: "pos", type: "select", label: "Position", options: FINISH_OPTIONS, defaults: () => "WR" }] },
    scatterCard("QB", "C10"), scatterCard("RB", "C11"), scatterCard("WR", "C12"), scatterCard("TE", "C13"),
    { id: "C14", name: "Team scatter plots", fn: cardTeamScatter, wide: true, isNew: true, note: "Nine team questions on EPA, success, explosive plays, pace and tendencies, every team as its logo. Pick teams to highlight them with their numbers and ranks.",
      controls: [
        { key: "chart", type: "select", label: "Chart", options: TEAM_SCATTERS.map((t) => [t.id, t.label]), defaults: () => TEAM_SCATTERS[0].id },
        { key: "hl", type: "highlight", label: "Highlight", pool: teamPool, defaults: () => [] },
      ] },
    { id: "C15", name: "Quarterback efficiency", fn: cardQbLadder, isNew: true, note: "Every starter's EPA per play beside his completion % over expected, best to worst." },
    { id: "C16", name: "Before and after contact", fn: cardContact, isNew: true, note: "Each back's yards per carry split at first contact: the line's share and his own, with rush yards over expected." },
    { id: "C17", name: "Next Gen scatter plots", fn: cardNgsScatter, wide: true, isNew: true, note: "Tracking and charting questions for every position: time to throw, pressure, stacked boxes, separation, YAC over expected.",
      controls: [
        { key: "chart", type: "select", label: "Chart", options: NGS_SCATTERS.map((c) => [c.id, c.label]), defaults: () => NGS_SCATTERS[0].id },
        { key: "cap", type: "select", label: "Players", options: CAP_OPTIONS, defaults: () => "50" },
        ...facesAndNumbers((_, o) => rows(ngsRows(ngsPreset(o.chart), o.cap)), (_, o) => defaultNgsFaces(o)),
      ] },
    { id: "C18", name: "How every offense plays", fn: cardTendencies, isNew: true, note: "All 32 offenses' tendencies in one table: pass rate over expected, pace, shotgun, motion, play action, RPO, screens, no huddle, depth.",
      controls: [{ key: "sort", type: "select", label: "Sort by", options: TENDENCY_COLS.map((c) => [c[0], `${c[1]} ${c[2]}`.trim()]), defaults: () => "proe" }] },
  ],
  player: [
    { id: "D1", name: "Player profile", fn: cardProfile, pick: true, note: "Stat tiles grouped by phase, percentiles among his position, every week's finish." },
    { id: "D6", name: "Head to head", fn: cardH2H, isNew: true, note: "Two players at one position, side by side: the same numbers and percentiles, the better one bold.",
      controls: [{ key: "vs", type: "player", label: "Against", pool: (pid) => Object.values(DATA.players).filter((o) => o.pos === posOf(pid) && o.id !== pid).sort((a, b) => b.season.fantasy_points - a.season.fantasy_points), defaults: (pid) => defaultRival(pid) }] },
    { id: "D2", name: "Week by week", fn: cardGameLog, wide: true, note: "Each week's points against expected points, with the finish and his usage." },
    { id: "D3", name: "Usage by week", fn: cardUsage, wide: true, pick: true, note: "Snap, route, target and air yards share (carry share for backs, volume for quarterbacks)." },
    { id: "D7", name: "Where the points come from", fn: cardSources, wide: true, isNew: true, note: "Each week's points split into yards, catches and touchdowns, with the season's split beside it." },
    { id: "D5", name: "Every target", fn: cardTargets, note: "Each target by depth and side. Quarterbacks get every throw, backs get every carry by gap." },
    { id: "D8", name: "Advanced percentiles", fn: cardAdvanced, isNew: true, note: "NFL numbers, not fantasy ones: efficiency, Next Gen tracking and PFR charting, each a percentile among his position. Blue rows are a style, not a grade." },
    { id: "D9", name: "Passing network", fn: cardNetwork, wide: true, isNew: true, note: "Who the quarterback throws to: each receiver at his depth and side, line width for targets, colour for EPA. A receiver's card shows his quarterback's network with him marked." },
  ],
  team: [
    { id: "E1", name: "Team profile", fn: cardTeamProfile, isNew: true, note: "Scoring, EPA, offense against defense, how they play and fantasy points by position, all ranked." },
    { id: "E2", name: "Who gets the work", fn: cardTeamShare, wide: true, isNew: true, note: "Each week's share of the targets and carries, by player." },
    { id: "E3", name: "EPA game by game", fn: cardTeamTrend, wide: true, isNew: true, note: "Offense and defense EPA per play in every game, with the result." },
    { id: "E4", name: "Red zone pecking order", fn: cardTeamRedZone, wide: true, isNew: true, note: "Who gets the targets and carries inside the 20, and each player's share." },
    { id: "E5", name: "Where they rank", fn: cardFingerprint, isNew: true, note: "Eleven efficiency numbers on offense and defense, each a strip of all 32 teams with this one's logo on it." },
    { id: "E6", name: "Where they throw", fn: cardPassZones, wide: true, isNew: true, note: "Every target in twelve zones by depth and side: EPA per target against the league there, and who gets the ball." },
    { id: "E7", name: "Where they run", fn: cardRunGaps, wide: true, isNew: true, note: "Designed runs by gap along the line: share against the league, EPA, yards per carry and success rate." },
  ],
};
const NOTES = {
  recap: "<b>My picks:</b> A1 after every game you post about. A4 when the story is who got the work. A7 when someone ran hot or cold against his usage.",
};

// Open on the week's highest-scoring game, the preview with the highest total, and the
// team with the best point margin.
const topIndex = (list, value) => list.reduce((best, item, i) => (value(item) > value(list[best]) ? i : best), 0);
const state = {
  recap: topIndex(DATA.recaps, (g) => (g.header.away.score ?? 0) + (g.header.home.score ?? 0)),
  preview: topIndex(DATA.previews, (g) => g.header.total_line ?? 0),
  player: null,
  team: Object.values(DATA.teams_cards).sort((a, b) => (b.stats.pdiff?.o?.[0] ?? 0) - (a.stats.pdiff?.o?.[0] ?? 0))[0]?.team,
  opts: {},
};
/** A player by id or by name (any case), for ?player= in solo mode. */
function findPlayer(key) {
  if (!key) return null;
  if (DATA.players[key]) return key;
  const want = key.toLowerCase().replace(/[^a-z]/g, "");
  return Object.values(DATA.players).find((p) => p.name.toLowerCase().replace(/[^a-z]/g, "") === want)?.id ?? null;
}

// ------------------------------------------------------------- card controls
const argKey = (arg) => (arg == null ? "-" : typeof arg === "string" ? arg : arg.id);
/** A card's options for this game, player or team: what was picked, else the defaults. */
function optsFor(card, arg) {
  const saved = state.opts[`${card.id}|${argKey(arg)}`] || {};
  const out = {};
  for (const c of card.controls || []) out[c.key] = saved[c.key] !== undefined ? saved[c.key] : c.defaults(arg, out);
  return out;
}
function setOpt(card, arg, key, value) {
  const k = `${card.id}|${argKey(arg)}`;
  const saved = { ...(state.opts[k] || {}), [key]: value };
  for (const reset of card.controls.find((c) => c.key === key)?.resets || []) delete saved[reset];
  state.opts[k] = saved;
}
function controlsHtml(card, arg, opts) {
  return (card.controls || []).map((c) => {
    if (c.type === "select") {
      return `<label class="ctrl"><span>${c.label}</span><select data-key="${c.key}">${c.options.map(([v, label]) => `<option value="${v}"${opts[c.key] === v ? " selected" : ""}>${label}</option>`).join("")}</select></label>`;
    }
    if (c.type === "player") {
      return `<label class="ctrl"><span>${c.label}</span><select data-key="${c.key}">${c.pool(arg).map((p) => `<option value="${p.id}"${opts[c.key] === p.id ? " selected" : ""}>${esc(p.name)} (${p.team})</option>`).join("")}</select></label>`;
    }
    const pool = c.pool(arg, opts);
    const named = Object.fromEntries(pool.map((p) => [p.id, p]));
    const listId = `dl-${card.id}`;
    const chips = (opts[c.key] || []).filter((id) => named[id]).map((id) => `<span class="hchip">${esc(named[id].name)}<button type="button" data-remove="${esc(id)}" data-key="${c.key}" aria-label="Remove ${esc(named[id].name)}">×</button></span>`).join("");
    return `<div class="ctrl hl"><span>${c.label}</span><div class="chips">${chips || '<span class="none">None</span>'}</div>
      <input type="text" list="${listId}" data-add="${c.key}" placeholder="Add a name" aria-label="Add to ${c.label.toLowerCase()}">
      <datalist id="${listId}">${pool.filter((p) => !(opts[c.key] || []).includes(p.id)).map((p) => `<option value="${esc(p.name)}${p.team ? ` (${p.team})` : ""}"></option>`).join("")}</datalist>
      <button type="button" class="link" data-reset="${c.key}">Reset</button><button type="button" class="link" data-clear="${c.key}">Clear</button></div>`;
  }).join("");
}

// --------------------------------------------------------------------- render
const GROUP_ARG = { recap: () => DATA.recaps[state.recap], preview: () => DATA.previews[state.preview], weekly: () => null, player: () => state.player, team: () => state.team };
const GRID = { recap: "recap-grid", preview: "preview-grid", weekly: "weekly-grid", player: "player-grid", team: "team-grid" };
function drawCard(card, arg) {
  try { return card.fn(arg, optsFor(card, arg)); } catch (error) {
    console.error(card.id, error);
    return `<div style="padding:40px;color:var(--neg)">${card.id} failed: ${esc(error.message)}</div>`;
  }
}
function figure(card, arg) {
  const svg = drawCard(card, arg);
  const [w, h] = (svg.match(/viewBox="0 0 (\d+) (\d+)"/) || []).slice(1);
  const ctrls = card.controls ? `<div class="controls-row">${controlsHtml(card, arg, optsFor(card, arg))}</div>` : "";
  return `<figure class="${card.wide ? "wide" : ""}" data-card="${card.id}"><div class="shot">${svg}</div>${ctrls}
    <figcaption><b>${card.id} · ${card.name}</b><span class="size">${w} × ${h}</span>${card.pick ? '<span class="badge">Pick</span>' : ""}${card.isNew ? '<span class="badge new">New</span>' : ""}
    <span class="actions"><button type="button" class="act" data-save>Save PNG</button><button type="button" class="act" data-copy>Copy image</button></span>
    <span class="note">${card.note}</span></figcaption></figure>`;
}
function renderGroup(group) {
  const arg = GROUP_ARG[group]();
  let html = GROUPS[group].map((card) => figure(card, arg)).join("");
  if (NOTES[group]) html += `<figure><div class="callout">${NOTES[group]}</div></figure>`;
  document.getElementById(GRID[group]).innerHTML = html;
}
function rerenderCard(group, card) {
  const el = document.querySelector(`figure[data-card="${card.id}"]`);
  if (el) el.outerHTML = figure(card, GROUP_ARG[group]());
}
function renderAll() {
  for (const group of Object.keys(GROUPS)) renderGroup(group);
  syncPlayerPickers();
}
function syncPlayerPickers() {
  for (const b of document.querySelectorAll("#quick button")) b.setAttribute("aria-pressed", String(b.dataset.pid === state.player));
  document.getElementById("player-pick").value = state.player;
  document.getElementById("team-pick").value = state.team;
}

// ---------------------------------------------------------------- export
// A card is an SVG drawn with CSS variables and the page's web fonts. Drawn as an image,
// it sees neither, so the export copies it, writes every colour out as a plain value,
// embeds the two fonts, and rasterises it at twice its size.
const probe = document.createElement("span");
probe.style.cssText = "position:absolute;left:-9999px;top:0";
const paintCache = new Map();
function plainColor(value) {
  const key = `${theme()}|${value}`;
  if (!paintCache.has(key)) {
    if (!probe.isConnected) document.body.appendChild(probe);
    probe.style.color = "";
    probe.style.color = value;
    let out = getComputedStyle(probe).color;
    const m = out.match(/^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)$/);
    if (m) out = `rgba(${Math.round(m[1] * 255)}, ${Math.round(m[2] * 255)}, ${Math.round(m[3] * 255)}, ${m[4] ?? 1})`;
    paintCache.set(key, out);
  }
  return paintCache.get(key);
}
async function cardPng(svgEl, scale = 2) {
  const clone = svgEl.cloneNode(true);
  for (const el of [clone, ...clone.querySelectorAll("*")]) {
    for (const attr of ["fill", "stroke"]) {
      const v = el.getAttribute(attr);
      if (v && (v.includes("var(") || v.includes("color-mix("))) el.setAttribute(attr, plainColor(v));
    }
  }
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = window.FONT_FACES || "";
  clone.insertBefore(style, clone.firstChild);
  const W = Number(clone.getAttribute("width")), H = Number(clone.getAttribute("height"));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = W * scale;
    canvas.height = H * scale;
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The image is too large to draw."))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** What a card shows, for its file name: the game, player, team or week, then its chosen chart or position. */
function subjectFor(group, card, arg) {
  const base = group === "player" ? playerName(arg) : group === "team" ? arg : arg?.id ?? `week-${DATA.recap_week}`;
  const o = optsFor(card, arg);
  const extra = (card.controls || []).filter((c) => c.type !== "highlight" && c.type !== "numbers").map((c) => (c.type === "player" ? `vs ${playerName(o[c.key])}` : o[c.key]));
  return [base, ...extra].join(" ");
}
function fileName(group, card) {
  return `${card.id}-${slug(subjectFor(group, card, GROUP_ARG[group]()))}-${theme()}.png`;
}
let toastTimer;
function toast(text) {
  const el = document.getElementById("toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}
/** Where a save cannot run (a local copy, a viewer without downloads), show the image to save by hand. */
function showForManualSave(blob, name) {
  const box = document.getElementById("lightbox");
  const url = URL.createObjectURL(blob);
  box.querySelector(".frame").innerHTML = `<img src="${url}" alt="${esc(name)}"><p class="hint">Right-click or long-press the image to save it.</p>`;
  box.classList.add("open");
}
async function saveCard(group, card, svgEl) {
  const name = fileName(group, card);
  let blob;
  try { blob = await cardPng(svgEl); } catch (error) { toast(`Could not draw the image: ${error.message}`); return; }
  const downloads = await window.claude?.use?.("downloads").catch(() => null);
  if (!downloads) { showForManualSave(blob, name); return; }
  try {
    await downloads.save({ filename: name, data: blob });
    toast(`Saved ${name}`);
  } catch (error) {
    if (error?.code === "declined") return;
    if (error?.code === "rate_limited") { toast("A save is already waiting for an answer."); return; }
    showForManualSave(blob, name);
  }
}
function copyCard(svgEl) {
  // The promise goes into the ClipboardItem so the write starts inside the click.
  const png = cardPng(svgEl);
  try {
    navigator.clipboard.write([new ClipboardItem({ "image/png": png })]).then(
      () => toast("Image copied. Paste it into a post."),
      () => toast("Copying images is blocked here. Use Save PNG."),
    );
  } catch (error) {
    toast("Copying images is blocked here. Use Save PNG.");
  }
}

/**
 * What a click on a chart point does next, and the hint that says so. With a Numbers
 * control the click cycles: add his face, then show his numbers, then take both off.
 * A team chart has one Highlight control, and a click turns it on or off.
 */
function clickStep(card, arg, id) {
  const o = optsFor(card, arg);
  const faces = card.controls.find((c) => c.type === "highlight"), nums = card.controls.find((c) => c.type === "numbers");
  const f = o[faces.key] || [], n = nums ? o[nums.key] || [] : [];
  const team = !!TEAMS[id];
  if (!nums) return f.includes(id)
    ? { next: { [faces.key]: f.filter((x) => x !== id) }, hint: team ? "Click to undo the highlight" : "Click to remove his face" }
    : { next: { [faces.key]: [...f, id] }, hint: team ? "Click to highlight this team and show its numbers" : "Click to add his face" };
  if (!f.includes(id) && !n.includes(id)) return { next: { [faces.key]: [...f, id] }, hint: "Click to add his face" };
  if (!n.includes(id)) return { next: { [nums.key]: [...n, id] }, hint: "Click again to show his numbers" };
  return { next: { [faces.key]: f.filter((x) => x !== id), [nums.key]: n.filter((x) => x !== id) }, hint: "Click to remove his face and numbers" };
}

// --------------------------------------------------------------------- setup
function cardFromEvent(e) {
  const fig = e.target.closest("figure[data-card]");
  if (!fig) return {};
  const group = Object.keys(GROUPS).find((g) => GROUPS[g].some((c) => c.id === fig.dataset.card));
  return { fig, group, card: GROUPS[group].find((c) => c.id === fig.dataset.card) };
}
function setup() {
  document.getElementById("lede-week").textContent = DATA.recap_week;
  const recapPick = document.getElementById("recap-pick");
  recapPick.setAttribute("aria-label", `Week ${DATA.recap_week} game`);
  recapPick.innerHTML = DATA.recaps.map((g, i) => `<option value="${i}">${g.header.away.abbreviation} ${g.header.away.score} @ ${g.header.home.abbreviation} ${g.header.home.score}</option>`).join("");
  recapPick.value = state.recap;
  recapPick.addEventListener("change", () => { state.recap = Number(recapPick.value); renderGroup("recap"); });

  const previewPick = document.getElementById("preview-pick");
  previewPick.setAttribute("aria-label", `Week ${DATA.preview_week} game`);
  previewPick.innerHTML = DATA.previews.map((g, i) => { const k = kickoff(g.header); return `<option value="${i}">${g.header.away.abbreviation} @ ${g.header.home.abbreviation} · ${k.day.slice(0, 3)} ${k.time}</option>`; }).join("");
  previewPick.value = state.preview;
  previewPick.addEventListener("change", () => { state.preview = Number(previewPick.value); renderGroup("preview"); });

  const byPos = { QB: [], RB: [], WR: [], TE: [] };
  for (const p of Object.values(DATA.players)) byPos[p.pos]?.push(p);
  for (const list of Object.values(byPos)) list.sort((a, b) => b.season.fantasy_points - a.season.fantasy_points);
  const playerPick = document.getElementById("player-pick");
  playerPick.innerHTML = Object.entries(byPos).map(([pos, list]) => `<optgroup label="${pos}">${list.map((p, i) => `<option value="${p.id}">${pos}${i + 1} · ${esc(p.name)} (${p.team})</option>`).join("")}</optgroup>`).join("");
  const quick = ["WR", "RB", "QB", "TE"].flatMap((pos) => byPos[pos].slice(0, 2));
  quick.push(...["Malik Nabers", "Ashton Jeanty", "Puka Nacua"].map((n) => Object.values(DATA.players).find((p) => p.name === n)).filter(Boolean));
  document.getElementById("quick").innerHTML = quick.map((p) => `<button type="button" data-pid="${p.id}">${esc(p.name)}</button>`).join("");
  state.player = byPos.WR[0].id;
  playerPick.addEventListener("change", () => { state.player = playerPick.value; renderGroup("player"); syncPlayerPickers(); });
  document.getElementById("quick").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { state.player = b.dataset.pid; renderGroup("player"); syncPlayerPickers(); } });

  const teamPick = document.getElementById("team-pick");
  teamPick.innerHTML = Object.keys(DATA.teams_cards).sort((a, b) => (TEAMS[a]?.name || a).localeCompare(TEAMS[b]?.name || b))
    .map((t) => `<option value="${t}">${esc(TEAMS[t]?.name || t)}</option>`).join("");
  teamPick.value = state.team;
  teamPick.addEventListener("change", () => { state.team = teamPick.value; renderGroup("team"); });

  for (const b of document.querySelectorAll("[data-theme-set]")) {
    b.addEventListener("click", () => {
      try { localStorage.setItem("tweet-theme", b.dataset.themeSet); } catch (e) { /* storage blocked */ }
      document.documentElement.setAttribute("data-theme", b.dataset.themeSet);
    });
  }
  try {
    const saved = localStorage.getItem("tweet-theme");
    if (saved === "light" || saved === "dark") document.documentElement.setAttribute("data-theme", saved);
  } catch (e) { /* storage blocked */ }
  const syncToggle = () => { for (const o of document.querySelectorAll("[data-theme-set]")) o.setAttribute("aria-pressed", String(o.dataset.themeSet === theme())); };
  syncToggle();
  // Logos swap between their light and dark files, so a theme change redraws the cards.
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => { syncToggle(); renderAll(); });
  new MutationObserver(() => { syncToggle(); renderAll(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  // Card controls and actions, delegated.
  document.body.addEventListener("change", (e) => {
    const { group, card } = cardFromEvent(e);
    if (!card) return;
    const arg = GROUP_ARG[group]();
    if (e.target.matches("select[data-key]")) { setOpt(card, arg, e.target.dataset.key, e.target.value); rerenderCard(group, card); }
    if (e.target.matches("input[data-add]")) {
      const key = e.target.dataset.add;
      const control = card.controls.find((c) => c.key === key);
      const typed = e.target.value.replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
      const hit = control.pool(arg, optsFor(card, arg)).find((p) => p.name.toLowerCase() === typed);
      if (!hit) return;
      const now = optsFor(card, arg)[key] || [];
      if (!now.includes(hit.id)) setOpt(card, arg, key, [...now, hit.id]);
      rerenderCard(group, card);
      document.querySelector(`figure[data-card="${card.id}"] input[data-add]`)?.focus();
    }
  });
  const box = document.getElementById("lightbox");
  document.body.addEventListener("click", (e) => {
    const { fig, group, card } = cardFromEvent(e);
    const dot = e.target.closest(".shot [data-pid]");
    const pick = card && dot && (card.controls || []).find((c) => c.type === "highlight");
    if (pick) {
      const arg = GROUP_ARG[group]();
      const step = clickStep(card, arg, dot.dataset.pid);
      for (const [key, ids] of Object.entries(step.next)) setOpt(card, arg, key, ids);
      hideTip();
      return rerenderCard(group, card);
    }
    if (card) {
      const arg = GROUP_ARG[group]();
      const key = (attr) => e.target.closest(`[${attr}]`)?.getAttribute(attr);
      if (key("data-remove")) {
        const control = card.controls.find((c) => c.key === e.target.closest("[data-remove]").dataset.key);
        setOpt(card, arg, control.key, (optsFor(card, arg)[control.key] || []).filter((id) => id !== key("data-remove")));
        return rerenderCard(group, card);
      }
      if (key("data-reset")) { const k = `${card.id}|${argKey(arg)}`; const saved = { ...(state.opts[k] || {}) }; delete saved[key("data-reset")]; state.opts[k] = saved; return rerenderCard(group, card); }
      if (key("data-clear")) { setOpt(card, arg, key("data-clear"), []); return rerenderCard(group, card); }
      if (e.target.closest("[data-save]")) return saveCard(group, card, fig.querySelector(".shot svg"));
      if (e.target.closest("[data-copy]")) return copyCard(fig.querySelector(".shot svg"));
    }
    const shot = e.target.closest(".shot");
    if (shot) { box.querySelector(".frame").innerHTML = shot.innerHTML; box.classList.add("open"); return; }
    if (e.target.closest("#lightbox")) box.classList.remove("open");
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") box.classList.remove("open"); });
  // Hover a point on a chart: who it is and his numbers.
  document.body.addEventListener("mousemove", (e) => {
    const hit = e.target.closest("[data-tip]");
    if (!hit) return hideTip();
    const lines = hit.dataset.tip.split("|");
    const inCard = cardFromEvent(e).card;
    const canPick = inCard && (inCard.controls || []).some((c) => c.type === "highlight");
    const hint = canPick ? clickStep(inCard, GROUP_ARG[Object.keys(GROUPS).find((g) => GROUPS[g].includes(inCard))](), hit.dataset.pid).hint : "";
    const tip = document.getElementById("tip");
    tip.innerHTML = `<b>${esc(lines[0])}</b>${lines.slice(1).map((l) => `<span>${esc(l)}</span>`).join("")}${hint ? `<em>${hint}</em>` : ""}`;
    tip.classList.add("show");
    const { innerWidth: vw, innerHeight: vh } = window;
    const r = tip.getBoundingClientRect();
    tip.style.left = `${Math.min(vw - r.width - 8, e.clientX + 14)}px`;
    tip.style.top = `${Math.min(vh - r.height - 8, e.clientY + 14)}px`;
  });
  document.body.addEventListener("mouseleave", hideTip);
}
function hideTip() { document.getElementById("tip")?.classList.remove("show"); }

const fontsReady = Promise.all([
  "500 20px Inter", "600 20px Inter", "700 20px Inter", "800 20px Inter", "500 20px 'JetBrains Mono'", "700 20px 'JetBrains Mono'", "800 20px 'JetBrains Mono'",
].map((f) => document.fonts.load(f).catch(() => null))).then(() => document.fonts.ready);

const params = new URLSearchParams(location.search);
if (params.get("card")) {
  // Solo mode for headless checks and PNG renders: one card at native size, nothing else.
  //   ?card=C8&theme=dark&opt.pos=RB&hl=Bijan Robinson,Jahmyr Gibbs&game=...&player=...&team=DET
  const id = params.get("card");
  if (params.get("theme")) document.documentElement.setAttribute("data-theme", params.get("theme"));
  const card = Object.values(GROUPS).flat().find((c) => c.id === id);
  const group = Object.keys(GROUPS).find((g) => GROUPS[g].includes(card));
  const game = params.get("game");
  if (group === "recap" && game) state.recap = Math.max(0, DATA.recaps.findIndex((g) => g.id === game));
  if (group === "preview" && game) state.preview = Math.max(0, DATA.previews.findIndex((g) => g.id === game));
  state.player = findPlayer(params.get("player")) || Object.values(DATA.players).filter((p) => p.pos === "WR").sort((a, b) => b.season.fantasy_points - a.season.fantasy_points)[0].id;
  if (params.get("team") && DATA.teams_cards[params.get("team").toUpperCase()]) state.team = params.get("team").toUpperCase();
  const arg = GROUP_ARG[group]();
  for (const [k, v] of params) if (k.startsWith("opt.")) setOpt(card, arg, k.slice(4), k === "opt.vs" ? findPlayer(v) : v);
  for (const [param, type] of [["hl", "highlight"], ["nums", "numbers"]]) {
    if (params.get(param) == null) continue;
    const control = (card.controls || []).find((c) => c.type === type);
    if (!control) continue;
    const pool = control.pool(arg, optsFor(card, arg));
    const want = params.get(param).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    setOpt(card, arg, control.key, want.map((w) => pool.find((p) => p.id.toLowerCase() === w || p.name.toLowerCase() === w)?.id).filter(Boolean));
  }
  fontsReady.then(() => {
    // Keep the page's <style> (it lives in the body now): drop only the review chrome.
    document.querySelector(".wrap")?.remove();
    document.getElementById("lightbox")?.remove();
    const holder = document.createElement("div");
    holder.style.cssText = "line-height:0";
    holder.innerHTML = drawCard(card, arg);
    document.body.appendChild(holder);
    document.body.style.cssText = "margin:0;background:var(--card)";
    document.body.setAttribute("data-subject", subjectFor(group, card, arg));
    document.body.setAttribute("data-ready", "1");
  });
} else {
  setup();
  fontsReady.then(renderAll, renderAll);
}
