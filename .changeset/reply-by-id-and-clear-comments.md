---
"helldots": minor
---

Two API additions: `addReply` now accepts a comment id as well as the live object (every sibling mutator already took ids; it returns `null` for an unknown id), and `clearComments()` removes every comment at once — markers, memory and their persisted entries — as the bulk reset a host needs to reconcile against its backend before a fresh `loadComments`. It deliberately fires no per-comment callbacks.
