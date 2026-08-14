import { describe, it, expect, afterEach, vi } from "vitest";
import {
  renderPage,
  cropRegion,
  cropViewport,
  AUTO_SCALE,
  canEmbedWebFonts,
} from "../src/capture.js";
import { TAG_NAME } from "../src/root-element.js";
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
    vi.mocked(domToCanvas).mockResolvedValue({ width: 10, height: 10 });
    await renderPage({ scale: 0.5 });
    expect(domToCanvas).toHaveBeenCalledWith(
      document.documentElement,
      expect.objectContaining({ scale: 0.5 })
    );
  });

  it("defaults to scale 1", async () => {
    vi.mocked(domToCanvas).mockResolvedValue({ width: 10, height: 10 });
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
    vi.mocked(domToCanvas).mockResolvedValue({ width: 100, height: 100 });

    await renderPage();

    expect(domToCanvas).toHaveBeenCalledWith(
      document.documentElement,
      expect.objectContaining({ backgroundColor: "#ffffff" })
    );
  });

  it("uses the page's own background color when one is painted", async () => {
    document.body.style.backgroundColor = "rgb(28, 28, 30)";
    vi.mocked(domToCanvas).mockResolvedValue({ width: 100, height: 100 });

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
    vi.mocked(domToCanvas).mockResolvedValue({ width: 1, height: 1 });

    await renderPage();

    const options = vi.mocked(domToCanvas).mock.calls[0][1];
    expect(typeof options.filter).toBe("function");
    expect(options.filter(document.createElement(TAG_NAME))).toBe(false);
    expect(options.filter(document.body)).toBe(true);
    expect(options.filter(document.createTextNode("text node"))).toBe(true);
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
    vi.mocked(domToCanvas).mockResolvedValue({ width: 1, height: 1 });

    await renderPage();

    expect(vi.mocked(domToCanvas).mock.calls[0][1]).not.toHaveProperty("font");
  });

  it("drops fonts rather than the whole screenshot under a strict policy", async () => {
    withDetachedSheet(null);
    vi.mocked(domToCanvas).mockResolvedValue({ width: 1, height: 1 });

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
    vi.mocked(domToCanvas).mockResolvedValue(
      /** @type {any} */ ({ width: 10, height: 10 })
    );

    await renderPage();

    expect(vi.mocked(domToCanvas).mock.calls[0][0]).toBe(
      document.documentElement
    );
  });
});
