---
"helldots": minor
---

Drag-to-capture screenshots are now correct on scrolled pages: html2canvas
double-counted the window scroll (captures showed content from higher up
the page). The capture engine moved to the maintained `modern-screenshot`
(smaller, better fidelity with modern CSS) and HellDots now owns the crop
in page coordinates, eliminating that bug class. `modern-screenshot`
replaces `html2canvas` as the package dependency.
