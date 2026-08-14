---
"helldots": patch
---

The automatic screenshot now works under a strict `style-src` Content
Security Policy. `modern-screenshot` embeds web fonts through a `<style>` in
a detached document, which inherits the page's CSP; where the policy blocks
it the render threw and the capture was lost entirely. The widget now detects
that case up front and renders without font embedding, so the screenshot is
taken and only downloaded fonts are substituted inside the image. Hosts
without such a policy are unaffected and keep full font fidelity.
