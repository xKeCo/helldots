import { describe, it, expect, afterEach, vi } from "vitest";
import {
  renderPage,
  cropRegion,
  cropViewport,
  AUTO_SCALE,
  canEmbedWebFonts,
} from "../src/capture.js";
import { TAG_NAME } from "../src/root-element.js";
import { CAPTURE_STYLE_PROPERTIES } from "../src/capture-style-props.js";
import { renderedCanvas } from "./rendered-canvas.js";
import { domToCanvas } from "modern-screenshot";

vi.mock("modern-screenshot", () => ({
  domToCanvas: vi.fn(),
}));

const makeFakeCanvas = () => {
  const drawImage = vi.fn();
  // fillRect is part of the contract now: every crop lays the page
  // background down before drawing the render over it.
  const fillRect = vi.fn();
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({ drawImage, fillRect, fillStyle: "" })),
    toDataURL: vi.fn(() => "data:image/png;base64,cropped"),
  };
  return { canvas, drawImage, fillRect };
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(domToCanvas).mockReset();
  document.documentElement.style.backgroundColor = "";
  document.body.style.backgroundColor = "";
});

describe("cropRegion", () => {
  it("crops the full-page render at page coordinates (viewport + scroll)", () => {
    // Regression for the scrolled-capture bug: the crop source rect must be
    // the viewport selection translated by the CURRENT scroll offset.
    const fullCanvas = { width: 2000, height: 5000 };
    const { canvas, drawImage } = makeFakeCanvas();
    vi.spyOn(document, "createElement").mockReturnValue(canvas);
    vi.spyOn(window, "scrollX", "get").mockReturnValue(0);
    vi.spyOn(window, "scrollY", "get").mockReturnValue(300);

    const dataUrl = cropRegion(fullCanvas, {
      left: 200,
      top: 200,
      width: 500,
      height: 220,
    });

    expect(canvas.width).toBe(500);
    expect(canvas.height).toBe(220);
    expect(drawImage).toHaveBeenCalledWith(
      fullCanvas,
      200, // left + scrollX(0)
      500, // top + scrollY(300)
      500,
      220,
      0,
      0,
      500,
      220
    );
    expect(dataUrl).toBe("data:image/png;base64,cropped");
  });

  it("returns null when the 2d context is unavailable", () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => null),
      toDataURL: vi.fn(),
    };
    vi.spyOn(document, "createElement").mockReturnValue(
      /** @type {any} */ (canvas)
    );

    const dataUrl = cropRegion(
      { width: 100, height: 100 },
      { left: 0, top: 0, width: 50, height: 50 }
    );
    expect(dataUrl).toBeNull();
  });
});

describe("renderPage", () => {
  it("renders at the requested scale", async () => {
    vi.mocked(domToCanvas).mockResolvedValue(renderedCanvas(10, 10));
    await renderPage({ scale: 0.5 });
    expect(domToCanvas).toHaveBeenCalledWith(
      document.documentElement,
      expect.objectContaining({ scale: 0.5 })
    );
  });

  it("defaults to scale 1", async () => {
    vi.mocked(domToCanvas).mockResolvedValue(renderedCanvas(10, 10));
    await renderPage();
    expect(domToCanvas).toHaveBeenCalledWith(
      document.documentElement,
      expect.objectContaining({ scale: 1 })
    );
  });

  it("falls back to a white background when the page paints none", async () => {
    // Pages often rely on the browser's default white canvas — CSS-wise
    // html/body are transparent, so the render must not come out as an
    // invisible transparent PNG.
    vi.mocked(domToCanvas).mockResolvedValue(renderedCanvas(100, 100));

    await renderPage();

    expect(domToCanvas).toHaveBeenCalledWith(
      document.documentElement,
      expect.objectContaining({ backgroundColor: "#ffffff" })
    );
  });

  it("uses the page's own background color when one is painted", async () => {
    document.body.style.backgroundColor = "rgb(28, 28, 30)";
    vi.mocked(domToCanvas).mockResolvedValue(renderedCanvas(100, 100));

    await renderPage();

    expect(domToCanvas).toHaveBeenCalledWith(
      document.documentElement,
      expect.objectContaining({ backgroundColor: "rgb(28, 28, 30)" })
    );
  });
});

