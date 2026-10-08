// Chart export: any chart on the Explore tab (and the target maps elsewhere), or the
// Query Builder's results table, as a branded PNG.
//
// A chart is drawn by a React component into an SVG styled with CSS variables. None of
// that survives outside the page: an SVG rasterised through an <img> cannot see the
// stylesheet, the variables, the web fonts or any external image. So an export:
//
//   1. renders the chart offscreen, with <html data-theme> set to the theme asked for,
//   2. clones the SVG and copies every element's *computed* paint onto the clone as
//      plain colours (colour-mix and var() resolved by the browser, then normalised),
//   3. restores the theme, all in one synchronous block, so the page never paints in
//      the other theme,
//   4. swaps each headshot and logo URL for a data URI (both CDNs send
//      Access-Control-Allow-Origin: *), shrunk to the size a chart draws it, which
//      keeps the canvas untainted and the SVG small,
//   5. draws the result into a frame: title, subtitle, the 2L mark top right, a faint
//      mark inside the plot so a crop still says where it came from, and a footer with
//      the wordmark, the site URL, the handle and the data credit.
//
// The URL and handle come from constants/brand.js, the one place they live.
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { MARK_ASPECT, MARK_PATHS } from "../components/Brand";
import { DATA_CREDIT, SITE_HANDLE, SITE_URL } from "../constants/brand";

const SVG_NS = "http://www.w3.org/2000/svg";
const SCALE = 2;
// iOS Safari refuses a canvas over about 16.7 million pixels and draws nothing, without
// an error. A 100-row Query Builder table at 2x is ~28 million, so a frame that large
// is drawn at the highest scale that stays under the limit.
const MAX_PIXELS = 16_000_000;
const FONT_SANS = "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const FONT_MONO = "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

/** Paint properties copied from the live element onto the clone. */
const PAINT = [
  "fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "opacity",
  "fill-opacity", "stroke-opacity", "font-size", "font-weight", "letter-spacing", "paint-order", "visibility",
  "display", "text-anchor", "dominant-baseline",
];

export const EXPORT_SIZES = {
  fit: "Fit the chart",
  wide: "Wide 16:9",
  square: "Square",
};

let colorContext = null;

/** Any CSS colour (color-mix, rgba, a keyword) as the canvas's normalised hex or rgba. */
function solidColor(value) {
  if (!value || value === "none" || value.startsWith("url(")) return value;
  colorContext ??= document.createElement("canvas").getContext("2d");
  colorContext.fillStyle = "#000";
  colorContext.fillStyle = value;
  return colorContext.fillStyle;
}

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function inlinePaint(source, target) {
  const computed = getComputedStyle(source);
  for (const property of PAINT) {
    let value = computed.getPropertyValue(property);
    if (!value) continue;
    if (property === "fill" || property === "stroke") {
      const attribute = source.getAttribute(property);
      if (attribute && attribute.startsWith("url(")) continue;
      value = solidColor(value);
    }
    target.style.setProperty(property, value);
  }
  if (source.tagName === "text" || source.tagName === "tspan") {
    const mono = /mono/i.test(computed.getPropertyValue("font-family"));
    target.style.setProperty("font-family", mono ? FONT_MONO : FONT_SANS);
  }
  for (let index = 0; index < source.children.length; index += 1) {
    inlinePaint(source.children[index], target.children[index]);
  }
}

/** The frame's colours, read while the requested theme is applied. */
function readPalette() {
  return {
    fg: solidColor(cssVar("--fg")),
    muted: solidColor(cssVar("--muted")),
    faint: solidColor(cssVar("--faint")),
    accent: solidColor(cssVar("--accent")),
    background: solidColor(cssVar("--surface-solid")),
    rule: solidColor(cssVar("--divider")),
  };
}

/**
 * Render `element` offscreen in `theme` and return a self-contained clone of its SVG.
 * Synchronous from the theme switch to its restoration, which is what keeps the page
 * from ever painting in the other theme.
 */
