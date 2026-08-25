---
"helldots": minor
---

Add `captureTimeout`, bounding how long one remote asset may hold a capture
up while the renderer re-fetches the page's images and fonts to inline them.

The default is unchanged. A dead asset URL stalls a capture for about a
minute — the renderer's own 30 second deadline, paid twice because the number
drives two waits in sequence, one for the image on the page to load and one
for the fetch that inlines it — and the capture still succeeds with that asset
replaced by a placeholder. The wait is bounded rather than multiplied: one
dead asset and ten cost the same.

Left at the default because a shorter one drops assets that were only slow
and leaves holes in the image with nothing to say so. Set it if you have
measured your own page. Only a finite positive number is honoured: 0 means
"never give up" to the renderer, and `Infinity` is coerced to no wait at all.
