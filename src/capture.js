// Screenshot primitives. The page render is the expensive part, so it's
// split out from the cropping: a drag capture and the automatic context
// capture of the same comment share ONE render instead of paying for two.
//
// WE own the crop in page coordinates — html2canvas used to own it and
// silently shifted it by the window scroll (double-counting: the hero
// showed up in captures taken further down the page). Owning the crop
// makes that whole bug class impossible.

import { domToCanvas } from "modern-screenshot";
import { TAG_NAME } from "./root-element.js";

/** Automatic captures render and encode small — they live in localStorage. */
export const AUTO_SCALE = 0.5;
const AUTO_QUALITY = 0.7;

const isUnpainted = (color) =>
  !color || color === "transparent" || color === "rgba(0, 0, 0, 0)";

// What the user visually perceives as the page background: the html/body
// CSS color when one is painted, else white — browsers paint their own
// white canvas under a transparent document, but that canvas is not part
// of the DOM, so a DOM-based render would come out as a transparent PNG
// (invisible against the dark inbox UI).
const effectiveBackgroundColor = () => {
  const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
  if (!isUnpainted(htmlBg)) return htmlBg;
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  if (!isUnpainted(bodyBg)) return bodyBg;
  return "#ffffff";
};

/**
 * Whether `modern-screenshot` can embed the page's web fonts.
 *
 * It reads `@font-face` rules by parking a `<style>` in a detached document
 * and reading back `.sheet`. That element inherits the host page's CSP, so a
 * policy with a strict `style-src` refuses to parse it, `.sheet` comes back
 * null, and the render dies on `null.cssRules` — taking the entire capture
 * with it, not just the fonts. Probing costs one detached document; the
 * render it guards costs orders of magnitude more.
 * @returns {boolean}
 */
export const canEmbedWebFonts = () => {
  try {
    const probe = document.implementation.createHTMLDocument("");
    const style = probe.createElement("style");
    probe.head.appendChild(style);
    return style.sheet !== null;
  } catch {
    return false;
  }
};

/**
 * Pulls the `@font-face` blocks out of a stylesheet's source text.
 *
 * Only those: the sheet is a third party's, and appending the whole thing to
 * the host's `<head>` would put its layout rules last in the cascade and
 * restyle the page for the duration of the capture.
 * @param {string} css
 * @returns {string}
 */
export const extractFontFaceRules = (css) => {
  const blocks = [];
  let at = css.indexOf("@font-face");
  while (at !== -1) {
    const open = css.indexOf("{", at);
    const close = open === -1 ? -1 : css.indexOf("}", open);
    if (close === -1) break; // truncated sheet — keep what parsed cleanly
    blocks.push(css.slice(at, close + 1));
    at = css.indexOf("@font-face", close);
  }
  return blocks.join("\n");
};

/** Same sheet, same session, one request. @type {Map<string, Promise<string>>} */
const fontRuleCache = new Map();

const fetchFontRules = (href) => {
  if (!fontRuleCache.has(href)) {
    fontRuleCache.set(
      href,
      fetch(href, { mode: "cors", credentials: "omit" })
        .then((res) => (res.ok ? res.text() : ""))
        .then(extractFontFaceRules)
        .catch(() => "")
    );
  }
  return fontRuleCache.get(href);
};

const isReadable = (sheet) => {
  try {
    return Boolean(sheet.cssRules);
  } catch {
    return false;
  }
};

/**
 * Makes a cross-origin stylesheet's web fonts reachable by the renderer, and
 * returns the undo.
 *
 * `cssRules` throws `SecurityError` on a cross-origin sheet, so the renderer
 * never finds its `@font-face` rules and never inlines the font files. What
 * it produces is an SVG rendered as an image — an isolated document with no
 * network of its own — so a font that was not inlined is simply absent and
 * the text reflows into a fallback. Fallback metrics differ, which moves
 * every glyph sideways: the page still *looks* about right, but a drag crop
 * taken at live coordinates comes back holding the wrong glyphs.
 *
 * `fetch` succeeds where `cssRules` does not — font CDNs serve
 * `Access-Control-Allow-Origin: *` — and a same-origin `<style>` carrying
 * those rules is readable, so the renderer inlines the binaries itself
 * rather than us reimplementing that. A host that refuses the fetch (no
 * CORS, a `connect-src` policy) lands exactly where it is today.
 *
 * Off unless asked for: requesting a third party's stylesheet is network a
 * host did not sign up for by mounting a comment widget, so that call is
 * theirs to make.
 * @param {boolean} enabled
 * @returns {Promise<() => void>}
 */
