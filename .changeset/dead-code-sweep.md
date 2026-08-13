---
"helldots": patch
---

Dead code found by the library audit is gone: `debugPosition()` (the only `console.log` in the bundle), the unreachable `captureRegion` export, the never-assigned `comment-circle-wrapper` class and its stylesheet block, and the never-read `data-comment-text` attribute markers duplicated the full comment text into. See DECISIONS.md for what was kept and why.
