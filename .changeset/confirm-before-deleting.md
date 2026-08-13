---
"helldots": minor
---

Ask before deleting anything.

Deleting a comment or a reply was a single click on a menu item, and there is
no trash and no undo to recover from it. Both now open a confirmation modal
first, from every place they can be reached: the inbox cards, the inbox
detail and the thread popover.

- The warning names what goes: deleting a comment that has replies says the
  replies go with it.
- Cancel takes focus, so the destructive button is never one stray Enter
  away. Escape and a click on the backdrop both cancel, and neither reaches
  the panel behind the dialog.
- Seven new locale keys (`confirmDelete`, `confirmCancel`,
  `confirmDeleteCommentTitle`, `confirmDeleteCommentMessage`,
  `confirmDeleteThreadMessage`, `confirmDeleteReplyTitle`,
  `confirmDeleteReplyMessage`). Hosts passing a custom `strings` object need
  to add them.
