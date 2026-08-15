---
"helldots": minor
---

Add an **In review** state to the comment lifecycle, between _In progress_ and
_Resolved_. It is available in the status picker, in the inbox status filter
and through `setCommentStatus(id, "in_review")`, and it carries the blue that
`open` used to have.

`open` moves to an unsaturated off-white grey, so the states somebody actively
moved a comment into are the ones that stand out. `CommentStatus` gains
`"in_review"`; stored comments need no migration.
