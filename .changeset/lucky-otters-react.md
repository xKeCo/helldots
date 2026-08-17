---
"helldots": minor
---

Add emoji reactions to comments and replies. One of six fixed reactions
(👍 👎 ❤️ 🎉 👀 🚀) is added from the emoji button in the action strip — the
same strip the thread popover and every inbox card share — and once something
has been reacted to, a row of pills appears under the comment (below its
screenshot when there is one) with a trailing button for adding one more.
Reacting again with the same emoji removes it, and the row disappears with the
last reaction.

The action strip is now split in two: status, type and priority on the left,
and the tools — react, copy context, ⋯ — on the right. Replies carry the same
pair of controls on their meta line.

Two new methods, `toggleCommentReaction(id, emoji)` and
`toggleReplyReaction(commentId, replyId, emoji)`, plus a `reaction:toggled`
event and its `onReactionToggled(comment, reply)` callback — `reply` is `null`
when the reaction is on the root comment.

`user` gained an optional `id`. It is never displayed: it is what a reaction is
keyed on, so two teammates who share a display name do not share a reaction.
Without it the name is used, exactly as authorship already does.

Reactions travel in `serializeComments()` output as an `{ emoji: actorKey[] }`
map, `null` when nobody has reacted, and hostile or stale persisted values are
scrubbed on load. Costs 2 KB gzip and no new dependency.
