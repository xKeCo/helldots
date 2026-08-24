---
"helldots": patch
---

A save that outlives its own comment box no longer lands on a different one.
The guard after the awaits in `_saveCommentNow` asked whether _a_ box was
open rather than whether it was still _the same_ one — a window that a host's
`transformScreenshot` upload stretches to seconds. Dismissing the box, opening
a second comment elsewhere and letting the upload resolve wrote the first
draft onto the second one's anchor and tore the second draft down. The draft
is now snapshotted before the first await and compared by identity.

A reply attachment sent while its upload is still in flight is no longer lost
either. The thumbnail appears as soon as the file is read, holding the data
URL, and the host's string replaces it in place when it lands; a reply sent in
between carries the data URL instead of nothing.
