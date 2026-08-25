---
"helldots": patch
---

Fix captures coming back blank on very long pages. Past the browser's canvas
ceiling — 65 535px in a dimension, and an area cap besides — a canvas accepts
its size, hands out a context, takes every draw call and holds no pixels, so
every screenshot off it was empty with nothing said about it.

Renders now fit their scale to what the browser will actually paint, verify
that the result holds pixels, and retry smaller if it does not. Pages below
the ceiling are unchanged; past it the capture goes soft rather than blank,
and a render that cannot be produced at all reports through `onError` instead
of attaching an empty image.
