// A stand-in for what `domToCanvas` hands back.
//
// It has to answer `getContext` and return a painted pixel, because
// `renderPage` checks that the canvas it got actually holds paint before
// trusting it: past the browser's canvas ceiling the renderer returns one
// that reports the right size, accepts every draw call, and holds nothing.
// A mock that is only `{ width, height }` is indistinguishable from that
// failure, so every suite that mocks the renderer needs this shape.
//
// Shared rather than copied into each suite — the four that need it would
// drift, and a stale copy would look like the ceiling check misfiring.

/**
 * @param {number} [width]
 * @param {number} [height]
 * @returns {any}
 */
export const renderedCanvas = (width = 1, height = 1) => ({
  width,
  height,
  getContext: () => ({
    getImageData: () => ({ data: [255, 255, 255, 255] }),
    drawImage: () => {},
    fillRect: () => {},
    fillStyle: "",
  }),
  toDataURL: () => "data:image/png;base64,rendered",
});