function renderInTheme(element, theme) {
  const html = document.documentElement;
  const previous = html.getAttribute("data-theme");
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-20000px;top:0;width:1600px;pointer-events:none;";
  html.setAttribute("data-theme", theme);
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(element));
    const svg = host.querySelector("svg");
    if (!svg) throw new Error("There is nothing to export.");
    const box = svg.viewBox.baseVal;
    const clone = svg.cloneNode(true);
    inlinePaint(svg, clone);
    clone.setAttribute("xmlns", SVG_NS);
    clone.removeAttribute("class");
    clone.removeAttribute("style");
    return { clone, width: box.width, height: box.height, palette: readPalette() };
  } finally {
    root.unmount();
    host.remove();
    if (previous === null) html.removeAttribute("data-theme");
    else html.setAttribute("data-theme", previous);
  }
}

const dataUris = new Map();

// The NFL CDN serves headshots as PNGs up to 3,400px wide and 4 MB, and a chart draws
// them at most ~64px across (x1.8 for a small chart, x2 for the canvas). Inlined at full
// size, a 100-row table carried ~100 MB of images in its SVG and took 13 seconds to
// draw. Each image is shrunk so its short side (what a circular crop shows) is this.
const MAX_IMAGE_SIDE = 256;

function readAsDataUri(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function shrunkDataUri(blob) {
  const bitmap = await createImageBitmap(blob);
  const ratio = MAX_IMAGE_SIDE / Math.min(bitmap.width, bitmap.height);
  if (ratio >= 1) {
    bitmap.close();
    return readAsDataUri(blob);
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  const context = canvas.getContext("2d");
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // WebP keeps the cut-out's transparency at a fraction of PNG's size; a browser that
  // cannot encode it (Safari) hands back a PNG instead, which is still small at this size.
  return canvas.toDataURL("image/webp", 0.92);
}

// The NFL CDN resizes on request: every headshot URL carries `f_auto,q_auto`, and adding
// a width there returns a ~12 kB WebP in place of the original's 0.3 to 4 MB. Headshots
// are about 1.4:1, so asking for 1.5x the side keeps the short side above it.
const NFL_HEADSHOT = /^(https:\/\/static\.www\.nfl\.com\/image\/(?:upload|private)\/f_auto,q_auto)\//;

function fetchBlob(url) {
  return fetch(url, { mode: "cors" })
    .then((response) => (response.ok ? response.blob() : Promise.reject(new Error(response.statusText))));
}

/** A remote image as a small data URI, cached; null when it cannot be fetched. */
function toDataUri(url) {
  if (!dataUris.has(url)) {
    const small = url.replace(NFL_HEADSHOT, `$1,w_${MAX_IMAGE_SIDE * 1.5}/`);
    dataUris.set(
      url,
      fetchBlob(small)
        .catch(() => (small === url ? Promise.reject() : fetchBlob(url)))
        .then((blob) => shrunkDataUri(blob).catch(() => readAsDataUri(blob)))
        .catch(() => null),
    );
  }
  return dataUris.get(url);
}

/** Replace every external <image> with a data URI, or drop it (the initials beneath show). */
async function inlineImages(svg) {
  const images = [...svg.querySelectorAll("image")];
  await Promise.all(images.map(async (image) => {
    const href = image.getAttribute("href") || image.getAttributeNS("http://www.w3.org/1999/xlink", "href");
    if (!href || href.startsWith("data:")) return;
    const uri = await toDataUri(href);
    if (uri) image.setAttribute("href", uri);
    else image.remove();
  }));
}

async function loadImage(svg, width, height) {
  svg.setAttribute("width", Math.round(width));
  svg.setAttribute("height", Math.round(height));
  const xml = new XMLSerializer().serializeToString(svg);
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  await image.decode();
  return image;
}

function drawMark(context, x, y, height, palette, alpha = 1) {
  const scale = height / 620.36;
  context.save();
  context.globalAlpha = alpha;
  context.translate(x, y);
  context.scale(scale, scale);
  context.fillStyle = palette.fg;
  context.fill(new Path2D(MARK_PATHS.ink), "evenodd");
  context.fillStyle = palette.accent;
  context.fill(new Path2D(MARK_PATHS.accent), "evenodd");
  context.restore();
  return height * MARK_ASPECT;
}

/**
 * Compose a branded PNG.
 *
 * @param {() => JSX.Element} render  returns the chart to export (an element whose
 *   outermost node is, or contains, one <svg> with a viewBox). Rendered with no
 *   providers, so it must not need the router or React Query.
 * @param {"fit"|"wide"|"square"} size  "fit" sizes the frame to the chart, enlarging it
 *   at most `fitScale` times so a narrow chart keeps readable type
 * @param {"dark"|"light"} theme
 * @param {number} fitScale  the most "fit" enlarges a chart (1.8 by default). A table is
 *   drawn at its final type size and passes 1.
 * @param {boolean} watermark  the faint mark inside the plot. A table leaves it out,
 *   because there it sits on top of the last rows' numbers.
 * @returns {Promise<{url: string, blob: Blob, width: number, height: number}>}
 */
export async function composeImage({ render, title, subtitle, size = "fit", theme = "dark", fitScale = 1.8, watermark = true }) {
  // Always yields before rendering, so the offscreen flushSync never runs inside a React
  // lifecycle (a caller in an effect would otherwise trip React's warning).
  await (document.fonts?.ready ?? Promise.resolve());
  const { clone, width, height, palette } = renderInTheme(render(), theme);
  await inlineImages(clone);

  const pad = 48;
  const head = subtitle ? 104 : 80;
  const foot = 76;
  const fitWidth = Math.min(1600 - pad * 2, width * fitScale);
  const frameWidth = size === "square" ? 1080 : size === "wide" ? 1600 : Math.max(900, Math.round(fitWidth + pad * 2));
  let chartWidth = size === "fit" ? fitWidth : frameWidth - pad * 2;
  let chartHeight = chartWidth * (height / width);
  const frameHeight = size === "wide" ? 900 : size === "square" ? 1080 : Math.round(head + chartHeight + foot + pad);
  const room = frameHeight - head - foot - pad;
  if (chartHeight > room) {
    chartHeight = room;
    chartWidth = chartHeight * (width / height);
  }

  const scale = Math.min(SCALE, Math.sqrt(MAX_PIXELS / (frameWidth * frameHeight)));
  const chart = await loadImage(clone, chartWidth * scale, chartHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(frameWidth * scale);
  canvas.height = Math.round(frameHeight * scale);
  const context = canvas.getContext("2d");
  context.scale(scale, scale);
  context.fillStyle = palette.background;
  context.fillRect(0, 0, frameWidth, frameHeight);
  context.fillStyle = palette.accent;
  context.fillRect(0, 0, frameWidth, 4);

  context.textBaseline = "alphabetic";
  context.fillStyle = palette.fg;
  context.font = `700 34px ${FONT_SANS}`;
  context.fillText(title, pad, pad + 26, frameWidth - pad * 2 - 150);
  if (subtitle) {
    context.fillStyle = palette.muted;
    context.font = `500 19px ${FONT_SANS}`;
    context.fillText(subtitle, pad, pad + 60, frameWidth - pad * 2);
  }
  drawMark(context, frameWidth - pad - 64, pad - 4, 40, palette);

  const left = (frameWidth - chartWidth) / 2;
  const top = head + pad / 2;
  context.drawImage(chart, left, top, chartWidth, chartHeight);
  if (watermark) {
    const markHeight = Math.min(120, chartHeight * 0.16);
    drawMark(context, left + chartWidth - markHeight * MARK_ASPECT - 14, top + chartHeight - markHeight - 14, markHeight, palette, 0.07);
  }

  const footTop = frameHeight - foot;
  context.fillStyle = palette.rule;
  context.fillRect(pad, footTop, frameWidth - pad * 2, 1);
  const markWidth = drawMark(context, pad, footTop + 22, 32, palette);
  context.font = `700 17px ${FONT_SANS}`;
  context.letterSpacing = "3px";
  context.fillStyle = palette.fg;
  context.fillText("SECOND", pad + markWidth + 14, footTop + 44);
  const secondWidth = context.measureText("SECOND ").width;
  context.fillStyle = palette.accent;
  context.fillText("LEVEL", pad + markWidth + 14 + secondWidth, footTop + 44);
  context.letterSpacing = "0px";
  context.textAlign = "right";
  context.fillStyle = palette.fg;
  context.font = `600 19px ${FONT_SANS}`;
  context.fillText(`${SITE_URL}   ${SITE_HANDLE}`, frameWidth - pad, footTop + 38);
  context.fillStyle = palette.faint;
  context.font = `500 14px ${FONT_SANS}`;
  context.fillText(DATA_CREDIT, frameWidth - pad, footTop + 58);
  context.textAlign = "left";

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("The image is too large to draw."))), "image/png");
  });
  return { url: URL.createObjectURL(blob), blob, width: canvas.width, height: canvas.height };
}
