---
"helldots": patch
---

Fix: the hover tooltip, thread popover and reply-row lookups escape host ids before interpolating them into attribute selectors, matching the marker lookups. A comment or reply id containing a quote or backslash (accepted via `loadComments`) crashed the marker UI on hover.
