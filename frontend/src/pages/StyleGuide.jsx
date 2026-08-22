// The design-token studio. A dev-only page (`/styleguide`) that renders every
// surface the Liquid Glass material produces, next to a panel that edits the
// theme's CSS variables live and emits the CSS to paste back into index.css.
//
// One page, not one per theme: the glass is `backdrop-filter`, so it blurs
// whatever is genuinely behind it — the `--env` gradient painted on <body>.
// Rendering a light panel inside a dark page would show light cards blurring a
// dark environment, which is a material that does not exist in the app. So the
// whole page switches themes and you tune one at a time; drafts for the other
// theme are kept, not discarded.
import { useCallback, useEffect, useMemo, useState } from "react";
import { TokenPanel } from "../components/TokenPanel";
import { THEME_BLOCKS, TOKEN_NAMES } from "../constants/designTokens";
import { useTheme } from "../hooks/useTheme";

const STORAGE_KEY = "gridiron.styleguide.draft";
const EMPTY_DRAFTS = { dark: {}, light: {} };

/**
 * Read every token's stylesheet value for both themes.
 *
 * This is why the registry holds no values: index.css stays the single source
 * of truth and the studio just asks the browser what it resolved to. Any inline
 * overrides already on <html> are lifted before reading and put back after, so
 * a baseline is always the authored value rather than a draft.
 */
function captureBaselines() {
  const root = document.documentElement;
  const previousTheme = root.getAttribute("data-theme");
  const previousInline = TOKEN_NAMES.map((name) => [name, root.style.getPropertyValue(name)]);

  for (const [name] of previousInline) root.style.removeProperty(name);

  const baselines = {};
  for (const theme of ["dark", "light"]) {
    root.setAttribute("data-theme", theme);
    // getComputedStyle forces a synchronous style recalc, so this reads the
    // theme we just set. Nothing paints in between — it is all one task.
    const computed = getComputedStyle(root);
    baselines[theme] = Object.fromEntries(
      TOKEN_NAMES.map((name) => [name, computed.getPropertyValue(name).trim()]),
    );
  }

  if (previousTheme === null) root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", previousTheme);
  for (const [name, value] of previousInline) {
    if (value) root.style.setProperty(name, value);
  }

  return baselines;
}

function readStoredDrafts() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!stored) return EMPTY_DRAFTS;
    // Drop anything that is no longer a token, so renaming one in index.css
    // cannot resurrect a dead variable from a months-old session.
    const clean = (theme) =>
      Object.fromEntries(
        Object.entries(stored[theme] ?? {}).filter(([name]) => TOKEN_NAMES.includes(name)),
      );
    return { dark: clean("dark"), light: clean("light") };
  } catch {
    return EMPTY_DRAFTS;
  }
}

/** Emit only what differs from index.css, in registry order, per theme. */
function emitCss(drafts, baselines) {
  const blocks = [];
  for (const { theme, selector, title } of THEME_BLOCKS) {
    const changed = TOKEN_NAMES.filter(
      (name) => drafts[theme]?.[name] !== undefined && drafts[theme][name] !== baselines[theme][name],
    );
    if (!changed.length) continue;
    const lines = changed.map((name) => `  ${name}: ${drafts[theme][name]};`).join("\n");
    blocks.push(`/* ${title} — ${changed.length} changed */\n${selector} {\n${lines}\n}`);
  }
  return blocks.join("\n\n");
}

