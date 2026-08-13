// Drag-selection and screenshot-capture orchestration.
//
// Extracted from CommentOverlay as part of splitting the god object
// (DECISIONS.md, Fase 5). This module owns the drag rectangle, the one
// render each gesture pays for, and the pending automatic capture the
// click path kicks off in the background. Placement — anchoring, the
// comment box — stays with the overlay and is reached through `onPlace`;
// the pending-attachments array stays with the comment box that previews
// it and is fed through `onRegionCaptured`.

import { renderPage, cropRegion, cropViewport, AUTO_SCALE } from "./capture.js";
import { CLASSES } from "./constants.js";

export class CaptureFlow {
  /**
   * @param {{
   *   host: ShadowRoot,
   *   autoScreenshot: boolean,
   *   onRegionCaptured: (dataUrl: string) => void,
   *   onPlace: (x: number, y: number) => Promise<void>,
   * }} deps `host` is where the selection rectangle mounts.
   */
  constructor({ host, autoScreenshot, onRegionCaptured, onPlace }) {
    this.host = host;
    this.autoScreenshot = autoScreenshot;
    this.onRegionCaptured = onRegionCaptured;
    this.onPlace = onPlace;

    /**
     * The in-flight automatic capture, resolving to a JPEG data-URL or
     * null. A promise rather than the value: the render kicks off when the
     * comment box opens and the save path awaits it, so the render never
     * gates the box.
     * @type {Promise<string | null> | null}
     */
    this.pendingCapture = null;

    /** @type {{ x: number, y: number } | null} */
    this._dragStart = null;
    this._isDragging = false;
    /** @type {HTMLElement | null} */
    this._selectionRect = null;
    this._boundDragMove = (/** @type {MouseEvent} */ e) => this.onDragMove(e);
    this._boundDragEnd = (/** @type {MouseEvent} */ e) => this.onDragEnd(e);
  }

  /** Starts tracking a possible drag from a mousedown in comment mode. */
  beginDrag(/** @type {MouseEvent} */ e) {
    this._dragStart = { x: e.clientX, y: e.clientY };
    this._isDragging = false;
    document.addEventListener("mousemove", this._boundDragMove);
    document.addEventListener("mouseup", this._boundDragEnd);
  }

  onDragMove(/** @type {MouseEvent} */ e) {
    const dx = e.clientX - this._dragStart.x;
    const dy = e.clientY - this._dragStart.y;

    if (!this._isDragging && Math.hypot(dx, dy) < 5) return;

    this._isDragging = true;

    const left = Math.min(this._dragStart.x, e.clientX);
    const top = Math.min(this._dragStart.y, e.clientY);
    const width = Math.abs(dx);
    const height = Math.abs(dy);

    if (!this._selectionRect) {
      this._selectionRect = document.createElement("div");
      this._selectionRect.className = CLASSES.SELECTION_RECT;
      this.host.appendChild(this._selectionRect);
    }

    this._selectionRect.style.left = `${left}px`;
    this._selectionRect.style.top = `${top}px`;
    this._selectionRect.style.width = `${width}px`;
    this._selectionRect.style.height = `${height}px`;
  }

  async onDragEnd(/** @type {MouseEvent} */ e) {
    document.removeEventListener("mousemove", this._boundDragMove);
    document.removeEventListener("mouseup", this._boundDragEnd);

    if (this._isDragging) {
      const left = Math.min(this._dragStart.x, e.clientX);
      const top = Math.min(this._dragStart.y, e.clientY);
      const width = Math.abs(e.clientX - this._dragStart.x);
      const height = Math.abs(e.clientY - this._dragStart.y);

      this._selectionRect?.remove();
      this._selectionRect = null;

      if (width > 10 && height > 10) {
        try {
          // One render feeds both images: the PNG region the user selected
          // and the automatic JPEG context shot. Unlike the click path this
          // one awaits — the region crop IS what the user asked for, and
          // the box should open with its preview already attached.
          const full = await renderPage({ scale: 1 });
          const dataUrl = cropRegion(full, { left, top, width, height });
          if (dataUrl) this.onRegionCaptured(dataUrl);
          if (this.autoScreenshot) {
            this.pendingCapture = Promise.resolve(
              cropViewport(full, { sourceScale: 1 })
            );
          }
        } catch (err) {
          console.warn("HellDots: screenshot capture failed:", err);
        }
      }

      await this.onPlace(e.clientX, e.clientY);
    } else {
      await this.onPlace(this._dragStart.x, this._dragStart.y);
    }

    this._isDragging = false;
    this._dragStart = null;
  }

  /**
   * Kicks off the click path's background capture. Half scale because the
   * output is half scale anyway — the render is the expensive part, and it
   * costs ~4x less here than at scale 1. Deliberately NOT awaited: on heavy
   * pages the render takes hundreds of ms, and gating the comment box on it
   * made every click feel broken. The save path awaits the promise, by
   * which time it has almost always resolved.
   */
  armClickCapture() {
    if (!this.autoScreenshot || this.pendingCapture) return;
    this.pendingCapture = renderPage({ scale: AUTO_SCALE })
      .then((full) => cropViewport(full, { sourceScale: AUTO_SCALE }))
      .catch((err) => {
        console.warn("HellDots: automatic screenshot failed", err);
        return null;
      });
  }

  /**
   * The capture the save path attaches — null when none is in flight.
   * @returns {Promise<string | null>}
   */
  async consumePending() {
    return this.pendingCapture ? await this.pendingCapture : null;
  }

  /** Dismissing the comment box must not leak its capture into the next. */
  clearPending() {
    this.pendingCapture = null;
  }

  /** Drops listeners and the selection rectangle, even mid-gesture. */
  destroy() {
    document.removeEventListener("mousemove", this._boundDragMove);
    document.removeEventListener("mouseup", this._boundDragEnd);
    this._selectionRect?.remove();
    this._selectionRect = null;
    this.pendingCapture = null;
    this._dragStart = null;
    this._isDragging = false;
  }
}
