---
"helldots": patch
---

Schema hardening: serialized comments carry `schemaVersion: 1` (additive — future breaking changes get a hinge to detect newer payloads); an anchor written by a newer schema version resolves as orphaned instead of half-interpreted; malformed replies are dropped on load with the same id+text gate the comment itself passes; and file attachments reject non-images before reading them into data URLs.
