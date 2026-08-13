import { describe, it, expect, afterEach, vi } from "vitest";
import { CaptureFlow } from "../src/capture-flow.js";
import { CLASSES } from "../src/constants.js";

vi.mock("modern-screenshot", () => ({ domToCanvas: vi.fn() }));

const move = (x, y) => new MouseEvent("mousemove", { clientX: x, clientY: y });
const up = (x, y) => new MouseEvent("mouseup", { clientX: x, clientY: y });
const down = (x, y) =>
  new MouseEvent("mousedown", { clientX: x, clientY: y, button: 0 });

const makeFlow = (overrides = {}) =>
  new CaptureFlow({
    host: /** @type {any} */ (document.body),
    autoScreenshot: false,
    onRegionCaptured: vi.fn(),
    onPlace: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  });

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("CaptureFlow", () => {
  it("a sub-threshold gesture places at the mousedown point, not the mouseup", async () => {
    const onPlace = vi.fn().mockResolvedValue(undefined);
    const flow = makeFlow({ onPlace });

    flow.beginDrag(down(50, 60));
    flow.onDragMove(move(52, 61)); // under the 5px threshold
    await flow.onDragEnd(up(52, 61));

    expect(onPlace).toHaveBeenCalledWith(50, 60);
  });

  it("dragging draws the selection rect in the host and removes it on release", async () => {
    const flow = makeFlow();

    flow.beginDrag(down(10, 10));
    flow.onDragMove(move(120, 140));

    const rect = document.body.querySelector(`.${CLASSES.SELECTION_RECT}`);
    expect(rect).toBeTruthy();
    expect(rect.style.width).toBe("110px");
    expect(rect.style.height).toBe("130px");

    await flow.onDragEnd(up(120, 140));
    expect(
      document.body.querySelector(`.${CLASSES.SELECTION_RECT}`)
    ).toBeNull();
  });

  it("destroy mid-gesture drops the selection rect and the drag listeners", async () => {
    const onPlace = vi.fn().mockResolvedValue(undefined);
    const flow = makeFlow({ onPlace });

    flow.beginDrag(down(10, 10));
    flow.onDragMove(move(80, 90));
    flow.destroy();

    expect(
      document.body.querySelector(`.${CLASSES.SELECTION_RECT}`)
    ).toBeNull();
    // The document-level listeners are gone: a stray mouseup after teardown
    // must not place a comment on a widget that no longer exists.
    document.dispatchEvent(up(80, 90));
    await Promise.resolve();
    expect(onPlace).not.toHaveBeenCalled();
  });

  it("consumePending resolves null when no capture is in flight", async () => {
    const flow = makeFlow();
    await expect(flow.consumePending()).resolves.toBeNull();
  });

  it("armClickCapture is a no-op with autoScreenshot off", () => {
    const flow = makeFlow({ autoScreenshot: false });
    flow.armClickCapture();
    expect(flow.pendingCapture).toBeNull();
  });
});
