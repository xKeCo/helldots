import CommentOverlay from "./overlay.js";

/**
 * Creates and initializes a new CommentOverlay instance
 * @param {import('./index.d.ts').CommentOverlayOptions} [options] - Configuration options
 * @returns {import('./index.d.ts').CommentOverlay | (() => import('./index.d.ts').CommentOverlay)}
 */
export function createCommentOverlay(options = {}) {
  const { autoInit = true, ...otherOptions } = options;

  const initialize = () => {
    const overlay = new CommentOverlay(otherOptions);
    return overlay;
  };

  if (autoInit) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initialize);
    } else {
      return initialize();
    }
  }

  return initialize;
}

// Export the class for advanced usage
export { CommentOverlay };

// Export a default instance creator for simple usage
export default createCommentOverlay;
