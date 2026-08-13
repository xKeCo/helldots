---
"helldots": minor
---

Add "Copy link" and "Edit" to the ⋯ menu, for comments and for replies.

**Copy link** copies `<page>?helldotsComment=<id>`. Opening it anywhere the
comments are available opens the inbox on that comment's thread. There is no
redirect hop: the page a comment lives on is recorded on the comment, so the
link points straight at its destination.

- The parameter stays in the URL, so the link can be reloaded or re-copied.
- The id is remembered and retried after every `loadComments()`, so a link
  works for hosts that fetch their comments from their own back end.
- A link to a comment this page cannot show opens the inbox with a notice
  rather than doing nothing.
- Under `persistence: "localStorage"` a link only works in the same browser —
  there is no server to share through.

**Edit** replaces the body with an inline editor, in the thread popover and
in the inbox. The draft is held as panel state, so it survives everything
that re-renders the panel — changing a comment's status, priority or type, or
deleting a reply, no longer discards what you were typing. Cancel, Escape,
opening another editor, closing the panel and navigating between comments all
ask before dropping unsaved text; a click on the page leaves the panel open
instead of asking. Edited items carry a text "edited" mark with the exact
time on hover.

New API: `editComment(id, text)`, `editReply(commentId, replyId, text)`,
`commentLink(id)`, the `linkParam` option, and the `onCommentEdited` /
`onReplyEdited` callbacks. `SerializedComment` and `CommentReply` gained an
optional `editedAt`.

Fourteen new locale keys (`copyLink`, `linkCopied`, `editComment`,
`editReply`, `editorAriaLabel`, `editSave`, `editCancel`, `editedMark`,
`editedAtPrefix`, `confirmDiscardTitle`, `confirmDiscardMessage`,
`confirmDiscard`, `confirmKeepEditing`, `commentNotFound`). Hosts passing a
custom `strings` object need to add them.
