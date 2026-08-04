# Changelog

## 0.5.0 — 2026-07-29

First published release. Preview: the feature set is substantial and covered
by tests, but the API may still change before 1.0.

**`createCommentOverlay` now always returns the instance.** While the document
was still loading it used to register a `DOMContentLoaded` listener _and_
return the uninvoked initializer, so a caller who invoked it — reasonable,
since the signature said it might be a function — ended up with two overlays,
and the one the listener built had no handle to `cleanup()` with. The
`readyState` branch belongs to `CommentOverlay`'s constructor, which already
had it. Typed with overloads, so `autoInit: false` still yields an initializer
and everyone else gets a `CommentOverlay` without narrowing a union.

**Anchoring.** Comments capture a JSON-serializable anchor at creation — a
best-effort CSS selector, a content fingerprint and relative coordinates — so
they re-attach after the page changes and are marked orphaned rather than
dropped when their element disappears. Public API: `serializeComments()`,
`loadComments()`, and the `onCommentCreated` / `onReplyAdded` / `onAnchorLost`
callbacks.

**Inbox.** A right-side sidebar listing every comment, with a detail view,
thread replies, delete, and a copy button that puts an agent-ready context
block on the clipboard. Optional `persistence: "localStorage"` mode stores
comments across pages; a `user` option sets authorship.

**Lifecycle.** Every comment carries a status — open, in progress or resolved —
shown as a coloured dot and changeable from a picker in both the inbox and the
thread popover. Resolved comments lose their on-page marker and sink to the
bottom of the list. `setCommentStatus()` plus an `onCommentStatusChanged`
callback.

**Automatic capture (RF1, RF2).** Every new comment records a viewport
screenshot (JPEG at half scale) and an environment snapshot: URL, viewport,
screen resolution, device pixel ratio, user agent, browser, OS and language.
The widget hides itself during the render, so its own toolbar never lands
inside the image. Opt out with `autoScreenshot: false`.

**Classification (RF3, RF4).** Comments can carry a type (bug, suggestion,
question, improvement), a priority (high, medium, low) and free-form tags. All
optional and neutral by default, settable while writing the comment or later
from the actions bar. The inbox filters on all of them. New `setCommentType()`,
`setCommentPriority()` and `setCommentTags()`, plus one `onCommentUpdated`
callback.

**Resolution time (RF5).** Resolved comments show how long they took, measured
from creation. Reopening clears it.

**Screenshot engine.** Drag-to-capture is correct on scrolled pages — the
previous engine double-counted the window scroll, so captures taken further
down showed content from higher up. Moved to `modern-screenshot` and HellDots
now owns the crop.

**Storage resilience.** When localStorage fills, the oldest automatic
screenshots are shed and the write retried, so comments survive. Screenshots a
user deliberately attached are never discarded.

**Foundations.** Shadow DOM isolation, English and Spanish locales, and
TypeScript definitions shipped with the package.

### Development notes

- **fix(shadow-dom)**: the custom comment-mode cursor stopped applying once
  the UI moved into a shadow root. The `comment-cursor` class is still set on
  `document.body` (outside the shadow root), but its CSS rule lived inside the
  `<style>` injected into the shadow root — which never reaches the host.
  `getGlobalStyles()` was added to `src/styles.js` for the few rules that must
  apply to the host page (today, only this one), injected into a separate
  `<style id="comment-overlay-global-styles">` in `document.head`
  (`CommentOverlay.injectStyles`/`cleanup`), apart from the widget's
  encapsulated stylesheet. Verified against `dev-v2` with Playwright:
  `getComputedStyle(document.body).cursor` now matches.
  On top of that, at the user's explicit request, the rule now also forces the
  cursor over **every** descendant of the host (`.comment-cursor,
.comment-cursor *`) — previously (even in `dev-v2`) links and buttons on the
  host page kept their own `cursor: pointer`, because a value inherited from
  `body` does not win against an explicit rule on the descendant. With
  `!important` plus the `*` selector, the comment icon now shows regardless of
  which host element the mouse is over. The selector does not cross the shadow
  boundary, so the widget's own controls (toolbar, buttons) keep their normal
  cursor.
