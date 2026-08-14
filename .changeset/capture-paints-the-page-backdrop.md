---
"helldots": patch
---

Screenshots taken on a page shorter than the viewport no longer come out with
a solid black band below the content. The render covers the `<body>` box, so
anything past it was left at the canvas's transparent black and JPEG flattened
it to black; crops now lay the page's own background down first, which is what
the browser paints across the viewport there. Applies to both the automatic
capture and drag selections.