describe("cropViewport", () => {
  it("crops the viewport rect and encodes it as downscaled JPEG", () => {
    const { canvas, drawImage } = makeFakeCanvas();
    canvas.toDataURL = vi.fn(() => "data:image/jpeg;base64,auto");
    vi.spyOn(document, "createElement").mockReturnValue(
      /** @type {any} */ (canvas)
    );
    vi.spyOn(window, "scrollX", "get").mockReturnValue(0);
    vi.spyOn(window, "scrollY", "get").mockReturnValue(400);
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1000);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(800);

    const source = { width: 1000, height: 5000 };
    const dataUrl = cropViewport(source, { sourceScale: 1 });

    // Output is half-size; the source rect is the viewport at scroll offset.
    expect(canvas.width).toBe(500);
    expect(canvas.height).toBe(400);
    expect(drawImage).toHaveBeenCalledWith(
      source,
      0,
      400,
      1000,
      800,
      0,
      0,
      500,
      400
    );
    expect(canvas.toDataURL).toHaveBeenCalledWith("image/jpeg", 0.7);
    expect(dataUrl).toBe("data:image/jpeg;base64,auto");
  });

  it("maps the source rect through sourceScale when the canvas is half-size", () => {
    const { canvas, drawImage } = makeFakeCanvas();
    vi.spyOn(document, "createElement").mockReturnValue(
      /** @type {any} */ (canvas)
    );
    vi.spyOn(window, "scrollX", "get").mockReturnValue(0);
    vi.spyOn(window, "scrollY", "get").mockReturnValue(400);
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1000);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(800);

    const source = { width: 500, height: 2500 };
    cropViewport(source, { sourceScale: AUTO_SCALE });

    expect(drawImage).toHaveBeenCalledWith(
      source,
      0,
      200,
      500,
      400,
      0,
      0,
      500,
      400
    );
  });

  it("returns null when the 2d context is unavailable", () => {
    vi.spyOn(document, "createElement").mockReturnValue(
      /** @type {any} */ ({ getContext: () => null, toDataURL: vi.fn() })
    );
    expect(cropViewport({ width: 10, height: 10 }, {})).toBeNull();
  });
});

describe("renderPage filter", () => {
  // Replaces the old hide-during-render dance (withHiddenOverlay): filtering
  // the host out of the clone keeps the widget out of its own screenshot
  // WITHOUT taking the UI off screen, which is what lets captures run in the
  // background while the user types.
  it("filters the widget host out of the render and keeps everything else", async () => {
    vi.mocked(domToCanvas).mockResolvedValue(renderedCanvas(1, 1));

    await renderPage();

    const options = vi.mocked(domToCanvas).mock.calls[0][1];
    expect(typeof options.filter).toBe("function");
    expect(options.filter(document.createElement(TAG_NAME))).toBe(false);
    expect(options.filter(document.body)).toBe(true);
    expect(options.filter(document.createTextNode("text node"))).toBe(true);
  });
});