- **revert(a11y)**: by explicit user decision, the four `:focus-visible` rings
  added during the accessibility pass (toolbar, comment input, reply input,
  comment circle) were removed to restore the exact visual appearance from
  before that work — verified pixel by pixel against `dev-v2`. The rest of the
  accessibility work (ARIA roles, `aria-label`, keyboard activation of the
  circles, placeholder contrast) is untouched. See `DECISIONS.md` for the
  accessibility trade-off this reintroduces.

- **feat(shadow-dom)**: HellDots now mounts inside a `<helldots-root>` custom
  element with an open shadow root (`src/root-element.js`). The entire UI
  (toolbar, comment box, tooltips, popovers, lightbox, selection rect) and the
  injected styles (`src/styles.js`) live inside the shadow tree instead of in
  `document.body` / `document.head`. This satisfies RNF07: no widget style
  leaks into the host, or the other way around. Anchoring comments to host
  elements (outside the shadow root) and the configurable keyboard shortcut
  keep working with no public API change. See `DECISIONS.md` for the details.
- **test**: Vitest + jsdom added (`vitest.config.js`, `test/`) with the first
  test suite, focused on regressions in the Shadow DOM encapsulation.
  `npm test` now runs Vitest.
- **build**: an esbuild build pipeline was added (`scripts/build.mjs`).
  `npm run build` produces `dist/helldots.esm.js` (ESM, minified,
  tree-shake friendly, `html2canvas` external) and `dist/helldots.umd.js`
  (self-contained IIFE for a plain `<script>` tag, with `html2canvas`
  bundled). `npm run size` measures the gzip size of `dist/helldots.esm.js`
  and fails if it exceeds the 50 KB budget (RNF01/RNF08) — currently ~10.4 KB
  gzip. `package.json` now points `main`/`module`/`exports` at `dist/`; the
  playground still imports straight from `src/index.js`, with no bundler. See
  `DECISIONS.md` for how `html2canvas` is treated.
- **test**: measurable coverage ≥80% over `src/` (RNF08). `@vitest/coverage-v8`
  was added with thresholds (`lines`/`functions`/`branches`/`statements`)
  configured in `vitest.config.js`; `npm run test:coverage` fails if coverage
  drops below 80%. Suites were added for `index.js`, `components.js`,
  `overlay.js`, `styles.js`, `constants.js` and `root-element.js` (105 tests,
  ~97%/85%/95%/99% stmts/branches/funcs/lines). Writing them found and fixed
  three real bugs:
  - `cleanup()` never removed `handleDocumentClick`'s `mousedown` listener
    from `document`, leaking it (memory/listener leak) every time a
    `CommentOverlay` instance was destroyed.
  - `CLASSES.TOOLBAR`, `CLASSES.COMMENT_BOX` and `CLASSES.SCREENSHOT_PREVIEW`
    were dead constants (never used as a className anywhere, and two of them
    collided in value with their identically named `IDS` entries) — removed.
  - The `:scope > .screenshots-container` selector in `showThreadPopover` is
    not reliably resolvable across jsdom-based testing environments; it was
    replaced by an explicit search over `popover.children`, with the same
    behavior in real browsers but verifiable in CI.
