---
"helldots": minor
---

Callbacks now say who caused a change and what moved, and a shared link can
ask for the comment it points at.

- **`meta.origin`** — every callback takes one extra trailing argument, and
  `onChange` events carry the same fields flattened onto them. `"user"` is
  somebody acting inside the widget, `"host"` is your own code calling a
  method. Multi-user apps needed this to stop echoing their own remote writes
  back to the server. Existing handlers that ignore the argument are
  unaffected.
- **`meta.from` / `meta.to` / `meta.field`** — `comment:status-changed` now
  carries both ends of the move (so a reopen is told apart from a resolve),
  and `comment:updated` says which of type, priority or tags it was about.
  `field` narrows `from`/`to` in TypeScript.
- **`onCommentRequested(id)`** — fires when a "Copy link" URL points at a
  comment the widget does not hold, once per id. Fetch it, hand it to
  `loadComments()`, and the inbox opens on it; return a promise and the link
  is retried once it settles. This is what makes loading only the linked
  comment possible. `DEFAULT_LINK_PARAM` and `readCommentLinkParam` are also
  exported now, for reading the id before an overlay exists.
- **`onReady(overlay)`** — the widget has mounted and every method is safe to
  call. `loadComments()` before that no longer throws: the data is held and
  applied at mount, though the counts come back as zeroes until then.
- **`onError(error, context)`** — failures the widget survives but only the
  console used to hear about: `"capture"`, `"storage"`, `"load"`, `"link"`.
- `setCommentType`, `setCommentPriority` and `setCommentTags` now no-op when
  the value does not change, matching `setCommentStatus`. They previously
  wrote to storage and emitted an event for a change that did not happen.