describe("captureTimeout bounds a dead asset's hold on the render", () => {
  it("says nothing unless the host asked, leaving the renderer's own default", async () => {
    // Not repeated as 30000 here: that number is the renderer's to change,
    // and echoing it would silently pin us to today's value.
    vi.mocked(domToCanvas).mockResolvedValue(renderedCanvas(1, 1));

    await renderPage();

    expect(vi.mocked(domToCanvas).mock.calls[0][1]).not.toHaveProperty(
      "timeout"
    );
  });

  it("passes a positive value straight through", async () => {
    vi.mocked(domToCanvas).mockResolvedValue(renderedCanvas(1, 1));

    await renderPage({ captureTimeout: 5000 });

    expect(vi.mocked(domToCanvas).mock.calls[0][1]).toMatchObject({
      timeout: 5000,
    });
  });

  it("ignores zero, which the renderer reads as 'wait forever'", async () => {
    // The trap: a host passing 0 to mean "do not wait" would get a render
    // with no deadline at all — the exact opposite. Falling through to the
    // default is the only safe reading.
    vi.mocked(domToCanvas).mockResolvedValue(renderedCanvas(1, 1));

    await renderPage({ captureTimeout: 0 });

    expect(vi.mocked(domToCanvas).mock.calls[0][1]).not.toHaveProperty(
      "timeout"
    );
  });

  it("ignores Infinity, which setTimeout turns into no wait at all", async () => {
    // The mirror of the zero trap, and nastier: `Infinity` survives a `> 0`
    // check, reaches `setTimeout`, and is coerced to 0 — so asking for "no
    // deadline" would abort every asset immediately.
    vi.mocked(domToCanvas).mockResolvedValue(renderedCanvas(1, 1));

    await renderPage({ captureTimeout: Infinity });

    expect(vi.mocked(domToCanvas).mock.calls[0][1]).not.toHaveProperty(
      "timeout"
    );
  });

  it("ignores values that are not a usable number of milliseconds", async () => {
    vi.mocked(domToCanvas).mockResolvedValue(renderedCanvas(1, 1));

    for (const bad of [-1, NaN, undefined, null, "5000"]) {
      vi.mocked(domToCanvas).mockClear();
      await renderPage({ captureTimeout: /** @type {any} */ (bad) });
      expect(vi.mocked(domToCanvas).mock.calls[0][1]).not.toHaveProperty(
        "timeout"
      );
    }
  });
});

describe("the canvas ceiling", () => {
  /** Every engine caps a canvas's size, and jsdom reports zeroes. */
  const pageSized = (width, height) =>
    vi
      .spyOn(document.documentElement, "getBoundingClientRect")
      .mockReturnValue(/** @type {any} */ ({ width, height }));

  /** Right size, context, draw calls all fine — and no pixels. */
  const blankCanvas = () => ({
    width: 1,
    height: 1,
    getContext: () => ({ getImageData: () => ({ data: [0, 0, 0, 0] }) }),
  });

  it("reports the scale it actually rendered at, not the one asked for", async () => {
    vi.mocked(domToCanvas).mockResolvedValue(renderedCanvas(10, 10));

    const { canvas, scale } = await renderPage({ scale: 0.5 });

    expect(scale).toBe(0.5);
    expect(canvas.width).toBe(10);
  });

  it("caps the scale on a page taller than the browser will paint", async () => {
    // The bug: at the requested scale this canvas comes back blank, and
    // every crop off it is blank too, with nothing said about it.
    pageSized(1000, 400000);
    vi.mocked(domToCanvas).mockResolvedValue(renderedCanvas(1, 1));

    const { scale } = await renderPage({ scale: 1 });

    expect(scale).toBeLessThan(1);
    expect(vi.mocked(domToCanvas).mock.calls[0][1].scale).toBe(scale);
  });

  it("retries smaller when a render comes back holding nothing", async () => {
    // The cap is a guess — engines differ by more than an order of
    // magnitude — so the render is checked rather than trusted.
    pageSized(1000, 1000);
    vi.mocked(domToCanvas)
      .mockResolvedValueOnce(/** @type {any} */ (blankCanvas()))
      .mockResolvedValue(renderedCanvas(1, 1));

    const { scale } = await renderPage({ scale: 1 });

    expect(vi.mocked(domToCanvas).mock.calls.map((c) => c[1].scale)).toEqual([
      1, 0.5,
    ]);
    expect(scale).toBe(0.5);
  });

  it("gives up loudly rather than handing back a blank capture", async () => {
    // What it replaces was silent: an empty image, no error, nothing on the
    // console. Throwing reaches the host through onError(err, "capture").
    pageSized(1000, 1000);
    vi.mocked(domToCanvas).mockResolvedValue(
      /** @type {any} */ (blankCanvas())
    );

    await expect(renderPage({ scale: 1 })).rejects.toThrow(/no pixels/);
    expect(vi.mocked(domToCanvas).mock.calls).toHaveLength(4);
  });
});

