---
"helldots": minor
---

Serializable comment anchoring: comments now capture a JSON-serializable
anchor (best-effort CSS selector + content fingerprint + relative
coordinates) at creation. New public API: `serializeComments()`,
`loadComments()`, and `onCommentCreated` / `onReplyAdded` / `onAnchorLost`
options callbacks so the host app can persist and restore comments across
reloads. Comments whose anchor can no longer be resolved are kept as
orphans — listed in the new Inbox panel with an "Unanchored" badge instead
of being positioned over the wrong element.
