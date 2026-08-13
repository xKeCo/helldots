---
"helldots": patch
---

`cleanup()` called while the document is still loading now cancels the deferred mount. Previously the instance kept its `DOMContentLoaded` listener and mounted a zombie UI nobody held a handle to — exactly the construct-then-cleanup shape React 18 StrictMode produces in SSR apps.