describe("cropRegion maps through the render's real scale", () => {
  it("reads the source rect at the scale the canvas was made at", () => {
    const fullCanvas = { width: 500, height: 1000 };
    const { canvas, drawImage } = makeFakeCanvas();
    vi.spyOn(document, "createElement").mockReturnValue(
      /** @type {any} */ (canvas)
    );
    vi.spyOn(window, "scrollX", "get").mockReturnValue(0);
    vi.spyOn(window, "scrollY", "get").mockReturnValue(200);

    cropRegion(
      fullCanvas,
      { left: 100, top: 50, width: 300, height: 200 },
      { sourceScale: 0.5 }
    );

    // Output stays in CSS pixels — a render the ceiling forced down comes
    // back soft, not the wrong size.
    expect(canvas.width).toBe(300);
    expect(canvas.height).toBe(200);
    expect(drawImage).toHaveBeenCalledWith(
      fullCanvas,
      50, // (100 + scrollX 0) * 0.5
      125, // (50 + scrollY 200) * 0.5
      150, // 300 * 0.5
      100, // 200 * 0.5
      0,
      0,
      300,
      200
    );
  });

  it("assumes 1:1 when no scale is given", () => {
    const fullCanvas = { width: 500, height: 1000 };
    const { canvas, drawImage } = makeFakeCanvas();
    vi.spyOn(document, "createElement").mockReturnValue(
      /** @type {any} */ (canvas)
    );
    vi.spyOn(window, "scrollX", "get").mockReturnValue(0);
    vi.spyOn(window, "scrollY", "get").mockReturnValue(0);

    cropRegion(fullCanvas, { left: 10, top: 20, width: 30, height: 40 });

    expect(drawImage).toHaveBeenCalledWith(
      fullCanvas,
      10,
      20,
      30,
      40,
      0,
      0,
      30,
      40
    );
  });
});

describe("renderPage yields the main thread", () => {
  // The clone traversal awaits only promises that are already resolved, and
  // those settle as microtasks — the queue drains before the browser gets
  // to paint or deliver a keystroke, so an asynchronous render still froze
  // the page solid. `onCloneEachNode` is the one hook the traversal awaits
  // once per node, which makes it the only place the pause can go.
  it("passes a per-node yield hook to the renderer", async () => {
    vi.mocked(domToCanvas).mockResolvedValue(renderedCanvas(1, 1));

    await renderPage();

    const options = vi.mocked(domToCanvas).mock.calls[0][1];
    expect(typeof options.onCloneEachNode).toBe("function");
  });

  it("gives every render its own budget", async () => {
    // A yielder shared across renders would carry the first one's clock
    // into the second, which would then yield on its very first node.
    vi.mocked(domToCanvas).mockResolvedValue(renderedCanvas(1, 1));

    await renderPage();
    await renderPage();

    const calls = vi.mocked(domToCanvas).mock.calls;
    expect(calls[1][1].onCloneEachNode).not.toBe(calls[0][1].onCloneEachNode);
  });
});

