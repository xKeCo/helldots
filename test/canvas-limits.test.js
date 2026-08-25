import { describe, it, expect, afterEach, vi } from "vitest";
import {
  fittingScale,
  maxCanvasDimension,
  paintsPixels,
} from "../src/canvas-limits.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("maxCanvasDimension", () => {
  it("still answers a usable number when nothing can be probed", () => {
    // jsdom hands out no 2d context, so every probe fails — the same shape
    // as an engine that refuses every size. The answer has to stay a finite
    // number: an Infinity or a NaN here would propagate into the scale and
    // put the render straight back where this fix found it.
    const measured = maxCanvasDimension();
    expect(Number.isFinite(measured)).toBe(true);
    expect(measured).toBeGreaterThan(0);
  });

  it("gives the same answer twice — it is a property of the engine", () => {
    expect(maxCanvasDimension()).toBe(maxCanvasDimension());
  });
});

describe("fittingScale", () => {
  const limits = { maxDimension: 4096, maxArea: 16777216 }; // 4096 squared

  it("leaves the requested scale alone when the render already fits", () => {
    expect(fittingScale(1000, 2000, 1, limits)).toBe(1);
  });

  it("never returns more than was asked for", () => {
    // A small page must not be scaled UP to fill the ceiling.
    expect(fittingScale(10, 10, 0.5, limits)).toBe(0.5);
  });

  it("shrinks to fit the tallest side", () => {
    // The bug this exists for: a very long page at scale 1.
    expect(fittingScale(1000, 40000, 1, limits)).toBeCloseTo(4096 / 40000, 6);
  });

  it("shrinks to fit the widest side too", () => {
    expect(fittingScale(40000, 1000, 1, limits)).toBeCloseTo(4096 / 40000, 6);
  });

  it("bounds area by a square root, because scale touches both axes", () => {
    // Area can only ever bind where an engine's area cap is tighter than its
    // dimension cap squared — which is mobile Safari, ~4096 squared against a
    // dimension cap far above it. 8000x4000 sits inside both dimensions and
    // is still twice the area. Halving the scale quarters the pixel count, so
    // the fit is the square root of the overshoot, not the overshoot.
    const tightArea = { maxDimension: 65535, maxArea: 4096 * 4096 };
    expect(fittingScale(8000, 4000, 1, tightArea)).toBeCloseTo(
      Math.sqrt((4096 * 4096) / (8000 * 4000)),
      6
    );
  });

  it("lets the dimension bind when it is the tighter of the two", () => {
    // The mirror of the case above, so neither branch can quietly stop
    // mattering: same area headroom, a side that does not fit.
    const wideDim = { maxDimension: 4096, maxArea: 4096 * 4096 * 64 };
    expect(fittingScale(40000, 100, 1, wideDim)).toBeCloseTo(4096 / 40000, 6);
  });

  it("passes the request through when the node has no box", () => {
    // jsdom reports zeroes, and so does a display:none root. Dividing by
    // those would hand back Infinity and cap nothing.
    expect(fittingScale(0, 0, 1, limits)).toBe(1);
    expect(fittingScale(100, 0, 0.5, limits)).toBe(0.5);
  });
});

describe("paintsPixels", () => {
  const canvasWith = (getImageData) => ({
    getContext: () => ({ getImageData }),
  });

  it("accepts a canvas that holds paint", () => {
    expect(paintsPixels(canvasWith(() => ({ data: [0, 0, 0, 255] })))).toBe(
      true
    );
  });

  it("rejects the silent failure: right size, no pixels", () => {
    // This is the whole bug. Past the ceiling a canvas reports the size it
    // was given, hands out a context, accepts every draw call, and comes
    // back transparent. Nothing throws and nothing warns.
    expect(paintsPixels(canvasWith(() => ({ data: [0, 0, 0, 0] })))).toBe(
      false
    );
  });

  it("rejects a canvas that cannot give a context", () => {
    expect(paintsPixels({ getContext: () => null })).toBe(false);
  });

  it("rejects one whose getImageData throws", () => {
    expect(
      paintsPixels(
        canvasWith(() => {
          throw new Error("tainted");
        })
      )
    ).toBe(false);
  });

  it("rejects a non-canvas without throwing", () => {
    expect(paintsPixels(undefined)).toBe(false);
    expect(paintsPixels({})).toBe(false);
  });
});
