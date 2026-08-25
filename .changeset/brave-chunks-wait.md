---
"helldots": patch
---

Load `modern-screenshot` lazily on the first capture instead of statically.

Bundlers now split the renderer (~10 KB gzip) into its own chunk that
downloads when the first capture runs, so apps embedding HellDots no longer
pay for it in their initial bundle — and pages where nobody captures never
fetch it at all. A failed load surfaces through the existing `onError` path
and is retried on the next capture rather than cached.
