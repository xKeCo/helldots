---
"helldots": minor
---

RF09 comment lifecycle: every comment carries a `status`
(open / in_progress / resolved / closed) shown as a colored circle in both
the inbox cards and the thread popover, changeable from a dropdown. New
`setCommentStatus()` API and `onCommentStatusChanged` callback; status is
persisted and included in the copied agent context. The thread popover now
exposes the same action strip as the inbox (copy agent context, status,
delete) with hover tooltips.
