---
"helldots": patch
---

Fix a blue focus ring appearing around the inbox panel when a comment is
opened from a copied link.

The panel takes focus as it opens so a screen reader lands inside the dialog.
Opened by a click that is quiet, but a link opens it during page load with no
pointer interaction behind it, which is enough for Chrome's `:focus-visible`
heuristic to paint its default ring. The panel carries `tabindex="-1"` and is
never reachable by Tab, so the ring marked nothing anyone could act on.

Focus still moves into the dialog; only the ring is suppressed. The focus
rings on the confirm dialog's buttons are untouched.
