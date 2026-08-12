---
"helldots": minor
---

Rework the inbox's empty state. Instead of a single line of grey text it now
shows the marker's outline, the comment shortcut spelled the way the user's
platform spells it (⌥ on Apple, Alt elsewhere — the same string the toolbar
tooltip shows), and a button that turns comment mode on.

An inbox whose filters happen to match nothing is treated as a different
state: it names that cause and offers Clear, rather than teaching a shortcut
to someone who already has comments.

Turning comment mode on now closes the inbox, so the panel stops covering the
page the user is being asked to click on. This applies to the keyboard
shortcut and the new button; turning the mode off leaves an open inbox alone.

The `inboxEmpty` string is replaced by `inboxEmptyTitle`,
`inboxEmptyHintTemplate`, `inboxEmptyAction` and `inboxNoMatches`. Only
consumers passing a custom `strings` object are affected.
