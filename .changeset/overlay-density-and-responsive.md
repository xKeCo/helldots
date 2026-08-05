---
"helldots": minor
---

Overlay UI pass: card density, chip filters, richer tooltip and mobile fixes

- The per-comment action strip moved out of the header and onto its own row —
  a footer on inbox cards (shared with the reply link) and a row under the
  header in the thread popover. The author no longer wraps onto two lines in
  the inbox or truncates mid-name in the popover.
- The inbox filter is now a chip panel: page, status, type and priority are
  all visible at once, with a clear button. Status, type and priority chips
  toggle off to clear their group.
- The status filter takes the real lifecycle values (`open`, `in_progress`,
  `resolved`) instead of `unresolved`/`resolved`, so `in_progress` is
  filterable. A comment with no stored status still matches `open`.
- The hover tooltip now summarises status, type, priority, tags and
  resolution time as badges instead of showing only the author and the text.
- The marker whose thread is open is visibly marked as active, and clicking
  it again closes the thread — it works as a toggle. Clicking a different
  marker still switches threads.
- The automatic context capture is reachable from the thread popover as a
  collapsed disclosure, not only from the inbox detail.
- The comment box's classification row lines up with the textarea, and its
  type/priority controls are outlined.
- The tags input was removed from the comment box. The `tags` field,
  `setCommentTags()` and the rendering of existing tags are unchanged.
- The comment box, tooltip and thread popover are now
  `min(400px, calc(100vw - 24px))` wide and clamp to the viewport, fixing the
  horizontal overflow when creating or opening a comment on a phone.
- The thread popover follows its marker while the page scrolls instead of
  staying fixed on screen, and hides while the marker is off-screen — coming
  back, with any half-typed reply intact, as soon as the marker returns.
- The thread popover no longer grows past the viewport. Its body, context
  block and replies scroll inside it while the header, the action strip and
  the reply box stay pinned, so a long thread or an expanded context block is
  actually reachable.
