---
"helldots": minor
---

SPA support: new `notifyNavigation()` re-syncs the widget after a client-side navigation — comments reclassify against the new pathname, anchors re-resolve against the new DOM, markers rebuild and the inbox moves onto the new page (deep links and the cross-page handoff included). New `navigate` option routes the widget's own cross-page jumps through the host's router instead of a full reload, and `autoDetectNavigation: true` opts into automatic re-sync on popstate.
