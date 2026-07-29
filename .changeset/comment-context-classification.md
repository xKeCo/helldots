---
"helldots": minor
---

Automatic context capture and comment classification (RF1–RF5)

- Every new comment now captures a viewport screenshot (JPEG, half scale) and
  an environment snapshot: URL, viewport, screen resolution, device pixel
  ratio, user agent, browser, OS and language. Opt out with
  `autoScreenshot: false`.
- Comments can be categorised by type (bug, suggestion, question,
  improvement), prioritised (high, medium, low) and labelled with free-form
  tags. All three are optional and start neutral. New methods:
  `setCommentType`, `setCommentPriority`, `setCommentTags`, plus a single
  `onCommentUpdated` callback.
- Resolved comments show how long they took, computed from the new
  `resolvedAt` timestamp. Reopening a comment clears it.
- The inbox gains type and priority filters, classification badges, and a
  context block in the detail view.
- Fixed: the HellDots toolbar was being rendered into manual drag
  screenshots. Captures now hide the whole widget host.
