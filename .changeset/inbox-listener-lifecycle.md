---
"helldots": patch
---

The inbox no longer leaves its outside-click listener on `document`. Like the thread popover's, it is armed from a timer, so `closeInbox()` — and `cleanup()` through it — could be outrun and leave a listener nothing remained to remove. Re-opening an already-open inbox also overwrote both the pending timer and the handler, orphaning the previous pair; `notifyNavigation()` re-reads the deep link on every route change, so a long-lived SPA session accumulated one dead listener per navigation, each pinning the overlay it closed over.
