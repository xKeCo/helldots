---
"helldots": patch
---

Close the gap under the context block in the inbox detail view. A comment
with no replies still rendered its replies container, and as a zero-height
flex item it collected 24px of the column gap — most visible with the
context block collapsed.
