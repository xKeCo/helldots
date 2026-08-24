---
"helldots": minor
---

**`transformScreenshot`** — swap every image the widget acquires for a string
of your own before it becomes part of a record, so a ~33 KB base64 data URL
per comment does not end up in your database.

Called with `(dataUrl, { kind, commentId })` for the automatic viewport
capture (`kind: "context"`), drag-crop regions, and file attachments on
comments and replies (`kind: "attachment"`). Return the string to store —
typically a URL into your own object storage.

Fail-open: a rejection, a throw, or a resolved value that is not a non-empty
string keeps the original data URL and reports the new
`onError(error, "transform")`. Not called for records passed to
`loadComments()`, nor for screenshots handed to `addReply()` directly.

The comment box's submit button is now disabled while a save is in flight,
since that save may be waiting on an upload.
