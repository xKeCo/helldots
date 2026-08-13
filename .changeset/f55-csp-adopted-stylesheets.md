---
"helldots": patch
---

The widget now works under a strict `style-src` Content Security Policy: styles are delivered as constructed stylesheets (`adoptedStyleSheets`), which CSP does not block, falling back to an injected `<style>` where the platform lacks them. Previously a policy without `'unsafe-inline'` blocked both stylesheets and left the widget unstyled and unusable. `cleanup()` detaches the adopted sheet, and stylesheets the host app had already adopted are preserved.
