import { describe, it, expect, afterEach, vi } from "vitest";
import {
  renderPage,
  cropRegion,
  cropViewport,
  AUTO_SCALE,
} from "../src/capture.js";
import { TAG_NAME } from "../src/root-element.js";
import { domToCanvas } from "modern-screenshot";

vi.mock("modern-screenshot", () => ({
  domToCanvas: vi.fn(),
}));

const makeFakeCanvas = () => {
  const drawImage = vi.fn();
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({ drawImage })),
    toDataURL: vi.fn(() => "data:image/png;base64,cropped"),
  };
  return { canvas, drawImage };
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
      document.body,
      expect.objectContaining({ scale: 0.5 })
    );
  });

  it("defaults to scale 1", async () => {
    vi.mocked(domToCanvas).mockResolvedValue({ width: 10, height: 10 });
    await renderPage();
    expect(domToCanvas).toHaveBeenCalledWith(
      document.body,
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
      document.body,
      expect.objectContaining({ backgroundColor: "#ffffff" })
    );
  });

  it("uses the page's own background color when one is painted", async () => {
    document.body.style.backgroundColor = "rgb(28, 28, 30)";
    vi.mocked(domToCanvas).mockResolvedValue({ width: 100, height: 100 });

    await renderPage();

    expect(domToCanvas).toHaveBeenCalledWith(
      document.body,
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
