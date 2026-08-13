import { build } from "esbuild";
import { copyFile, mkdir, readFile, rm } from "node:fs/promises";

// esbuild minifies JS but never touches the inside of a template literal, so
// the stylesheet in src/styles.js used to ship to every consumer with its
// full indentation, newlines and CSS comments (~15 KB raw / ~2.5 KB gzip).
// This plugin minifies the CSS inside that file's template literals at build
// time, leaving ${...} expressions (and the runtime/playground/tests, which
// load the unbuilt source) untouched.
//
// The transform is deliberately conservative: strip CSS comments, collapse
// whitespace runs, and remove spaces around structural punctuation — never
// before a ":" (`.a :hover` and `.a:hover` are different selectors).
const minifyCssChunk = (css) =>
  css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/ ?([{};,>]) ?/g, "$1")
    .replace(/: /g, ":");

// Walks JS source, minifying only the CSS text between backticks. Handles
// ${...} expressions, including nested template literals (styles.js builds
// part of the sheet with a .map() over selectors).
const minifyTemplateCss = (source) => {
  let out = "";
  let i = 0;

  const copyExpression = () => {
    // At "${": copy verbatim until the matching "}", recursing into any
    // nested template literal.
    out += source.slice(i, i + 2);
    i += 2;
    let depth = 1;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (ch === "`") {
        copyTemplate();
        continue;
      }
      if (ch === "{") depth++;
      if (ch === "}") depth--;
      out += ch;
      i++;
    }
  };

  const copyTemplate = () => {
    out += source[i]; // opening backtick
    i++;
    let chunk = "";
    while (i < source.length) {
      if (source[i] === "\\") {
        chunk += source.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (source[i] === "`") {
        out += minifyCssChunk(chunk) + "`";
        i++;
        return;
      }
      if (source[i] === "$" && source[i + 1] === "{") {
        out += minifyCssChunk(chunk);
        chunk = "";
        copyExpression();
        continue;
      }
      chunk += source[i];
      i++;
    }
  };

  while (i < source.length) {
    if (source[i] === "`") {
      copyTemplate();
    } else {
      out += source[i];
      i++;
    }
  }
  return out;
};

const minifyStylesTemplates = {
  name: "minify-styles-templates",
  setup(pluginBuild) {
    pluginBuild.onLoad({ filter: /[\\/]src[\\/]styles\.js$/ }, async (args) => {
      const source = await readFile(args.path, "utf8");
      return { contents: minifyTemplateCss(source), loader: "js" };
    });
  },
};

const outdir = new URL("../dist/", import.meta.url);

// nanoid is bundled into both artifacts (see DECISIONS.md), and its own
// sources carry no license header for esbuild to preserve — so the notice
// MIT requires when redistributing has to be added here by hand.
const banner = {
  js: `/*! HellDots — MIT. Bundles nanoid (MIT) © 2017 Andrey Sitnik <andrey@sitnik.es> — https://github.com/ai/nanoid */`,
};

// The UMD artifact additionally bundles modern-screenshot (external in the
// ESM build), whose sources also ship without a license header — same
// reasoning as nanoid, so its MIT notice rides along here too.
const umdBanner = {
  js: `${banner.js}\n/*! Bundles modern-screenshot (MIT) © 2021-present wxm — https://github.com/qq15725/modern-screenshot */`,
};

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
  // Pinned so a future esbuild syntax feature can't silently raise the
  // browser floor (default is esnext); matches tsconfig's ES2022.
  target: "es2022",
  external: ["modern-screenshot"],
  plugins: [minifyStylesTemplates],
  banner,
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
  target: "es2022",
  globalName: "HellDots",
  plugins: [minifyStylesTemplates],
  banner: umdBanner,
  // No CommonJS footer: the package is deliberately ESM-only (see
  // DECISIONS.md). The old `module.exports = HellDots.default` footer
  // implied a require() story the exports map never actually offered — and
  // it only exported the factory, silently dropping CommentOverlay.
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
