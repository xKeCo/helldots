import { describe, it, expect } from "vitest";
import {
  CAPTURE_STYLE_PROPERTIES,
  RENDERER_READS_BACK,
} from "../src/capture-style-props.js";

describe("the curated capture style list", () => {
  it("has no duplicates", () => {
    const seen = CAPTURE_STYLE_PROPERTIES.filter(
      (name, i) => CAPTURE_STYLE_PROPERTIES.indexOf(name) !== i
    );
    expect(seen).toEqual([]);
  });

  it("carries every property the renderer reads back out of the map", () => {
    // These do not paint anything — `modern-screenshot` reads them back to
    // decide what it does: clone the scrollbar, apply its Chrome ellipsis
    // workaround, tag `background-clip: text`, and pick which web fonts to
    // subset and embed. Dropping one changes behaviour, not just pixels.
    for (const name of RENDERER_READS_BACK) {
      expect(CAPTURE_STYLE_PROPERTIES).toContain(name);
    }
  });

  it("carries the properties an omission would visibly break", () => {
    // A spot-check of the load-bearing ones, each verified against a
    // pixel diff: dropping the family it belongs to moved pixels.
    for (const name of [
      "width",
      "height",
      "display",
      "position",
      "color",
      "background-color",
      "background-image",
      "border-top-width",
      "border-top-color",
      "font-size",
      "font-weight",
      "line-height",
      "opacity",
      "transform",
      "accent-color",
    ]) {
      expect(CAPTURE_STYLE_PROPERTIES).toContain(name);
    }
  });

  it("names longhands only", () => {
    // The browser enumerates computed style as longhands, so a shorthand
    // is a lookup that answers nothing — and reads as covering the four
    // sides it does not actually fetch.
    const shorthands = [
      "background",
      "border",
      "border-radius",
      "flex",
      "font",
      "gap",
      "grid",
      "grid-area",
      "inset",
      "margin",
      "mask",
      "outline",
      "overflow",
      "padding",
      "text-decoration",
      "transition",
    ];
    for (const name of shorthands) {
      expect(CAPTURE_STYLE_PROPERTIES).not.toContain(name);
    }
  });

  it("stays meaningfully smaller than a full enumeration", () => {
    // The whole point is the read count. A list that grows back toward the
    // ~527 properties a browser exposes has stopped buying anything.
    expect(CAPTURE_STYLE_PROPERTIES.length).toBeLessThan(250);
  });
});
