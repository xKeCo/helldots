---
"helldots": minor
---

Persist the host-supplied user identity as `authorId` on comments and replies.

`user.id` already keyed reactions; it is now also stored alongside `author` on
everything that user creates, so a backend can correlate a comment against its
own user table and two teammates who share a display name stay distinguishable
in the record. The display name is still the only thing rendered — `authorId`
never reaches the UI.

The field is additive and optional: records written before this change load
unchanged with `authorId: null`, and no migration is involved. A non-string id
arriving through `loadComments` is dropped rather than trusted.

HellDots still authenticates nobody. Whatever the host declares in `user` is
recorded as-is.
