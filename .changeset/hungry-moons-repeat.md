---
"helldots": minor
---

Add `fastCapture`, an opt-in that narrows the screenshot renderer's
computed-style enumeration to a curated allow-list instead of every property
the browser exposes. That enumeration is ~91% of a capture's cost and scales
with element count; the list cuts the dominant phase by about 2.7x, measured
pixel-identical to a full capture on the pages it was verified against.

Off by default: a property the list does not name is absent from the image,
so the trade belongs to the host. See the README for when to turn it on.
