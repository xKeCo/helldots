// Region screenshots for the drag-to-capture flow. The page is rendered
// once with modern-screenshot and WE do the cropping in page coordinates —
// html2canvas used to own the crop and silently shifted it by the window
// scroll (double-counting: the hero showed up in captures taken further
// down the page). Owning the crop makes that whole bug class impossible.

import { domToCanvas } from "modern-screenshot";

/**
 * Captures a viewport-relative region of the current page.
 * @param {{ left: number, top: number, width: number, height: number }} region
 *   Viewport (client) coordinates of the drag selection.
 * @returns {Promise<string | null>} PNG data-URL, or null when a 2d canvas
 *   context isn't available. Render failures reject — the caller decides
 *   how to degrade.
 */
export async function captureRegion({ left, top, width, height }) {
  const full = await domToCanvas(document.body, {
    // scale 1 keeps the rendered canvas in CSS pixels so the crop rect
    // below maps 1:1 to page coordinates.
    scale: 1,
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(
    full,
    left + window.scrollX,
    top + window.scrollY,
    width,
    height,
    0,
    0,
    width,
    height
  );
  return canvas.toDataURL("image/png");
}