describe("skipIframeContent blanks embedded documents", () => {
  /** A node that reports a different ownerDocument, i.e. one inside a frame. */
  const foreignNode = (name = "div") => {
    const other = document.implementation.createHTMLDocument("");
    return other.createElement(name);
  };

  it("is off by default and clones embedded documents like anything else", async () => {
    vi.mocked(domToCanvas).mockResolvedValue(renderedCanvas(1, 1));

    await renderPage();

    const { filter } = vi.mocked(domToCanvas).mock.calls[0][1];
    expect(filter(foreignNode())).toBe(true);
  });

  it("drops nodes that live in another document when asked", async () => {
    vi.mocked(domToCanvas).mockResolvedValue(renderedCanvas(1, 1));

    await renderPage({ skipIframeContent: true });

    const { filter } = vi.mocked(domToCanvas).mock.calls[0][1];
    expect(filter(foreignNode())).toBe(false);
    expect(filter(foreignNode("body"))).toBe(false);
  });

  it("keeps the <iframe> element itself, box and all", async () => {
    // Regression for a 260px upward shift: filtering by tag name removes the
    // frame's BOX, so everything below it slides up while the crop is still
    // taken at live page coordinates. Matching on ownerDocument keeps the
    // element and blanks only its interior.
    vi.mocked(domToCanvas).mockResolvedValue(renderedCanvas(1, 1));

    await renderPage({ skipIframeContent: true });

    const { filter } = vi.mocked(domToCanvas).mock.calls[0][1];
    expect(filter(document.createElement("iframe"))).toBe(true);
  });

  it("never mistakes shadow content for embedded content", async () => {
    // Nodes in a shadow root keep the host document as their ownerDocument.
    // If they did not, this option would silently gut the widget's own UI.
    vi.mocked(domToCanvas).mockResolvedValue(renderedCanvas(1, 1));
    const host = document.createElement("div");
    document.body.appendChild(host);
    const inShadow = host
      .attachShadow({ mode: "open" })
      .appendChild(document.createElement("span"));

    await renderPage({ skipIframeContent: true });

    const { filter } = vi.mocked(domToCanvas).mock.calls[0][1];
    expect(filter(inShadow)).toBe(true);
    host.remove();
  });

  it("still keeps the widget out of its own screenshot", async () => {
    vi.mocked(domToCanvas).mockResolvedValue(renderedCanvas(1, 1));

    await renderPage({ skipIframeContent: true });

    const { filter } = vi.mocked(domToCanvas).mock.calls[0][1];
    expect(filter(document.createElement(TAG_NAME))).toBe(false);
    expect(filter(document.createTextNode("text node"))).toBe(true);
  });
});

describe("fastCapture narrows the computed-style enumeration", () => {
  // Reading computed styles IS the render — ~91% of a capture, scaling with
  // element count. The renderer enumerates every property a browser exposes
  // unless it is handed a list; the list is opt-in because anything it does
  // not name is absent from the image.
  it("is off by default, and leaves the renderer enumerating everything", async () => {
    vi.mocked(domToCanvas).mockResolvedValue(renderedCanvas(1, 1));

    await renderPage();

    // Absent, not null: `includeStyleProperties: null` IS the renderer's
    // enumerate-everything default, so the two would be indistinguishable.
    expect(vi.mocked(domToCanvas).mock.calls[0][1]).not.toHaveProperty(
      "includeStyleProperties"
    );
  });

  it("hands over the curated list when asked", async () => {
    vi.mocked(domToCanvas).mockResolvedValue(renderedCanvas(1, 1));

    await renderPage({ fastCapture: true });

    expect(vi.mocked(domToCanvas).mock.calls[0][1]).toMatchObject({
      includeStyleProperties: CAPTURE_STYLE_PROPERTIES,
    });
  });
});

describe("web font embedding under a Content Security Policy", () => {
  // modern-screenshot reads @font-face rules by parking a <style> in a
  // detached document. That element inherits the page's CSP, so a strict
  // `style-src` leaves `.sheet` null and the render throws on
  // `null.cssRules` — the whole capture is lost, not just the fonts.
  // Verified in Chrome: with `font: false` the same policy renders fine.
  const withDetachedSheet = (sheet) =>
    vi.spyOn(document.implementation, "createHTMLDocument").mockReturnValue(
      /** @type {any} */ ({
        head: { appendChild: () => {} },
        createElement: () => ({ sheet }),
      })
    );

  it("reports web fonts as embeddable when the detached sheet parses", () => {
    withDetachedSheet({});
    expect(canEmbedWebFonts()).toBe(true);
  });

  it("reports them as unembeddable when the policy blocks the sheet", () => {
    withDetachedSheet(null);
    expect(canEmbedWebFonts()).toBe(false);
  });

  it("reports them as unembeddable when probing throws outright", () => {
    vi.spyOn(document.implementation, "createHTMLDocument").mockImplementation(
      () => {
        throw new Error("blocked");
      }
    );
    expect(canEmbedWebFonts()).toBe(false);
  });

  it("keeps fonts on when nothing blocks them, so captures stay faithful", async () => {
    withDetachedSheet({});
    vi.mocked(domToCanvas).mockResolvedValue(renderedCanvas(1, 1));

    await renderPage();

    expect(vi.mocked(domToCanvas).mock.calls[0][1]).not.toHaveProperty("font");
  });

  it("drops fonts rather than the whole screenshot under a strict policy", async () => {
    withDetachedSheet(null);
    vi.mocked(domToCanvas).mockResolvedValue(renderedCanvas(1, 1));

    await renderPage();

    expect(vi.mocked(domToCanvas).mock.calls[0][1]).toMatchObject({
      font: false,
    });
  });
});

