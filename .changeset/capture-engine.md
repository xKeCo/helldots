---
"helldots": minor
---

Drag-to-capture screenshots are now correct on scrolled pages: html2canvas
double-counted the window scroll (captures showed content from higher up
the page). The capture engine moved to the maintained `modern-screenshot`
(smaller, better fidelity with modern CSS) and HellDots now owns the crop
in page coordinates, eliminating that bug class. Captures also paint the
page's effective background (computed html/body color, white fallback)
instead of coming out as invisible transparent PNGs on pages that rely on
the browser's default canvas. `modern-screenshot` replaces `html2canvas`
as the package dependency.
