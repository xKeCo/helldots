import CommentOverlay from "./overlay.js";

/**
 * Creates a CommentOverlay.
 *
 * Safe to call before the document is ready: `CommentOverlay`'s constructor
 * already defers its own DOM work to `DOMContentLoaded`, so callers always
 * get a real instance back and never have to branch on `readyState`. An
 * earlier version duplicated that same check here and, while the document
 * was loading, both registered a listener AND returned the uninvoked
 * initializer — so a caller who invoked it (reasonably, since the type said
 * it might be a function) ended up with two overlays, and the one the
 * listener built had no handle to call `cleanup()` on.
 *
 * @overload
 * @param {import('./index.d.ts').CommentOverlayOptions & { autoInit?: true }} [options]
 * @returns {CommentOverlay}
 */
/**
 * @overload
 * @param {import('./index.d.ts').CommentOverlayOptions & { autoInit: false }} options
 * @returns {() => CommentOverlay}
 */
/**
 * @param {import('./index.d.ts').CommentOverlayOptions} [options]
 * @returns {CommentOverlay | (() => CommentOverlay)}
 */
export function createCommentOverlay(options = {}) {
  const { autoInit = true, ...overlayOptions } = options;
  const initialize = () => new CommentOverlay(overlayOptions);
  return autoInit ? initialize() : initialize;
}

// Export the class for advanced usage
export { CommentOverlay };

// Export a default instance creator for simple usage
export default createCommentOverlay;
