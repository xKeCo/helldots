// The style properties a capture actually needs.
//
// `modern-screenshot` reproduces an element by reading its computed style
// and inlining it on the clone. Left alone it enumerates everything the
// browser exposes — ~527 properties per element on a modern engine — and
// that enumeration is the render: profiling a host's page put 116 467
// property reads at 97 ms against 1 ms of cloning and 7 ms of rasterising.
//
// The clone is re-parented into a fresh document inside a `<foreignObject>`
// with no cascade of its own, so anything omitted here is simply not there.
// That makes this list a fidelity contract, not a preference: it has to
// carry every property that changes a pixel, and it is opt-in precisely
// because "every property that changes a pixel" is not decidable for a page
// this library has never seen.
//
// Verified by rendering the same page with and without the list and
// comparing the two canvases pixel for pixel — see DECISIONS.md.

/**
 * Properties `modern-screenshot` reads back out of the map it just built,
 * to drive behaviour rather than appearance: scrollbar cloning, its Chrome
 * ellipsis workaround, the `background-clip: text` class hack, and the font
 * subsetting that decides which web fonts get embedded at all.
 *
 * Dropping one of these does not degrade an image, it changes what the
 * renderer does — which is why they are called out instead of being left to
 * blend into the list below.
 */
export const RENDERER_READS_BACK = [
  "background-clip",
  "font-family",
  "font-kerning",
  "overflow-x",
  "overflow-y",
  "text-overflow",
  "text-transform",
];

/**
 * The curated allow-list handed to `includeStyleProperties`.
 *
 * Longhands only. The renderer sets each name it is given straight onto the
 * clone's inline style, so a shorthand would work — but the browser
 * enumerates computed styles as longhands, and asking for `margin` when the
 * engine only answers to `margin-top` costs a lookup that returns nothing.
 * @type {string[]}
 */
export const CAPTURE_STYLE_PROPERTIES = [
  ...RENDERER_READS_BACK,

  // Box and flow.
  "aspect-ratio",
  "border-collapse",
  "border-spacing",
  "bottom",
  "box-sizing",
  "caption-side",
  "clear",
  "display",
  "empty-cells",
  "float",
  "height",
  "isolation",
  "left",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-height",
  "max-width",
  "min-height",
  "min-width",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "position",
  "right",
  "table-layout",
  "top",
  "vertical-align",
  "visibility",
  "width",
  "z-index",

  // Borders and outlines.
  "border-bottom-color",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "border-bottom-style",
  "border-bottom-width",
  "border-image-outset",
  "border-image-repeat",
  "border-image-slice",
  "border-image-source",
  "border-image-width",
  "border-left-color",
  "border-left-style",
  "border-left-width",
  "border-right-color",
  "border-right-style",
  "border-right-width",
  "border-top-color",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-top-style",
  "border-top-width",
  "outline-color",
  "outline-offset",
  "outline-style",
  "outline-width",

  // Flexbox, grid and multi-column.
  "align-content",
  "align-items",
  "align-self",
  "column-count",
  "column-fill",
  "column-gap",
  "column-rule-color",
  "column-rule-style",
  "column-rule-width",
  "column-span",
  "column-width",
  "flex-basis",
  "flex-direction",
  "flex-grow",
  "flex-shrink",
  "flex-wrap",
  "grid-auto-columns",
  "grid-auto-flow",
  "grid-auto-rows",
  "grid-column-end",
  "grid-column-start",
  "grid-row-end",
  "grid-row-start",
  "grid-template-areas",
  "grid-template-columns",
  "grid-template-rows",
  "justify-content",
  "justify-items",
  "justify-self",
  "order",
  "row-gap",

  // Typography.
  "color",
  "direction",
  "font-feature-settings",
  "font-size",
  "font-stretch",
  "font-style",
  "font-variant",
  "font-variation-settings",
  "font-weight",
  "hyphens",
  "letter-spacing",
  "line-height",
  "list-style-image",
  "list-style-position",
  "list-style-type",
  "overflow-wrap",
  "tab-size",
  "text-align",
  "text-align-last",
  "text-decoration-color",
  "text-decoration-line",
  "text-decoration-style",
  "text-decoration-thickness",
  "text-indent",
  "text-orientation",
  "text-shadow",
  "text-underline-offset",
  "text-underline-position",
  "unicode-bidi",
  "white-space",
  "word-break",
  "word-spacing",
  "writing-mode",
  "-webkit-box-orient",
  "-webkit-line-clamp",
  "-webkit-text-fill-color",
  "-webkit-text-stroke-color",
  "-webkit-text-stroke-width",

  // Paint.
  "backdrop-filter",
  "backface-visibility",
  "background-attachment",
  "background-blend-mode",
  "background-color",
  "background-image",
  "background-origin",
  "background-position-x",
  "background-position-y",
  "background-repeat",
  "background-size",
  "box-shadow",
  "clip-path",
  "filter",
  "mask-image",
  "mask-mode",
  "mask-position",
  "mask-repeat",
  "mask-size",
  "mix-blend-mode",
  "object-fit",
  "object-position",
  "opacity",
  "perspective",
  "perspective-origin",
  "rotate",
  "scale",
  "transform",
  "transform-origin",
  "transform-style",
  "translate",

  // Form controls, which the UA paints from these rather than from a
  // background: an unstyled checkbox with no `accent-color` comes out as an
  // empty box.
  "accent-color",
  "appearance",

  // SVG. Presentation attributes resolve into computed style, so a chart or
  // an icon set is invisible without them.
  "dominant-baseline",
  "fill",
  "fill-opacity",
  "fill-rule",
  "paint-order",
  "shape-rendering",
  "stop-color",
  "stop-opacity",
  "stroke",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "stroke-width",
  "text-anchor",
];
