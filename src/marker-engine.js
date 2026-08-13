// The marker engine: circle rendering, position math, occlusion hit-testing,
// the batched rAF update loop, and every observer/listener that feeds it.
//
// Extracted from CommentOverlay as part of splitting the god object
// (DECISIONS.md, Fase 5). The engine owns WHERE markers are and WHETHER they
// are visible; what a marker click or hover opens (tooltip, thread popover)
// belongs to the overlay and comes in through `wireMarker`, so this module
// never learns about panels, storage or callbacks to the host app.

import { MARKER_SIZE } from "./constants.js";
import { createCommentCircle } from "./components.js";
import { TAG_NAME } from "./root-element.js";

// How long a batched position pass may reuse the previous occlusion verdict
// before hit-testing again. Scrolling schedules a pass per frame; occlusion
// rarely changes mid-scroll, and the trailing pass settles the end state.
const OCCLUSION_INTERVAL_MS = 150;

export class MarkerEngine {
  /**
   * @param {{
   *   container: HTMLElement,
   *   strings: Object,
   *   getComments: () => any[],
   *   wireMarker: (circle: HTMLElement, comment: any) => void,
   *   onMarkerHidden: (comment: any) => void,
   *   onVisibilityFlip: () => void,
   *   onAfterPass: () => void,
   * }} deps `container` is the overlay element the circles mount into;
   *   `wireMarker` is where the overlay attaches its tooltip/popover
   *   handlers; `onMarkerHidden` dismisses UI floating over a marker that
   *   just went away; `onAfterPass` runs after every rAF pass (the thread
   *   popover follows its marker there).
   */
  constructor(deps) {
    this.deps = deps;

    /**
     * Marker circles by String(comment.id). The per-frame position loop
     * used to querySelector each one — a full shadow-tree scan per comment
     * per frame, O(n²) on scroll.
     * @type {Map<string, HTMLElement>}
     */
    this.circles = new Map();
    /** @type {Map<string, { circle: HTMLElement, observer: any, container: HTMLElement }>} */
    this.resizeObservers = new Map();
    /** Position validation gate — off means passes only sync the popover. */
    this.enabled = true;

    // Occlusion hit-testing (elementsFromPoint + getComputedStyle per
    // marker) is the expensive part of a position pass, and scrolling is
    // when passes are hottest — so batched passes run it at most once per
    // OCCLUSION_INTERVAL_MS, with a trailing pass to settle the final state.
    this._lastOcclusionPass = 0;
    this._occlusionTrailingTimer = null;

    // rAF scheduling flag for bulk updates
    this._pendingRaf = null;

    this._globalMutationObserver = null;
    this._resizeHandler = null;
    this._scrollHandler = null;
    this._loadHandler = null;
  }