export function StyleGuide() {
  const { theme, setTheme } = useTheme();
  const [baselines] = useState(captureBaselines);
  const [drafts, setDrafts] = useState(readStoredDrafts);

  // Apply the active theme's draft as inline custom properties on <html>. The
  // cleanup runs on every change and on unmount, so leaving the page always
  // restores the real theme — the studio can never leak into the rest of the app.
  useEffect(() => {
    const root = document.documentElement;
    const draft = drafts[theme] ?? {};
    for (const [name, value] of Object.entries(draft)) root.style.setProperty(name, value);
    return () => {
      for (const name of Object.keys(draft)) root.style.removeProperty(name);
    };
  }, [drafts, theme]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
    } catch {
      // Ignore storage failures (private mode, quota) — the draft still applies.
    }
  }, [drafts]);

  const resolve = useCallback(
    (name) => drafts[theme]?.[name] ?? baselines[theme][name],
    [drafts, theme, baselines],
  );

  // Derived from the values rather than the keys, so a stored draft that index.css
  // has since caught up with correctly reports as unchanged.
  const changedNames = useMemo(() => {
    const draft = drafts[theme] ?? {};
    return new Set(Object.keys(draft).filter((name) => draft[name] !== baselines[theme][name]));
  }, [drafts, theme, baselines]);

  const setToken = useCallback(
    (name, value) => {
      setDrafts((previous) => {
        const next = { ...previous, [theme]: { ...previous[theme], [name]: value } };
        if (value === baselines[theme][name]) delete next[theme][name];
        return next;
      });
    },
    [theme, baselines],
  );

  const resetToken = useCallback(
    (name) => {
      setDrafts((previous) => {
        const next = { ...previous, [theme]: { ...previous[theme] } };
        delete next[theme][name];
        return next;
      });
    },
    [theme],
  );

  const resetTheme = useCallback(() => {
    setDrafts((previous) => ({ ...previous, [theme]: {} }));
  }, [theme]);

  const css = useMemo(() => emitCss(drafts, baselines), [drafts, baselines]);

  // The panel pins itself to the untouched theme so it stays legible no matter
  // what the gallery has been turned into.
  const baselineStyle = useMemo(
    () => Object.fromEntries(TOKEN_NAMES.map((name) => [name, baselines[theme][name]])),
    [baselines, theme],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <div className="min-w-0 space-y-6">
        <Gallery theme={theme} resolve={resolve} />
      </div>

      <div className="lg:sticky lg:top-20">
        <TokenPanel
          theme={theme}
          onThemeChange={setTheme}
          baselineStyle={baselineStyle}
          resolve={resolve}
          changedNames={changedNames}
          onChange={setToken}
          onResetToken={resetToken}
          onResetTheme={resetTheme}
          css={css}
        />
      </div>
    </div>
  );
}

/* ==========================================================================
   Gallery — every surface the material system produces, on one screen.

   Built from the .glass-* classes and the tokens directly rather than from the
   real app components: those need router context, API data and auth state, and
   a styleguide that can break because the leaderboard's props changed is a
   styleguide nobody opens. Every real component is assembled from exactly what
   is shown here.
   ========================================================================== */

