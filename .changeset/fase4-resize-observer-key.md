---
"helldots": patch
---

Fix: per-comment ResizeObservers are tracked by the id's string form, so deleting a legacy numeric-id comment through its string spelling (or vice versa) disconnects its observer instead of leaking it against a detached marker.
