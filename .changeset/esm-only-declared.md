---
"helldots": patch
---

The package is now explicitly ESM-only, and the UMD build dropped its misleading CommonJS footer: `module.exports = HellDots.default` implied a `require()` story the exports map never offered, and it exported only the factory, silently losing `CommentOverlay`. Plain `<script>` usage keeps the `HellDots` global via the CDN build; `require("helldots")` was already unsupported and now the docs say so.