- **lint/format**: ESLint added (flat config, `eslint.config.js`) with the
  recommended `@eslint/js` + `eslint-config-prettier`, plus Prettier
  (`.prettierrc.json`). `npm run lint` runs clean over `src/`, `test/` and
  `scripts/`; `npm run format` / `npm run format:check` format or verify the
  repo (excluding `playground/index.html`, a third-party template that is not
  HellDots' code — see `DECISIONS.md`). An unused `circle` parameter was
  removed from `createMutationObserver`.
- **ci**: `.github/workflows/ci.yml` added, running `npm run lint`,
  `npm test`, `npm run test:coverage`, `npm run build`, `npm run size` and a
  Lighthouse CI audit over a minimal fixture (`playground/lighthouse.html`)
  that fails if Accessibility < 90 (a proxy for RNF09/WCAG 2.1 AA).
  `.github/workflows/release.yml` was added too (documented, not actually
  publishing — it needs an `NPM_TOKEN` secret that is not configured).
  Writing the accessibility gate found a real bug: the toolbar buttons
  (Comment/Inbox) and other icon-only buttons (attach image, send, close,
  remove screenshot) had no accessible name (`aria-label`) — fixed in
  `src/components.js`/`src/overlay.js`, along with `alt` on the screenshot
  images. See `DECISIONS.md` for why a dedicated fixture is audited instead of
  `playground/index.html`.
- **typecheck**: `tsconfig.json` added (`checkJs`, no emit) plus
  `npm run typecheck` (`tsc --noEmit`), wired as a gate in
  `ci.yml`/`release.yml`. `src/index.js` was annotated with JSDoc referencing
  the types in `src/index.d.ts`, and ~20 real type errors were fixed in
  `src/overlay.js`/`src/components.js` (DOM elements without narrowing —
  `HTMLInputElement`, `HTMLTextAreaElement`, `HTMLImageElement`, and so on)
  through targeted JSDoc annotations, with no behavior change.
  `typecheck/consistency-check.ts` was added (outside `src/`, not published)
  so the check really does contrast `index.d.ts` against the implementation —
  see `DECISIONS.md` for the TypeScript problem this works around.
- **versioning**: [changesets](https://github.com/changesets/changesets) added
  (`.changeset/`, `npm run changeset`, `npm run release`) for semantic
  versioning and an npm-release `CHANGELOG.md` automated from the accumulated
  changesets. Documented in `CONTRIBUTING.md`, along with the Conventional
  Commits convention the repo history already followed. Manually verified: a
  test changeset (`minor`) makes `npm run release` bump `1.0.0 → 1.1.0` and
  prepend the matching entry to `CHANGELOG.md`; reverted after confirming.
- **accessibility (WCAG 2.1 AA)**: comment markers (circles) are now
  keyboard-reachable (`role="button"`, `tabindex="0"`, `aria-label` carrying
  the comment text, `Enter`/`Space` activating them like a click). The close
  buttons (`×`) went from `<span>` to real `<button>` elements with
  `aria-label="Close"`. The toolbar's "Comment" button exposes `aria-pressed`
  reflecting whether comment mode is active. The comment box / tooltip /
  popover containers carry `role="dialog"` and `aria-label`; text inputs have
  `aria-label`. Visible focus rings (`:focus-visible`) were added on buttons,
  inputs and circles where `outline` had been removed with no replacement. The
  single below-threshold color contrast was fixed (placeholder text
  `rgba(255,255,255,0.4)` → `0.5`, from 3.79:1 to 5.16:1). Verified with
  Lighthouse (fixture: 100/100 Accessibility, above the ≥95 target) and with a
  fully keyboard-driven walkthrough in a real browser via Playwright —
  documented in `TESTING.md`. Placing a **new** comment still requires
  pointing at a spot on the page with the mouse (inherent to anchoring
  comments to arbitrary locations, same as Vercel Toolbar/Userback/Marker.io);
  everything else is fully keyboard-operable.
- **i18n**: minimal internationalization added. Every user-visible string in
  `src/components.js` was extracted into `src/locales/en.js` /
  `src/locales/es.js` (not `.json` — see `DECISIONS.md`). A new
  `locale: "en" | "es"` option on `createCommentOverlay(...)`, with automatic
  detection from `navigator.language` as the default (`src/i18n.js`). Month
  names in the full-date tooltip (`data-full-date`) use
  `Intl.DateTimeFormat(locale, ...)` instead of a hand-written English month
  table, localizing for free to any browser locale, not just `en`/`es`.
  Verified: zero hardcoded strings in `src/components.js` (a regression test
  running a regex over the source file), and a `locale: "es"` switch visible
  end to end (toolbar, comment box, thread popover, reply) both in Vitest and
  in a real browser via Playwright.
