import { describe, it, expect, afterEach, vi } from "vitest";
import { createCommentOverlay, CommentOverlay } from "../src/index.js";
import { TAG_NAME } from "../src/root-element.js";

const cleanup = () => {
  document.querySelectorAll(TAG_NAME).forEach((el) => el.remove());
};

describe("createCommentOverlay", () => {
  afterEach(cleanup);

  it("auto-initializes and returns a CommentOverlay instance when the document is ready", () => {
    expect(document.readyState).toBe("complete");
    const overlay = createCommentOverlay({ autoInit: true });
    expect(overlay).toBeInstanceOf(CommentOverlay);
    expect(document.querySelector(TAG_NAME)).toBeTruthy();
  });

  it("defaults autoInit to true when no options are passed", () => {
    const overlay = createCommentOverlay();
    expect(overlay).toBeInstanceOf(CommentOverlay);
  });

  it("returns an initializer function instead of an instance when autoInit is false", () => {
    const initialize = createCommentOverlay({ autoInit: false });
    expect(typeof initialize).toBe("function");
    expect(document.querySelector(TAG_NAME)).toBeNull();

    const overlay = initialize();
    expect(overlay).toBeInstanceOf(CommentOverlay);
    expect(document.querySelector(TAG_NAME)).toBeTruthy();
  });

  it("forwards custom options (shortcutKey/shortcutModifier) through to CommentOverlay", () => {
    const overlay = createCommentOverlay({
      autoInit: true,
      shortcutKey: "k",
      shortcutModifier: "shift",
    });
    expect(overlay.options.shortcutKey).toBe("k");
    expect(overlay.options.shortcutModifier).toBe("shift");
  });

  it("defers initialization until DOMContentLoaded when the document is still loading", () => {
    const readyStateSpy = vi
      .spyOn(document, "readyState", "get")
      .mockReturnValue("loading");
    const addEventListenerSpy = vi.spyOn(document, "addEventListener");

    const result = createCommentOverlay({ autoInit: true });

    // autoInit defers to DOMContentLoaded but the function still returns the
    // (uninvoked) initializer, same as the autoInit:false path.
    expect(typeof result).toBe("function");
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "DOMContentLoaded",
      expect.any(Function)
    );

    readyStateSpy.mockRestore();
    addEventListenerSpy.mockRestore();
  });
});
