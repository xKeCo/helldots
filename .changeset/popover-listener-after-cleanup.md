---
"helldots": patch
---

`cleanup()` can no longer be outrun by the thread popover's outside-click listener. The listener is armed from a timer, so tearing the widget down in the same tick as opening a thread left it to land on `document` afterwards, with nothing remaining to remove it — and because it closes over the popover controller, it kept that instance, its shadow root and its comments alive. A host that mounts and unmounts the widget (a route change, a React StrictMode double-invoke) accumulated one dead listener per mount.
