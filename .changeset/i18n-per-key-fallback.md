---
"helldots": patch
---

i18n hardening: a locale missing individual keys now falls back to English per key instead of rendering literal `undefined`; the hardcoded-string regression test scans every file in `src/` instead of only `components.js`; the `locale` option is typed `string` (unknown codes degrade to English, never break); and the Shift modifier label is localized like Alt and Ctrl always were.
