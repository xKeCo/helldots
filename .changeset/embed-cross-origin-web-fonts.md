---
"helldots": patch
---

Drag-selected screenshots no longer come back holding the wrong glyphs on
pages whose web font is served cross-origin (Google Fonts and the like).
Reading `cssRules` on such a stylesheet throws, so its `@font-face` rules
never reached the renderer, the captured text fell back to a different face,
and its different metrics shifted every glyph sideways — a short drag over a
few letters came out clipped on one side with dead space on the other. Those
rules can now be fetched and made readable for the duration of the render, so
the capture matches the page.

This is opt-in through the new `embedCrossOriginFonts` option, default
`false`: re-fetching a third party's stylesheet mid-capture is network the
host did not sign up for by mounting a comment widget. Left off, such a page
captures exactly as it did before. A host that would rather fix it at the
source can self-host the font or add `crossorigin` to the `<link>`, which
makes the stylesheet readable and costs no requests at capture time.
