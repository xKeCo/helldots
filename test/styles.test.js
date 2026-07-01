import { describe, it, expect } from "vitest";
import { getStyles, getGlobalStyles } from "../src/styles.js";
import { CLASSES, IDS } from "../src/constants.js";

describe("styles", () => {
  it("returns a CSS string starting with a :host reset", () => {
    const css = getStyles();
    expect(typeof css).toBe("string");
    expect(css.trim().startsWith(":host")).toBe(true);
    expect(css).toContain("all: initial");
  });

  it("styles the toolbar and comment box ids", () => {
    const css = getStyles();
    expect(css).toContain(`#${IDS.TOOLBAR}`);
    expect(css).toContain(`#${IDS.COMMENT_BOX}`);
  });

  it("styles every interactive base class used by components.js", () => {
    const css = getStyles();
    [
      CLASSES.CIRCLE,
      CLASSES.TOOLTIP,
      CLASSES.THREAD_POPOVER,
      CLASSES.TOOLBAR_ACTION_BTN,
      CLASSES.ATTACH_IMAGE_BTN,
      CLASSES.THREAD_SUBMIT,
      CLASSES.LIGHTBOX,
    ].forEach((className) => {
      expect(css.includes(`.${className}`)).toBe(true);
    });
  });

  it("is regenerated fresh on every call (function, not a cached constant)", () => {
    expect(getStyles()).toBe(getStyles());
    expect(typeof getStyles).toBe("function");
  });

  it("does not style the comment-cursor class (that's host-page-only, see getGlobalStyles)", () => {
    expect(getStyles()).not.toContain(`.${CLASSES.COMMENT_CURSOR}`);
  });
});

describe("getGlobalStyles", () => {
  it("styles the comment-cursor class meant for document.body", () => {
    const css = getGlobalStyles();
    expect(css).toContain(`.${CLASSES.COMMENT_CURSOR}`);
    expect(css).toContain("cursor: url(");
  });
});
