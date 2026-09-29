// "Export image": a branded PNG of a chart, previewed before it downloads.
//
// `render` returns the chart to export and is called fresh for every preview, so the
// size and theme options re-render it rather than stretching one picture. What makes it
// an image (theme, fonts, headshots, the frame with the logo, URL and handle) is
// utils/exportImage.js.
import { useEffect, useState } from "react";
import { Dialog } from "../ui/Dialog";
import { Segmented } from "../team/Segmented";
import { EXPORT_SIZES, composeImage } from "../../utils/exportImage";
import { slugify } from "../../utils/csv";
import { useThemeName } from "../../hooks/useThemeName";

export function DownloadIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2.5v7.5M4.8 7 8 10.2 11.2 7M3 13.2h10" />
    </svg>
  );
}

export function ExportImageButton({ title, subtitle, render, sizes = ["fit", "wide", "square"], disabled = false }) {
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
        <ExportDialog title={title} subtitle={subtitle} render={render} sizes={sizes} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function ExportDialog({ title, subtitle, render, sizes, onClose }) {
  const appTheme = useThemeName();
  const [size, setSize] = useState(sizes[0]);
  const [theme, setTheme] = useState(appTheme === "light" ? "light" : "dark");
  const [image, setImage] = useState({ status: "rendering" });

  useEffect(() => {
    let cancelled = false;
    setImage((current) => ({ ...current, status: "rendering" }));
    composeImage({ render, title, subtitle, size, theme })
      .then((result) => !cancelled && setImage({ status: "ready", ...result }))
      .catch((error) => !cancelled && setImage({ status: "error", message: error.message }));
    return () => {
      cancelled = true;
    };
    // `render` is a fresh function every parent render; the dialog exports the chart as
    // it was when opened, and re-renders only for its own options.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, theme]);

  return (
    <Dialog open title="Export image" onClose={onClose} width="max-w-4xl">
      <div className="grid gap-3">
        <div className="grid min-h-[220px] place-items-center rounded-xl bg-surface-2 p-2">
          {image.url ? (
            <img
              src={image.url}
              alt={`${title} export preview`}
              className={`block max-h-[62vh] max-w-full rounded-lg shadow-2xl transition ${image.status === "rendering" ? "opacity-60" : ""}`}
            />
          ) : (
            <span className="text-sm text-muted">{image.status === "error" ? "" : "Rendering…"}</span>
          )}
        </div>
        <div className="stat-num text-center text-[11px] text-faint">
          {image.status === "error"
            ? `Could not render this chart: ${image.message}`
            : image.status === "ready"
              ? `${image.width} × ${image.height} PNG`
              : "Rendering…"}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
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
          <a
            href={image.url ?? undefined}
            download={`second-level-${slugify(title)}.png`}
            aria-disabled={image.status !== "ready"}
            className={`btn-accent-solid inline-flex items-center gap-1.5 px-4 py-2 text-sm ${
              image.status === "ready" ? "" : "pointer-events-none opacity-50"
            }`}
          >
            <DownloadIcon />
            Download PNG
          </a>
        </div>
      </div>
    </Dialog>
  );
}
