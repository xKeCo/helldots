---
"helldots": patch
---

Fix the inbox detail header: its prev/next/close buttons reuse the card
action strip, whose `space-between` scattered them across the row instead
of grouping them opposite `Back`. They now align to the end of the strip,
which keeps its full width.
