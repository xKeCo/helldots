import { describe, it, expect, afterEach, vi } from "vitest";
import { CaptureFlow } from "../src/capture-flow.js";
import { CLASSES } from "../src/constants.js";
import { renderedCanvas } from "./rendered-canvas.js";
import { domToCanvas } from "modern-screenshot";

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

  it("a drag places at the region's center and passes the region", async () => {
    const onPlace = vi.fn().mockResolvedValue(undefined);
    const flow = makeFlow({ onPlace });

    flow.beginDrag(down(10, 20));
    flow.onDragMove(move(110, 100));
    await flow.onDragEnd(up(110, 100));

    expect(onPlace).toHaveBeenCalledWith(60, 60, {
      left: 10,
      top: 20,
      width: 100,
      height: 80,
    });
  });

  it("a drag too small to capture places at its center, with no region", async () => {
    const onPlace = vi.fn().mockResolvedValue(undefined);
    const flow = makeFlow({ onPlace });

    // Past the 5px drag threshold, under the 10px capture threshold.
    flow.beginDrag(down(10, 10));
    flow.onDragMove(move(18, 18));
    await flow.onDragEnd(up(18, 18));

    expect(onPlace).toHaveBeenCalledWith(14, 14, undefined);
  });
});

describe("capture options reach both render paths", () => {
  // The flow renders from two places — the awaited drag render and the
  // background click render — and an option wired into only one of them
  // fails exactly where it is least likely to be noticed.
  //
  // The last call, not the first: this file's `afterEach` restores spies but
  // does not reset the module mock, so call 0 belongs to whichever test ran
  // before this one.
  const lastOptions = () => vi.mocked(domToCanvas).mock.calls.at(-1)[1];

  it("carries fastCapture into the click path's background render", async () => {
    vi.mocked(domToCanvas).mockResolvedValue(renderedCanvas(1, 1));
    const flow = makeFlow({ autoScreenshot: true, fastCapture: true });

    flow.armClickCapture();
    await flow.consumePending();

    expect(lastOptions()).toHaveProperty("includeStyleProperties");
  });

  it("carries fastCapture into the drag path's awaited render", async () => {
    vi.mocked(domToCanvas).mockResolvedValue(renderedCanvas(1, 1));
    const flow = makeFlow({ fastCapture: true });

    flow.beginDrag(down(10, 10));
    flow.onDragMove(move(200, 150));
    await flow.onDragEnd(up(200, 150));

    expect(lastOptions()).toHaveProperty("includeStyleProperties");
  });

  it("carries skipIframeContent into both renders", async () => {
    const other = document.implementation.createHTMLDocument("");
    const embedded = other.createElement("div");

    vi.mocked(domToCanvas).mockResolvedValue(renderedCanvas(1, 1));
    const flow = makeFlow({ autoScreenshot: true, skipIframeContent: true });

    flow.armClickCapture();
    await flow.consumePending();
    expect(lastOptions().filter(embedded)).toBe(false);

    flow.beginDrag(down(10, 10));
    flow.onDragMove(move(200, 150));
    await flow.onDragEnd(up(200, 150));
    expect(lastOptions().filter(embedded)).toBe(false);
  });

  it("carries captureTimeout into both renders", async () => {
    vi.mocked(domToCanvas).mockResolvedValue(renderedCanvas(1, 1));
    const flow = makeFlow({ autoScreenshot: true, captureTimeout: 5000 });

    flow.armClickCapture();
    await flow.consumePending();
    expect(lastOptions()).toMatchObject({ timeout: 5000 });

    flow.beginDrag(down(10, 10));
    flow.onDragMove(move(200, 150));
    await flow.onDragEnd(up(200, 150));
    expect(lastOptions()).toMatchObject({ timeout: 5000 });
  });

  it("leaves it off when the host did not ask", async () => {
    vi.mocked(domToCanvas).mockResolvedValue(renderedCanvas(1, 1));
    const flow = makeFlow({ autoScreenshot: true });

    flow.armClickCapture();
    await flow.consumePending();

    expect(lastOptions()).not.toHaveProperty("includeStyleProperties");
  });
});

