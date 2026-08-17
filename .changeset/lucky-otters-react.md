---
"helldots": minor
---

Add emoji reactions to comments and replies. One of six fixed reactions
(👍 👎 ❤️ 🎉 👀 🚀) can be added from the thread popover and from the inbox
detail view; inbox list cards show the pills read-only so the signal is there
while triaging. Reacting again with the same emoji removes it.

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
