---
"helldots": minor
---

Editing and deleting are no longer open to everyone

The widget recorded `authorId` on every comment and reply but never read it
back, so the ⋯ menu offered Edit and Delete on all of them to whoever was
looking. It now offers them only on records carrying your own identity.

A new `can(action, target)` option overrides that rule for moderators, owner
roles or read-only viewers. `action` is one of `"edit:comment"`,
`"delete:comment"`, `"edit:reply"` or `"delete:reply"`; return literal `true`
to allow. The same verdict is readable from `overlay.can(action, target)`, so
a delete button in your own chrome can ask the one rule.

Only those four actions are gated — status, type, priority, tags, reactions
and replying stay open to everyone. Your own API calls are never refused:
`can` governs clicks inside the widget, not `overlay.deleteComment(id)` from
your code.

Behaviour changes only for hosts that set `user`. Without one, every record
is written by the same anonymous actor and nothing is hidden.

This is not authorization — HellDots runs in the page. Keep checking
`authorId` against the session on your server.
