// How large a canvas this browser will actually paint.
//
// Every engine caps both a canvas's single dimension and its total area, and
// neither cap is reported anywhere. Worse, going past one is not an error: the
// assignment is accepted, `canvas.width`/`.height` read back exactly what was
// set, `getContext("2d")` hands out a context, every draw call succeeds — and
// the canvas holds no pixels. A render of a long page comes back completely
// blank with nothing on the console to say why.
//
// Measured in Chromium 1265px wide: 65 535 tall holds paint, 65 536 does not;
// 16384x16384 (268 Mpx) holds, 20000x20000 (400 Mpx) does not. Firefox caps
// the dimension at 32 767 and mobile Safari caps the area far lower, so the
// numbers here are a starting point and `paintsPixels` is the thing that
// actually decides.

/**
 * Chromium's measured area cap, used as the opening guess.
 *
 * Only a guess: engines differ by more than an order of magnitude, so a
 * render is verified afterwards rather than trusted to this.
 */
const AREA_LIMIT = 16384 * 16384;

/** Fallback when even the smallest probe fails — pathological, but finite. */
const MIN_DIMENSION = 4096;

/**
 * Whether a canvas of this size holds what is painted into it.
 * @param {number} width
 * @param {number} height
 * @returns {boolean}
 */
const holdsPaint = (width, height) => {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    if (canvas.width !== width || canvas.height !== height) return false;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 1, 1);
    return ctx.getImageData(0, 0, 1, 1).data[3] !== 0;
  } catch {
    return false;
  }
};

/** @type {number | null} */
let measured = null;

/**
 * The largest single dimension this browser paints.
 *
 * Probed one pixel wide, so it measures the dimension cap on its own: a
 * 1x65535 canvas is 256 KB and tells us nothing about the area cap, which is
 * exactly what is wanted here. Measured once and remembered — the answer is a
 * property of the engine, not of the page.
 * @returns {number}
 */
export const maxCanvasDimension = () => {
  if (measured !== null) return measured;
  measured =
    [65535, 32767, 16384, 8192, MIN_DIMENSION].find((d) => holdsPaint(1, d)) ??
    MIN_DIMENSION;
  return measured;
};

/**
 * The largest scale at or below `wanted` that should produce a painted canvas.
 *
 * Area is bounded by a square root because scaling touches both axes: halving
 * the scale quarters the pixel count.
 *
 * The limits are parameters so this stays a pure function of four numbers.
 * Callers pass none — the defaults are the measured dimension and the area
 * guess — but a test can pin every branch without a browser, and the area
 * branch is otherwise unreachable wherever the dimension probe floors out.
 * @param {number} width CSS pixels of the node being rendered
 * @param {number} height
 * @param {number} wanted the scale the caller asked for
 * @param {{ maxDimension?: number, maxArea?: number }} [limits]
 * @returns {number}
 */
export const fittingScale = (width, height, wanted, limits = {}) => {
  if (!(width > 0) || !(height > 0)) return wanted;
  const { maxDimension = maxCanvasDimension(), maxArea = AREA_LIMIT } = limits;
  return Math.min(
    wanted,
    maxDimension / width,
    maxDimension / height,
    Math.sqrt(maxArea / (width * height))
  );
};

/**
 * Whether a finished render actually holds pixels.
 *
 * Reads one pixel's alpha, which works only because every render is given an
 * opaque `backgroundColor` and the renderer fills the whole canvas with it
 * before drawing. A render allowed to stay transparent would read as failed
 * here — that coupling is deliberate and is why `effectiveBackgroundColor`
 * falls back to white rather than returning null.
 * @param {any} canvas
 * @returns {boolean}
 */
export const paintsPixels = (canvas) => {
  try {
    const ctx = canvas?.getContext?.("2d");
    return Boolean(ctx) && ctx.getImageData(0, 0, 1, 1).data[3] !== 0;
  } catch {
    return false;
  }
};
