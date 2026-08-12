---
"helldots": minor
---

Stop inbox cards stating the same thing twice, and give the hover preview a
sense of the thread behind it.

- The hover tooltip now says how many replies a thread has, when it has any.
  Threads with no replies are unchanged.
- The status picker carries its label like type and priority already did, so
  the current status is readable without hovering — which touch never allows.
- Those labels are no longer capped at 72px, so "In progress" and
  "Improvement" show in full. The strip wraps to a second line in the one
  combination that no longer fits a narrow card.
- Inbox cards no longer repeat type and priority as badges when the action
  strip above already states them. Tags and the resolution time still show —
  nothing else displays those.
- The action strip sits directly under the author now, the same place the
  thread popover puts it, instead of in a card footer.
