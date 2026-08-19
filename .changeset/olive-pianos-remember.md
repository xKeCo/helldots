---
"helldots": minor
---

Add an append-only audit trail to every comment: who created it, edited its
text, moved its status or changed its classification, and when. It shows as a
folded `History (n)` disclosure in the inbox detail and rides along in
`serializeComments()` output as `history`.

Resolution time is now derived from that log instead of read off a stored
figure, so a comment that was resolved, reopened and resolved again reports the
duration of the resolution currently in force — and the superseded ones are
listed under **Previous resolutions** in the same disclosure.

Replies and reactions are deliberately not recorded: a reply already carries
its own author and timestamp, and reactions are high-frequency signal with no
audit value. That keeps a typical comment at three to five entries.

The field is additive and optional — a corpus written before this change loads
unchanged with `history: null`, and no migration is involved. Entries arriving
through `loadComments` are scrubbed: an unknown event type or an unparseable
timestamp is dropped rather than trusted.

HellDots still authenticates nobody, so the trail records what the host
declared in `user` at the moment of each action. It is attributive, not
evidential.
