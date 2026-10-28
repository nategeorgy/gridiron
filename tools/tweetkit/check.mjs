// Runs every card for every game and player in the built page and reports any that throw
// or print NaN, undefined, Infinity or null. Also checks the review page at phone width.
//   node check.mjs        (after python3 build.py; run from this folder)
import { spawn } from "node:child_process";
const port = 9800 + Math.floor(Math.random() * 100);
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/.chrome-check`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
// A run that throws must not leave Chrome holding the profile, or the next run cannot start.
process.on("exit", () => chrome.kill());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target; for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener("open", r));
let seq = 0; const pending = new Map(); const logs = [];
ws.addEventListener("message", (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(d.params.type)) logs.push(d.params.args.map((a) => a.value ?? a.description).join(" ")); else if (d.method === "Runtime.exceptionThrown") logs.push(d.params.exceptionDetails.exception?.description); });
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (e) => { const r = (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result; if (r.exceptionDetails) console.log("EVAL ERROR", r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1320, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `file://${process.cwd()}/preview.html` });
await sleep(4000);
console.log("svgs", await ev("document.querySelectorAll('.shot svg').length"), "failed", await ev("[...document.querySelectorAll('.shot')].filter(s => !s.querySelector('svg')).length"));
// Every recap and preview game, and a spread of players, must render without a failure box.
const bad = await ev(`(() => {
  const out = [];
  let runs = 0;
  const run = (card, arg, label, extra = {}) => {
    try {
      runs++;
      const svg = card.fn(arg, { ...optsFor(card, arg), ...extra }).replace(/data:[^"]+/g, '');
      const m = svg.match(/.{60}(NaN|undefined|Infinity|null).{20}/);
      if (!svg.includes('</svg>') || m) out.push(label + ' ' + card.id + ' ' + (m ? m[0] : 'no svg'));
    } catch (e) { out.push(label + ' ' + card.id + ' ' + e.message); }
  };
  const ARGS = { recap: DATA.recaps, preview: DATA.previews, weekly: [null], player: Object.keys(DATA.players), team: Object.keys(DATA.teams_cards), league: [null] };
  for (const [group, cards] of Object.entries(GROUPS)) {
    for (const arg of ARGS[group]) {
      for (const card of cards) {
        const hl = (card.controls || []).find((c) => c.key === 'hl');
        const label = arg?.id ?? arg ?? group;
        run(card, arg, label);
        // Every option of every select, one control at a time; the first few of a player picker.
        // Whole-league cards get every option; per-game and per-player cards a sample, to keep the run short.
        const wide = arg == null || arg === ARGS[group][0];
        for (const c of card.controls || []) {
          const options = c.type === 'select' ? c.options.map(([v]) => v) : c.type === 'player' ? c.pool(arg, optsFor(card, arg)).slice(0, wide ? 12 : 2).map((p) => p.id) : [];
          for (const v of wide ? options : options.slice(0, 2)) {
            const extra = { [c.key]: v };
            if (hl) extra.hl = hl.defaults(arg, { ...optsFor(card, arg), ...extra });
            run(card, arg, label + ' ' + c.key + '=' + v, extra);
          }
        }
      }
    }
  }
  return out.slice(0, 40).concat(['problems ' + out.length + ' in ' + runs + ' card draws: ' + DATA.recaps.length + ' recaps, ' + DATA.previews.length + ' previews, ' + Object.keys(DATA.players).length + ' players, ' + Object.keys(DATA.teams_cards).length + ' teams']);
})()`);
console.log(bad.join("\n"));
console.log("phone overflow:", await (async () => { await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 800, deviceScaleFactor: 1, mobile: true }); await sleep(500); return ev("document.documentElement.scrollWidth"); })());
if (logs.length) console.log("CONSOLE:", logs.slice(0, 10).join("\n"));
ws.close(); chrome.kill();
