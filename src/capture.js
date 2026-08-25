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
import { createPaintYielder } from "./yield-to-paint.js";
import { CAPTURE_STYLE_PROPERTIES } from "./capture-style-props.js";
import { fittingScale, paintsPixels } from "./canvas-limits.js";

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
 * Builds the clone filter.
 *
 * `skipIframeContent` drops what lives inside an iframe while keeping the
 * `<iframe>` element itself, and that distinction is the whole point.
 * Filtering the iframe out by tag name — the obvious reading — removes its
 * BOX, so everything below it slides up by the frame's height: measured at
 * a 260px shift on a 260px frame, with the crop still taken at live page
 * coordinates. That is the misalignment class `capture.js` exists to make
 * impossible. Matching on `ownerDocument` leaves the box, its border and
 * its space exactly where the page put them, and blanks only the interior.
 *
 * Nodes in a shadow root keep the host's `ownerDocument`, so the widget's
 * own shadow content is unaffected by this test.
 * @param {boolean} skipIframeContent
 * @returns {(node: Node) => boolean}
 */
const captureFilter = (skipIframeContent) => (node) => {
  // nodeName, not tagName: the filter also receives text nodes, which must
  // be kept (and have no tagName).
  if (node.nodeName?.toLowerCase() === TAG_NAME) return false;
  if (skipIframeContent && node.ownerDocument !== document) return false;
  return true;
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
 * @param {{ scale?: number, embedCrossOriginFonts?: boolean,
 *   fastCapture?: boolean, skipIframeContent?: boolean,
 *   captureTimeout?: number }} [options]
 *   scale 1 keeps the canvas in CSS pixels so crop rects map 1:1 to page
 *   coordinates. `embedCrossOriginFonts` opts into fetching stylesheets the
 *   renderer cannot read, so their web fonts survive into the capture.
 *   `fastCapture` narrows the computed-style enumeration to a curated list
 *   (see capture-style-props.js) — roughly 2.7x off the dominant phase, at
 *   the cost of any property that list does not name. `skipIframeContent`
 *   blanks embedded documents instead of cloning them. `captureTimeout`
 *   bounds how long a single remote asset may hold the render up.
 * @returns {Promise<{ canvas: any, scale: number }>} the render and the scale
 *   it was ACTUALLY produced at, which is not always the one asked for — see
 *   the canvas ceiling below. Every crop has to map through this rather than
 *   assume the requested scale.
 */
export async function renderPage({
  scale = 1,
  embedCrossOriginFonts = false,
  fastCapture = false,
  skipIframeContent = false,
  captureTimeout,
} = {}) {
  const unshim = await shimUnreadableFontRules(embedCrossOriginFonts);
  const { width, height } = document.documentElement.getBoundingClientRect();
  // A page taller than the browser's canvas ceiling used to render to a
  // canvas that reported the right size and held nothing, so every crop off
  // it was blank and nothing said so. Fitting the scale to the ceiling turns
  // that into a capture that is correct and progressively softer.
  let attempt = fittingScale(width, height, scale);
  try {
    // The ceiling differs by more than an order of magnitude between
    // engines, so the fitted scale is a guess and the render is checked
    // rather than trusted. Halving quarters the pixel count, so three
    // attempts cover a 64x overshoot; past that, throwing is the honest
    // outcome — it reaches the host through onError, where a blank image
    // never would.
    for (let left = 3; ; left--) {
      // documentElement, not body. The clone is re-parented into a document
      // where the UA's `body { margin: 8px }` applies again, even on a page
      // that zeroed it — so rendering <body> pushed every flow element 8px
      // right and down inside a canvas that did not grow, losing 8px off the
      // right edge and putting every crop 8px out. <html> carries no such
      // margin, so page coordinates and canvas pixels line up 1:1, which is
      // exactly what the crops below assume.
      const canvas = await domToCanvas(document.documentElement, {
        scale: attempt,
        backgroundColor: effectiveBackgroundColor(),
        // Dropping web fonts costs one font substitution inside the image;
        // keeping them where they cannot be read costs the image entirely.
        ...(canEmbedWebFonts() ? {} : { font: false }),
        filter: captureFilter(skipIframeContent),
        // The clone traversal awaits this hook once per node, which makes it
        // the one place a caller can get the main thread back mid-render —
        // see yield-to-paint.js for why awaiting anything else does not.
        onCloneEachNode: createPaintYielder(),
        // Spread rather than a null: passing `includeStyleProperties: null`
        // is the renderer's own "enumerate everything" default, so the two
        // branches would be indistinguishable to a test reading the options.
        ...(fastCapture
          ? { includeStyleProperties: CAPTURE_STYLE_PROPERTIES }
          : {}),
        // Omitted rather than defaulted: the renderer has its own 30 000 ms,
        // and repeating that number here would pin us to one that is theirs
        // to change.
        //
        // Finite AND positive, both load-bearing, because the two values a
        // host would reach for to mean "no deadline" each do the opposite.
        // The renderer reads 0 as "never give up" and hangs; `Infinity`
        // reaches `setTimeout`, which coerces it to 0 and aborts on the
        // spot. Neither is a deadline, so neither is honoured — and a
        // string that merely compares as a number is not one either.
        ...(Number.isFinite(captureTimeout) && captureTimeout > 0
          ? { timeout: captureTimeout }
          : {}),
      });

      if (paintsPixels(canvas)) return { canvas, scale: attempt };
      if (left <= 0) {
        throw new Error(
          `HellDots: the page render came back holding no pixels. ` +
            `${Math.round(width)}x${Math.round(height)} CSS pixels is most ` +
            `likely past this browser's canvas limit.`
        );
      }
      attempt /= 2;
    }
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
 * @param {any} canvas full-page render from `renderPage`
 * @param {{ left: number, top: number, width: number, height: number }} region
 *   Viewport (client) coordinates of the drag selection.
 * @param {{ sourceScale?: number }} [options] the scale `canvas` was actually
 *   produced at — `renderPage` reports it, and it is not always the one asked
 *   for. The output stays sized in CSS pixels either way, so a render the
 *   canvas ceiling forced down comes back soft rather than the wrong size.
 * @returns {string | null} PNG data-URL, or null with no 2d context.
 */
export function cropRegion(
  canvas,
  { left, top, width, height },
  { sourceScale = 1 } = {}
) {
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) return null;

  paintBackdrop(ctx, width, height);
  ctx.drawImage(
    canvas,
    (left + window.scrollX) * sourceScale,
    (top + window.scrollY) * sourceScale,
    width * sourceScale,
    height * sourceScale,
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
