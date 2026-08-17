---
"helldots": patch
---

Fix dropdowns rendering see-through on resolved comments. A resolved card is
dimmed with `opacity`, which composites it and everything inside it as a single
translucent layer — so the status, type, priority and `...` menus opened from
one were painted above the context block and still showed it through
themselves. The dim is now lifted while a dropdown inside the card is open.

Most visible in the inbox detail view, where the context screenshot sits
directly behind the menu.
