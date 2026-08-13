---
"helldots": patch
---

`cleanup()` removes the now-empty `helldots-root` host element from the page, and `loadComments` drops non-string entries from comment and reply `screenshots[]` arrays instead of rendering silently broken thumbnails.
