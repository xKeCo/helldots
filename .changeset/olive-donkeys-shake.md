---
"helldots": minor
---

Add `skipIframeContent`, an opt-in that renders embedded documents as blank
instead of cloning them. A same-origin iframe's cost is invisible from the
host page — the renderer clones the whole embedded document, so a page of
242 elements can be a capture of 9 245.

The `<iframe>` element is kept, so its box and the layout below it stay
where the page put them. Off by default: on a same-origin frame the content
you lose is real.
