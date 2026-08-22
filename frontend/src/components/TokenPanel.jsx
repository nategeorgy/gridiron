// The editor half of the design-token studio (`/styleguide`): one control per
// theme token, a live WCAG readout, and the CSS to paste back into index.css.
//
// The panel re-declares every token at its *baseline* value on its own root, so
// the cascade stops at this subtree. That is deliberate: without it, setting
// --fg to the same colour as --surface would make the controls invisible and
// leave no way to undo the change that caused it. The gallery shows the damage;
// the panel stays usable.
import { useEffect, useState } from "react";
import { CONTRAST_CHECKS, TOKEN_GROUPS } from "../constants/designTokens";
import { contrastRatio, flattenLayers, formatColor, parseColor, toHex, wcagGrade } from "../utils/color";

/**
 * A text box that publishes on blur, plus Enter on the single-line variant
 * (Enter belongs to the textarea, which is multi-line by nature). Editing a
 * live CSS value keystroke-by-keystroke would apply "#0", "#00", "#00e"… on the
 * way to "#00e389" and yank the colour picker around while you type.
 */
function DeferredInput({ value, onCommit, className = "", rows = 0, ...rest }) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);

  // Adopt outside changes (slider, picker, reset) unless the user is mid-edit.
  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);

  const commit = () => {
    setFocused(false);
    if (draft !== value) onCommit(draft.trim());
  };

  const shared = {
    value: draft,
    onChange: (event) => setDraft(event.target.value),
    onFocus: () => setFocused(true),
    onBlur: commit,
    spellCheck: false,
    className: `glass-input w-full px-2 py-1 font-mono text-[11px] ${className}`,
    ...rest,
  };

  if (rows > 0) return <textarea {...shared} rows={rows} />;
  return (
    <input
      {...shared}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(value);
          setFocused(false);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function ColorControl({ value, onChange }) {
  const parsed = parseColor(value);

  return (
    <div className="flex items-center gap-2">
      {/* Checkerboard behind the swatch so alpha is visible rather than implied. */}
      <div
        className="h-8 w-8 shrink-0 rounded-lg border border-edge"
        style={{
          backgroundImage: `linear-gradient(${value}, ${value}), conic-gradient(#bbb 0 25%, #fff 0 50%, #bbb 0 75%, #fff 0)`,
          backgroundSize: "100% 100%, 10px 10px",
        }}
        title={value}
      />
      <div className="min-w-0 flex-1 space-y-1">
        {parsed ? (
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={toHex(parsed)}
              onChange={(event) => {
                const picked = parseColor(event.target.value);
                onChange(formatColor({ ...picked, a: parsed.a }));
              }}
              className="h-6 w-8 shrink-0 cursor-pointer rounded border border-edge bg-transparent p-0"
              aria-label="Colour"
            />
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={parsed.a}
              onChange={(event) => onChange(formatColor({ ...parsed, a: Number(event.target.value) }))}
              className="h-1 flex-1 accent-accent"
              aria-label="Alpha"
              title={`Alpha ${parsed.a}`}
            />
            <span className="stat-num w-8 shrink-0 text-right text-[10px] text-faint">
              {Math.round(parsed.a * 100)}%
            </span>
          </div>
        ) : (
          <p className="text-[10px] text-faint">Not a plain colour — edit as text.</p>
        )}
        <DeferredInput value={value} onCommit={onChange} />
      </div>
    </div>
  );
}

function LengthControl({ token, value, onChange }) {
  const numeric = parseFloat(value);
  const current = Number.isFinite(numeric) ? numeric : token.min ?? 0;

  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={token.min}
        max={token.max}
        step={token.step}
        value={current}
        onChange={(event) => onChange(`${event.target.value}${token.unit}`)}
        className="h-1 flex-1 accent-accent"
        aria-label={token.label}
      />
      <input
        type="number"
        min={token.min}
        max={token.max}
        step={token.step}
        value={current}
        onChange={(event) => onChange(`${event.target.value}${token.unit}`)}
        className="glass-input stat-num w-16 px-2 py-1 text-right text-[11px]"
        aria-label={`${token.label} value`}
      />
      <span className="w-4 text-[10px] text-faint">{token.unit}</span>
    </div>
  );
}

function TokenRow({ token, value, isChanged, onChange, onReset }) {
  return (
    <div className="space-y-1.5 border-b border-line py-2.5 last:border-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-fg">{token.label}</span>
        <span className="flex items-center gap-1.5">
          {isChanged ? (
            <button
              type="button"
              onClick={onReset}
              className="text-[10px] font-semibold text-accent hover:underline"
              title="Revert to the value in index.css"
            >
              reset
            </button>
          ) : null}
          <code className="stat-num text-[10px] text-faint">{token.name}</code>
        </span>
      </div>

      {token.type === "color" ? <ColorControl value={value} onChange={onChange} /> : null}
      {token.type === "length" ? <LengthControl token={token} value={value} onChange={onChange} /> : null}
      {token.type === "raw" ? <DeferredInput value={value} onCommit={onChange} rows={token.rows ?? 2} /> : null}

      {token.hint ? <p className="text-[10px] leading-snug text-faint">{token.hint}</p> : null}
    </div>
  );
}

