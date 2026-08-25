---
"helldots": minor
---

Declare `modern-screenshot` as a peer dependency instead of a direct one.

The ESM bundle already treated the renderer as external, but package size
scanners (Bundlephobia, bundlejs) resolve bare imports from `dependencies`,
so the published package measured 51.6–54 KB gzip against a 50 KB budget the
bundle itself meets at 44.7 KB. Both scanners attribute peer dependencies to
their own package, so the public measurement now matches the gate.

npm 7+, pnpm 8+ and bun install missing peer dependencies automatically, so
`npm install helldots` is unchanged. Yarn users must add
`modern-screenshot` alongside.
