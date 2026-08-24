---
"helldots": minor
---

Four additions for hosts integrating the widget into a real app.

- **`onCommentModeChanged(active)`** — comment mode turned on or off, however
  it was flipped. The keyboard shortcut is the reason: it never reaches the
  host, so an app that has to stand down while somebody picks an element had
  no signal at all.
- **`onCommentOpened(comment)`** — somebody opened a comment's thread, from
  its marker or from the inbox detail. This is what an unread count is built
  on; it does not fire when the inbox merely re-renders. HellDots stores no
  read state of its own, because whose read it is depends on an identity only
  the host can persist.
- **`setUser(user)`** — replaces the identity new comments, replies and
  reactions are attributed to, without rebuilding the widget. For a session
  that resolves after mount, or a user switching account. Nothing already
  written is rewritten; `null` returns to the anonymous author.
- **`exportCommentsCsv()` / `exportMetricsCsv()` now return the CSV text** as
  well as downloading it, so the rows can be sent somewhere instead of handed
  to the user as a file. `printMetricsReport()` still returns nothing — what
  it produces is a print dialog.
