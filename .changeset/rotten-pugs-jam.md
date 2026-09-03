---
"helldots": minor
---

Restore visible keyboard focus indicators (WCAG 2.1 AA, 2.4.7 Focus Visible).

Every control the widget exposes to the keyboard now shows one: the toolbar,
the status, type and priority pickers, the menu items, the inbox cards and
filter chips, the marker circles and the screenshot thumbnails take a 2px
ring, and the borderless text fields take an inset underline.

They are bound to `:focus-visible`, so they appear only when focus arrived by
keyboard — the pointer look is unchanged, which is what the earlier revert of
these rules was protecting.
