---
"helldots": patch
---

Resolve anchor-matching ties to the deepest matching element — in both the
selector match and the rescue search. The text fingerprint is truncated to
64 characters, so in nested DOMs a parent and its child score identically;
the strict comparison kept the first candidate in document order — always
the ancestor — so the most specific match could never win. Ties between
unrelated elements keep document order, and anchors that resolved uniquely
before resolve identically now.