describe("crops on pages shorter than the region being cut", () => {
  // domToCanvas renders the BODY's box. On a page shorter than the viewport
  // that canvas is shorter than the crop, so the uncovered strip stayed at
  // the output canvas's initial transparent black — which JPEG encodes as a
  // solid black band across the bottom of every automatic screenshot.
  // Painting the page's own background first is what the user actually sees
  // there: the browser paints html/body across the whole viewport.
  const makePaintedCanvas = () => {
    const calls = [];
    const ctx = {
      set fillStyle(v) {
        calls.push(["fillStyle", v]);
      },
      fillRect: (...a) => calls.push(["fillRect", ...a]),
      drawImage: (...a) => calls.push(["drawImage", a.length]),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ctx,
      toDataURL: () => "data:image/jpeg;base64,out",
    };
    return { canvas, calls };
  };

  it("paints the page background under the viewport crop, before the render", () => {
    document.body.style.backgroundColor = "rgb(28, 28, 30)";
    const { canvas, calls } = makePaintedCanvas();
    vi.spyOn(document, "createElement").mockReturnValue(
      /** @type {any} */ (canvas)
    );
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1000);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(800);

    cropViewport({ width: 1000, height: 76 }, { outputScale: 1 });

    expect(calls[0]).toEqual(["fillStyle", "rgb(28, 28, 30)"]);
    expect(calls[1]).toEqual(["fillRect", 0, 0, 1000, 800]);
    // The backdrop must go down first, or it would erase the render.
    expect(calls[2][0]).toBe("drawImage");
  });

  it("falls back to white for a page that paints no background of its own", () => {
    const { canvas, calls } = makePaintedCanvas();
    vi.spyOn(document, "createElement").mockReturnValue(
      /** @type {any} */ (canvas)
    );

    cropViewport({ width: 10, height: 10 }, {});

    expect(calls[0]).toEqual(["fillStyle", "#ffffff"]);
  });

  it("paints it under a drag selection too", () => {
    document.body.style.backgroundColor = "rgb(28, 28, 30)";
    const { canvas, calls } = makePaintedCanvas();
    vi.spyOn(document, "createElement").mockReturnValue(
      /** @type {any} */ (canvas)
    );

    cropRegion(
      { width: 500, height: 76 },
      {
        left: 0,
        top: 0,
        width: 400,
        height: 300,
      }
    );

    expect(calls[0]).toEqual(["fillStyle", "rgb(28, 28, 30)"]);
    expect(calls[1]).toEqual(["fillRect", 0, 0, 400, 300]);
    expect(calls[2][0]).toBe("drawImage");
  });
});

describe("what the render is anchored to", () => {
  // Rendering <body> puts the clone somewhere the UA's `body { margin: 8px }`
  // applies again, even on a page that zeroed it. Every flow element lands 8px
  // right and 8px down inside a canvas that did not grow, so the last 8px fall
  // off the right edge — and a crop taken at live coordinates is off by that
  // much. Measured in Chrome on the playground: body → content at (7,8) and
  // 799px wide; documentElement → (0,0) and the full 806px.
  //
  // <html> carries no such margin, so page coordinates and canvas pixels line
  // up 1:1, which is the whole contract cropRegion depends on.
  it("renders the document element, so page coordinates map 1:1", async () => {
    vi.mocked(domToCanvas).mockResolvedValue(renderedCanvas(10, 10));

    await renderPage();

    expect(vi.mocked(domToCanvas).mock.calls[0][0]).toBe(
      document.documentElement
    );
  });
});
