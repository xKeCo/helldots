---
"helldots": patch
---

Screenshot capture no longer freezes the page. The clone traversal now hands
the main thread back to the browser on an 8 ms budget, so the page keeps
painting and accepting input while a render is in flight — on heavy pages
that render could block for over a second. Wall-clock capture time is
unchanged; what changes is that it is no longer a freeze.