function Section({ title, note, children }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{title}</h2>
        {note ? <p className="text-xs leading-snug text-faint">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

const SERIES = ["--series-1", "--series-2", "--series-3", "--series-4", "--series-5"];

const SERIES_DEMO = [
  { name: "Jefferson", values: [12, 18, 9, 24, 20, 28, 22] },
  { name: "Chase", values: [22, 14, 26, 16, 12, 18, 15] },
  { name: "Lamb", values: [8, 11, 14, 12, 19, 15, 24] },
  { name: "Hill", values: [26, 24, 20, 21, 15, 12, 9] },
  { name: "Nabers", values: [15, 20, 17, 9, 24, 21, 27] },
];

/** A five-series line chart, drawn from the tokens so a hue change is visible in situ. */
function SeriesChart() {
  const width = 560;
  const height = 160;
  const padX = 12;
  const padY = 14;
  const maxValue = 30;
  const stepX = (width - padX * 2) / (SERIES_DEMO[0].values.length - 1);
  const toY = (value) => height - padY - (value / maxValue) * (height - padY * 2);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full" role="img" aria-label="Five-series demo chart">
      {[0, 10, 20, 30].map((gridValue) => (
        <line
          key={gridValue}
          x1={padX}
          x2={width - padX}
          y1={toY(gridValue)}
          y2={toY(gridValue)}
          stroke="var(--divider)"
          strokeWidth="1"
        />
      ))}
      {SERIES_DEMO.map((series, seriesIndex) => {
        const points = series.values
          .map((value, index) => `${padX + index * stepX},${toY(value)}`)
          .join(" ");
        return (
          <g key={series.name}>
            <polyline
              points={points}
              fill="none"
              stroke={`var(${SERIES[seriesIndex]})`}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {series.values.map((value, index) => (
              <circle
                key={index}
                cx={padX + index * stepX}
                cy={toY(value)}
                r="3"
                fill={`var(${SERIES[seriesIndex]})`}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

const TABLE_ROWS = [
  { rank: 1, name: "Ja'Marr Chase", team: "CIN", position: "WR", games: 17, points: 403.2, gap: 6.4 },
  { rank: 2, name: "Justin Jefferson", team: "MIN", position: "WR", games: 17, points: 361.8, gap: 2.1 },
  { rank: 3, name: "CeeDee Lamb", team: "DAL", position: "WR", games: 15, points: 318.5, gap: -1.7 },
  { rank: 4, name: "Malik Nabers", team: "NYG", position: "WR", games: 16, points: 296.0, gap: -4.9 },
];

function Gallery({ theme, resolve }) {
  return (
    <>
      <div className="glass-card p-5">
        <h1 className="text-xl font-bold text-fg">
          Token studio<span className="text-accent">.</span>
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
          Everything below is drawn from the CSS variables in{" "}
          <code className="text-faint">src/index.css</code>. Drag a slider on the right and every surface here
          moves together — that is the whole point: you are tuning the system, not a screen.
        </p>
        <p className="mt-2 max-w-2xl text-xs leading-relaxed text-faint">
          You are editing the <strong className="text-muted">{theme}</strong> theme. Switch themes in the panel
          to tune the other one — the two sets are independent and both are kept. Nothing is written to disk
          until you paste the CSS back yourself.
        </p>
      </div>

      <Section
        title="Surfaces & material"
        note="Card fill, raised fill, opaque popover, and the specular edge that does most of the work."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="glass-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-faint">glass-card</p>
            <p className="mt-1 text-sm text-fg">The primary surface. Every board, tile and chart sits on one.</p>
            <div className="mt-3 rounded-xl bg-surface-2 p-3">
              <p className="text-xs text-muted">Nested raised fill (surface-2) — hover states and chips.</p>
            </div>
          </div>

          <div className="glass-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-faint">glass-popover</p>
            <p className="mt-1 text-sm text-fg">Opaque, because a menu over a chart has to stay readable.</p>
            <div className="glass-popover mt-3 p-2">
              {["Insight", "Explore", "Fantasy", "NFL"].map((item, index) => (
                <div
                  key={item}
                  className={`rounded-lg px-2.5 py-1.5 text-sm ${index === 0 ? "bg-surface-2 text-accent" : "text-muted"}`}
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="glass-header rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-fg">
              Gridiron<span className="text-accent">IQ</span>
            </span>
            <span className="glass-pill px-3 py-1 text-xs">glass-header</span>
            <span className="ml-auto text-xs text-faint">radius {resolve("--radius")} · blur {resolve("--blur")}</span>
          </div>
        </div>
      </Section>

      <Section title="Type ramp" note="Three steps. Stat values are mono and tabular so columns align.">
        <div className="glass-card space-y-2 p-4">
          <p className="text-2xl font-bold text-fg">Primary — who to start this week</p>
          <p className="text-sm text-muted">Muted — supporting copy, labels, and secondary values.</p>
          <p className="text-xs text-faint">Faint — hints, units, and table metadata.</p>
          <p className="stat-num pt-2 text-lg text-fg">
            403.2 <span className="text-muted">·</span> 23.7 <span className="text-muted">·</span> 0.318{" "}
            <span className="text-muted">·</span> 1,284
          </p>
        </div>
      </Section>

      <Section title="Controls" note="Focus the input to check the accent ring against the current accent.">
        <div className="glass-card flex flex-wrap items-center gap-3 p-4">
          <button type="button" className="btn-accent px-4 py-2 text-sm">
            Primary action
          </button>
          <button type="button" className="btn-ghost px-4 py-2 text-sm">
            Secondary
          </button>
          <button type="button" disabled className="btn-ghost px-4 py-2 text-sm">
            Disabled
          </button>
          <span className="glass-pill px-3 py-1.5 text-xs">Filter pill</span>
          <span className="glass-pill !text-accent px-3 py-1.5 text-xs">Active pill</span>
          <input className="glass-input px-3 py-2 text-sm" placeholder="Search players…" />
        </div>
      </Section>

      <Section title="Semantics" note="Meaning-bearing colours. A chart series must never borrow these.">
        <div className="glass-card flex flex-wrap gap-6 p-4">
          {[
            { label: "Positive", token: "--pos", className: "text-pos", sample: "+4.6 over expected" },
            { label: "Negative", token: "--neg", className: "text-neg", sample: "−4.6 over expected" },
            { label: "Warning", token: "--warn", className: "text-warn", sample: "Questionable" },
            { label: "Accent", token: "--accent", className: "text-accent", sample: "Sorted by PPG" },
          ].map((entry) => (
            <div key={entry.label} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="h-4 w-4 rounded" style={{ background: `var(${entry.token})` }} />
                <span className="text-xs font-semibold text-fg">{entry.label}</span>
              </div>
              <p className={`stat-num text-sm ${entry.className}`}>{entry.sample}</p>
              <code className="text-[10px] text-faint">{resolve(entry.token)}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Chart series"
        note="Fixed categorical order, never cycled. Check separation at line width, not just as swatches."
      >
        <div className="glass-card space-y-3 p-4">
          <div className="flex flex-wrap gap-4">
            {SERIES.map((token, index) => (
              <div key={token} className="flex items-center gap-2">
                <span className="h-3 w-6 rounded-full" style={{ background: `var(${token})` }} />
                <span className="text-xs text-muted">{SERIES_DEMO[index].name}</span>
                <code className="text-[10px] text-faint">{resolve(token)}</code>
              </div>
            ))}
          </div>
          <SeriesChart />
        </div>
      </Section>

      <Section title="Stat table" note="Hairlines, hover fill, accented sort column, and signed values.">
        <div className="glass-card overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-faint">
                <th className="px-3 py-3 text-right">#</th>
                <th className="px-3 py-3">Player</th>
                <th className="px-3 py-3">Team</th>
                <th className="px-3 py-3 text-right">G</th>
                <th className="px-3 py-3 text-right text-accent">PPR ↓</th>
                <th className="px-3 py-3 text-right">+/− EXP</th>
              </tr>
            </thead>
            <tbody>
              {TABLE_ROWS.map((row) => (
                <tr key={row.name} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="stat-num px-3 py-2.5 text-right text-faint">{row.rank}</td>
                  <td className="px-3 py-2.5 font-medium text-fg">{row.name}</td>
                  <td className="px-3 py-2.5">
                    <span className="stat-num text-xs text-muted">{row.team}</span>
                    <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-faint">
                      {row.position}
                    </span>
                  </td>
                  <td className="stat-num px-3 py-2.5 text-right text-muted">{row.games}</td>
                  <td className="stat-num px-3 py-2.5 text-right font-semibold text-accent">
                    {row.points.toFixed(1)}
                  </td>
                  <td className={`stat-num px-3 py-2.5 text-right ${row.gap > 0 ? "text-pos" : "text-neg"}`}>
                    {row.gap > 0 ? "+" : "−"}
                    {Math.abs(row.gap).toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