describe("a drag places the comment before its crop exists", () => {
  /** jsdom has no 2d context, and without one every crop returns null. */
  const stubCanvas = () => {
    const real = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag) =>
      tag === "canvas"
        ? /** @type {any} */ ({
            width: 0,
            height: 0,
            getContext: () => ({
              drawImage: vi.fn(),
              fillRect: vi.fn(),
              fillStyle: "",
            }),
            toDataURL: () => "data:image/png;base64,crop",
          })
        : real(/** @type {any} */ (tag))
    );
  };

  /** A render held open, so the test owns the moment it lands. */
  const heldRender = () => {
    let settle, fail;
    vi.mocked(domToCanvas).mockReset();
    vi.mocked(domToCanvas).mockReturnValue(
      /** @type {any} */ (
        new Promise((res, rej) => {
          settle = () => res(renderedCanvas(100, 100));
          fail = rej;
        })
      )
    );
    return { settle: () => settle(), fail: (e) => fail(e) };
  };

  const drag = async (flow) => {
    flow.beginDrag(down(10, 10));
    flow.onDragMove(move(200, 150));
    await flow.onDragEnd(up(200, 150));
  };

  const flush = () => new Promise((r) => setTimeout(r));

  it("returns from the gesture while the render is still running", async () => {
    // The regression this guards is a hang, not a wrong value: before the
    // split, onDragEnd awaited the render, so with the render held open this
    // await would never resolve and the test would time out.
    stubCanvas();
    const render = heldRender();
    const onPlace = vi.fn().mockResolvedValue(undefined);
    const flow = makeFlow({ onPlace });

    await drag(flow);

    expect(onPlace).toHaveBeenCalledWith(105, 80, {
      left: 10,
      top: 10,
      width: 190,
      height: 140,
    });
    render.settle();
  });

  it("raises the placeholder immediately and drops it when the crop lands", async () => {
    stubCanvas();
    const render = heldRender();
    const onRegionPending = vi.fn();
    const onRegionCaptured = vi.fn();
    const flow = makeFlow({ onRegionPending, onRegionCaptured });

    await drag(flow);
    expect(onRegionPending).toHaveBeenCalledWith(true);
    expect(onRegionCaptured).not.toHaveBeenCalled();

    render.settle();
    await flow.consumePending();

    expect(onRegionCaptured).toHaveBeenCalledWith("data:image/png;base64,crop");
    expect(onRegionPending).toHaveBeenLastCalledWith(false);
  });

  it("holds the save path open until the crop is in the array", async () => {
    // The save reads the attachments array the instant consumePending
    // resolves, so this has to wait for the region and not just the context
    // shot. `autoScreenshot: false` is what makes that visible: with no
    // context capture there is nothing else to wait on, and a Send pressed
    // early would write a comment without the region the user selected.
    stubCanvas();
    const render = heldRender();
    const onRegionCaptured = vi.fn();
    const flow = makeFlow({ autoScreenshot: false, onRegionCaptured });

    await drag(flow);

    // Recorded AT the moment consumePending resolves, not after further
    // awaits: both chains hang off the same render, so a few extra hops in
    // the test would let the crop land anyway and hide the bug.
    let cropsAtResolve = null;
    const save = flow.consumePending().then(() => {
      cropsAtResolve = onRegionCaptured.mock.calls.length;
    });
    await flush();
    expect(cropsAtResolve).toBeNull();

    render.settle();
    await save;
    expect(cropsAtResolve).toBe(1);
  });

  it("throws away a crop whose draft was dismissed under it", async () => {
    stubCanvas();
    const render = heldRender();
    const onRegionCaptured = vi.fn();
    const flow = makeFlow({ onRegionCaptured });

    await drag(flow);
    flow.clearPending(); // Escape, while the render is still going
    render.settle();
    await flush();

    expect(onRegionCaptured).not.toHaveBeenCalled();
  });

  it("gives a late crop to nobody once a second drag has started", async () => {
    stubCanvas();
    const first = heldRender();
    const onRegionCaptured = vi.fn();
    const flow = makeFlow({ onRegionCaptured });

    await drag(flow);
    const second = heldRender(); // a new gesture takes the slot
    await drag(flow);

    first.settle();
    await flush();
    expect(onRegionCaptured).not.toHaveBeenCalled();

    second.settle();
    await flow.consumePending();
    expect(onRegionCaptured).toHaveBeenCalledTimes(1);
  });

  it("still renders once per drag, not twice", async () => {
    // onPlace runs armClickCapture. It has to find the slot already taken,
    // or every dragged comment pays for the page render twice.
    stubCanvas();
    const render = heldRender();
    /** @type {any} */
    let flow;
    flow = makeFlow({
      autoScreenshot: true,
      onPlace: vi.fn().mockImplementation(async () => flow.armClickCapture()),
    });

    await drag(flow);

    expect(vi.mocked(domToCanvas)).toHaveBeenCalledTimes(1);
    render.settle();
  });

  it("places the comment anyway when the render fails, and reports it once", async () => {
    // Two chains hang off one render. Both rejecting to the host would
    // report a single failure twice.
    stubCanvas();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const render = heldRender();
    const onPlace = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();
    const flow = makeFlow({ autoScreenshot: true, onPlace, onError });

    await drag(flow);
    render.fail(new Error("render died"));
    const captured = await flow.consumePending();

    expect(onPlace).toHaveBeenCalledWith(105, 80, {
      left: 10,
      top: 10,
      width: 190,
      height: 140,
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(captured).toBeNull();
  });
});
