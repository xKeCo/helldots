---
"helldots": minor
---

Make long threads usable: a scrollbar that matches the panel, a popover that
grows the right way, and a way to remove a single reply.

- Scrollbars in the thread popover, the hover preview and both inbox panes
  are now dark. They were rendering as the light platform default, because
  Chromium ignores `::-webkit-scrollbar-*` rules on any element that also
  sets `scrollbar-width`.
- A thread popover that no longer fits below its marker anchors to the bottom
  of the viewport, so new replies extend it upward instead of pushing the
  reply box off screen. It goes back to sitting beside the marker as soon as
  it fits again.
- Sending a reply scrolls the thread to it, rather than leaving it below the
  fold.
- Each reply carries the same ⋯ menu as its comment, with a "Delete reply"
  option. Available in the thread popover and in the inbox detail view.
- New `deleteReply(commentId, replyId)` method and matching `onReplyDeleted`
  callback, so hosts that persist comments themselves can mirror the change.
