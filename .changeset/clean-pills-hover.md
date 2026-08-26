---
"helldots": patch
---

Drop the hover tooltip from reaction pills. The emoji and the count already say
what a pill is, so a bubble per pill turned a dense row into a wall of popups.
The trigger beside the row keeps its tooltip, and the pills keep their
accessible name and `aria-pressed` state.
