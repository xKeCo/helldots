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
   *   embedCrossOriginFonts?: boolean,
   *   fastCapture?: boolean,
   *   skipIframeContent?: boolean,
   *   captureTimeout?: number,
   *   onRegionCaptured: (dataUrl: string) => void,
   *   onRegionPending?: (pending: boolean) => void,
   *   onPlace: (x: number, y: number) => Promise<void>,
   *   onError?: (error: unknown) => void,
   * }} deps `host` is where the selection rectangle mounts. `onError` is
   *   how a failed render reaches the host: a capture that silently comes
   *   back null leaves a feedback tool without the thing it exists to
   *   collect, and the console is the only place that says so today.
   */
  constructor({
    host,
    autoScreenshot,
    embedCrossOriginFonts = false,
    fastCapture = false,
    skipIframeContent = false,
    captureTimeout,
    onRegionCaptured,
    onRegionPending,
    onPlace,
    onError,
  }) {
    this.host = host;
    this.autoScreenshot = autoScreenshot;
    this.embedCrossOriginFonts = embedCrossOriginFonts;
    this.fastCapture = fastCapture;
    this.skipIframeContent = skipIframeContent;
    this.captureTimeout = captureTimeout;
    this.onRegionCaptured = onRegionCaptured;
    this.onRegionPending = onRegionPending;
    this.onPlace = onPlace;
    this.onError = onError;

    /**
     * The in-flight automatic capture, resolving to a JPEG data-URL or
     * null. A promise rather than the value: the render kicks off when the
     * comment box opens and the save path awaits it, so the render never
     * gates the box.
     * @type {Promise<string | null> | null}
     */
    this.pendingCapture = null;

    /**
     * The in-flight region crop. Nothing reads its value — the crop reaches
     * the box through `onRegionCaptured` — but the save path has to be able
     * to wait for it.
     * @type {Promise<void> | null}
     */
    this.pendingRegion = null;

    /**
     * Identity of the gesture that owns the in-flight region crop.
     *
     * An object rather than a boolean, and compared by identity: what has to
     * be caught is not only "the draft was dismissed" but "dismissed and a
     * different one opened while the render ran" — a window that is now
     * seconds long, because the box no longer waits. A flag cannot tell
     * those apart, and the crop would land on the wrong draft.
     * @type {object | null}
     */
    this._regionToken = null;

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
        this.startRegionCapture({ left, top, width, height });
      }

      // NOT awaited any more. This used to sit behind the render, which on
      // a heavy page meant a second or more between releasing the mouse and
      // the box appearing — the gesture read as having been ignored. The
      // crop arrives through `onRegionCaptured` and drops into the slot the
      // box is already showing.
      await this.onPlace(e.clientX, e.clientY);
    } else {
      await this.onPlace(this._dragStart.x, this._dragStart.y);
    }

    this._isDragging = false;
    this._dragStart = null;
  }

  /**
   * Starts the render a drag gesture pays for, and returns immediately.
   *
   * One render still feeds both images — the PNG region the user selected
   * and the automatic JPEG context shot — because rendering the page is
   * practically the whole cost of a capture and doing it twice for one
   * comment was never defensible.
   *
   * `pendingCapture` is claimed synchronously, before this returns: the very
   * next thing the caller does is `onPlace`, which runs `armClickCapture`,
   * and that starts a SECOND render unless the slot is already taken.
   * @param {{ left: number, top: number, width: number, height: number }} region
   *   Viewport coordinates of the selection.
   */
  startRegionCapture(region) {
    const token = {};
    this._regionToken = token;
    const stillMine = () => this._regionToken === token;

    const render = renderPage({
      scale: 1,
      embedCrossOriginFonts: this.embedCrossOriginFonts,
      fastCapture: this.fastCapture,
      skipIframeContent: this.skipIframeContent,
      captureTimeout: this.captureTimeout,
    });

    if (this.autoScreenshot) {
      this.pendingCapture = render
        .then(({ canvas, scale }) =>
          stillMine() ? cropViewport(canvas, { sourceScale: scale }) : null
        )
        // Reported through the region chain below, which owns the error for
        // this render — one failure should not reach the host twice.
        .catch(() => null);
    }

    this.onRegionPending?.(true);
    this.pendingRegion = render
      .then(({ canvas, scale }) => {
        if (!stillMine()) return;
        // The render's real scale, not the requested 1: on a page past the
        // canvas ceiling those differ, and cropping at 1 would cut the
        // wrong rectangle out of a smaller image.
        const dataUrl = cropRegion(canvas, region, { sourceScale: scale });
        if (dataUrl) this.onRegionCaptured(dataUrl);
      })
      .catch((err) => {
        console.warn("HellDots: screenshot capture failed:", err);
        this.onError?.(err);
      })
      .finally(() => {
        // Only if this gesture still owns the slot: a newer draft has its
        // own placeholder, and clearing it here would blank that one.
        if (stillMine()) this.onRegionPending?.(false);
      });
  }

  /**
   * Kicks off the click path's background capture. Half scale because the
   * output is half scale anyway — that is ~4x off the RASTER, which is a
   * small share of the total; the clone and the style reads cost the same
   * at either scale. Deliberately NOT awaited: on heavy pages the render
   * takes hundreds of ms, and gating the comment box on it made every
   * click feel broken. The save path awaits the promise, by which time it
   * has almost always resolved.
   */
  armClickCapture() {
    if (!this.autoScreenshot || this.pendingCapture) return;
    this.pendingCapture = renderPage({
      scale: AUTO_SCALE,
      embedCrossOriginFonts: this.embedCrossOriginFonts,
      fastCapture: this.fastCapture,
      skipIframeContent: this.skipIframeContent,
      captureTimeout: this.captureTimeout,
    })
      .then(({ canvas, scale }) => cropViewport(canvas, { sourceScale: scale }))
      .catch((err) => {
        console.warn("HellDots: automatic screenshot failed", err);
        this.onError?.(err);
        return null;
      });
  }

  /**
   * The capture the save path attaches — null when none is in flight.
   *
   * Waits on the region crop too, even though that is not what it returns.
   * Both come off the same render, and the save path reads the attachments
   * array immediately after this resolves; awaiting only the context shot
   * would let a Send land in the window before the crop was pushed into
   * that array, silently dropping the thing the user deliberately selected.
   * Folded in here rather than left as a second call for the caller to
   * remember, because forgetting it fails silently.
   * @returns {Promise<string | null>}
   */
  async consumePending() {
    await this.pendingRegion;
    return this.pendingCapture ? await this.pendingCapture : null;
  }

  /** Dismissing the comment box must not leak its capture into the next. */
  clearPending() {
    this.pendingCapture = null;
    this.pendingRegion = null;
    // Orphans whatever render is still running: its crop now belongs to a
    // draft that is gone, and the promise cannot be cancelled.
    this._regionToken = null;
  }

  /** Drops listeners and the selection rectangle, even mid-gesture. */
  destroy() {
    document.removeEventListener("mousemove", this._boundDragMove);
    document.removeEventListener("mouseup", this._boundDragEnd);
    this._selectionRect?.remove();
    this._selectionRect = null;
    this.pendingCapture = null;
    this.pendingRegion = null;
    this._regionToken = null;
    this._dragStart = null;
    this._isDragging = false;
  }
}
