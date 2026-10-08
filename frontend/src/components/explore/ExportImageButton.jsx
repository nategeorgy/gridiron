// "Export image": a branded PNG of a chart, previewed before it downloads or is copied.
//
// `render` returns the chart to export and is called fresh for every preview, so the
// size and theme options re-render it rather than stretching one picture. What makes it
// an image (theme, fonts, headshots, the frame with the logo, URL and handle) is
// utils/exportImage.js.
import { useEffect, useRef, useState } from "react";
import { Dialog } from "../ui/Dialog";
import { Segmented } from "../team/Segmented";
import { EXPORT_SIZES, composeImage } from "../../utils/exportImage";
import { slugify } from "../../utils/csv";
import { useDebounce } from "../../hooks/useDebounce";
import { useThemeName } from "../../hooks/useThemeName";

export function DownloadIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2.5v7.5M4.8 7 8 10.2 11.2 7M3 13.2h10" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinejoin="round" aria-hidden="true">
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.6" />
      <path d="M10.5 5.5V3.8a1.3 1.3 0 0 0-1.3-1.3H3.8a1.3 1.3 0 0 0-1.3 1.3v5.4a1.3 1.3 0 0 0 1.3 1.3h1.7" />
    </svg>
  );
}

// Copying an image needs the async clipboard and ClipboardItem: Chrome, Edge, Safari 13.1+
// and Firefox 127+. Where either is missing the button is left out rather than failing.
const CAN_COPY = typeof window !== "undefined" && typeof window.ClipboardItem === "function"
  && typeof navigator.clipboard?.write === "function";

/**
 * @param editableTitle  offer a Title field in the dialog, starting from `title`. For an
 *   export whose default title is generated (the Query Builder's) rather than written.
 * @param note           a line under the preview, e.g. how many rows the image holds
 * @param fitScale, watermark  passed to composeImage
 */
export function ExportImageButton({
  title, subtitle, render, sizes = ["fit", "wide", "square"], disabled = false,
  editableTitle = false, note, fitScale, watermark,
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] transition enabled:hover:!text-accent"
      >
        <DownloadIcon />
        Export image
      </button>
      {open && (
        <ExportDialog title={title} subtitle={subtitle} render={render} sizes={sizes} editableTitle={editableTitle}
          note={note} fitScale={fitScale} watermark={watermark} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function ExportDialog({ title, subtitle, render, sizes, editableTitle, note, fitScale, watermark, onClose }) {
  const appTheme = useThemeName();
  const [size, setSize] = useState(sizes[0]);
  const [theme, setTheme] = useState(appTheme === "light" ? "light" : "dark");
  const [typed, setTyped] = useState("");
  const [image, setImage] = useState({ status: "rendering" });
  const [copy, setCopy] = useState("idle");
  // Redraw once typing pauses, not on every keystroke.
  const shownTitle = useDebounce(typed.trim(), 300) || title;
  const urlRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setImage((current) => ({ ...current, status: "rendering" }));
    composeImage({ render, title: shownTitle, subtitle, size, theme, fitScale, watermark })
      .then((result) => {
        if (cancelled) {
          URL.revokeObjectURL(result.url);
          return;
        }
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = result.url;
        setImage({ status: "ready", ...result });
      })
      .catch((error) => !cancelled && setImage({ status: "error", message: error.message }));
    return () => {
      cancelled = true;
    };
    // `render` is a fresh function every parent render; the dialog exports the chart as
    // it was when opened, and re-renders only for its own options.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, theme, shownTitle]);

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const copyImage = () => {
    // Called straight from the click, with the PNG already drawn: Safari only allows a
    // clipboard write inside the gesture that asked for it.
    navigator.clipboard
      .write([new window.ClipboardItem({ "image/png": image.blob })])
      .then(() => setCopy("copied"), () => setCopy("failed"))
      .finally(() => setTimeout(() => setCopy("idle"), 1800));
  };
  const ready = image.status === "ready";

  return (
    <Dialog open title="Export image" onClose={onClose} width="max-w-4xl">
      <div className="grid gap-3">
        <div className="grid min-h-[220px] place-items-center rounded-xl bg-surface-2 p-2">
          {image.url ? (
            <img
              src={image.url}
              alt={`${shownTitle} export preview`}
              className={`block max-h-[62vh] max-w-full rounded-lg shadow-2xl transition ${image.status === "rendering" ? "opacity-60" : ""}`}
            />
          ) : (
            <span className="text-sm text-muted">{image.status === "error" ? "" : "Rendering…"}</span>
          )}
        </div>
        <div className="stat-num text-center text-[11px] text-faint">
          {image.status === "error"
            ? `Could not render this chart: ${image.message}`
            : ready
              ? [`${image.width} × ${image.height} PNG`, note].filter(Boolean).join(" · ")
              : "Rendering…"}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            {editableTitle && (
              <label className="flex min-w-0 items-center gap-2 text-xs text-muted">
                Title
                <input
                  type="text"
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  placeholder={title}
                  maxLength={90}
                  aria-label="Image title"
                  className="glass-input w-[min(340px,62vw)] px-3 py-1.5 text-[13px] text-fg placeholder:text-faint"
                />
              </label>
            )}
            {sizes.length > 1 && (
              <Segmented
                label="Size"
                value={size}
                onChange={setSize}
                options={sizes.map((value) => ({ value, label: EXPORT_SIZES[value] }))}
              />
            )}
            <Segmented
              label="Theme"
              value={theme}
              onChange={setTheme}
              options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }]}
            />
          </div>
          <div className="flex items-center gap-2">
            {CAN_COPY && (
              <button
                type="button"
                onClick={copyImage}
                disabled={!ready}
                aria-live="polite"
                className="btn-ghost inline-flex items-center gap-1.5 px-4 py-2 text-sm transition enabled:hover:!text-accent disabled:opacity-50"
              >
                <CopyIcon />
                {copy === "copied" ? "Copied" : copy === "failed" ? "Could not copy" : "Copy image"}
              </button>
            )}
            <a
              href={image.url ?? undefined}
              download={`second-level-${slugify(shownTitle)}.png`}
              aria-disabled={!ready}
              className={`btn-accent-solid inline-flex items-center gap-1.5 px-4 py-2 text-sm ${
                ready ? "" : "pointer-events-none opacity-50"
              }`}
            >
              <DownloadIcon />
              Download PNG
            </a>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
