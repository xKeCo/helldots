---
"helldots": patch
---

The per-frame position loop no longer degrades with the number of comments: marker circles are indexed in a Map instead of a shadow-tree query per comment per frame, every pass measures all markers before writing any style (no more forced layout per marker), the occlusion hit-test runs at most every 150ms during scroll bursts (with a trailing pass to settle the end state), and flipping N markers in one frame refreshes the inbox once instead of N times. The per-comment MutationObservers — redundant with the page-wide one — are gone, along with their N callbacks per DOM mutation.
