---
"helldots": patch
---

Fix: the storage merge and the inbox detail lookups compare ids on their string form like every other entry point, so a numeric legacy id and its string spelling can never duplicate a stored entry or miss the detail view.
