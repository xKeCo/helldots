import { build } from "esbuild";
import { copyFile, mkdir, rm } from "node:fs/promises";

const outdir = new URL("../dist/", import.meta.url);

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

// ESM bundle: the package's primary, tree-shakeable entry point.
// modern-screenshot is left external so it doesn't blow the size budget —
// apps importing this bundle resolve it from their own node_modules/bundler.
await build({
  entryPoints: ["src/index.js"],
  outfile: "dist/helldots.esm.js",
  bundle: true,
  minify: true,
  sourcemap: true,
  format: "esm",
  platform: "browser",
  external: ["modern-screenshot"],
});

// UMD/IIFE bundle for plain <script> usage with no module system or
// bundler available. modern-screenshot IS bundled here so the file is fully
// self-contained; it is intentionally excluded from the size budget
// (see DECISIONS.md) since it targets quick demos, not production apps.
await build({
  entryPoints: ["src/index.js"],
  outfile: "dist/helldots.umd.js",
  bundle: true,
  minify: true,
  // No sourcemap: this artifact targets <script>-tag demos, and its map was
  // 40% of the published tarball for something nobody step-debugs. The ESM
  // bundle — what production apps actually load — keeps its map.
  sourcemap: false,
  format: "iife",
  platform: "browser",
  globalName: "HellDots",
  footer: {
    js: "if (typeof module !== 'undefined' && module.exports) { module.exports = HellDots.default; }",
  },
});

// The published tarball ships dist/ only — src/ stays out of it, since the
// sourcemaps already embed every source file. So the hand-maintained type
// declarations have to travel to where `exports.types` points.
await copyFile(
  new URL("../src/index.d.ts", import.meta.url),
  new URL("index.d.ts", outdir)
);

console.log(
  "Build complete: dist/helldots.esm.js, dist/helldots.umd.js, dist/index.d.ts"
);