const shimUnreadableFontRules = async (enabled) => {
  const noop = () => {};
  if (!enabled || !canEmbedWebFonts()) return noop;

  const hrefs = Array.from(document.styleSheets)
    .filter((sheet) => sheet.href && !isReadable(sheet))
    .map((sheet) => sheet.href);
  if (!hrefs.length) return noop;

  const css = (await Promise.all(hrefs.map(fetchFontRules)))
    .filter(Boolean)
    .join("\n");
  if (!css) return noop;

  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
  return () => style.remove();
};

/**
 * Renders the whole page to a canvas. This is the expensive call — callers
 * that need more than one image should render once and crop repeatedly.
 *
 * The widget must never render into its own screenshot: the host node is
 * filtered out of the clone. Filtering replaced the old hide-during-render
 * approach (withHiddenOverlay), which took the whole UI off screen for the
 * duration of the render and therefore forced callers to await the capture
 * before showing anything — with the filter, a capture can run in the
 * background while the comment box is already on screen.
 * @param {{ scale?: number, embedCrossOriginFonts?: boolean }} [options]
 *   scale 1 keeps the canvas in CSS pixels so crop rects map 1:1 to page
 *   coordinates. `embedCrossOriginFonts` opts into fetching stylesheets the
 *   renderer cannot read, so their web fonts survive into the capture.
 * @returns {Promise<any>}
 */
export async function renderPage({
  scale = 1,
  embedCrossOriginFonts = false,
} = {}) {
  const unshim = await shimUnreadableFontRules(embedCrossOriginFonts);
  try {
    // documentElement, not body. The clone is re-parented into a document
    // where the UA's `body { margin: 8px }` applies again, even on a page
    // that zeroed it — so rendering <body> pushed every flow element 8px
    // right and down inside a canvas that did not grow, losing 8px off the
    // right edge and putting every crop 8px out. <html> carries no such
    // margin, so page coordinates and canvas pixels line up 1:1, which is
    // exactly what the crops below assume.
    return await domToCanvas(document.documentElement, {
      scale,
      backgroundColor: effectiveBackgroundColor(),
      // Dropping web fonts costs one font substitution inside the image;
      // keeping them where they cannot be read costs the image entirely.
      ...(canEmbedWebFonts() ? {} : { font: false }),
      // nodeName, not tagName: the filter also receives text nodes, which
      // must be kept (and have no tagName).
      filter: (node) => node.nodeName?.toLowerCase() !== TAG_NAME,
    });
  } finally {
    unshim();
  }
}

/**
 * Lays the page's background down across the whole output before the render
 * goes on top.
 *
 * The render covers the BODY's box, which on a page shorter than the
 * viewport is shorter than the crop. Whatever the render does not reach
 * keeps the canvas's initial transparent black — invisible in a PNG, and a
 * solid black band once JPEG flattens it. The browser paints html/body
 * across the entire viewport, so the background is what is really there.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 */
const paintBackdrop = (ctx, width, height) => {
  ctx.fillStyle = effectiveBackgroundColor();
  ctx.fillRect(0, 0, width, height);
};

/**
 * Crops a viewport-relative region out of a scale-1 page render.
 * @param {any} canvas full-page render from renderPage({ scale: 1 })
 * @param {{ left: number, top: number, width: number, height: number }} region
 *   Viewport (client) coordinates of the drag selection.
 * @returns {string | null} PNG data-URL, or null with no 2d context.
 */
export function cropRegion(canvas, { left, top, width, height }) {
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) return null;

  paintBackdrop(ctx, width, height);
  ctx.drawImage(
    canvas,
    left + window.scrollX,
    top + window.scrollY,
    width,
    height,
    0,
    0,
    width,
    height
  );
  return out.toDataURL("image/png");
}

/**
 * Crops the current viewport out of a page render and encodes it small.
 * @param {any} canvas full-page render
 * @param {{ sourceScale?: number, outputScale?: number, quality?: number }} [options]
 *   `sourceScale` is the scale `canvas` was rendered at — the source rect is
 *   mapped through it. `outputScale` is the final size in CSS pixels.
 * @returns {string | null} JPEG data-URL, or null with no 2d context.
 */
export function cropViewport(
  canvas,
  { sourceScale = 1, outputScale = AUTO_SCALE, quality = AUTO_QUALITY } = {}
) {
  const out = document.createElement("canvas");
  out.width = Math.round(window.innerWidth * outputScale);
  out.height = Math.round(window.innerHeight * outputScale);
  const ctx = out.getContext("2d");
  if (!ctx) return null;

  paintBackdrop(ctx, out.width, out.height);
  ctx.drawImage(
    canvas,
    window.scrollX * sourceScale,
    window.scrollY * sourceScale,
    window.innerWidth * sourceScale,
    window.innerHeight * sourceScale,
    0,
    0,
    out.width,
    out.height
  );
  return out.toDataURL("image/jpeg", quality);
}
