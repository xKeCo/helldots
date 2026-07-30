---
"helldots": patch
---

Fix two overlay dismissal bugs

- Opening a screenshot in the lightbox no longer tears down the surface
  behind it. The lightbox is mounted as a sibling of the inbox and the thread
  popover, so their "the click landed outside me, close" rule used to read
  every click on it — its own close button included — as a click away, and
  closed the panel underneath.
- The status, type and priority pickers (and the ⋯ menu, and the inbox
  filter) now follow a single-open rule: opening one closes the others,
  instead of leaving three menus stacked on top of each other in the thread
  popover. Any click outside the open menu closes it too, and the toggles
  report `aria-expanded`.
