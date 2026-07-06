import { describe, it, expect, afterEach, vi } from "vitest";
import { captureRegion } from "../src/capture.js";
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

describe("captureRegion", () => {
  it("crops the full-page render at page coordinates (viewport + scroll)", async () => {
    // Regression for the scrolled-capture bug: the crop source rect must be
    // the viewport selection translated by the CURRENT scroll offset.
    const fullCanvas = { width: 2000, height: 5000 };
    vi.mocked(domToCanvas).mockResolvedValue(fullCanvas);
    const { canvas, drawImage } = makeFakeCanvas();
    vi.spyOn(document, "createElement").mockReturnValue(canvas);
    vi.spyOn(window, "scrollX", "get").mockReturnValue(0);
    vi.spyOn(window, "scrollY", "get").mockReturnValue(300);

    const dataUrl = await captureRegion({
      left: 200,
      top: 200,
      width: 500,
      height: 220,
    });

    expect(domToCanvas).toHaveBeenCalledWith(
      document.body,
      expect.objectContaining({ scale: 1 })
    );
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

  it("falls back to a white background when the page paints none", async () => {
    // Pages often rely on the browser's default white canvas — CSS-wise
    // html/body are transparent, so the render must not come out as an
    // invisible transparent PNG.
    vi.mocked(domToCanvas).mockResolvedValue({ width: 100, height: 100 });
    const { canvas } = makeFakeCanvas();
    vi.spyOn(document, "createElement").mockReturnValue(
      /** @type {any} */ (canvas)
    );

    await captureRegion({ left: 0, top: 0, width: 50, height: 50 });

    expect(domToCanvas).toHaveBeenCalledWith(
      document.body,
      expect.objectContaining({ backgroundColor: "#ffffff" })
    );
  });

  it("uses the page's own background color when one is painted", async () => {
    document.body.style.backgroundColor = "rgb(28, 28, 30)";
    vi.mocked(domToCanvas).mockResolvedValue({ width: 100, height: 100 });
    const { canvas } = makeFakeCanvas();
    vi.spyOn(document, "createElement").mockReturnValue(
      /** @type {any} */ (canvas)
    );

    await captureRegion({ left: 0, top: 0, width: 50, height: 50 });

    expect(domToCanvas).toHaveBeenCalledWith(
      document.body,
      expect.objectContaining({ backgroundColor: "rgb(28, 28, 30)" })
    );
  });

  it("returns null when the 2d context is unavailable", async () => {
    vi.mocked(domToCanvas).mockResolvedValue({ width: 100, height: 100 });
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => null),
      toDataURL: vi.fn(),
    };
    vi.spyOn(document, "createElement").mockReturnValue(
      /** @type {any} */ (canvas)
    );

    const dataUrl = await captureRegion({
      left: 0,
      top: 0,
      width: 50,
      height: 50,
    });
    expect(dataUrl).toBeNull();
  });

  it("propagates render failures to the caller", async () => {
    vi.mocked(domToCanvas).mockRejectedValue(new Error("render failed"));
    await expect(
      captureRegion({ left: 0, top: 0, width: 50, height: 50 })
    ).rejects.toThrow("render failed");
  });
});
