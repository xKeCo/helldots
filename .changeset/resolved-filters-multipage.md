---
"helldots": minor
---

Lifecycle refinements: the "closed" state is removed (legacy data maps to
"resolved"); resolved comments lose their on-page marker, get a
green-accented dimmed card and sink to the bottom of the inbox. The inbox
filter now combines Filter by Page (All / Current page) and Filter by
Status (All / Unresolved / Resolved) in one sectioned dropdown with
checkmarks. Clicking an other-page comment navigates to its page and opens
its thread automatically (sessionStorage handoff), and hovering an inbox
card highlights the anchored element on the page. Playground gains a
second route (about.html) to exercise the cross-page flow.
