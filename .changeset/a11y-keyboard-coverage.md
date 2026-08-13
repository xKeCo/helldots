---
"helldots": patch
---

Accessibility: dropdown menus honor the keyboard contract their `role="menu"` promises — Escape closes just the menu (never the popover behind it) and returns focus to its button, and Arrow/Home/End walk the items. Screenshot thumbnails are keyboard-operable (the lightbox was mouse-only). The lightbox announces itself as a dialog, takes focus on open and returns it on close; the inbox panel receives focus when it opens; the delete confirmation announces its message via `aria-describedby`; the page-filter chips sit in a proper `radiogroup`; and an edited comment's marker updates its accessible name.
