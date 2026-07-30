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

  it("still returns the instance when the document is loading, deferring only the DOM work", () => {
    // Regression guard. This used to register a DOMContentLoaded listener AND
    // return the uninvoked initializer: a caller who invoked it — reasonable,
    // since the signature said it might be a function — got a SECOND overlay,
    // and the one the listener built was unreachable, so it could never be
    // cleaned up. The readyState branch belongs to CommentOverlay's
    // constructor, which already has it; duplicating it here was the bug.
    const readyStateSpy = vi
      .spyOn(document, "readyState", "get")
      .mockReturnValue("loading");
    const addEventListenerSpy = vi.spyOn(document, "addEventListener");

    const overlay = createCommentOverlay({ autoInit: true });

    expect(overlay).toBeInstanceOf(CommentOverlay);
    // The constructor defers mounting, so nothing is in the DOM yet...
    expect(document.querySelector(TAG_NAME)).toBeNull();
    // ...but it did arrange to mount once the document is ready.
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "DOMContentLoaded",
      expect.any(Function)
    );

    readyStateSpy.mockRestore();
    addEventListenerSpy.mockRestore();
  });

  it("creates exactly one overlay while the document is loading", () => {
    // The old double-registration meant two hosts could end up mounted.
    const readyStateSpy = vi
      .spyOn(document, "readyState", "get")
      .mockReturnValue("loading");

    const overlay = createCommentOverlay();
    overlay.initOverlay();

    expect(document.querySelectorAll(TAG_NAME)).toHaveLength(1);

    readyStateSpy.mockRestore();
  });
});
