---
"helldots": patch
---

The automatic-context screenshot — the one the thread popover and the inbox
detail render under "Context" — can now be opened from the keyboard. It wired
its own click listener instead of going through the shared thumbnail helper,
so unlike every other screenshot in the widget it carried no `role="button"`,
no `tabindex` and no Enter/Space handler, leaving it reachable by mouse only.
