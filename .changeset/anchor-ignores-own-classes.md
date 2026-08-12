---
"helldots": patch
---

Stop comment anchors from capturing HellDots' own `comment-cursor` class.
That class is on `<body>` only while comment mode is active — exactly when
anchors are created — so a comment anchored on `<body>` was stored as
`body.comment-cursor` and its selector stopped matching as soon as the mode
ended, forcing every reload through the fuzzy fingerprint rescue path.
Anchors now store a plain `body`. Existing comments are unaffected: they keep
resolving through the rescue path as they already did.
