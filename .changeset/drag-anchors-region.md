---
"helldots": patch
---

A drag comment now anchors to the region it selected, not to the mouseup
pixel. The comment is placed at the rectangle's center, and the anchor
target is the topmost element at that point whose box covers at least 60%
of the region — so a floating panel that happens to sit under the released
mouse (and later closes) can no longer capture the anchor and leave the
marker invisible. Plain-click placement is unchanged.