  /** Attaches the window listeners and the page-wide mutation observer. */
  start() {
    this._resizeHandler = () => this.scheduleUpdate();
    window.addEventListener("resize", this._resizeHandler, { passive: true });

    // Capture scroll on any scrolling ancestor
    this._scrollHandler = () => this.scheduleUpdate();
    window.addEventListener("scroll", this._scrollHandler, {
      capture: true,
      passive: true,
    });

    // Update after resources load (images, fonts)
    this._loadHandler = () => this.scheduleUpdate();
    window.addEventListener("load", this._loadHandler);

    // Modals open/close outside any comment's container (backdrops are
    // usually appended to <body> or toggled via style/class), so the
    // per-comment observers never see them. One page-wide observer keeps
    // the occlusion check honest; shadow-root internals don't bubble into
    // it, so our own marker updates can't retrigger it.
    if (window.MutationObserver) {
      this._globalMutationObserver = new MutationObserver(() => {
        this.scheduleUpdate();
      });
      this._globalMutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class", "hidden", "open"],
      });
    }
  }

  /** Creates, mounts, positions and observes one comment's marker. */
  render(comment) {
    const circle = createCommentCircle(comment, this.deps.strings);
    this.deps.wireMarker(circle, comment);

    this.deps.container.appendChild(circle);
    this.circles.set(String(comment.id), circle);
    this.updatePosition(comment, circle);

    // Size changes of the container are watched per comment (ResizeObserver
    // below); DOM mutations are watched once for the whole page by the
    // global observer in start() — a per-comment MutationObserver here
    // would fire N redundant callbacks per mutation batch on top of it.
    this.createResizeObserver(comment, circle);
  }

  /** The marker circle for a comment id, however the caller spells it. */
  circleOf(id) {
    return this.circles.get(String(id)) ?? null;
  }

  /** Removes one comment's marker and its observer. */
  remove(id) {
    this.cleanupResizeObserver(id);
    this.circles.get(String(id))?.remove();
    this.circles.delete(String(id));
  }

  /** Removes every marker and observer at once (bulk reset). */
  clear() {
    this.resizeObservers.forEach(({ observer }) => observer?.disconnect());
    this.resizeObservers.clear();
    this.circles.forEach((circle) => circle.remove());
    this.circles.clear();
  }

  /**
   * Validates and recalculates comment position based on container dimensions
   * @param {Object} comment - The comment object with position data
   * @param {HTMLElement} circle - The comment circle element
   * @returns {Object} - Validated position data
   */
  validateAndCalculatePosition(comment, circle) {
    if (!comment.container || !circle) return null;

    const containerRect = comment.container.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    // Zero size isn't an anomaly: it's what display:none (e.g. responsive
    // media queries) looks like. The caller hides the marker until the
    // element gets its size back.
    if (containerWidth <= 0 || containerHeight <= 0) {
      return null;
    }

    // Use simple relative positioning for consistent results
    const absoluteX = comment.relativeX * containerWidth;
    const absoluteY = comment.relativeY * containerHeight;

    const circleSize = MARKER_SIZE;
    const validatedX = Math.max(
      0,
      Math.min(absoluteX, containerWidth - circleSize)
    );
    const validatedY = Math.max(
      0,
      Math.min(absoluteY, containerHeight - circleSize)
    );

    // Recalculate relative position for future calculations
    const validatedRelativeX = validatedX / containerWidth;
    const validatedRelativeY = validatedY / containerHeight;

    return {
      absoluteX: validatedX,
      absoluteY: validatedY,
      relativeX: validatedRelativeX,
      relativeY: validatedRelativeY,
      containerWidth,
      containerHeight,
      containerLeft: containerRect.left,
      containerTop: containerRect.top,
    };
  }

  /**
   * The exact element the user clicked on can vanish (responsive
   * display:none) while its coarse anchor container stays visible. When we
   * have a live target — or can re-derive one from the serialized
   * targetSelector — the marker follows ITS visibility too.
   */
  _isAnchorTargetVisible(comment) {
    let target = comment.target;
    if ((!target || !target.isConnected) && comment.anchor?.targetSelector) {
      try {
        target = document.querySelector(comment.anchor.targetSelector);
      } catch {
        target = null;
      }
      comment.target = target || null;
    }
    if (!target || !target.isConnected) return true; // no signal — assume visible
    const rect = target.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  /**
   * A marker floats above the whole page (own shadow host, high z-index),
   * so a host-page modal overlay can never cover it with CSS alone. Hit-test
   * the marker's point instead: if the topmost page element there is
   * unrelated to the comment's anchor (neither ancestor nor descendant),
   * something like a modal backdrop is covering it and the marker should
   * hide with it.
   */
  _isMarkerOccluded(comment, x, y) {
    if (typeof document.elementsFromPoint !== "function") return false;
    // Off-viewport points can't be hit-tested; the marker isn't visible
    // there anyway, so keep the current (visible) state.
    if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) {
      return false;
    }
    const stack = document.elementsFromPoint(x, y);
    // Our own shadow host shows up first (the marker itself, toolbar, …).
    const top = stack.find(
      (el) => el.tagName.toLowerCase() !== TAG_NAME.toLowerCase()
    );
    if (!top) return false;

    const target = comment.target?.isConnected ? comment.target : null;
    // The precise element the comment was left on (or its subtree /
    // ancestors) is what should be under the marker — never an occluder.
    if (target && (target.contains(top) || top.contains(target))) {
      return false;
    }

    const container = comment.container;
    if (!container?.isConnected) return false;
    // Something entirely unrelated to the anchor sits on top of it.
    if (!container.contains(top) && !top.contains(container)) return true;

    // `top` lives inside the anchor container — usually normal content of
    // the anchored subtree. But broad containers (body, page wrappers) also
    // contain the page's modals, so walk the chain up to the container: if
    // it crosses a modal-looking layer the anchor doesn't belong to, the
    // marker is covered after all.
    if (container.contains(top) && top !== container) {
      for (let el = top; el && el !== container; el = el.parentElement) {
        if (this._looksLikeModalLayer(el, target)) return true;
      }
    }
    return false;
  }

  /**
   * Heuristic for "this element is a modal/backdrop layer": explicit dialog
   * semantics, or a hit-testable fixed element covering most of the
   * viewport. Elements that contain the comment's own target are the layer
   * the comment lives in, never an occluder.
   */
  _looksLikeModalLayer(el, target) {
    if (target && el.contains(target)) return false;
    if (el.matches?.('dialog, [aria-modal="true"], [role="dialog"]')) {
      return true;
    }
    if (getComputedStyle(el).position !== "fixed") return false;
    const rect = el.getBoundingClientRect();
    return (
      rect.width >= window.innerWidth * 0.5 &&
      rect.height >= window.innerHeight * 0.5
    );
  }

  /**
   * Read half of a position update: layout reads only, no DOM writes, so a
   * batched pass can measure every marker before touching any style (an
   * interleaved read-write loop forces a fresh layout per marker).
   * @param {Object} comment
   * @param {HTMLElement} circle
   * @param {{ checkOcclusion?: boolean }} [options] when false, the pass
   *   reuses the marker's previous occlusion verdict instead of hit-testing.
   * @returns {{ kind: "resolved" } | { kind: "noop" } | { kind: "hidden" }
   *   | { kind: "visible", viewportX: number, viewportY: number,
   *   relativeX: number, relativeY: number }}
   */
  _computeMarkerState(comment, circle, { checkOcclusion = true } = {}) {
    // Resolved comments have no on-page marker (RF09). This is not the
    // "hidden" state — the anchor is fine, the issue is just done.
    if (comment.status === "resolved") {
      return { kind: "resolved" };
    }

    let positionData = this.validateAndCalculatePosition(comment, circle);
    if (positionData && !this._isAnchorTargetVisible(comment)) {
      positionData = null;
    }
    if (!positionData) {
      // Anchor element currently invisible (zero-size container): hide the
      // marker; it comes back automatically when the observers fire again.
      return comment.container ? { kind: "hidden" } : { kind: "noop" };
    }

    // Offset so the circle's top-left tip (sharp corner) aligns with the stored position
    const circleRadius = MARKER_SIZE / 2;
    const viewportX =
      positionData.containerLeft + positionData.absoluteX + circleRadius;
    const viewportY =
      positionData.containerTop + positionData.absoluteY + circleRadius;

    // A host-page modal (or any unrelated overlay) covering the anchor also
    // hides the marker — it must not float above the modal's backdrop.
    if (checkOcclusion) {
      comment._occluded = this._isMarkerOccluded(comment, viewportX, viewportY);
    }
    if (comment._occluded) {
      return { kind: "hidden" };
    }

    return {
      kind: "visible",
      viewportX,
      viewportY,
      relativeX: positionData.relativeX,
      relativeY: positionData.relativeY,
    };
  }

  /**
   * Write half of a position update: styles and state only, no layout
   * reads.
   * @param {Object} comment
   * @param {HTMLElement} circle
   * @param {ReturnType<MarkerEngine["_computeMarkerState"]>} state
   * @returns {boolean} true when the marker's hidden flag flipped — the
   *   caller decides how to refresh the inbox (once per batch in the rAF
   *   loop, immediately on direct calls).
   */
  _applyMarkerState(comment, circle, state) {
    if (state.kind === "resolved") {
      if (circle) circle.style.display = "none";
      return false;
    }
    if (state.kind === "noop") return false;

    const wasHidden = comment.hidden === true;
    if (state.kind === "hidden") {
      comment.hidden = true;
      circle.style.display = "none";
      // A marker that just went away must not leave its hover tooltip or
      // its open thread popover floating on the page.
      this.deps.onMarkerHidden(comment);
      return !wasHidden;
    }

    comment.hidden = false;
    circle.style.display = "";
    circle.style.left = `${state.viewportX}px`;
    circle.style.top = `${state.viewportY}px`;
    circle.style.transform = "translate(-50%, -50%)";
    circle.style.position = "absolute";

    comment.relativeX = state.relativeX;
    comment.relativeY = state.relativeY;
    return wasHidden;
  }

  /** One marker's position, refreshed now. */
  updatePosition(comment, circle = this.circles.get(String(comment.id))) {
    if (!circle) return;
    const state = this._computeMarkerState(comment, circle);
    const flipped = this._applyMarkerState(comment, circle, state);
    if (flipped) this.deps.onVisibilityFlip();
  }

  /**
   * One batched pass over every marker: measure everything, then write
   * everything, then refresh the inbox at most once — flipping N markers in
   * one frame used to rebuild the inbox N times from inside the loop.
   */
  _updateAllPositions() {
    const now = Date.now();
    const checkOcclusion =
      now - this._lastOcclusionPass >= OCCLUSION_INTERVAL_MS;
    if (checkOcclusion) {
      this._lastOcclusionPass = now;
    } else {
      // This pass reuses stale occlusion verdicts; make sure one more pass
      // runs after the burst settles so the end state is honest.
      this._armOcclusionTrailingPass();
    }

    const plans = [];
    for (const comment of this.deps.getComments()) {
      const circle = this.circles.get(String(comment.id));
      if (!circle) continue;
      plans.push([
        comment,
        circle,
        this._computeMarkerState(comment, circle, { checkOcclusion }),
      ]);
    }

    let anyFlipped = false;
    for (const [comment, circle, state] of plans) {
      if (this._applyMarkerState(comment, circle, state)) anyFlipped = true;
    }
    if (anyFlipped) this.deps.onVisibilityFlip();
  }

  _armOcclusionTrailingPass() {
    if (this._occlusionTrailingTimer) {
      clearTimeout(this._occlusionTrailingTimer);
    }
    this._occlusionTrailingTimer = setTimeout(() => {
      this._occlusionTrailingTimer = null;
      this.scheduleUpdate();
    }, OCCLUSION_INTERVAL_MS);
  }

  /** Coalesces any number of triggers into one rAF pass. */
  scheduleUpdate() {
    if (this._pendingRaf) return;
    this._pendingRaf = requestAnimationFrame(() => {
      this._pendingRaf = null;
      if (this.enabled) {
        this._updateAllPositions();
      }
      // Runs even with position validation off: the markers are placed in
      // viewport coordinates either way, so the popover has to follow.
      this.deps.onAfterPass();
    });
  }

  /**
   * Creates a ResizeObserver for a specific comment container
   * @param {Object} comment - The comment object
   * @param {HTMLElement} circle - The comment circle element
   */
  createResizeObserver(comment, circle) {
    if (!window.ResizeObserver) {
      console.warn(
        "ResizeObserver not supported, position validation will be limited"
      );
      return;
    }

    const observer = new ResizeObserver((entries) => {
      if (!this.enabled) return;

      for (const entry of entries) {
        // Only update if the container size actually changed
        if (entry.target === comment.container) {
          this.updatePosition(comment, circle);
        }
      }
    });

    // Start observing the container
    observer.observe(comment.container);

    // Store the observer for cleanup, keyed by String(id) like circles.
    this.resizeObservers.set(String(comment.id), {
      circle,
      observer,
      container: comment.container,
    });
  }

  cleanupResizeObserver(commentId) {
    // Keyed by String(id), exactly like the circles map: the caller may
    // hold the other spelling of a legacy numeric id, and a missed lookup
    // here leaks a live observer pointed at a detached circle.
    const key = String(commentId);
    if (this.resizeObservers.has(key)) {
      const { circle, observer } = this.resizeObservers.get(key);
      if (observer) {
        observer.disconnect();
      }
      if (circle && circle.parentNode) {
        circle.parentNode.removeChild(circle);
      }
      this.resizeObservers.delete(key);
    }
  }

  /**
   * Brings a comment's marker into view, centred vertically.
   *
   * Deliberately not `comment.container.scrollIntoView()`: the container is
   * the coarse anchor box (`section, div[class*=container|content]`), which
   * falls back to `<body>` whenever the commented element has no such
   * ancestor. Centring `<body>` lands halfway down the document — nowhere
   * near the marker, which is what made opening a comment from the inbox
   * jump to an unrelated section.
   *
   * @param {any} comment
   */
  scrollMarkerIntoView(comment) {
    const y = this._markerViewportY(comment);
    if (y == null) return;
    window.scrollTo({
      top: Math.max(0, window.scrollY + y - window.innerHeight / 2),
    });
  }

  /**
   * The marker's centre in viewport coordinates, derived from the anchor the
   * same way `updatePosition` derives it — including the clamp that keeps
   * the circle inside its container.
   *
   * Deliberately not read off the rendered circle: the circle's coordinates
   * are only refreshed inside a rAF on scroll, so they are stale for any
   * caller that runs in the same tick as a scroll. The container's rect is
   * live, which makes this correct whenever it is asked.
   *
   * @param {any} comment
   * @returns {number | null} null when there is no anchor to resolve
   */
  _markerViewportY(comment) {
    const container = comment.container;
    if (!container?.isConnected) return null;
    const rect = container.getBoundingClientRect();
    if (rect.height <= 0) return null;

    const circleSize = MARKER_SIZE;
    const offsetY = Math.max(
      0,
      Math.min(comment.relativeY * rect.height, rect.height - circleSize)
    );
    return rect.top + offsetY + circleSize / 2;
  }

  /** Cancels every scheduled pass, listener and observer. */
  destroy() {
    // A pass scheduled before teardown must not run against a destroyed
    // widget — cancel the pending frame and the trailing occlusion timer.
    if (this._pendingRaf) {
      cancelAnimationFrame(this._pendingRaf);
      this._pendingRaf = null;
    }
    if (this._occlusionTrailingTimer) {
      clearTimeout(this._occlusionTrailingTimer);
      this._occlusionTrailingTimer = null;
    }
    if (this._resizeHandler) {
      window.removeEventListener("resize", this._resizeHandler);
      this._resizeHandler = null;
    }
    if (this._scrollHandler) {
      window.removeEventListener("scroll", this._scrollHandler, {
        capture: true,
      });
      this._scrollHandler = null;
    }
    if (this._loadHandler) {
      window.removeEventListener("load", this._loadHandler);
      this._loadHandler = null;
    }
    if (this._globalMutationObserver) {
      this._globalMutationObserver.disconnect();
      this._globalMutationObserver = null;
    }
    this.clear();
  }
}
