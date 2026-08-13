---
"helldots": patch
---

The inbox list no longer rebuilds itself from scratch on every refresh: cards reconcile by comment id, unchanged cards (and their decoded thumbnails) are reused, and the scrolling container survives — so the list keeps its scroll position when a comment changes, resolves, or a marker's visibility flips mid-scroll.
