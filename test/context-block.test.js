import { describe, it, expect } from "vitest";
import { createContextBlock } from "../src/context-block.js";
import { getStrings } from "../src/i18n.js";
import { CLASSES } from "../src/constants.js";

const strings = getStrings("en");

const comment = (overrides = {}) => ({
  contextScreenshot: "data:image/jpeg;base64,x",
  context: {
    version: 1,
    url: "https://example.test/page",
    viewport: { width: 1280, height: 720 },
    screen: { width: 1920, height: 1080 },
    devicePixelRatio: 2,
    userAgent: "test",
    browser: { name: "Chromium", version: "148" },
    os: { name: "macOS", version: "14" },
    language: "en",
  },
  ...overrides,
});

describe("createContextBlock", () => {
  it("returns null for comments created before RF1/RF2", () => {
    expect(
      createContextBlock(comment({ context: null, contextScreenshot: null }), {
        strings,
        onShowLightbox: () => {},
      })
    ).toBeNull();
  });

  it("makes the automatic-context thumbnail keyboard-operable", () => {
    // This thumbnail opens the lightbox like every other one, so it is a
    // control and not decoration. It used to carry a bare click listener of
    // its own instead of going through the shared helper, which left it
    // mouse-only — unreachable by keyboard and unnamed to a screen reader.
    const onShow = [];
    const block = createContextBlock(comment(), {
      strings,
      onShowLightbox: (src) => onShow.push(src),
    });

    const img = block.querySelector(`.${CLASSES.SCREENSHOT_IMG}`);
    expect(img.getAttribute("role")).toBe("button");
    expect(img.getAttribute("tabindex")).toBe("0");

    img.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    expect(onShow).toEqual(["data:image/jpeg;base64,x"]);

    img.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", bubbles: true })
    );
    expect(onShow).toHaveLength(2);
  });

  it("still opens the lightbox on click", () => {
    const onShow = [];
    const block = createContextBlock(comment(), {
      strings,
      onShowLightbox: (src) => onShow.push(src),
    });

    block.querySelector(`.${CLASSES.SCREENSHOT_IMG}`).click();
    expect(onShow).toEqual(["data:image/jpeg;base64,x"]);
  });

  it("collapses behind a toggle that reports its state", () => {
    const toggled = [];
    const block = createContextBlock(comment(), {
      strings,
      onShowLightbox: () => {},
      collapsible: true,
      expanded: false,
      onToggle: (open) => toggled.push(open),
    });

    const toggle = block.querySelector(`.${CLASSES.CONTEXT_TOGGLE}`);
    const body = block.querySelector(`.${CLASSES.CONTEXT_BODY}`);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(body.style.display).toBe("none");

    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(body.style.display).toBe("");
    expect(toggled).toEqual([true]);
  });
});
