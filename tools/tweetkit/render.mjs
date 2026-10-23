// Render tweet cards to PNG with headless Chrome (no npm packages: Node's own WebSocket
// talks to Chrome's DevTools protocol).
//
//   node render.mjs A4,A5 --game 2026_06_BUF_LV
//   node render.mjs D1,D3 --player "Jaxon Smith-Njigba" --themes dark
//   node render.mjs C1,C3,C4 --scale 1 --out /tmp/check
//   node render.mjs E1,E2 --team DET
//   node render.mjs C8 --opt pos=RB --highlight "Bijan Robinson,Jahmyr Gibbs"
//   node render.mjs C12 --numbers "Puka Nacua,Ja'Marr Chase"   (their faces and actual values)
//   node render.mjs D6 --player "Puka Nacua" --opt vs="Jaxon Smith-Njigba"
//
// Defaults: both themes, 2x (a 1200x1500 card becomes 2400x3000), and the repo's
// tweets/<season>-w<week>/ folder, which .git/info/exclude keeps out of git. Each file is
// <card>-<game or player or "week">-<theme>.png. Text that leaves a card is reported.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const cards = (args.find((a) => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--")) || "").split(",").filter(Boolean);
if (!cards.length) { console.error("usage: node render.mjs A4,A5 [--game ID] [--player NAME] [--team ABBR] [--opt key=value] [--highlight \"Name,Name\"] [--numbers \"Name,Name\"] [--themes dark,light] [--scale 2] [--out DIR]"); process.exit(1); }
if (!existsSync(join(HERE, "preview.html"))) { console.error("preview.html is missing: run python3 build.py first"); process.exit(1); }

const meta = JSON.parse(readFileSync(join(HERE, "data.json"), "utf8"));
const themes = flag("themes", "dark,light").split(",");
const scale = Number(flag("scale", "2"));
const game = flag("game", "");
const player = flag("player", "");
const team = flag("team", "");
const highlight = flag("highlight", null);
const numbers = flag("numbers", null);
const opts = args.flatMap((a, i) => (a === "--opt" ? [args[i + 1]] : [])).map((kv) => kv.split("=")).filter(([k, v]) => k && v != null);
const out = resolve(flag("out", join(HERE, "..", "..", "tweets", `${meta.season}-w${String(meta.recap_week).padStart(2, "0")}`)));
mkdirSync(out, { recursive: true });
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const port = 9300 + Math.floor(Math.random() * 600);
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${join(HERE, ".chrome")}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 60 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {} }
if (!target) { console.error("Chrome did not start"); chrome.kill(); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let seq = 0;
const pending = new Map();
const errors = [];
ws.addEventListener("message", (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  else if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description);
  else if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push(d.params.args.map((a) => a.value ?? a.description).join(" "));
});
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const value = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result?.result?.value;
await send("Runtime.enable");
await send("Page.enable");

for (const card of cards) {
  for (const theme of themes) {
    const query = new URLSearchParams({ card, theme, k: String(Math.random()) });
    if (game) query.set("game", game);
    if (player) query.set("player", player);
    if (team) query.set("team", team);
    if (highlight != null) query.set("hl", highlight);
    if (numbers != null) query.set("nums", numbers);
    for (const [k, v] of opts) query.set(`opt.${k}`, v);
    await send("Page.navigate", { url: `file://${join(HERE, "preview.html")}?${query}` });
    let ready = false;
    for (let i = 0; i < 200 && !ready; i++) { ready = (await value("document.body && document.body.getAttribute('data-ready')")) === "1"; if (!ready) await sleep(150); }
    if (!ready || !(await value("!!document.querySelector('svg')"))) { console.log(`${card} ${theme}: FAILED to draw${errors.length ? `: ${errors.at(-1)}` : ""}`); continue; }
    const info = JSON.parse(await value(`(() => {
      const s = document.querySelector('svg');
      const W = s.viewBox.baseVal.width, H = s.viewBox.baseVal.height, bad = [];
      for (const t of s.querySelectorAll('text')) {
        if (t.getAttribute('transform')) continue;
        const b = t.getBBox();
        if (b.width && (b.x < 2 || b.x + b.width > W - 2 || b.y < 0 || b.y + b.height > H)) bad.push(t.textContent.slice(0, 40));
      }
      return JSON.stringify({ W, H, bad, subject: document.body.getAttribute('data-subject') || 'card' });
    })()`));
    await send("Emulation.setDeviceMetricsOverride", { width: info.W, height: info.H, deviceScaleFactor: scale, mobile: false });
    await sleep(300);
    const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: info.W, height: info.H, scale: 1 } });
    const subject = slug(info.subject);
    const file = join(out, `${card}-${subject}-${theme}.png`);
    writeFileSync(file, Buffer.from(shot.result.data, "base64"));
    console.log(`${file}  ${info.W * scale}x${info.H * scale}${info.bad.length ? `  TEXT OUTSIDE: ${info.bad.join(" | ")}` : ""}`);
  }
}
if (errors.length) console.log("Page errors:\n" + errors.slice(0, 10).join("\n"));
ws.close();
chrome.kill();
await sleep(300);
