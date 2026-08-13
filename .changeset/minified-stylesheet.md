---
"helldots": patch
---

The injected stylesheet ships minified: esbuild never touches template-literal contents, so the sheet used to travel with its full indentation and internal CSS comments (~15 KB raw / ~2.3 KB gzip). A build plugin now strips comments and collapses whitespace inside `styles.js`'s templates — the ESM bundle drops from 31.8 to 29.5 KB gzip. Both builds also pin `target: "es2022"` so a future esbuild default can't silently raise the browser floor.
