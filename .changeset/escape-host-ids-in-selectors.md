---
"helldots": patch
---

Host-supplied comment ids containing quotes or backslashes no longer make marker lookups throw. `loadComments` accepts arbitrary ids, and every lookup interpolated them raw into an attribute selector, so a `"` in an id crashed `querySelector` mid-load and inside the position loop.
