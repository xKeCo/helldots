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
 * Renders the whole page to a canvas. This is the expensive call — callers
 * that need more than one image should render once and crop repeatedly.
 *
 * The widget must never render into its own screenshot: the host node is
 * filtered out of the clone. Filtering replaced the old hide-during-render
 * approach (withHiddenOverlay), which took the whole UI off screen for the
 * duration of the render and therefore forced callers to await the capture
 * before showing anything — with the filter, a capture can run in the
 * background while the comment box is already on screen.
 * @param {{ scale?: number }} [options] scale 1 keeps the canvas in CSS
 *   pixels so crop rects map 1:1 to page coordinates.
 * @returns {Promise<any>}
 */
export async function renderPage({ scale = 1 } = {}) {
  return domToCanvas(document.body, {
    scale,
    backgroundColor: effectiveBackgroundColor(),
    // nodeName, not tagName: the filter also receives text nodes, which
    // must be kept (and have no tagName).
    filter: (node) => node.nodeName?.toLowerCase() !== TAG_NAME,
  });
}

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
