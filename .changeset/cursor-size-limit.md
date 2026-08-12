---
"helldots": patch
---

Fix the comment-mode cursor reverting to the default arrow near the edges of
the page. The image was 48x48, and Chromium drops custom cursors larger than
32x32 device-independent pixels once they can intersect native browser UI.
The canvas is now 32x32 with the artwork unchanged at 28px, so the cursor
looks identical and keeps its shape all the way to the edge. The blue drop
shadow is gone — it needed more margin than the smaller canvas allows; the
white outline that carries contrast is unchanged.