function ContrastReadout({ resolve }) {
  const rows = CONTRAST_CHECKS.map((check) => {
    const foreground = parseColor(resolve(check.fg));
    const stack = check.over.map((name) => parseColor(resolve(name)));
    if (!foreground || stack.some((layer) => !layer)) return { ...check, ratio: null };

    // Flatten the translucent stack first: the text is not on --surface, it is
    // on what --surface lets through from --bg.
    const background = flattenLayers(stack);
    const composited = foreground.a < 1 ? flattenLayers([foreground, background]) : foreground;
    return { ...check, ratio: contrastRatio(composited, background) };
  });

  return (
    <div className="space-y-1">
      {rows.map((row) => {
        if (row.ratio === null) {
          return (
            <div key={row.label} className="flex justify-between text-[11px] text-faint">
              <span>{row.label}</span>
              <span>—</span>
            </div>
          );
        }
        const grade = wcagGrade(row.ratio, { large: row.large });
        return (
          <div key={row.label} className="flex items-center justify-between gap-2 text-[11px]">
            <span className="truncate text-muted">{row.label}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              <span className="stat-num text-fg">{row.ratio.toFixed(2)}</span>
              <span className={`stat-num text-[10px] ${grade.pass ? "text-pos" : "text-neg"}`}>{grade.label}</span>
            </span>
          </div>
        );
      })}
      <p className="pt-1 text-[10px] leading-snug text-faint">
        Scored against the flat <code>--bg</code>, not the environment gradient, and it cannot model what
        backdrop-filter pulls through. Treat it as a floor, not a certificate.
      </p>
    </div>
  );
}

export function TokenPanel({
  theme,
  onThemeChange,
  baselineStyle,
  resolve,
  changedNames,
  onChange,
  onResetToken,
  onResetTheme,
  css,
}) {
  const [copied, setCopied] = useState(false);

  const copyCss = async () => {
    try {
      await navigator.clipboard.writeText(css);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be blocked (permissions, insecure origin). The CSS is
      // rendered below regardless, so there is always a way to get it out.
      setCopied(false);
    }
  };

  return (
    <div style={baselineStyle} className="glass-card flex max-h-[calc(100vh-6rem)] flex-col overflow-hidden">
      <div className="shrink-0 space-y-3 border-b border-line p-4">
        <div>
          <h2 className="text-sm font-bold text-fg">Token studio</h2>
          <p className="text-[11px] leading-snug text-muted">
            Edits apply live to the page, never to a file. Copy the CSS below into{" "}
            <code className="text-faint">src/index.css</code> to keep them.
          </p>
        </div>

        {/* One page, one theme at a time — see the note in the gallery header. */}
        <div className="flex gap-1 rounded-full bg-surface-2 p-1">
          {["dark", "light"].map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onThemeChange(option)}
              className={`flex-1 rounded-full px-3 py-1 text-xs font-semibold capitalize transition ${
                theme === option ? "bg-accent text-[color:var(--accent-ink)]" : "text-muted hover:text-fg"
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted">
            {changedNames.size === 0
              ? "No changes in this theme"
              : `${changedNames.size} changed in ${theme}`}
          </span>
          <button
            type="button"
            onClick={onResetTheme}
            disabled={changedNames.size === 0}
            className="btn-ghost px-2.5 py-1 text-[11px] disabled:opacity-40"
          >
            Reset {theme}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {TOKEN_GROUPS.map((group) => (
          <details key={group.id} open className="group border-b border-line py-2 last:border-0">
            <summary className="cursor-pointer list-none text-xs font-bold uppercase tracking-wide text-muted marker:content-none hover:text-fg">
              <span className="inline-block w-3 text-faint transition group-open:rotate-90">›</span>
              {group.label}
            </summary>
            {group.blurb ? (
              <p className="py-1.5 pl-3 text-[10px] leading-snug text-faint">{group.blurb}</p>
            ) : null}
            <div className="pl-3">
              {group.tokens.map((token) => (
                <TokenRow
                  key={token.name}
                  token={token}
                  value={resolve(token.name)}
                  isChanged={changedNames.has(token.name)}
                  onChange={(next) => onChange(token.name, next)}
                  onReset={() => onResetToken(token.name)}
                />
              ))}
            </div>
          </details>
        ))}

        <details open className="border-b border-line py-2">
          <summary className="cursor-pointer list-none text-xs font-bold uppercase tracking-wide text-muted hover:text-fg">
            <span className="inline-block w-3 text-faint">›</span>Contrast
          </summary>
          <div className="pl-3 pt-2">
            <ContrastReadout resolve={resolve} />
          </div>
        </details>

        <details open className="py-2">
          <summary className="cursor-pointer list-none text-xs font-bold uppercase tracking-wide text-muted hover:text-fg">
            <span className="inline-block w-3 text-faint">›</span>CSS to paste
          </summary>
          <div className="space-y-2 pl-3 pt-2">
            <button
              type="button"
              onClick={copyCss}
              disabled={!css}
              className="btn-accent w-full px-3 py-1.5 text-xs disabled:opacity-40"
            >
              {copied ? "Copied" : "Copy CSS"}
            </button>
            <pre className="max-h-64 overflow-auto rounded-lg bg-surface-2 p-2 font-mono text-[10px] leading-relaxed text-fg">
              {css || "/* Nothing changed yet. */"}
            </pre>
          </div>
        </details>
      </div>
    </div>
  );
}
