# Design decisions

Why HellDots is built the way it is. Each entry records a choice where more
than one option was defensible, along with the reasoning and — where it
applies — the limitation the choice accepts.

This is a living log: when a decision is made that the code cannot explain on
its own, it belongs here. Entries are append-only in spirit; when a decision
is reversed, the new entry says so rather than the old one being deleted.

The early sections come from the initial hardening pass (shadow DOM, build,
testing, CI, typecheck, versioning, accessibility, i18n); later ones are
grouped by feature.

## Shadow DOM

- **Custom element vs. `attachShadow` on a bare `<div>`**: we went with a
  custom element `<helldots-root>` (`src/root-element.js`) registered through
  `customElements.define`, rather than calling `attachShadow` directly on a
  `<div>` (which the spec also allows). A custom element makes the intent
  explicit in the host's DOM and makes debugging easier
  (`document.querySelector('helldots-root')`).
- **Singleton mount**: `getShadowRoot()` reuses the existing host if one is
  already mounted, instead of creating a new one per `CommentOverlay`
  instance. If multiple independent overlays on the same page ever need to be
  supported, this has to be revisited.
- **Style isolation**: a `:host { all: initial; ... }` rule was added at the
  top of the injected stylesheet (`src/styles.js`) to cancel any inheritable
  property the host page might leak into the shadow tree (for example an
  aggressive `* { all: unset !important; }` reset). The host's CSS rules
  cannot select nodes inside the shadow tree — selectors do not cross the
  shadow boundary — but they can leak _inherited values_ (color, font-family,
  and so on) into the host element. `:host { all: initial }` cuts that
  inheritance off.
- **Event retargeting**: the global listeners on `document` (outside click to
  close the comment box / thread popover) used `e.target`, which retargets to
  the shadow host when the listener lives outside the shadow tree. They were
  changed to `e.composedPath()[0]` to recover the real node inside the shadow
  tree before calling `.contains()` / `.closest()`.
- **Comment anchoring**: the anchor container (`comment.container`) is still
  always an element in the light (host) DOM, never a node in the shadow tree —
  that did not change. Only the visual circles, positioned with
  `position: fixed`/`absolute` in viewport coordinates, live inside the shadow
  root.

## Build pipeline

- **esbuild over Rollup/Webpack**: esbuild was chosen for configuration
  simplicity — a single `scripts/build.mjs` using the Node API, with no
  separate config file — and for speed. The project has no complex bundling
  needs (no code-splitting across multiple entries, no framework plugins) that
  would justify Rollup.
- **`html2canvas` external in the ESM bundle**: measured at ~45 KB gzip
  (`html2canvas.min.js` on its own), bundling it would leave almost no room in
  the 50 KB budget. It is marked `external: ["html2canvas"]` in the ESM build
  (`dist/helldots.esm.js`, the artifact `npm run size` measures) and kept as a
  regular `dependency` in `package.json` — any consumer bundler (Vite, webpack,
  esbuild) resolves it like any other transitive npm dependency. Verified by
  importing the bundle from a scratch Vite project: it resolves and compiles
  without errors.
- **`dist/helldots.umd.js` (IIFE) DOES bundle `html2canvas`**: it is a
  convenience artifact for a plain `<script>` tag with no bundler or module
  resolution available, so it has to be self-contained. That is why it sits
  **outside** the 50 KB budget `npm run size` enforces — that gate audits only
  the package's real entry point (`dist/helldots.esm.js`), which is what the
  overwhelming majority of real consumers import.
- **The playground does not use `dist/`**: it still imports `../src/index.js`
  directly through native ES Modules (with `html2canvas` resolved by import
  map from a CDN), exactly as it did before the build pipeline existed.
  `dist/` is only produced to publish the package and is never committed (it
  was already in `.gitignore`).

## Testing and coverage

- **Vitest + jsdom**: the natural choice given that the project runs entirely
  on ESM with no transpiler (Vitest supports native ESM) and that `jsdom` is
  required to test Shadow DOM manipulation, `MutationObserver`, and so on.
  `happy-dom` was considered, but `jsdom` has better Shadow DOM support in
  practice (with caveats — see below).
- **`createOverlay` in tests builds `new CommentOverlay(options)` directly,
  without a separate `.initOverlay()` call**: `CommentOverlay`'s constructor
  already calls `initOverlay()` synchronously unless `document.readyState` is
  `"loading"` (it isn't, in jsdom). `autoInit` is a concept only the
  `createCommentOverlay()` factory in `index.js` consumes, not the class
  itself — passing it straight to `new CommentOverlay()` has no effect. An
  early version of the tests called `.initOverlay()` a second time "just in
  case", which registered every document listener twice and caused listener
  leaks detectable across tests (see the `cleanup()` bug below). Already fixed
  in `test/overlay.test.js` and `test/shadow-dom.test.js`.
- **A real jsdom limitation with `:scope` inside a shadow root**: while
  writing tests for `showThreadPopover`, we found that
  `element.querySelector(':scope > .class')` returns `null` when `element`
  lives inside a shadow root in jsdom (nwsapi does not resolve `:scope`
  correctly there), even though the combination is valid and works in every
  real browser. We chose to **drop the dependency on `:scope`** in
  `src/overlay.js` — replaced by a search over `popover.children` — rather
  than leave that path uncovered. Same observable behavior, now verifiable in
  CI with the testing stack chosen for the whole project.

## Linting and formatting

- **ESLint flat config + `eslint-config-prettier`**: the flat config
  (`eslint.config.js`) is used instead of the legacy `.eslintrc` format, since
  it is the recommended format for new ESM projects. `eslint-config-prettier`
  turns off the ESLint style rules that would fight Prettier, avoiding
  conflicts between the two tools.
- **`playground/index.html` excluded from Prettier**: it is a third-party HTML
  template ("Dev Space" by Lapa Ninja) used only as a visual development
  fixture, not HellDots' own code. Reformatting it produced a huge, irrelevant
  diff, so it was excluded through `.prettierignore` instead.
- **`no-empty: { allowEmptyCatch: true }`**: the empty `catch {}` blocks in
  the `ResizeObserver`/`MutationObserver` cleanup (`src/overlay.js`) are
  intentional — they swallow `disconnect()` errors on already-disconnected
  observers. The exception is allowed through ESLint configuration rather than
  by adding comments or superfluous logic just to silence the rule.

## CI/CD

- **GitHub Actions, a single `ci.yml` workflow**: it runs on every push/PR and
  chains lint → test → coverage → build → size → Lighthouse, in that order, so
  the cheapest gates fail first.
- **A dedicated Lighthouse fixture (`playground/lighthouse.html`) instead of
  auditing `playground/index.html`**: the `playground/index.html` demo is a
  third-party template ("Dev Space" by Lapa Ninja) with pre-existing
  accessibility problems that have nothing to do with HellDots
  (`color-contrast`, `heading-order`, `link-name` in the template's own
  markup) — measured locally with `@lhci/cli` at 0.82 Accessibility, below the
  required threshold. Auditing that page would make the CI gate fail for
  reasons HellDots neither controls nor can fix (third-party code is not
  reformatted — see the linting section). A minimal, semantically clean
  fixture was created that mounts the widget on our own page, so the
  Lighthouse gate audits exclusively the UI HellDots controls. With the
  fixture: Accessibility 1.0, after fixing the bug below.
- **A real bug found by the accessibility gate**: the icon-only toolbar
  buttons (Comment/Inbox) had no accessible name, failing the `button-name`
  audit even on the clean fixture. `aria-label` was added to those and to the
  widget's other icon-only buttons (attach image, send reply, close
  tooltip/lightbox, remove screenshot), plus `alt` on the screenshot images.
- **No Performance regression comparison against the previous run**: failing
  when Performance regresses beyond a threshold relative to the previous run
  requires persistent storage between runs (an LHCI server with a database, or
  a service keeping history). That was considered out of scope for this
  initial gate — instead an absolute minimum threshold applies (`warn` from
  0.5) that does not block the merge but leaves a record in the log.
  Documented here as a known limitation, not as a fully met criterion.
- **`release.yml` was documented before it was functional**: it publishes to
  npm on `v*` tags but depends on an `NPM_TOKEN` secret, which was
  deliberately not created when the workflow was written — the flow was meant
  to be documented without real credentials, so until then the workflow would
  have failed at the publish step. **Resolved on 2026-07-30**: the secret was
  configured and `v0.3.0` published through it. The workflow is now live, and
  a `v*` tag publishes for real.
- **A tag is the only thing that publishes**: `release.yml` triggers on
  `push: tags: v*` and nothing else, so pushing or merging to any branch —
  `main` included — never touches npm. The other route to the registry is a
  manual `npm publish`, which `prepublishOnly` gates behind `npm run verify`.

## Typecheck

- **`checkJs` instead of migrating to TypeScript**: validate consistency
  without migrating. `tsconfig.json` sets `allowJs`, `checkJs` and `noEmit`,
  with no `declaration`.
- **A real TypeScript gotcha discovered while building the gate**: when a
  `foo.d.ts` sits next to a `foo.js` (our case: `src/index.d.ts` next to
  `src/index.js`), TypeScript stops re-deriving and checking the `.js` body
  and treats the `.d.ts` as the single source of truth for that module. An
  early `npm run typecheck` "passed" even with `index.d.ts` deliberately
  broken (verified by adding a method that does not exist in the real
  implementation and by changing the type of `commentMode`): `src/index.js`
  was simply never being analyzed. Confirmed with `tsc --listFiles`, which did
  not list `src/index.js` in the compiled program.
- **A dedicated consistency file (`typecheck/consistency-check.ts`), outside
  `src/`**: it imports the real implementation (`src/overlay.js`, which does
  keep its inferred type since it has no sibling `.d.ts`) and the declared
  types (`src/index.d.ts`), and assigns them to each other — if they diverge,
  this file stops compiling. Deliberately verified: breaking
  `commentMode: boolean` into `string`, or adding a nonexistent method, makes
  `npm run typecheck` fail (exit code 2) pointing exactly at the mismatch;
  reverting the change makes it pass again (exit 0).
- **An extra trap in the file name**: a first attempt was called
  `src/index.d.consistency.ts`. TypeScript classified it as an ambient
  declaration file too — any name containing the `.d.` infix triggers that
  heuristic, not just the exact `.d.ts` suffix — so the type assertions inside
  it were not being checked either, the same symptom as the bug above.
  Renamed to `typecheck/consistency-check.ts` (no `.d.` in the name) to avoid
  it.
- **`src/index.js` carries JSDoc referencing `import('./index.d.ts').X`
  directly**: this makes the implementation declare its contract against the
  `.d.ts` explicitly, instead of letting `checkJs` try to infer types for
  unannotated JS parameters — which would have landed on `any` in most cases
  and given no useful signal.

## Versioning

- **changesets over `standard-version`**: changesets fits a per-PR flow better
  (each change adds its own changeset file, without depending on the merge
  commit message carrying the right prefix) and handles a single published
  package with `access: "public"`, which is our case.
- **The root `CHANGELOG.md` vs. the one changesets generates**: two documents
  with different purposes, not a conflict — see `CONTRIBUTING.md`. The root
  one narrates architectural decisions made while building the library; the
  changesets one (prepended to the same file from the first real release
  onward) documents published npm versions. Once the first release is cut,
  both coexist in the same file, with the version entries on top.

## Accessibility

- **Comment markers are `<div role="button">` rather than `<button>`**: the
  circle needs a custom shape (asymmetric border-radius) and absolute
  positioning that a real `<button>` would complicate slightly through its
  base styles. Instead of fighting the reset, the standard pattern was used:
  `role="button"` + `tabindex="0"` + explicit `keydown` handling for
  `Enter`/`Space`, which the ARIA Authoring Practices guide documents as
  valid.
- **`role="dialog"` without `aria-modal="true"` on popover/tooltip/comment
  box**: no real focus trap was implemented (it would require intercepting
  `Tab`/`Shift+Tab` to cycle focus inside the dialog) — out of scope for that
  pass. `aria-modal` without a real trap would mislead assistive technology,
  so it was deliberately omitted rather than declaring a guarantee that is not
  met.
- **Placing a new comment still requires a mouse**: this is inherent to the
  feature (anchoring to an arbitrary position on the host page), not an
  omission — the same trade-off Vercel Toolbar, Userback, BugHerd and
  Marker.io make. Everything else (activating an existing marker, replying,
  closing tooltips/popovers/lightbox, leaving comment mode) is fully
  keyboard-operable, verified in `TESTING.md`.
- **The Lighthouse fixture has no interactive scenario**: the CI accessibility
  audit (`playground/lighthouse.html`) only audits the page's initial state
  (toolbar visible, nothing else mounted) because Lighthouse does not simulate
  user interaction. The keyboard walkthrough that exercises
  popover/tooltip/comment box was verified manually through Playwright and
  documented in `TESTING.md`, not through the automated CI gate.

## i18n

- **`src/locales/en.js` / `es.js` instead of `.json`**: importing JSON through
  native ES Modules in the browser requires the
  `import x from './y.json' with { type: 'json' }` syntax, whose cross-browser
  support is more recent and uneven than a plain JS module import — and the
  playground loads `src/index.js` without a bundler, straight in the browser.
  A `.js` module with `export default {...}` is functionally identical to a
  `.json` for this purpose, works the same in Vitest/esbuild/browser with no
  conditionals, and sidesteps that compatibility risk entirely.
- **Month names through `Intl.DateTimeFormat` instead of a hand-translated
  `MONTHS` table**: simpler, more correct (it uses the runtime's real
  localization data instead of a homegrown translation that would only cover
  `en`/`es`), and it removes an entire category of hardcoded strings with
  nothing left to maintain.
- **i18n coverage limited to `en`/`es`**: `detectLocale()` falls back to `en`
  for any unsupported browser language (it neither throws nor leaves empty
  strings), so adding more locales later is purely additive: a new file in
  `src/locales/` and an entry in the map in `i18n.js`, without touching
  `components.js`/`overlay.js`.
- **A known limitation, not introduced here**: `getShadowRoot()` reuses a
  single `<helldots-root>` host per page (see the Shadow DOM section). If a
  page mounts two `CommentOverlay` instances with different locales, both
  share the same shadow root and whoever mounted their toolbar first "wins" —
  not something this work introduces or tries to solve (the real use case is a
  single instance per page).

## Serializable comment anchoring

- **No XPath, despite the original requirement saying "CSS/XPath selector"**:
  agreed explicitly with the user ("this requirement can be modified, I just
  want the best format"). A structural XPath is strictly more fragile than the
  chosen combination (cascading CSS selector + content fingerprint with
  scoring) and adds nothing the CSS selector does not already cover. Full
  design in `docs/superpowers/specs/2026-07-02-comment-anchoring-design.md`.
- **Mandatory fingerprint verification**: a `querySelector` match is never
  accepted blindly — it is scored against the fingerprint (text 0.5 /
  attributes 0.3 / position among siblings 0.2, with weights redistributed
  when a signal is missing). Threshold 0.6 via selector, 0.7 via rescue search
  (with no structural signal, more confidence is demanded). "Anonymous"
  elements (no text, no attributes) resolve only via selector; the rescue is
  skipped because any tag-wide match would be a guess.
- **Screenshots excluded from v1 serialization**: they are data URLs hundreds
  of KB in size, and `SerializedComment` has to be cheap to persist. The host
  app can store them separately keyed by the comment's `id`.
- **Persistence delegated to the host app**: HellDots exposes
  `serializeComments()` / `loadComments()` and callbacks
  (`onCommentCreated`, `onReplyAdded`, `onAnchorLost`); it ships neither
  `localStorage` nor a backend of its own — the unopinionated-library pattern,
  decided during the brainstorm.
- **A real bug found by the JSON round-trip test**: a container with zero size
  (`display: none`, no layout yet) produced `relativeX/Y = Infinity` (division
  by zero), which is not even JSON-serializable (`JSON.stringify` turns it
  into `null`). A guard was added in `_placeCommentAtPoint` that collapses to
  0 in that case.
- **Minimal inbox**: the toolbar button was a stub; it now opens a panel
  listing every comment and flagging orphans with a localized badge
  ("Unanchored"/"Desanclado"). Clicking an orphan opens its thread popover
  centered in the viewport (`showThreadPopover` accepts `circle = null`),
  because an unanchored comment has no valid position on the page — it is
  never positioned "best effort" over the wrong content.

## Inbox sidebar, localStorage persistence and hidden state

- **Amendment to v1 serialization**: `SerializedComment` now DOES include
  `screenshots` (and `replies[].screenshots`). The `localStorage` mode and the
  inbox cards need them, and maintaining two serialization formats (with and
  without screenshots) cost more than it saved. `page`
  (`location.pathname` at creation time) was also added, for the per-page
  filter.
- **`anchorState: "inactive"` for comments from other pages**: on restore, a
  comment whose `page` does not match the current pathname is not "broken" —
  its element simply does not exist here. Its anchor is not resolved, no
  circle is rendered and `onAnchorLost` does not fire (avoiding false alarms);
  it only shows up under the inbox's "All" filter, tagged with its pathname.
- **`hidden` is runtime state, not serialized**: it depends on the viewport at
  that moment (media queries). It is detected from a zero-sized container in
  `updateCommentPosition` — the "invalid dimensions" `console.warn` was
  removed because zero size stopped being an anomaly: it is the normal state
  of a responsively `display: none` element (the `slogan-img` case).
- **The "copy" button generates agent context** rather than copying the text:
  a user decision inspired by Vercel Toolbar. The template
  (`src/agent-context.js`) includes page/viewport/state/selector/element/DOM
  path/nearby text/thread — with no framework component tree, since HellDots
  is framework-agnostic and the real DOM is what it can offer.
- **`InboxView` as a pure view** (`src/inbox.js`): every mutation (reply,
  delete) goes back to the overlay through callbacks; the sidebar never
  touches storage or the markers directly. The bottom-center panel from the
  previous iteration was removed entirely.
- **The playground modal uses `class="modal-content"`** deliberately: the
  anchor-container selector
  (`section, div[class*="container"], div[class*="content"]`) has to match the
  dialog so comments anchor to the modal and not to `document.body` — if they
  anchored to body, closing the modal would not hide the marker.

## Migration from html2canvas to modern-screenshot

- **The real bug that motivated the change**: on a scrolled page, drag capture
  returned content shifted upward by exactly `window.scrollY` px (the hero
  appeared when capturing lower sections). Reproduced and isolated with
  Playwright: html2canvas v1.4.1 defaults `scrollX/scrollY` to
  `window.pageXOffset/pageYOffset` and offsets the clone's render, while our
  crop already added the scroll to `x/y` → double counting (html2canvas issues
  #1878/#2333). Verified empirically: `scrollX: 0, scrollY: 0` produced the
  correct crop.
- **Migrating rather than just fixing** (user decision): html2canvas has been
  unmaintained since 2022 and does not support modern CSS (`oklch`/`lab` color
  functions, used by Tailwind v4 among others — it would break capture on
  modern pages). `modern-screenshot` (a maintained fork of html-to-image,
  ~10 KB gzip vs ~45 KB) uses SVG foreignObject with better fidelity.
- **The crop is now ours** (`src/capture.js`): the full page is rendered once
  (`domToCanvas`, `scale: 1` = CSS pixels) and the crop is done with
  `drawImage` in page coordinates (`viewport + scroll`). By not delegating the
  crop to the library, the double-scroll class of bug is eliminated by design,
  and swapping render engines later does not touch the coordinate logic.
- **Same dependency treatment**: external in the ESM bundle (inside the 50 KB
  budget), bundled into the self-contained UMD; the playground's import maps
  point at esm.sh/modern-screenshot@4.7.0.
- **Effective page background, not a fixed white**: DOM-based renders produce
  a transparent PNG when `<html>`/`<body>` paint no background (the white you
  see on screen is painted by the browser, outside the DOM) — the capture came
  out invisible against the inbox's dark UI. `backgroundColor` is now passed
  to `domToCanvas`, resolving the computed color of html → body → `#ffffff` as
  a fallback (mirroring what the user sees: dark pages come out dark, pages
  with no background come out white). Verified by measuring the alpha of the
  captured PNG's pixels on `/about` before (0) and after (255).

## Visual parity fix after Shadow DOM

- **A real bug: comment-mode cursor broken by the shadow root**: when styles
  were encapsulated, the `.comment-cursor` rule — which has to apply to
  `document.body`, a host element the widget does not control — got trapped
  inside the shadow root's `<style>`. A shadow root does not let its styles
  escape into the document, by design, so the rule stopped having any effect.
  It was split into `getGlobalStyles()`, injected in a second `<style>` in
  `document.head`. It is the first (and so far only) rule that needs this
  treatment; if more cases appear, add them to `getGlobalStyles()` rather than
  duplicating the mechanism.
- **`.comment-cursor *` instead of just `.comment-cursor`**: the original ask
  was "restore the cursor", but checking against `dev-v2` confirmed that not
  even the original version forced the cursor over elements with their own
  explicit `cursor` (links, template buttons) — CSS `cursor` inheritance
  cannot beat an explicit declaration on the element itself, Shadow DOM or
  not. The user explicitly asked for the icon to appear "wherever I move the
  cursor", so the descendant selector `*` was added along with `!important` to
  force it across the whole host while comment mode is active. It does not
  cross the shadow boundary (CSS selectors cannot), so the widget's own
  controls (toolbar, comment box buttons) keep their normal cursor — only the
  host page is affected, which is the intent.
- **Deliberate reversal of the four `:focus-visible` rules**: the user tested
  the branch against `dev-v2` (the pre-Shadow-DOM state) and explicitly asked
  to restore the exact previous look, including losing the visible focus ring
  that had been added for accessibility (WCAG 2.1 AA, criterion 2.4.7 Focus
  Visible). This is a conscious product decision, not an oversight, and is
  documented here to make clear that **it reintroduces a known accessibility
  gap** — the widget's interactive elements (toolbar, inputs, circles) once
  again show no focus indicator under keyboard navigation, exactly as in
  `dev-v2`. If that criterion has to be met again in the future, review the
  accessibility work's history and this reversal commit.

## Automatic context, classification and resolution time

- **`contextScreenshot` in a field separate from `screenshots[]`**: the two
  have different semantics. `screenshots[]` is evidence the user attached on
  purpose; `contextScreenshot` is collected by the library on its own.
  Separating them allows displaying them differently, purging only the
  automatic one if the localStorage quota is ever hit, and prevents the user
  from accidentally deleting something they did not add.
- **JPEG q0.7 at 0.5 scale for the automatic capture**: a full-scale viewport
  PNG weighs 300 KB–1.5 MB as a data URL and blows through the ~5 MB
  localStorage quota after three or four comments (all persistence lives under
  a single key). At half scale it is ~40–120 KB. Manual drag stays PNG at
  scale 1: when the user deliberately selects a region, fidelity matters.
- **`renderPage` / `cropRegion` / `cropViewport` instead of a single
  `captureRegion`**: rendering the page is practically the entire cost of a
  capture. With the drag flow already rendering once, an independent
  auto-capture would have made every dragged comment pay that cost twice. The
  shared canvas avoids it. `captureRegion` is kept as an export for
  compatibility.
- **The capture is awaited before showing the comment box**: the host has to
  be hidden during the render, so showing the box in parallel would be a race
  that would put it halfway into the capture itself. The non-drag path renders
  at `scale: 0.5` (~4× cheaper) to bound the latency, and
  `autoScreenshot: false` removes it entirely.
- **`withHiddenOverlay` hides the whole `<helldots-root>` host, not just
  `this.overlay`**: the previous drag flow only hid the overlay, so the
  HellDots toolbar ended up inside manual screenshots. A pre-existing bug,
  fixed along the way by sharing the helper.
- **`captureContext()` uses `navigator.userAgentData` with a regex fallback**:
  Chromium exposes brands and platform already structured; Safari and Firefox
  require parsing the UA. The table's order is load-bearing (Edge's UA
  contains "Chrome", Chrome's contains "Safari"). The raw UA is always stored,
  so a failed parse degrades to `unknown` without losing information.
- **Types as a fixed enum + free-form `tags: string[]`, rather than
  host-configurable types**: tags cover customization without the library
  having to translate or color labels it does not know about.
- **Priority reuses `bug`'s red and `in_progress`'s orange**: deliberate. The
  red/orange/gray ramp reads as an urgency scale immediately, and these are
  different dimensions in different UI slots. No badge communicates its
  meaning through color alone — all of them carry text (WCAG 1.4.1, and the
  Lighthouse a11y gate sits at 0.9).
- **A generic `createPicker` instead of three duplicated pickers**: status,
  type and priority are the same widget with a different dictionary. The
  pre-existing status picker became its first consumer, with no observable
  behavior change.
- **A single `onCommentUpdated` for type/priority/tags**: three separate
  callbacks would have been API noise. `onCommentStatusChanged` is left
  untouched so existing consumers do not break.
- **A single `resolvedAt` instead of a status history**: it is stamped on
  entering `resolved` and cleared on leaving, so the displayed figure always
  corresponds to the current resolution. A full `statusHistory` offered more
  analytical value than the requirement asked for, at the cost of more payload
  per comment. Comments resolved before this change have no timestamp: they
  render as `—`, never as an invented duration.
- **Emoji reactions are out of scope**: `reactions?: Record<string, string[]>`
  (emoji → authors) is reserved. Being optional and absent by default,
  implementing it later requires no migration.
- **`createPicker` gained an `action` parameter.** Pre-existing tests queried
  the status picker by `[data-action="status"]`, an attribute the generic
  picker did not emit. Rather than rewriting those queries, the generic picker
  accepts `action` and puts it on the button — which also makes all three
  pickers (status, type, priority) separately addressable in the DOM. The only
  unavoidable rename was `data-status-option` → `data-picker-option`,
  mechanical and touching no assertion.
- **Two repo guards had their scope wrong and were corrected.** The i18n one
  (`components.js has no hardcoded, user-visible English UI strings`) flagged
  `"Enter"` — a DOM key name, not UI text — as a violation, which pushed the
  code toward `e.key.toLowerCase() !== "enter"`: less idiomatic and able to
  throw when `e.key` is `undefined`. The idiomatic comparison was restored and
  the guard taught to exclude key names through a named, narrow allowlist. The
  constants guard claimed to check code "referenced from `src/`" but only read
  three files, leaving `inbox.js` out; it now scans every `.js` in `src/`. In
  both cases the guard was re-verified afterwards to confirm it still catches
  the real violation, so a false positive was not traded for a false negative.
- **The inbox's collapsed filter button reflects all four filters.** When type
  and priority were added, the label was still composed from page and status
  alone, so an active filter could hide comments with no visible signal.
  `_filterSummaryLabel()` was extracted, and every active filter now shows up
  in the label.

## Overlay dismissal: lightbox and dropdown menus

- **The lightbox is excluded from the inbox's and thread popover's
  outside-click test.** The lightbox is opened _from_ those panels but is
  mounted as their sibling in the shadow root, so the naive "did this click
  land outside me?" check read every click on it — its own close button
  included — as a click away, and tore the panel down behind the image.
  `handleDocumentClick` already had this exclusion; the two panel handlers did
  not. Shared as `_isInsideLightbox()` so the three stay in sync.
- **A single registry (`src/menus.js`) for every dropdown**, rather than each
  one owning its open state. The status, type and priority pickers, the ⋯ menu
  and the inbox filter each toggled independently _and_ called
  `stopPropagation()`, so nothing could close a menu except its own button:
  three menus could sit open on top of each other in the thread popover, and
  clicking elsewhere in the panel closed none of them. The registry enforces
  one rule — at most one menu open, any outside mousedown closes it.
- **The outside listener runs in the capture phase.** It has to: the toggles
  call `stopPropagation()`, so a bubble-phase listener on `document` would
  never hear the click at all.
- **Open state is read from the DOM (`menu.style.display`), not from the
  registry's set.** Callers that hide a menu by hand, and re-renders that
  detach one while it is open, would otherwise leave a stale entry stuck
  "open" and refusing to reopen. A detached menu is never in a click path, so
  the next outside mousedown evicts it and releases the document listener.

## Card density, chip filters and viewport-relative panels

- **The per-comment action strip moved out of the header, onto its own row.**
  Copy, status, type, priority and ⋯ shared the header with the author and the
  timestamp. Inside a 380px inbox panel that left the name roughly 90px, so
  "Kevin Collazos" wrapped onto two lines; in the 400px thread popover it
  truncated mid-name instead. The inbox card grew an `.inbox-card-footer`
  shared with the reply link, and the popover an `.thread-actions-row` under
  its header. Two alternatives were rejected: dropping the type/priority
  labels back to bare dots (undoes the WCAG 1.4.1 reasoning recorded under
  "Automatic context, classification and resolution time" — colour alone
  cannot separate `bug` from `high`, they are the same hex), and folding both
  pickers into the ⋯ menu (two clicks to classify, and classification is the
  most-used action there). The cost accepted is one more row of card height.
- **`.thread-meta` is `flex: 1; min-width: 0` and the author truncates.** The
  `min-width: 0` is the load-bearing half: a flex item's default minimum is
  its content width, so without it the author pushes the row wider instead of
  shrinking, and the ellipsis never engages.
- **The inbox filter is a chip panel, not a list of radio rows.** Four
  dimensions × their values made a tall scrolling menu where the shape of the
  filter was invisible. Chips show every dimension and every option at once in
  300px. Status, type and priority chips toggle — activating the active chip
  clears that group — which is why they carry no explicit "All" option; the
  page group keeps two chips because it has no neutral state. Selection is
  still one value per group: multi-select would turn `filteredComments()` and
  the collapsed label into list handling for a filter set that is already
  small enough to re-pick.
- **`statusFilter` now matches the data model.** It was `all | unresolved |
resolved` while comments carried `open | in_progress | resolved`, so
  `in_progress` was unreachable as a filter and invisible as a distinct state.
  It now takes the `STATUSES` values directly, treating a missing status as
  `open` so pre-RF09 comments still match. `filterUnresolved`,
  `filterResolved` and `filterStatusAll` were dropped from both locales.
- **The tags input was removed; the `tags` field was not.** It was the only
  way to author a tag, it rendered near-black inside the dark comment box, and
  it was the weakest third of the classification strip. Removing the whole
  feature would have broken `setCommentTags()`, the `tags` entry in
  `index.d.ts` and the display of comments that already carry tags — so only
  the authoring affordance went away. `createClassifyRow` no longer exposes
  `getTags()`, and `saveComment` stores an empty array. Re-introducing tag
  authoring is a future decision, not a reversal of this one.
- **The automatic context is a collapsed disclosure in the thread popover.**
  It was reachable only from the inbox detail, which meant leaving the thread
  to read the environment a bug was reported from. `_buildContextBlock` moved
  out of `InboxView` into `src/context-block.js` and takes a `collapsible`
  flag: the inbox detail renders it expanded (that view exists to show
  everything), the popover collapsed (it is a conversation first). The
  rejected alternative — a ⋯ menu item that opens the inbox detail — was
  cheaper but pushes the user out of the thread they are reading.
- **`_buildBadges` became `createBadgeRow` in `components.js`, with an
  opt-in status badge.** The tooltip needed the same strip. Status is opt-in
  rather than always-on because every other surface already exposes it through
  the status picker's coloured dot; the tooltip has no picker, so it is the
  one place the value has to be spelled out — and there it shows even when the
  status is `open`.
- **Panel widths are `min(400px, calc(100vw - 24px))`, and positioning
  measures instead of assuming.** `showCommentBox()` clamped against a
  `boxWidth = 300` constant while the CSS said `400px`, and
  `positionPopoverAtCircle()` hardcoded `400` — which is why both ran off the
  right edge on a phone. Both now read the element's real width and clamp
  against both viewport edges, since on a viewport narrower than the panel
  plus its margins, flipping to the other side of the marker is not enough on
  its own. The inbox panel's full-width media query moved from 420px to 480px:
  380px of panel plus two 16px gutters needs 412px before it can sit flush
  right.

## Thread popover: tracking its marker and scrolling its own body

- **The popover follows its marker on scroll instead of staying put.** It is
  `position: fixed` and was positioned exactly once, in the `setTimeout` that
  opens it. The markers are already recomputed into viewport coordinates on
  every scroll (`scheduleUpdatePositions`), so the popover simply was not
  part of that pass — it stayed nailed to the screen while the comment it
  belonged to slid away. `syncThreadPopoverToMarker()` now runs in the same
  rAF, after the markers move.
- **It runs even when `positionValidationEnabled` is false.** That flag gates
  re-anchoring, not coordinate space: the markers are placed in viewport
  coordinates either way, so a popover that did not follow would drift apart
  from its marker regardless of the flag.
- **Off-screen hides the popover; it does not close it.** The marker leaving
  the viewport is a transient state — scrolling back must restore the thread,
  including a half-typed reply. Closing would also collide with the
  outside-click handler, which is the one thing that should genuinely dismiss
  it. The visibility test is a plain rect intersection with the viewport, so
  a partly-visible marker still keeps its popover.
- **Hiding is `display: none`, and the popover is un-hidden before being
  measured.** `positionPopoverAtCircle()` sizes itself from
  `getBoundingClientRect()`, which reports zeros for a `display: none`
  element; positioning first and revealing after would place it using the
  400px fallback width and a height of zero.
- **A centered popover is left alone.** Orphaned comments opened from the
  inbox have no marker, so there is nothing to track — `_activePopoverCircle`
  is null and the sync is a no-op rather than a fallback re-centering, which
  would fight the user on every scroll.
- **The popover became a flex column with an inner scroll container.** It had
  no `max-height`, so expanding the context block or loading a long thread
  grew it past the viewport with no way to reach the rest: the wheel fell
  through to the page. It is now `max-height: calc(100vh - 20px)` with the
  header, its action row and the reply box pinned (`flex: none`) and
  `.thread-scroll` taking the remainder. The `min-height: 0` on that
  container is load-bearing — a flex item's default minimum is its content
  height, so without it the popover grows past `max-height` instead of
  scrolling, which is the original bug wearing a `max-height`.
- **`overscroll-behavior: contain` on the scroll area.** Reaching the end of
  the thread otherwise chains the wheel to the page and scrolls the comment's
  own marker out from under it.
- **The tooltip got `max-height` and `overflow-y` too, but no inner
  container.** It has nothing to pin — no reply box, no action row — so
  scrolling the whole element is the correct, smaller answer there.

- **The marker toggles its own thread.** Clicking the active marker used to
  run `showThreadPopover()` again, which tore the popover down and rebuilt an
  identical one — visually a no-op, so the marker looked like it could not be
  deselected. It now closes instead. The check is on the popover's own
  `data-for`, not merely "is a popover open", so clicking a _different_ marker
  still switches threads rather than closing. `showThreadPopover()` itself
  stays a plain "show" — the toggle belongs to the click handler, so
  programmatic callers (saving a comment, the inbox handoff) keep opening
  unconditionally. Keyboard activation inherits this for free: the
  Enter/Space handler goes through `circle.click()`.

- **Opening a comment's detail in the inbox marks its marker active too.**
  Selecting a comment is the same act whichever surface it happens on, so the
  inbox reuses `comment-circle--active` rather than inventing a second
  "selected" look. The two never collide: `showInbox()` closes the thread
  popover before rendering, and the inbox's outside-click handler closes the
  panel before a marker click can open one. The existing hover spotlight
  (`helldots-highlight`) is unchanged and still answers a different question —
  "which marker is this card?" versus "which comment am I in?".
- **`_markerFor()` extracted from `_highlight()`.** Both the hover spotlight
  and the active state need the same precondition: resolved, orphaned and
  hidden comments render no circle, so there is nothing to decorate. Having
  that rule in one place is what keeps the active state from being applied to
  a marker the user cannot see — which would strand the class until the next
  render.

## Scrolling to a comment from the inbox

- **Opening a comment's detail scrolls to the marker, not to
  `comment.container`.** The container is the coarse anchor box —
  `section, div[class*=container|content]`, falling back to `<body>` when the
  commented element has no such ancestor — and the inbox centred _it_.
  Centring `<body>` lands halfway down the document: on the playground a
  marker at page 214 sent the viewport to ~620, "some sections further down"
  with no marker in sight. Even for a real container, centring a tall
  `<section>` never guaranteed the marker was on screen. The scroll now
  targets the marker's own point.
- **The marker's position is derived from the anchor, never read off the
  rendered circle.** The circle's coordinates are refreshed inside the
  `requestAnimationFrame` that `scheduleUpdatePositions` schedules on scroll,
  so any caller running in the same tick as a scroll reads a stale position —
  measured live, that produced a scroll ~1000px away from the marker. The
  container's rect is current whenever it is asked, so `_markerViewportY()`
  repeats the arithmetic (including the in-container clamp) that
  `updateCommentPosition` uses rather than trusting the rendered result of it.
- **`window.scrollTo` rather than `Element.scrollIntoView`.** There is no
  element at the marker's position to scroll into view: the circle lives in
  the shadow root inside a `position: fixed` overlay, so the browser
  considers it already in view and `scrollIntoView` on it does nothing.

- **Anchors never capture HellDots' own host-page classes.** `comment-cursor`
  sits on `<body>` for exactly as long as comment mode is on — which is
  precisely when anchors are created — so a comment anchored on `<body>` was
  stored as `body.comment-cursor` and stopped matching the moment the mode
  ended. The comment survived through the fingerprint rescue path, but that
  path is fuzzy by design (0.7 threshold, no structural signal) and is meant
  for pages that changed, not for a selector we broke ourselves.
  `HOST_PAGE_CLASSES` in `constants.js` names the offenders and
  `isStableClass()` filters them, so `<body>` now falls through to the
  structural strategy and stores a plain `body`.
- **That list is explicit, not "every value of `CLASSES`".** Filtering all of
  them would strip generic names the widget happens to reuse — `CLASSES.ACTIVE`
  is `"active"`, which host pages use constantly — and weaken anchors on
  elements HellDots never touched. Only classes actually applied to host-page
  elements belong in the list; everything else the widget owns lives inside
  the shadow root, where anchors cannot reach it anyway.

## The comment-mode cursor is capped at 32x32

- **The cursor image is 32x32, and that is a correctness constraint rather
  than a design choice.** Chromium refuses to paint a custom cursor larger
  than 32x32 device-independent pixels once it can intersect native UI — the
  mitigation for cursor-spoofing attacks, where an oversized image with a
  misleading hotspot makes users click browser chrome while aiming at the
  page. In practice that means the cursor silently reverts to the default
  arrow as the pointer nears the edges of the page, which is exactly what was
  reported. The CSS was never at fault: `getComputedStyle` reports the custom
  cursor at every edge, because the rule does apply — the compositor just
  declines to draw it. See
  https://chromestatus.com/feature/5825971391299584
- **The canvas shrank; the artwork did not.** The marker is still 28px. It
  moved from (6,6) on a 48px canvas to (2,2) on a 32px one, so the rendered
  cursor is pixel-identical and only the transparent padding is gone. The
  hotspot moved with it, which is why it now lives in `CURSOR_HOTSPOT`
  next to the SVG: the two are one unit, and a hotspot that does not track a
  change to the canvas silently misaims every comment placed with it.
- **The blue drop shadow was dropped, not shrunk.** At `dx=4 dy=4` with
  `stdDeviation=5` it needed roughly 15px of margin that a 32px canvas does
  not have. It was a 16%-opacity blue glow; the white 2px stroke is what
  actually keeps the marker legible against an arbitrary page background, and
  that is untouched.
- **A test pins the size.** Nothing about a 48px SVG looks wrong in review —
  the failure only shows up as a cursor flicker at the screen edge, on one
  engine. `constants.test.js` asserts the declared width and height stay
  within 32 so a future redraw cannot quietly reintroduce it.

## The inbox's empty state

- **The empty inbox teaches instead of just reporting.** It used to be one
  line of grey text. A user who has just installed the widget and opens the
  inbox first has no way to discover the shortcut from there, so the state now
  carries the marker's outline, the chord, and a button that turns comment
  mode on — the same three things a first-run tooltip would say, in the one
  place a user with no comments is guaranteed to look.
- **The chord comes from `getShortcutText()`, now exported from
  `components.js`.** It was private and used only by the toolbar tooltip.
  Re-deriving the modifier in the inbox would have meant two renderings of one
  shortcut, free to drift — and the platform branch (⌥ on Apple, Alt
  elsewhere) is exactly the kind of thing that drifts. A test asserts the two
  surfaces print the same string.
- **"No comments at all" and "the filters match nothing" are different
  states.** Both used to render the same line, which was merely vague; with a
  call to action it becomes wrong — offering "turn on comment mode" to someone
  who has twenty comments hidden behind a `Resolved` chip answers a question
  they did not ask. The filtered variant names the cause and offers Clear
  instead.
- **Turning comment mode on closes the inbox.** The panel is full-height and
  covers the right side of the page the user is now being asked to click on.
  Clicking the toolbar button already closed it as an outside click, so the
  gap was the keyboard shortcut — and now the empty state's own button. The
  close is on activation only: turning the mode _off_ leaves an open inbox
  alone, since nothing is competing for the page then.
- **That button turns the mode on; it never turns it off.** It reads as an
  action, not a toggle, and it is only reachable from a panel that the action
  itself closes — so a user can never see it in a state where "off" would be
  the outcome.
- **The shortcut renders as `⌥ + C`, not the `⌥C` of the mockup.** The
  spacing comes from the shared helper, and matching the mockup here would
  have meant either changing the toolbar tooltip too or forking the format.
  One shortcut, one rendering.

## Card density, round two: one fact, one place

- **The tooltip counts the thread's replies.** It previews the root comment
  only, so a discussion looked like a lone remark. The line is omitted at
  zero rather than rendered as "0 replies" — the absence already says it, and
  a count of nothing is noise on every unanswered comment, which is most of
  them.
- **The status picker is labelled, like type and priority.** It was dot-only
  from when the strip shared the header row and space was scarce. That
  reasoning expired when the strip moved to its own row, and a lone coloured
  dot still needed a hover to read — which touch never provides. Same WCAG
  1.4.1 argument that put labels on type and priority in the first place.
- **The 72px cap on those labels is gone.** It existed to stop the strip
  crowding out copy and ⋯ on a shared row. With a row of its own the labels
  fit, and truncating "In progress" to "In progr…" was never good.
- **The strip wraps instead of overflowing.** Removing the cap has a worst
  case: "In progress" + "Improvement" + "Medium" measures ~335px against a
  330px card. `flex-wrap` lets it fall to a second line there, and
  `justify-content: flex-end` keeps the overflowing control aligned under the
  others rather than orphaned at the far left. Only that combination wraps;
  everything shorter stays on one line.
- **Type and priority badges are gone from inbox cards.** The labelled
  pickers state them a few pixels above; the badge row was the same fact
  twice. **Tags and the resolution time stayed** — no control anywhere shows
  either, so dropping the whole row would have silently lost information
  rather than removed duplication. `createBadgeRow` grew an
  `includeClassification` flag for this; the tooltip, which has no pickers at
  all, still asks for everything.
- **The action strip moved from the card's footer to just under the author.**
  Same position the thread popover uses, so the two views read alike. The
  footer placement was only ever a way to give the strip a full row — which
  the new position does equally well, closer to the meta it qualifies.

## Thread chrome, round three: scrollbars, growth direction, reply deletion

- **Scrollbar colour moved to the standard properties.** `.thread-scroll`
  already styled its bar through `::-webkit-scrollbar-*`, and none of it was
  applied: Chromium >= 121 drops every one of those pseudo-elements as soon
  as the same element declares `scrollbar-width` or `scrollbar-color`, and
  the element declared `scrollbar-width: thin`. What rendered was the
  platform default — a light thumb on a white track — over a `#1C1C1E`
  panel. `scrollbar-color` now carries it. The webkit block stayed for
  Safari, which only shipped `scrollbar-color` in 18.2.
- **Every scrollable surface got the same treatment, not just the one that
  was reported.** The popover, the read-only tooltip and both inbox panes are
  all dark panels; only the popover had ever tried to style its bar. Left as
  it was, fixing the reported case would have left three surfaces disagreeing
  with it.
- **`:host { color-scheme: light }` was left alone.** Switching it to `dark`
  would have fixed the scrollbars as a side effect, and would also have
  changed how every native control inside the widget renders. Colouring the
  scrollbars directly is the narrower change and does not depend on a
  browser's idea of a dark theme.
- **The popover anchors by whichever edge keeps it on screen.** `max-height`
  caps how tall it gets but says nothing about where it starts, so a marker
  low on the page pinned `top` at ~600px and the box ran off the bottom,
  taking the reply input with it. Once the content no longer fits below the
  marker the popover anchors `bottom` instead: the reply box holds still and
  the thread grows upward until `max-height` takes over and `.thread-scroll`
  starts scrolling.
- **Re-clamping `top` on every growth was the alternative, and it is worse.**
  It keeps the box on screen too, but each new reply shifts the whole thread
  upward under the cursor. Anchoring the other edge lets the browser do it,
  and nothing moves that the user was reading.
- **A ResizeObserver re-runs the placement, rather than a call at each site
  that changes the content.** Sending a reply, expanding the context
  disclosure and a screenshot finishing its decode all resize the popover
  after it was placed, and the last one has no call site at all. Guarded on
  `typeof ResizeObserver` because jsdom does not implement it; the three
  positioning cases are unit-tested directly instead.
- **Replies are deleted through the same ⋯ menu as their comment.** The
  builder is shared (`createMoreMenu`) rather than copied, so the button, the
  dropdown chrome and the single-open rule cannot drift between the two.
- **The reply ⋯ has no hover tooltip, though the comment's does.** The
  tooltip is an absolutely positioned `::after`, and on a button flush
  against the right edge of `.thread-scroll` it stuck ~9px past it — enough
  to give every thread a horizontal scrollbar. `aria-label` still names the
  control and the menu it opens says the rest, which is a better trade than
  clipping the bubble or reserving a gutter for it.
- **Deleting a reply drops its row instead of re-rendering.** In the inbox
  detail a full render would also discard whatever is half-typed in the reply
  box below it. The reply count is not shown anywhere in that view, so
  nothing else needs to be recomputed.
- **`deleteReply` is its own method, not a case of `deleteComment`.**
  Removing the last reply leaves the comment standing; the two operations
  only look alike. Hosts get `onReplyDeleted` to mirror it, matching the
  `onReplyAdded` they already have.

## A confirmation before every delete

- **Deleting is the only irreversible thing in the widget, and it took one
  click.** There is no trash, no undo and no history: a menu item landed on
  by accident destroyed a comment and its whole thread, with nothing to
  recover it from. A modal is the cheap version of an undo stack.
- **The confirmation lives in `createMoreMenu`, not at each call site.** Four
  paths reach a delete (inbox card, inbox detail reply, popover header,
  popover reply) and they would have needed the same wrapper four times. Put
  where the destructive item is declared, a new one cannot be added without
  the question being considered.
- **`confirm` is a factory, not an object.** The wording depends on whether
  the comment has replies, and the action strip is built once when the
  popover opens. Read up front it described the thread as it was minutes
  ago — a comment answered after opening still promised that only the
  comment would go. Caught in the browser, not by a test.
- **Two fixed wordings instead of a reply count.** "and all of its replies"
  says the thing that actually matters, and it avoids pluralising a number
  in every locale we add.
- **The promise resolves; it never rejects.** "The user said no" is a normal
  answer, not an error, so every call site is `if (!(await …)) return;`
  rather than a try/catch.
- **Cancel takes focus, not the destructive button.** A dialog that appears
  under a cursor already moving toward where the menu item was should not
  have Delete one stray Enter away.
- **Escape is handled in the capture phase and stops the event.** The
  overlay's own Escape handler is on `document` and would otherwise close the
  thread popover behind the dialog while the question was still on screen.
  The backdrop stops `mousedown` for the same reason: the inbox and the
  popover both close on any mousedown outside themselves.
- **The backdrop only dismisses when the press starts _and_ ends on it.** A
  drag that begins inside the panel and releases outside is a slip, not an
  answer.
- **This is the one place with visible focus rings.** The dialog traps Tab
  between exactly two buttons, one of them destructive, so a keyboard user
  who cannot see which is focused is being asked to guess. Scoped to these
  two buttons on purpose — it does not reopen the rings that were reverted
  elsewhere for visual parity.
- **`z-index` sits above the lightbox.** A screenshot can be open full-screen
  when the ⋯ behind it is used, and a confirmation nobody can see is worse
  than no confirmation at all.
- **Open dialogs are tracked in a module-level set so `cleanup()` can settle
  them.** Unmounting mid-question would take the DOM away and leave a
  capture-phase keydown listener on `document` eating Escape for the whole
  host page. Same reasoning that already makes `cleanup()` call
  `closeOpenMenus()`.
- **The mount point falls back to `document.body`.** Callers reach the dialog
  through `getRootNode()`, which is the `Document` — not a shadow root — for
  anything mounted in the light DOM, and a `Document` cannot take a second
  element child.

## Comment ids are nanoid strings, not `Date.now()`

`Date.now()` was never an id — it is a timestamp that usually happens not to
repeat. Two things in this codebase already depended on ids being unique:
`mergeForStorage` deduplicates by id, and every lookup is a `find()` that
returns the first match. A collision therefore does not throw; one comment
silently overwrites another. One millisecond is wide enough to hit that with
a programmatic import, or with two people commenting from different machines
into a host's shared back end.

- **nanoid, not `crypto.randomUUID()`.** 21 characters carrying ~126 bits
  from a 64-symbol URL-safe alphabet, against a UUIDv4's 122 bits in 36
  characters — stronger and shorter at once. The length matters because these
  ids now travel in `?helldotsComment=` links. And nanoid reads from
  `crypto.getRandomValues`, which unlike `crypto.randomUUID` is _not_
  restricted to secure contexts: a widget dropped into a dev server on plain
  `http://192.168.x.x` keeps working.
- **A devDependency bundled into both artifacts, not a runtime dependency.**
  nanoid 6 declares `engines: node ^22 || ^24 || >=26` and this package
  promises `>=18`. Taking it as a runtime dependency would propagate that
  floor to any host importing HellDots under SSR and make our own `engines`
  a lie. Bundling contains the requirement to our toolchain (CI and local are
  both on Node 22) and costs ~130 B gzip after tree-shaking. This is
  deliberately the opposite of the `modern-screenshot` treatment — that one
  is `external` in ESM because it is large, and 130 B does not earn the same
  exception.
- **The MIT notice is added by hand in `scripts/build.mjs`.** nanoid's sources
  carry no license header, so esbuild has nothing to preserve, and MIT
  requires the notice when redistributing a substantial portion. A `banner`
  on both bundles is the only place it can honestly live.
- **`CommentId` is `string | number`, and the `number` arm is permanent.**
  Comments created before this change are sitting in hosts' localStorage and
  back ends right now. Dropping the arm later would strand them. Ids that
  cross a JSON or URL boundary are compared with `String(a) === String(b)`
  for the same reason.
- **No data migration.** Rewriting stored ids would break any host that
  recorded them elsewhere — issue trackers, its own database — and buys
  nothing, since old and new ids coexist without ambiguity.

## Copy link, and editing what was already said

Two additions to the ⋯ menu, and the second one turned out to be mostly a
question about where a half-typed sentence lives.

### The link has no redirect hop

Hosted tools hand you a link on their own domain that bounces to the app.
That hop is not a feature — it is the cost of a back end that has to resolve
which deployment a thread belongs to before it can send you anywhere. The
page a HellDots comment lives on is recorded on the comment itself, so the
link points straight at its destination: `<page>?helldotsComment=<id>`.

- **The parameter stays in the URL after the comment opens.** Stripping it
  with `replaceState` would leave a reader unable to reload or re-copy the
  link they just followed.
- **`linkParam` is configurable.** A host may already route on that name,
  and colliding with it would break their app, not ours.
- **One pending id, two sources, retried after every `loadComments()`.** The
  URL and the existing cross-page `sessionStorage` handoff feed the same
  slot. Resolving only at startup would have failed exactly the setup a
  shared link is _for_: a host that fetches comments from its own back end
  has not loaded them yet when the widget boots.
- **An unresolved link opens the inbox and says so.** Clicking a link and
  having nothing happen is indistinguishable from a broken widget. The notice
  clears itself when the comment arrives.
- **The link cannot cross browsers under `persistence: "localStorage"`.**
  Accepted, and it is a property of having no server, not of this design:
  there the comments only exist in one browser. Between tabs and reloads it
  works; to share with another person the host must persist the comments
  itself.

### The draft is state, not DOM

The inbox re-renders from ten call sites, and the overlay refreshes it from
seven more. An editor that lived only in its textarea would be destroyed by
any of them — changing a comment's priority mid-sentence would eat the
sentence, silently, which is the exact failure the delete confirmation was
added to prevent. So the panel owns `editing = { commentId, replyId, draft }`
the same way it already owns `detailId`, and rebuilds the editor from it.

- **One draft slot per panel.** That makes "open a second editor" just
  another exit from the first, so it asks the same question the others do,
  rather than being a special case bolted on.
- **The popover mounts its editor into the DOM directly**, because it is
  built once and never re-rendered. It still tracks the draft as state:
  Escape, the close button and a click on the page all need to know whether
  there is anything to lose.
- **The draft does not survive closing the panel**, and does not travel
  between the popover and the inbox. Persisting it further is scope this
  does not need.

### What asks, and the one thing that does not

Cancel, Escape, opening another editor, the panel's ×, and the prev/next and
Back navigation all ask before discarding — but only when the text actually
changed. An untouched editor closes silently; a dialog nobody needs is how
people learn to dismiss dialogs without reading them.

**A click outside does not ask. It does not close the panel either.** This is
the one place the rule bends, and it bends toward doing less. A stray click
is an ambiguous gesture — the user may have gone to look at the very thing
they are describing — and answering ambiguity with a modal interrupts them
for something they did not ask for. Leaving the panel open loses nothing and
asks nothing: strictly better than a dialog on both counts, in the one
situation that occurs most often. The textarea still on screen communicates
everything the dialog would have.

It also happens to be cheaper — a synchronous guard rather than suspending a
`mousedown` handler on a promise — but that is a consequence of the decision,
not the reason for it.

### Smaller calls

- **`editedAt` is stamped and shown as a text "edited" mark**, with the exact
  time on the same `data-full-date` hover the timestamp uses. Someone can
  answer "the button is blue", watch that text get rewritten, and otherwise
  have no way to know their reply is now arguing with a sentence that no
  longer exists.
- **A blank body is refused.** Blanking is not a back door to deletion — the
  comment would keep its marker, its replies and its inbox row while saying
  nothing. Deleting is its own action, and it asks first.
- **Saving an unchanged body is a no-op**, so opening the editor and closing
  it does not brand a comment as edited.
- **The playground's import maps carry a `nanoid` entry.** It imports `src/`
  through native ES modules, where a bare specifier does not resolve. All
  three fixtures need it — `lighthouse.html` included, or the CI
  accessibility gate would score a page with no widget on it.

## Dead-code sweep after the v0.4.0 audit

A full audit of the library (2026-08-12) ran an export/usage census over the
whole repo. What it flagged, and what was done about it:

- **`captureRegion` is gone, reversing the "kept as an export for
  compatibility" note above.** That compatibility claim had quietly stopped
  being true: the function is not re-exported from `src/index.js`, is not
  declared in `src/index.d.ts`, and the package `exports` map blocks deep
  imports — no consumer could reach it. Its tests covered real behavior
  (the scroll-offset crop math, the background-color fallback), so they were
  rewritten against `cropRegion`/`renderPage`, the path runtime code actually
  takes, rather than deleted.
- **`debugPosition()` is gone.** A leftover debug helper holding the only
  `console.log` in `src/`, with no runtime caller — it was kept alive solely
  by a test asserting it "logs without throwing". Class methods cannot be
  tree-shaken, so every consumer shipped it.
- **`data-comment-text` is no longer stamped on markers.** Nothing ever read
  it, it duplicated the full comment text into an attribute per marker, and
  it silently went stale after `editComment`. The marker keeps its
  `aria-label` (which has the same staleness problem — a separate, real fix).
- **`comment-circle-wrapper` (constant + stylesheet block) is gone.** No code
  ever assigned the class, including dynamically-composed class names.
- **`STORAGE_KEY` and `createClassifyRow` keep their `export` keyword
  deliberately.** Both have exactly one external importer — their test file —
  and serve as test seams (seeding localStorage, building the row in
  isolation). Removing the exports would force the tests through clumsier
  paths for no bundle win (both are bundled regardless). `AUTO_QUALITY`, which
  not even a test imported, lost its `export`.

## CI: the changeset rule gets its gate

CLAUDE.md claims every working rule is backed by a gate, but "any change that
affects the published package needs a changeset" had none — it relied on
review memory. CI now runs `changeset status --since=<base>` on every PR.

- **Empty changesets over a skip label**: a PR that publishes nothing (docs,
  CI, playground) satisfies the gate with `npx changeset --empty` rather than
  a `no-changeset` PR label. The empty file is reviewed like any other diff
  and leaves a record in the branch history; a label lives outside the repo
  and is invisible to `git log`. The cost accepted: one extra file in
  trivial PRs.
- **The same CI pass also stopped running the test suite twice** (a bare
  `npm test` step before `test:coverage`, which already runs every test) and
  started running `format:check`, which `npm run verify` always included but
  CI never did.

## The position loop, batched (Fase 2 of the audit)

The per-frame update used to interleave a shadow-tree query, layout reads
and style writes per comment — O(n²) scans plus a forced layout per marker
per scroll frame, with an `elementsFromPoint` occlusion hit-test each. Now:

- **Markers are indexed in a Map**; the update is split into a read phase
  (all measurements) and a write phase (all styles).
- **Occlusion is throttled to one pass per 150ms during batched updates**,
  with a trailing pass once the burst settles. The accepted limitation: a
  marker sliding under a fixed host overlay mid-scroll can stay visible up
  to 150ms longer than before. Direct, event-driven updates (status change,
  container resize) still evaluate occlusion immediately — which is also why
  every existing occlusion test passes unchanged.
- **Inbox refreshes coalesce to one per batch** instead of one per flipped
  marker (a host modal occluding 150 markers used to rebuild the panel 150
  times in a single frame).
- **The per-comment MutationObservers are gone.** The page-wide observer
  already scheduled the same update; N observers with `subtree: true` on
  (usually) `document.body` fired N redundant callbacks per mutation batch.
  Accepted limitation: attribute mutations outside the global observer's
  filter (`style`, `class`, `hidden`, `open`) no longer trigger
  repositioning — container size changes are still caught per comment by
  its ResizeObserver, and scroll/resize by their own handlers.

## Storage: cache the parse, keep the write synchronous

`_syncStorage()` used to `getItem` + `JSON.parse` the entire cross-page
corpus on every mutation. The parsed corpus is now cached; a `storage`
event from another tab invalidates it (that listener exists ONLY for cache
invalidation — real cross-tab reconciliation of in-memory state remains an
open item from the audit).

The audit's suggestion to also defer the `setItem` was **rejected**: a
debounced write buys back the `JSON.stringify` cost per burst, but a tab
closed before the flush silently loses the last edits, and every test that
asserts persistence right after a mutation would have to be weakened to
match. Synchronous durability won. The stringify itself therefore still
runs per mutation — the remaining cost is proportional to the current
page's corpus, and the honest fix for that is a storage schema with
per-comment keys, which is a breaking change parked for later.

## The stylesheet is minified by the build, not by hand

esbuild minifies JavaScript but deliberately never rewrites the inside of a
template literal, so the sheet in `src/styles.js` shipped with its full
indentation and internal comments — the single largest module in the bundle
(28.8% of it). A build plugin (`scripts/build.mjs`) now minifies the CSS
between backticks at build time, leaving `${...}` expressions intact.

- **A hand-rolled conservative transform instead of a real CSS minifier**:
  the sheet is JS-with-holes, which no off-the-shelf CSS minifier parses.
  Extracting, minifying and re-splicing around the holes with a real
  minifier is more machinery for marginal bytes. The transform only strips
  comments, collapses whitespace and trims around structural punctuation —
  never before a `:` (`.a :hover` and `.a:hover` differ). Verified
  structurally: the minified sheet keeps rule-for-rule identical counts of
  braces, declarations and at-rules, and the quoted font name survives.
- **The runtime, playground and tests keep the readable source** — the
  plugin runs at build time only, so this costs nothing in dev.
- Both builds also pin `target: "es2022"` (previously esbuild's default
  `esnext`), so a future esbuild release can't silently emit syntax newer
  than the documented browser floor.

## The Lighthouse gate was red from birth — and nobody was told

The CI accessibility gate had failed on every `dev` run since the workflow
existed: `.lighthouserc.json` used `http://localhost:PORT/...` with a
literal `PORT` placeholder, which LHCI does not substitute — it calls
`new URL(url)` first, which throws `Invalid URL` on a non-numeric port. LHCI
replaces the port of any _valid_ URL when `staticDistDir` is set, so a plain
`http://localhost/...` is the supported spelling. Verified locally with
`@lhci/cli`: collect runs and the a11y >= 0.9 assertion passes.

The lesson recorded here is less about the URL than about the failure mode:
a gate that fails on every run is indistinguishable from a gate nobody
reads. The audit found it only because it asked why every run of a "passing"
project was red.

## Fase 3 of the audit: the safe structural items

The heavy structural work the audit surfaced (keyed inbox reconciliation,
runtime re-anchoring for SPAs, an onChange emitter) was deliberately parked
for a dedicated design pass. What landed now:

- **Menus keep `role="menu"` and earn its keyboard contract** instead of
  downgrading the roles: Escape closes only the menu — the capture-phase
  listener stops propagation so the overlay's Escape cascade never tears
  down the popover behind it — and Arrow/Home/End walk the items. One
  implementation in `menus.js` covers all five dropdowns.
- **Thumbnails use `role="button"` + tabindex, not a `<button>` wrapper**:
  the same documented pattern the marker circles use. Wrapping every
  thumbnail in a real button would have restyled five surfaces for the same
  accessibility outcome.
- **i18n falls back per key**: `getStrings` merges English under the chosen
  locale, so a translation added to `en.js` and not yet to a sibling
  degrades to English instead of rendering literal "undefined". The
  hardcoded-string gate now scans all of `src/` (comments stripped;
  `metadata.js` excluded — its literals are UA brand names).
- **`clearComments()` fires no callbacks.** It exists for host-initiated
  reconciliation (clear, then loadComments with fresh data); echoing N
  `onCommentDeleted` calls back at the host for its own bulk action would
  force every consumer to guard against feedback loops.

## The package is ESM-only, and now says so

`require("helldots")` never worked from the exports map (only `import` and
`default` conditions exist), yet the UMD build carried a
`module.exports = HellDots.default` footer implying otherwise — and that
footer exported only the factory, silently dropping the named
`CommentOverlay`. Two honest options existed: ship a real CJS artifact
wired to a `"require"` condition, or declare ESM-only. **ESM-only won**
(explicit maintainer decision during the audit follow-up): modern bundlers
and Node ≥ 22 consume ESM without friction, a second module format is a
second artifact to test and keep honest, and the plain-`<script>` audience
already has the self-contained UMD global via the CDN fields. The footer is
gone, and README's "Module format" section states the contract.

## Fase 4: one shortcut matcher, no hardcoded fallbacks

The keydown handler carried two unconditional special cases (`Option+C`
spells "ç" on macOS; plain Alt+C on Windows) next to the configurable
matcher. Unconditional was the bug: a host that configured `Ctrl+K` shipped
two shortcuts — its own and Alt+C — with no way to turn the second off.

The fix is one matcher for every chord: `e.key` is compared first
(layout-correct), and for Alt chords with a single-letter key, `e.code`
(`KeyC`, `KeyK`…) is accepted as a fallback — which is what makes ANY custom
Alt chord work on macOS, where Option+letter types a dead or special
character and `e.key` never spells the configured letter. The hardcoded "ç"
case is now just one instance of that rule.

Accepted limitation: `e.code` names the physical key position, not the
printed letter, so on a non-QWERTY layout an Alt chord may also fire on the
QWERTY position of the configured letter. That beats the previous state on
macOS, where custom Alt chords did not fire at all.

## Fase 4: captures filter the widget out instead of hiding it

`withHiddenOverlay` set `display: none` on the shadow host for the duration
of every render. That had a structural cost: anything on screen (including
the comment box, had it been shown) vanished while the render ran, which is
why the click path AWAITED the capture before opening the comment box — on
heavy pages, hundreds of ms between the click and being able to type.

`modern-screenshot` accepts a `filter` callback; excluding the
`helldots-root` node from the clone keeps the widget out of its own
screenshot without touching the live page. With the flash gone, the click
path now kicks the render off and shows the box immediately; `saveComment`
awaits the in-flight promise (usually already resolved by the time anyone
finishes typing) and carries a double-submit guard. The drag path still
awaits its render on purpose: there the region crop IS what the user asked
for, and the box should open with the preview attached.

Accepted trade-offs: `saveComment` is now async (it was never part of the
public API surface in `index.d.ts`); and a save racing an Escape that
dismissed the box is dropped, because a comment materialising after the box
visibly closed would contradict the screen.

## Fase 5.1: the god object, split along its real seams

`overlay.js` had grown to ~2,500 lines and at least eight responsibilities.
Three extractions, chosen because each has a genuine one-way dependency on
the overlay and not on each other:

- **`capture-flow.js`** — the drag rectangle, the one render per gesture,
  and the pending background capture. Placement stays behind `onPlace`.
- **`popover-controller.js`** — thread-popover lifecycle, in-place editing
  state, and the placement math (`positionPopoverAtCircle` is exported on
  its own because the hover tooltip shares it). Mutations flow back through
  an `actions` contract; the controller never touches storage or the host
  callbacks.
- **`marker-engine.js`** — circles, position math, occlusion, the batched
  rAF loop and every observer/listener feeding it. What a marker OPENS
  (tooltip, popover) comes in through `wireMarker`; the engine knows where
  markers are, never what they do.

The overlay keeps a thin **compatibility facade**: same-named methods
(`renderCommentCircle`, `showThreadPopover`, `scheduleUpdatePositions`, …)
and accessor properties (`_circles`, `resizeObservers`,
`positionValidationEnabled`, `activeThreadPopover`) that delegate to the
modules. This was a deliberate trade: the facade is ~60 lines, it is the
surface every internal caller and 500+ tests grew around, and deleting it
would have turned a no-behavior-change refactor into a rename sweep with
real regression risk. The public API in `index.d.ts` is untouched, and the
refactor was verified against the pre-split code in a real browser (same
playground flows, same outcomes) on top of the full suite.

Accepted costs: ~0.5 KB gzip of module plumbing, and dependency-injection
constructors in `initOverlay` that restate what the modules need — which is
also the point: the needs are now written down.

## Fase 5.2: the inbox list reconciles by key

Every `refresh()` used to rebuild the whole panel with `innerHTML = ""` —
and refresh is called from a dozen places, including marker visibility
flips while the page scrolls. Each rebuild re-decoded every thumbnail and
reset the list's scroll position to the top, which read as the panel
"jumping" whenever anything anywhere changed.

The list now keeps a persistent skeleton (header + scrolling container)
and reconciles its cards through a keyed cache: `String(id) → { comment,
fingerprint, card }`. A card is reused as-is when its live comment object
is the same AND its fingerprint (text, editedAt, status, type, priority,
tags, resolvedAt, anchorState, hidden, page, screenshot count) is
unchanged; anything else rebuilds just that card. Ordering is a
minimal-move walk, so an untouched tail never moves. The object-identity
check is load-bearing: `loadComments` replaces comment objects, and a
reused card whose closures held the stale object would mutate a comment
the overlay no longer owns.

Deliberately NOT reconciled: the header (label-driven and stateless — the
filter summary changes with every selection) and the detail view (one
comment; a full rebuild keeps the editing/reply wiring simple). Verified
in a real browser: 15 cards, list scrolled, a priority change through the
picker — same container node, scroll intact, unchanged cards reused.

## Fase 5.3: SPA support is a verb, not a watcher

Client-side routers swap the DOM and rewrite the URL without a page load,
so nothing re-ran the anchor resolution: markers floated over dead nodes
and the inbox kept filtering by the page the widget was born on.

The fix is one explicit primitive — `notifyNavigation()` — rather than
automatic detection. It reclassifies every comment against the new
pathname, re-resolves anchors against the new DOM (same contract as
loadComments, including onAnchorLost for elements that did not survive),
rebuilds markers, moves the inbox onto the new page, and re-reads the URL
for deep links — which is also what makes the cross-page handoff and
"Copy link" URLs work through an SPA router. Called on the same path, it
doubles as the "re-anchor now" primitive after a route re-render.

Deliberately explicit: there is no reliable, framework-neutral signal for
"the route finished rendering". popstate misses pushState navigations,
patching history is hostile, and the Navigation API is not cross-browser.
`autoDetectNavigation: true` exists as an opt-in for the one signal the
platform does provide (back/forward), and is never on by default so MPA
hosts inherit no listeners. The `navigate` option is the mirror image:
the widget's own cross-page jump rides the host's router instead of
location.assign, and the sessionStorage handoff resolves on the next
notifyNavigation() instead of the next page load.

## Fase 5.4: one dispatcher, two shapes of subscription

Nine specific callbacks are right for a host that cares about one or two
things. A host that mirrors everything to one endpoint had to wire all nine
and re-derive "what happened" from which function fired. `onChange` is that
stream, typed as a discriminated union on `type`.

The nine callbacks are **kept**, not deprecated: they are the documented API
every existing consumer wired, and a convenience is not a reason to break
them. Both flow through one private `_emit(type, callbackArgs, payload)`,
driven by a `CHANGE_CALLBACKS` table that pairs each event type with its
callback name. That table is the point: a new event cannot join the stream
while forgetting the callback (or vice versa), and the two can never
disagree about when they fire.

Two deliberate calls:

- **Host handlers are isolated.** `_emit` wraps each in try/catch and warns.
  This is a behavior change: a throwing callback used to propagate out of
  the mutation that called it, so `editComment` could throw _after_ having
  already edited the comment — leaving the caller to believe nothing
  happened. Swallowing (and logging) is the honest choice; the mutation is
  done either way, and one bad subscriber must not take its sibling down.
- **`clearComments()` stays silent on the stream too**, for the same reason
  it fires no `onCommentDeleted`: the host initiated the bulk reset and
  would only hear its own action echoed back N times.

## Fase 5.5: constructed stylesheets, because CSP is not a cosmetic gate

A host with `style-src 'self'` (no `'unsafe-inline'`) blocked both of the
`<style>` elements the widget injected. That is not a styling nit: markers
are positioned by CSS, so the widget arrived as unstyled controls stacked in
the top-left corner — verified in Chrome under a real CSP, where the
injected `<style>` was present in the DOM with `styleEl.sheet === null` and
the toolbar computing `position: static`.

Constructed stylesheets (`new CSSStyleSheet` + `replaceSync` +
`adoptedStyleSheets`) are not subject to `style-src`, because nothing is
parsed from document markup. `style-mount.js` takes that path wherever the
platform offers it and injects a `<style>` otherwise, returning a detach
function so the caller undoes exactly what was mounted.

Three details worth writing down:

- **Feature detection checks both halves.** Safari shipped `CSSStyleSheet`
  for years without making it constructible, and jsdom constructs sheets
  happily while not implementing `adoptedStyleSheets` at all — so a sheet
  nobody can adopt would silently style nothing. Construction is also
  wrapped in try/catch.
- **The array is appended to, never assigned over.** A host app (Lit, or
  anything using constructed sheets) adopts onto the document too;
  replacing `document.adoptedStyleSheets` would delete its styles.
- **`cleanup()` detaches the adopted sheet.** With `<style>` this was a
  `remove()`; an adopted sheet has no element to remove, and leaving it
  would keep styling the host page — the comment-mode cursor included —
  after the widget is gone.

Because jsdom has no `adoptedStyleSheets`, the whole suite exercises the
fallback; the adopting path is driven in `test/styles-mount.test.js` by
declaring the property the way a browser does, and was confirmed for real
in Chrome under a strict CSP.

## The same CSP also broke the screenshot, one layer down

Styling the widget under `style-src 'self'` was only half of it. Pre-release
testing of 0.5.0 found the automatic capture still failing under that policy,
and the cause was not ours: `modern-screenshot` embeds web fonts by parking a
`<style>` in a document from `createHTMLDocument` and reading back `.sheet`
to walk its `@font-face` rules. That element inherits the host page's CSP,
so the browser refuses to parse it, `.sheet` is null, and the render throws
`Cannot read properties of null (reading 'cssRules')`. The failure was not
confined to fonts — it took the whole screenshot with it.

The library accepts `font: false`, which skips that path entirely. Measured
in Chrome on the same page under both policies: strict CSP renders nothing by
default and renders fine with `font: false`; with no CSP both settings render.

`canEmbedWebFonts()` performs exactly the operation that fails — detached
document, `<style>`, read `.sheet` — and `renderPage` passes `font: false`
only when it comes back null. Three things about that shape:

- **Probing beats retrying.** A try-then-retry would render twice on every
  strict-CSP capture, and the render is the expensive part of the whole
  feature. A detached document costs nothing next to it.
- **Not applied unconditionally.** `font: false` means text in a downloaded
  web font is substituted inside the image. Hosts without a strict policy —
  nearly all of them — keep full fidelity; the trade is only taken where the
  alternative is no image at all.
- **The probe fails safe.** Anything unexpected (a browser that throws, a
  platform without `createHTMLDocument`) reads as "cannot embed", which
  degrades a capture rather than losing one.

The limitation that remains is deliberate: under a strict `style-src` the
capture is faithful in everything except downloaded fonts. A host that wants
those too can grant `modern-screenshot`'s inline style a hash or nonce.

## The crop paints a backdrop, because a canvas starts transparent

Comparing captures across CSP policies turned up something neither policy
caused: on a page shorter than the viewport, every automatic screenshot had a
solid black band under the content. Measured on a 77px body in a 720px
viewport, the bottom of the image read `1,1,1`.

`domToCanvas` renders the `<body>` box, and `backgroundColor` paints that box
— not the viewport. `cropViewport` then asks for a viewport-sized rect out of
a canvas that is far shorter, so most of the output canvas is never drawn to
and keeps its initial transparent black. PNG hides that; JPEG has no alpha
channel and flattens it to black. That is why the drag capture never showed
the bug and the automatic one always did.

The fix is to fill before drawing, with `effectiveBackgroundColor()` — the
same value handed to the renderer. It is not an arbitrary filler: the browser
paints html/body across the whole viewport, so below a short page's content
the background IS what the user is looking at. Both crops do it, so a drag
selection running past the content behaves the same way.

Order matters and is asserted in the tests: the backdrop goes down first, or
it erases the render it was meant to sit behind.

## A drag crop is only as correct as the render's typography

Reported against 0.5.0: a short drag over the word "UI" in the playground's
hero came back with the "U" clipped and dead space beside it. The obvious
suspect was the crop arithmetic, and it was innocent — dropping two
uniquely-coloured 6px markers at known page coordinates and finding them in
the render proved the mapping is exactly 1:1.

The render's _typography_ was wrong. The playground pulls Poppins from
`fonts.googleapis.com`, a cross-origin `<link>` with no `crossorigin`
attribute, so `cssRules` on that sheet throws `SecurityError`.
`modern-screenshot` catches that and skips the sheet, so the `@font-face`
never reaches the clone. The clone becomes an SVG rendered as an image — an
isolated document with no network — so an un-inlined font is simply absent
and the text reflows into `serif`. Different metrics, so every glyph sits at
a different x than on screen.

That is why the bug looked size-dependent. A large drag spans whole blocks,
whose positions do not move, so the substitution reads as "the screenshot's
font looks a bit off". A drag tight around a few glyphs is all inline text,
where the drift is most of the crop.

`fetch` succeeds where `cssRules` does not — font CDNs serve
`Access-Control-Allow-Origin: *` — so `shimUnreadableFontRules` fetches those
sheets, parks their rules in a same-origin `<style>` for the duration of the
render, and lets `modern-screenshot` inline the binaries itself. Verified in
Chrome: without it the clone carries `font-family: Poppins` and zero
`@font-face`; with it, nine rules whose `src` are `data:font/woff2` URLs, and
the crop frames what was selected.

Four things that shaped the implementation:

- **Only the `@font-face` blocks are injected.** Appending a third party's
  entire stylesheet to the host's `<head>` would put its layout rules last in
  the cascade and restyle the page mid-capture.
- **Passing the CSS as `font.cssText` is not enough.** It reaches the clone,
  but the `src` URLs stay remote and an SVG-as-image cannot fetch them. The
  rules have to be readable for the library's own inlining to run.
- **One request per sheet per session**, cached — the render already costs
  far more, but a capture should not re-fetch on every drag.
- **No new hosts are contacted.** The fetch targets URLs the page already
  loaded. Where it is refused (no CORS, a `connect-src` policy) the capture
  lands exactly where it did before, and the shim is skipped entirely when
  the CSP probe already said fonts cannot be embedded.

It ships **opt-in**, behind `embedCrossOriginFonts` (default `false`), which
is a deliberate trade of correctness for restraint. Mounting a comment widget
is not consent for it to start requesting third-party stylesheets on your
users' behalf, and that call belongs to the host — a library that quietly
adds outbound requests to a page is the kind of thing you find out about in
an audit. The accepted cost is real and worth stating plainly: with the
option off, a page whose font is served cross-origin still captures its text
in a fallback face, and drag crops over that text are still misaligned. The
README documents the cheaper fix that needs nothing from us — self-host the
font, or add `crossorigin` to the `<link>` — because a host who does that
gets a correct capture and no extra requests at all.

## The render is anchored to `<html>`, not `<body>`

Fixing the font above uncovered what it had been hiding. With the typography
correct, drag crops were still wrong — now uniformly 8px to the right, where
before the font substitution had dragged them the other way by more.

Painting a landmark element magenta, rendering, and comparing its box in the
canvas against `getBoundingClientRect` gave the number exactly: every element
in normal flow landed at `+8, +8`, and the page's full-width band came back
798px wide instead of 806 — translated inside a canvas that had not grown, so
the last 8px fell off the right edge.

8px in both axes is the user-agent's `body { margin: 8px }`. The playground
zeroes it, and `getComputedStyle(document.body).margin` confirmed `0px`, so
the margin was not coming from the live page: `domToCanvas(document.body)`
clones the body into a document where the UA default applies to it again.
Measured on the raw library call, with none of our options: body → content at
`(7, 8)`, 799px wide; `documentElement` → `(0, 0)`, the full 806px.

`<html>` carries no such margin, so the fix is to anchor the render there.
Page coordinates and canvas pixels then map 1:1 — the contract `cropRegion`
and `cropViewport` were already written against.

Two notes for whoever meets this next:

- **Absolutely-positioned probes will not show this.** An earlier pass
  dropped two coloured 6px markers at known coordinates and found them at
  exactly those pixels, which looked like proof the mapping was sound. It was
  not: an absolutely-positioned box resolves against its containing block and
  skips the body margin entirely, while everything in flow does not. Landmarks
  used to verify layout have to be in normal flow.
- **The bug was there before the font fix**, invisible underneath it. Two
  independent errors in the same pixels, pushing opposite ways, is why the
  first report read as "shifted left" and the second as "shifted right".

## Marker placement in containers shorter than the marker

A comment left on a navbar row landed ~10px above where it was clicked (up
to 25px near the row's bottom edge), and nowhere else on the page. The cause
was in the position clamp, which reserved room for the marker's whole 28px
box inside the anchor container:

```js
Math.min(absoluteY, containerHeight - MARKER_SIZE);
```

In the playground's navbar the anchor container — a `<section>`, matched by
`SELECTORS.CONTAINER` — measures 36px tall. The clamp's ceiling is therefore
8px, so every point below it collapsed onto 8: measured in Chrome, a click
at `y=47` rendered the marker at `top: 52px` while the preview circle had
just drawn it at `61px`. Body sections are 500–2100px tall, which is why the
symptom looked local to the navbar.

Three options were on the table:

- **Keep the marker inside its container** (the old rule), and accept that
  it lies about the click point in short containers. Rejected: the anchor
  container is a coarse box the widget picks by selector, not something the
  user aimed at. Fidelity to the click is what the user can actually see.
- **Drop the clamp entirely.** `relativeX/Y` are in `[0, 1]` by construction
  at creation time, so the clamp is dead weight for our own data — but not
  for data a host hands back through `loadComments`, which can carry
  anything.
- **Clamp the point to the container's box** instead of the marker's box.
  Chosen: the guard against out-of-range values survives, and a legitimate
  point is never moved.

The marker's tip is what carries the meaning, so it now stays on the point
and the marker's body overhangs the container when there is no room. That
also makes the marker agree with the preview circle, which was never
clamped — the preview is the promise, and the marker has to keep it.

The same clamp existed twice: `_markerViewportY` re-derived it to scroll a
comment into view. Two copies of this math will always drift apart, so it
now lives in one `clampToBox` helper both call, with a test asserting the
scroll target equals the rendered marker's position.

One limitation accepted: a marker anchored to the very bottom or right edge
of a container now overhangs into whatever sits next to it. That is a
faithful rendering of where the user clicked, and the widget already allowed
it for the preview circle.

## Dropdowns flip up instead of being clipped by a scroll container

Every dropdown in the widget is `position: absolute; top: calc(100% + 4px)`
inside a `position: relative` wrapper. Inside a scrolling ancestor that
placement is clipped: measured in Chrome, the ⋯ menu on a reply row extended
10px past the bottom of `.thread-scroll`, so the container reported
`scrollHeight 167 / clientHeight 157` and the menu could only be read by
scrolling the thread. With both items present (see the fix below) it
overhung by roughly 37px.

Three ways out were considered:

- **Remove the clipping.** Not available: `.thread-scroll` exists precisely
  so a long thread doesn't grow the popover past the viewport, and dropping
  its `overflow` brings back the bug it was added for.
- **Portal the menu out, positioned `fixed` from the button's rect.** Escapes
  every clipping ancestor, and is the only fully general answer — but a
  `fixed` element is still clipped when a containing-block ancestor sits
  below the overflow in the chain, and the menu then has to be repositioned
  or closed on every scroll of the thread. More machinery than the symptom
  justifies.
- **Flip the menu above its button when there is no room below.** Chosen:
  the standard dropdown behaviour, no repositioning to maintain (the menu
  stays in flow and moves with its row), and it is decided once per open.

The measurement lives in `menus.js`, in `attachMenuToggle`, so every
dropdown gets it — the status/type/priority pickers, both ⋯ menus and the
inbox filter — rather than being fixed at the one call site that was
reported. The clipping boundary is found by walking up to the nearest
ancestor whose overflow is not `visible`, falling back to the viewport, and
it is re-measured on every open: a menu on a row that has scrolled since
last time has different room than it had.

Two limits accepted, both deliberate:

- **A menu that fits in neither direction stays pointing down.** Flipping it
  would trade a clipped bottom for a clipped top while also reversing the
  order the user reaches for. Verified by shrinking `.inbox-list` to 150px
  around a 110px menu: it correctly declines to flip.
- **The flip is not animated and the menu can overlap the row above it.**
  That is what a dropdown does; the row underneath is not interactive while
  the menu is open.

## A reply's ⋯ menu was missing its edit item until the popover was reopened

`createReplyElement` builds the ⋯ menu from whichever handlers it is given,
and `submitReply` — the path that appends the row the user just created —
passed only `onDelete`. The full render in `createThreadPopover` passed both,
so the item appeared as soon as the popover was closed and opened again:
the reply most likely to need a correction was the one that could not be
corrected.

The handler is now a named `const` alongside `onDeleteReply` and both call
sites pass it. Naming it is the actual fix: it was inlined in the
`createThreadPopover` argument list, which is what let a second builder be
added without it.

## The popover's deferred listener is cancellable, not removed

`show()` arms the outside-click listener from a `setTimeout(…, 0)` so the
gesture that opened the popover cannot immediately close it. The timer id was
not held, so `close()` had nothing to cancel: a `cleanup()` in the same tick
as opening a thread was outrun by the timer, and the listener landed on
`document` after teardown with nothing left to remove it. It closes over the
controller, so each occurrence pinned an entire overlay instance — shadow
root and comments included — for the page's lifetime.

The alternative was to drop the deferral and arm the listener synchronously,
which would delete the race outright. Rejected as unverifiable from here: the
deferral exists to survive whatever event sequence opens a thread (a marker
click, a keyboard Enter, a jump from the inbox), and proving that a
synchronous listener never eats its own opening gesture across all three
needs more evidence than the leak justifies. Holding the id and clearing it
in `close()` fixes the leak without touching open/close semantics.

Two notes for whoever reads this next:

- **The test waits for the armed handler, not for 10ms.** The old
  `await wait(10)` against a `setTimeout(…, 0)` passed on timer ordering
  alone; it would have silently become a coin flip the day that delay
  changed.
- **`show()` also schedules positioning on a 10ms timer that `close()` does
  not cancel.** That one is harmless today — it positions a detached node —
  but it is the same shape, and it is what makes two of the popover
  positioning tests order-dependent under `--sequence.shuffle`.

## What the flaky outside-click test was actually hiding

One CI-adjacent run failed `clicking outside the popover and circle closes it`
and never did so again — not in 10 isolated runs, 6 under full CPU
saturation, 8 of the whole suite, or 15 shuffled seeds. The original
diagnosis (a `wait(10)` racing a `setTimeout(…, 10)`) was wrong twice over:
the listener is armed on a `setTimeout(…, 0)`, whose ordering against a later
10ms timer is guaranteed, and a 300-iteration probe armed and closed 300/300.
That single failure has no confirmed cause.

Chasing it with `--sequence.shuffle` was what paid off, because it turned
"passes in file order" into a testable property. Four defects came out, three
of them real leaks in the widget rather than in the tests:

- **The popover armed its outside-click listener on an uncancellable timer.**
  See the entry above.
- **The inbox did the same, and also re-armed without disarming.** Each
  `showInbox()` overwrote the pending timer and the handler field, so the
  previous pair was orphaned beyond `closeInbox()`'s reach. `notifyNavigation()`
  re-reads the deep link on every route change, which makes this one
  accumulate on an ordinary SPA session, not just on unmount.
- **Two suites stubbed `document.body.getBoundingClientRect` by direct
  assignment** in their own `beforeEach`. `restoreAllMocks` cannot undo an own
  property, so the stub leaked to every suite declared after them. The popover
  suite silently depended on it: without a sized anchor its marker renders
  `display: none`, and `syncToMarker` then reads the marker as off-screen,
  hides the popover and never positions it. It now calls the shared
  `stubBodyRect()` itself, and the top-level `afterEach` deletes the override.
- **`domToCanvas` is a `vi.fn()` from a module factory, so
  `restoreAllMocks` does not reset its implementation.** The
  capture-rejects test installs a permanent `mockRejectedValue`, which starved
  every later capture of its canvas. Reset in the top-level `afterEach`.

The test harness also tracks every instance `makeOverlay` creates and tears
them all down, instead of only whatever `overlay` points at last: several
suites create one in `beforeEach` and reassign inside the test, and a shuffled
run caught nine orphaned comment-mode listeners answering a single mousedown.

Two habits this is worth writing down for:

- **Assert on conditions, not durations.** The two tests that failed here
  both slept a fixed number of milliseconds and then asserted. `waitFor` was
  already in the file.
- **`restoreAllMocks` only undoes spies.** Direct property assignments and
  module-factory `vi.fn()`s need explicit teardown, and until they get it they
  are a channel between tests.

## The inbox's context block is a disclosure too (amends the entry above)

The earlier decision gave `createContextBlock` a `collapsible` flag and used
it only in the thread popover: the inbox detail rendered the block expanded
and fixed, on the reasoning that "that view exists to show everything". In
practice the automatic screenshot plus five metadata rows push the replies
below the fold on exactly the surface where you read a discussion, so the
block now carries the same toggle there.

What did not change: it still **starts** expanded in the inbox. The reasoning
above holds for the first render — you opened the detail to see everything —
and starting it collapsed would hide information that is visible today. Only
the ability to fold it is new.

Two things this required:

- **The caller owns the open/closed state.** `createContextBlock` takes
  `expanded` and reports changes through `onToggle` instead of keeping the
  state in its own closure. The inbox rebuilds its detail from scratch on
  every refresh, and a refresh follows any mutation — adding a reply,
  changing a status — so a block that remembered its own state would spring
  back open under the user. The popover, built once and mutated in place,
  does not need this and passes neither.
- **One flag per panel, not per comment.** `InboxView.contextExpanded` is
  panel-level, so folding the block away keeps it folded while stepping
  through comments with prev/next. Per-comment state would re-expand on every
  step, which reads as the toggle not working.

The state is deliberately not persisted across sessions: it is a reading
preference for the panel that is open, and `localStorage` here is the
comments' store, not the widget's UI settings.

## "In review" joins the lifecycle, and `open` desaturates instead of vanishing

RF09 shipped with three states — `open`, `in_progress`, `resolved` — and a
colour for each. Adding a review step exposed the problem with that: the
palette had no blue left that was not already the _default_ state's blue, and
inventing a fourth hue would have put four saturated dots in a row where only
three of them ever mean a decision was made.

So `in_review` took the blue, and `open` moved to an unsaturated off-white
grey (`#D1D1D6`). The three states a person actively moves a comment into keep
the saturated colours and read as the signal; the state every comment is born
in is still painted, just quiet.

The rejected alternative was giving `open` no colour at all and letting it
fall through to the `transparent` dot that type and priority use for their
unset option. It is tempting — the fallback already exists, and "nobody has
touched this" is roughly what `open` means — but the two are not the same
thing. Type and priority genuinely have no value until someone picks one;
status always has one. An empty ring in a row of filled ones reads as _failed
to load_, not as _new_, and it is the one state where that misreading costs
the most, since it is what most comments show most of the time.

Three things this leans on:

- **The label carries the meaning, the dot only ranks it.** `statusLabelOf`
  runs on every surface, so "Open" is written out next to the dot in the
  action strip and inside the badge row. Nothing is distinguishable by colour
  alone (WCAG 1.4.1), which is what makes desaturating a state a matter of
  emphasis rather than of information.
- **Order in `STATUSES` is the picker's order.** `in_review` sits between
  `in_progress` and `resolved` because that is the sequence people describe,
  not because anything enforces the transitions. `setCommentStatus` still
  accepts any state from any state.
- **No migration is needed.** The union in `index.d.ts` grew, and the
  `loadComments` guard already falls back to `open` for anything it does not
  recognise, so a store written by an older version loads unchanged and a
  store written by this one loads into an older version as all-open. The
  `"closed"` → `"resolved"` fold from the original lifecycle is untouched.

What this accepts: `in_review` shares `#2E90FA` with the marker cursor
artwork. They never appear in the same slot — one is a page-level pin, the
other a 12px dot in a menu — and the alternative was a fourth hue chosen only
to avoid a coincidence.

## Dimming resolved cards with `opacity` needs an escape hatch for dropdowns

Resolved inbox cards are dimmed with `opacity: 0.75`. That reads correctly at
rest, but `opacity` is not a paint-order property — it composites the element
and every descendant into one layer and then makes the whole layer
translucent. A dropdown opened from a resolved card is a descendant, so it
came out see-through: painted _above_ the context block, and still showing it
through itself.

The tell was that `elementFromPoint` disagreed with the eye. Hit-testing named
the menu item at every point down the menu's column, so it genuinely was on
top; nothing about z-index or stacking order was wrong, and raising either
would have changed nothing. Only the compositing was.

The fix is to stop the group existing while a menu is open:

```css
.inbox-card--resolved:has([aria-expanded="true"]) {
  opacity: 1;
}
```

Keyed on `aria-expanded` because `menus.js` already toggles it on every
dropdown button it wires — the status/type/priority pickers and the `...`
menu alike — so no new state had to be invented for the stylesheet to read.

Two things worth recording:

- **The list hid this by accident, the detail view did not.** The existing
  `.inbox-list .inbox-card--resolved:hover { opacity: 1 }` meant that reaching
  the button with a pointer had already lifted the dim, so the bug only
  surfaced where that rule does not apply — and would have surfaced on touch
  in the list too. The new rule is hover-independent and covers both.
- **The alternative was giving up group opacity.** Dimming the card's text and
  meta individually would avoid the compositing layer entirely, but it means
  hand-picking every child that should fade and keeping that list correct as
  the card grows. Lifting the dim for the duration of a menu is a smaller
  promise to keep, and the momentary jump to full opacity reads as feedback
  rather than as a glitch — the list has behaved that way on hover all along.

What this accepts: `:has()` in shipped CSS. The README already scopes support
to modern evergreen browsers, where it has been baseline since 2023; an engine
without it simply keeps the old translucent-menu behaviour rather than
breaking.

## Emoji reactions ship without an emoji library (amends "out of scope")

The earlier entry reserved `reactions?: Record<string, string[]>` and left the
feature unbuilt. Building it needed a handful of choices worth recording,
because each had a defensible alternative.

**A fixed set of six, not a picker.** `👍 👎 ❤️ 🎉 👀 🚀`, hardcoded in
`constants.js`. The measured cost of the whole feature is **+2.07 KB gzip** on
`dist/helldots.esm.js` — bundled against the real entry with the real build
options before a line was written, so the budget question was answered rather
than estimated. A searchable picker would have to carry an emoji dataset:
~1,800 entries with keywords, which alone is several times the ~15 KB of
headroom the 50 KB budget has left. `emoji-picker-element` also mounts its own
Shadow DOM and fetches its data at runtime, which the self-contained UMD
artifact cannot do. Rendering is the platform emoji font — no sprites, no
Twemoji, no third-party requests from inside the widget.

Host-configurable sets (`reactionEmojis?: string[]`) were rejected for now: a
public option to validate and document, plus an unanswered question about
reactions whose emoji is no longer in the configured set.

**Order is load-bearing.** `REACTION_EMOJIS` orders both the palette and the
pills, so a pill never moves out from under the pointer when a count changes.
Sorting by count would reshuffle the row mid-click.

**Identity is `user.id ?? user.name ?? anonymous`, resolved in one place.**
`user` gained an optional `id`; it is never rendered — the display name stays
what gets shown as an author. `actorKeyOf` is the only place this is decided,
because the toggle and the "this one is mine" render have to agree: resolved
separately in two spots, a host that swaps `user` at runtime would paint pills
nobody can switch off.

What this accepts: with no `user` at all, every actor collapses into the
anonymous string and reactions are effectively single-actor. That is the same
limitation authorship already had, and it is the host's to fix by passing
`user` — HellDots inventing a per-browser id would mean persisting an identity
of its own invention outside the comment corpus.

**Pills never show who reacted.** Stored keys are display names when the host
passes no `id` and opaque ids when it does, so rendering them would be
inconsistent at best and a leak at worst. The tooltip carries the action
("Add/Remove your reaction"), the count is the visible digit, and "mine" is
`aria-pressed` plus the highlight. No prose carries a number anywhere:
`formatTemplate` has no plural forms, and this repo already decided against
pluralising counts in copy. Storing `{ id, name }` per reaction was the
alternative — real names in the tooltip, at the cost of duplicating a name into
every reaction and putting more personal data into `localStorage`, which today
holds the author's name once per comment.

**A dedicated `reaction:toggled`, not `onCommentUpdated`.** The precedent
("one `onCommentUpdated` for type/priority/tags; three callbacks would have
been API noise") points the other way, but replies are in scope and
`onCommentUpdated(comment)` cannot say _which_ reply changed — a host syncing
to a backend would have to diff the thread. The event carries
`(comment, reply | null)`, and the `CHANGE_CALLBACKS` table keeps it and its
callback from drifting apart.

**Read-only pills on inbox list cards.** The card navigates on click and
already carries a header, four controls, text, badges and a replies link;
another dropdown would turn it into a form. Pills render as `<span>` there —
the signal while triaging, without the affordance. Reacting happens in the
detail view and in the thread popover.

**The palette rides on `attachMenuToggle`.** That buys the single-open rule,
`aria-expanded`, the upward flip when it would be clipped, and outside-click
close — and, because the resolved-card escape hatch keys off a generic
`:has([aria-expanded="true"])`, the dim behaves correctly with no new CSS. Two
consequences worth knowing: the helper drives `display` inline (`none`/`block`),
so the palette lays itself out with inline-flex items and `nowrap` rather than
a flex container it would overwrite; and the toggle closes the palette
_before_ mutating, because the inbox detail rebuilds itself on every refresh
and a palette still open through that rebuild is orphaned mid-click.

**Two guards needed teaching, one test needed narrowing.** `_cardFingerprint`
now carries the reaction counts — the inbox reuses a card node whose
fingerprint is unchanged, so without them a card whose reactions moved kept its
cached node and the counts froze. `test/styles.test.js` keeps a hardcoded list
of interactive classes, which silently stops covering new ones, so the pill,
the add button and the palette items were added to it. And a reply-row test
swept for `[role="menuitem"]`; the palette is a `role="menu"` too, so it is now
scoped to the `⋯` menu it was always about.

One jsdom quirk, recorded so it is not rediscovered: its selector engine does
not match attribute values containing astral-plane characters, so
`[data-reaction-emoji="🎉"]` finds nothing in tests. Browsers match it fine and
no selector in `src/` depends on it, but tests have to filter on `dataset`.

## The reaction UI moves into the action strip (amends the entry above)

A high-fidelity mockup arrived after the first cut shipped, and it changes
where reactions live rather than what they are. The data model, the identity
rule and the event are untouched; this entry records what the UI became and
what that cost.

**The action strip is now two groups.** What the comment _is_ — status, type,
priority — sits on the left; what you can _do_ with it — react, copy its
context, the `⋯` — sits on the right, with `justify-content: space-between`
between them. That is why the copy button moved: mixed in among three labelled
pickers it read as a fourth classification rather than an action.

**The first reaction can only be added from the strip.** The pill row appears
_with_ the first reaction and disappears with the last, so it cannot be the
entry point for one. Two affordances, same palette: the strip's button starts a
reaction, and once pills exist the row carries a trailing button for one more.
A reply gets the same pair, its trigger sitting left of its `⋯`.

**The icon is a smiley with a plus, not a bare plus.** In a row that is already
made of emoji, a lone `+` read as "add something" rather than "add a reaction".

**The row is hidden, not absent.** It renders as an empty `[hidden]` element
and only fills in when there is something to show. Returning null instead
would have been tidier markup, but then the first pick from the strip would
have nowhere to land — the row has to be mounted and waiting.

**A `createReactionsUi` controller replaced the standalone bar factory.** The
pick that changes a row now comes from a control that does not own it, and on a
comment those two are built by different modules: `createThreadPopover` builds
the pill row, while the action strip is assembled by the popover controller
_after_ that function has already returned. Threading refresh handles through
both was the alternative; instead each row registers itself with the
thread's UI object (a `WeakMap` keyed on the target) and any pick repaints
whatever rows for that target are still connected — detached ones are dropped
on the next pass, since the inbox rebuilds its detail view on every refresh.
The same registry is what makes a toggle in the detail view update the list
card behind it.

`actorKey` became a getter in the process. It was read once at build time,
which would have gone stale on a host that swaps `user` while the widget is
mounted — the exact failure the single-resolver rule exists to prevent.

**Read-only pills on inbox list cards are reversed.** The previous entry made
them static spans, reasoning that a card which navigates on click should carry
the signal but not the affordance. That no longer holds: the action strip is
shared, so the card now has the button that _adds_ a reaction, and a surface
that can add one but not remove it is incoherent. The pills are buttons
everywhere, and every one of them stops propagation so a pill press never opens
the detail view — the same guard the pickers in that strip already had.

What this accepts: nested interactive controls inside a `role="button"` card,
which was already true of the three pickers and the `⋯` there.

One test needed narrowing rather than weakening, again: a reply-row assertion
listed every `button` inside the row's tool group, which now includes the six
palette items. It is scoped to `button[data-action]` — the controls themselves,
not the menus they open.

## The commit convention gets a hook (amends "enforced at review time")

`CONTRIBUTING.md` said the convention had no automated check and lived on
review. It did not survive contact: two commits landed as
`:lipstick: style(...)` when this repo's table assigns `:art:` to `style`.
`:lipstick:` is what gitmoji's _own_ convention puts on UI work, so the wrong
emoji was not a typo — it was a plausible answer from the wrong table, which
is the kind of mistake review catches late and inconsistently.

So there is now a `commit-msg` hook. Three things about how it is built:

- **The guard parses the table out of `CONTRIBUTING.md` instead of holding its
  own copy.** A second list is a second source of truth, and the two drift the
  first time someone edits one — the exact failure being guarded against.
  Editing the table in the document is what changes what the hook accepts, and
  a test asserts the parse still finds `style` → `:art:`.
- **`npm install` installs it, via `core.hooksPath`.** Hooks in `.git/hooks`
  are not versioned and would have to be copied by hand on every clone; a
  `prepare` script pointing git at the committed `.githooks/` directory needs
  no ceremony. It no-ops silently outside a git work tree so a tarball install
  can never fail on it.
- **It checks shape, not taste.** Format, the type→emoji pair, a trailing
  period, and a 72-char subject ceiling. Imperative mood and the 50–60 char
  guidance stay with the reviewer, because a guard that fires on judgment
  calls gets bypassed, and a bypassed guard protects nothing.

What this accepts: `--no-verify` still exists, and the hook only runs for
people who ran `npm install`. It is a fast local check, not a gate — CI does
not re-check messages, since squash-merge titles are written in the GitHub UI
where this hook cannot reach.

The two offending commits were rewritten (they had not been pushed): the
larger one became `feat`, since it restructured the DOM and reversed a
documented decision rather than only changing presentation — `style` in this
repo means presentation only. `CLAUDE.md` now carries the table itself, with a
note that gitmoji's general convention disagrees with it, because that file is
the one an agent reads at the start of every session.

## The detail header's nav trio keeps the shared strip's full width

The inbox detail header reuses `.inbox-card-actions` — the card's action strip
— as the container for `prev` / `next` / `close`. That strip is `width: 100%`
with `justify-content: space-between`, which is what makes a card's two groups
(classification left, tools right) split cleanly. In the header there is only
one group, so `space-between` distributed the three buttons across the whole
row: the up arrow sat against `Back`, the down arrow floated in the middle,
and only `close` landed where it belonged.

Two fixes were defensible. Dropping `width: 100%` in the header would let the
strip shrink to its contents and the header's own `space-between` would push it
right — but the 100% width is a deliberate property of that strip, asked for
explicitly, and a scoped exception is exactly how it gets quietly lost. So the
width stays and only the alignment is overridden:
`.inbox-detail-header .inbox-card-actions { justify-content: flex-end }`. The
strip still spans the row, which is what holds `Back` at the left edge, and the
trio reads as one cluster opposite it.

The gap tightens to 2px there, matching `.actions-group--end` — the same
treatment icon-only buttons already get in the card, where 8px between bare
glyphs reads as three unrelated controls rather than one group.

## An empty replies container is collapsed in CSS, not skipped at build time

The inbox detail view is a flex column with `gap: 12px`: card, context block,
replies, reply box. A comment with no replies still got the replies container,
and a zero-height flex item still collects the gap on both sides — 24px of
nothing between the context block and the reply box. With the context expanded
it passed for breathing room; collapsed to its one-line toggle it read as a
hole, which is how it was reported.

The obvious fix is to not append the element when `comment.replies` is empty.
That was rejected: deleting the last reply removes its row in place rather than
re-rendering the detail view — a full render would throw away whatever is
half-typed in the reply box — so the container empties out without
`_renderDetail` running again, and a build-time decision would leave the hole
behind exactly then. `.inbox-replies:empty { display: none }` covers both paths
with one rule, and the guard for it is behavioural: asserting the rule's text
is present would pass just as happily while the element still took up space.

What this does not touch: the panel is `top: 16 / bottom: 16`, so a short
comment still leaves the rest of the panel empty below the reply box. Docking
the reply box to the bottom edge, or letting the panel take its content's
height in the detail view, were both considered and declined — the panel's
geometry stays fixed on purpose, and both of those move the empty space rather
than removing it.

## Dropdowns flip sideways too, measured in the same place as the vertical flip

`menus.js` already decided one thing about placement: a dropdown that would be
clipped below its scrolling ancestor opens upward instead, and only when it
actually fits up there. The horizontal axis had no such rule — every menu is
`position: absolute; right: 0`, pinned to its button's right edge — and the
status picker is the first control in the action strip. Its 130px menu on a
59px button reached 45px past the left edge of the inbox panel, where the
panel's `overflow: hidden` cut it in half: the labels were unreadable and two
of the four states unclickable. The same geometry applies in the thread
popover, which is narrower still.

Right-aligned is the correct default — the `⋯` and the tools sit at the end of
the strip, and a left-aligned menu there would spill the other way — so the
side has to be chosen per open, not per component. That put the fix next to
the vertical one, as `.inbox-menu--start` (`right: auto; left: 0`), for the
reason the vertical comment already gives: a measurement in the shared registry
covers every dropdown, including ones added later, while a rule at the call
site covers one.

Two details worth recording:

- **The overflow test reads the menu's measured `left`, not one derived from
  the button.** Which edge a menu hangs off is a CSS decision that already
  differs per surface — the reaction palette opens leftward only inside the
  tools group — and deriving the position from the anchor would misjudge
  whichever surface disagreed with the assumption.
- **It flips only when the menu fits on the other side**, exactly like the
  vertical case: a menu wider than what clips it would trade one cut edge for
  the other while also losing the alignment the user reached for.

What this accepts: a menu wider than its container is still clipped, and the
`--start` class is inert on any menu whose stylesheet does not pair it with a
rule (today only `.inbox-menu` does). The alternative — nudging the menu by
the overflowing amount, the way Floating UI's `shift` works — was declined
because trigger-aligned edges are what the rest of the widget does, and the
flip keeps them.

## The host's user id is persisted, and says nothing about authentication

`user.id` already existed — the reactions entry above introduced it — but it
only ever lived in memory, as the key `actorKeyOf` produces. What got stored
on a comment was `author`, a display name. A record that claims to say _who_
created, changed or resolved something cannot rest on that: two teammates
called "Ana" are one author in the corpus, and a display name that changes
rewrites history retroactively for every comment that person ever wrote.

So `authorId` joins `author` on comments and replies, stamped from
`this.options.user?.id` on both creation paths.

**Optional and absent by default, so `schemaVersion` does not move.** A corpus
written before this change loads unchanged and reports `authorId: null` — the
same policy `resolvedAt` and `reactions` already follow, and the reason
neither needed a migration. Bumping the version to `2` would announce a
migration path that no stored payload requires. The serializer emits the key
unconditionally as `null` when there is no id, matching how `resolvedAt`,
`type`, `priority` and `context` already behave; only `reactions` omits itself
entirely, and it does so because its absent form is an object rather than a
scalar.

**The id is scrubbed on the way in, like every other field crossing that
boundary.** `loadComments` keeps it only when it is a string. An id reaches a
host that may look it up, so a `{ toString() }` from a hostile backend must
not survive a round trip — the same reasoning that had `normalizeReactions`
drop non-string actor keys.

**Never rendered.** `author` stays what every renderer shows; `authorId` is
correlation data for the host. This is the rule the reaction pills already
follow ("Pills never show who reacted"), and a test asserts the id does not
appear anywhere in the rendered shadow root, so a future card or timeline
cannot quietly start leaking it.

**The record is attributive, not evidential.** HellDots authenticates nobody,
and the requirement is explicit that it should not. Whatever the host declares
in `user` is taken at face value and stored as-is; a host that lies produces a
corpus that lies. What is being recorded is what the application asserted
about who acted, and a deployment needing the stronger claim verifies it on
its own backend, which `onChange` already feeds. Saying that out loud matters
more than it looks: an audit trail whose limits are undocumented reads as a
guarantee it cannot make.

What this accepts: a little more personal data in `localStorage`. The
reactions entry weighed exactly this when it rejected storing `{ id, name }`
per reaction, and landed the other way — but there the name was a duplicate of
something already stored once per comment, whereas here the identifier is what
the requirement asks for. An `id` that is itself sensitive is the host's to
choose; HellDots stores the opaque string it is given and invents none of its
own.

## The audit trail records four actions, and nothing it cannot label

The entry above ("A single `resolvedAt` instead of a status history") declined
a status history on the grounds that it "offered more analytical value than
the requirement asked for, at the cost of more payload per comment". The
requirement now asks for it — who created, changed or resolved a comment, and
when — so this amends that call rather than replacing it.

**Four event types, chosen by what the requirement names.** `created`,
`edited`, `status`, `classified`. Two things stay out on purpose:

- **Reactions.** A single triage session can toggle a dozen; folding them in
  would quadruple the log to record that somebody clicked 👀.
- **Replies.** A reply already carries its own `author`, `timestamp` and
  `editedAt`, and it is visible in the thread. Copying that into the parent's
  log would be the second place one fact lives.

That bound is load-bearing rather than cosmetic. It puts a typical comment at
three to five entries — roughly 450–750 bytes — so a hundred comments' worth
of history costs about what two automatic `contextScreenshot`s cost. Against a
~5 MB quota that needs no cap and no retention policy, and the shedding path
in `writeStoredComments` stays exactly as it was: screenshots remain the only
thing sacrificed, because they are the only thing a user can regenerate by
taking another one. A log cannot; it _is_ the record.

**Resolution time is derived, never stored.** `resolutionsOf` walks the
`status` entries and `currentResolutionMs` returns the one in force; neither
is serialized. Storing the figure would put the same fact in two places and
let it go stale the moment a comment is reopened — the failure "Card density,
round two: one fact, one place" already named. `resolvedAt` stays as it is,
both for hosts already reading it and as the fallback inside
`currentResolutionMs` for comments resolved before the log existed. Each
duration is measured from creation rather than from the reopen: restarting the
clock would make a comment that bounced twice look faster than one fixed on
the first attempt.

**No new change event.** Reactions got a dedicated `reaction:toggled` because
a reaction could change without any other event firing. An audit entry cannot:
it is appended _by_ the mutation that already emits `comment:created`,
`comment:edited`, `comment:status-changed` or `comment:updated`, and the
serialized comment those carry now includes the log. A host subscribing today
receives the history with no new wiring.

**Recording happens after each no-op guard, never before.** `setCommentStatus`
returns early when the status is unchanged, and the three classification
setters compare against the previous value first — tags on their joined form,
since `normalizeTags` already lowercases and de-duplicates both sides. An
entry appended above those checks would log a change that did not happen, and
`_cardFingerprint` would then repaint a card for nothing.

**The trail is attributive, not evidential.** HellDots authenticates nobody,
and the requirement is explicit that it should not. Whatever the host declares
in `user` is recorded as-is; a host that lies produces a corpus that lies.
What is recorded is what the application asserted about who acted. Saying that
out loud matters more than it looks: an audit trail whose limits are
undocumented reads as a guarantee it cannot make.

**Timestamps are client clocks, so durations clamp at zero.** Every `at` is
`new Date().toISOString()` on the acting machine. A host syncing two devices
with skewed clocks will eventually merge a resolution that predates its own
creation. Clamping keeps the figure meaningless-but-harmless instead of
negative, and `normalizeHistory` drops an entry whose timestamp does not parse
at all — one unparseable date would otherwise poison every average built on
the log.

**The timeline reuses the pickers' dictionaries.** A move reads
`Status: Open → Resolved`, composed from `statusLabel` plus `statusLabelOf` —
the same words the picker shows. A second dictionary would let a state be
called one thing where you change it and another where you read what changed.
Tags are the exception: a list has no two-value transition, so the change gets
its own sentence (`auditTagsChanged`) rather than a malformed arrow. Seven new
i18n keys instead of the nine an earlier draft needed, because the field names
and every value already existed in both locales.

## The metrics dashboard and its exports carry no libraries

Three candidate dependencies were bundled against the real entry point with
the real build options before any of this was written, the way the reactions
entry established:

| Candidate                                       | gzip        | Against ~13 KB of headroom |
| ----------------------------------------------- | ----------- | -------------------------- |
| `jspdf` + `jspdf-autotable`                     | 253.99 KB   | 19×                        |
| `pdf-lib`                                       | 202.12 KB   | 15×                        |
| `jspdf`, optional deps external                 | 133.01 KB   | 10×                        |
| `chart.js/auto`                                 | 68.86 KB    | 5×                         |
| `chart.js`, tree-shaken to bar + doughnut       | 55.14 KB    | 4×                         |
| `uplot` (the smallest serious charting library) | 22.66 KB    | 1.7×                       |
| `papaparse`                                     | 7.03 KB     | half of it                 |
| **hand-written CSV serializer**                 | **0.29 KB** | —                          |
| **hand-drawn SVG bars**                         | **0.30 KB** | —                          |

Not one of them fits, including the smallest. The whole feature — aggregation,
dashboard, both CSV exports, the printable report, twenty i18n keys in two
locales and the CSS — came to **+4.28 KB gzip**, landing the bundle at 41.48 KB
of 50.

**The PDF is the browser's.** The report is built in its own document and that
document is asked to print; "Save as PDF" in the dialog produces a real one,
laid out by the engine that already knows how. What this accepts: the user
passes through the print dialog rather than receiving a file programmatically,
and a headless context has no dialog to pass through. Against ten times the
remaining budget for the alternative, that is the cheaper limitation.

**A print report needs its own realm, and that broke a hidden assumption.**
`mountStyles` constructed its `CSSStyleSheet` from whatever realm the module
happened to be evaluated in. That was invisible while every target lived in
the main document, but a sheet built in one document and adopted into another
throws — so the report's frame would have taken the `<style>` fallback, and an
inline sheet is exactly what a strict `style-src` drops, since an iframe
inherits the embedder's CSP. `constructSheet` now resolves the constructor
from the target's own `defaultView`. The report is the first caller that
needed it; the widget's own mount is unchanged.

**Charts state their numbers.** No figure communicates through length or
colour alone (WCAG 1.4.1, and the Lighthouse gate at 0.9): every bar row
carries its count as text beside it, and the daily chart is an
`<svg role="img">` whose `aria-label` reads the whole series with a `<title>`
per column. That requirement alone rules out a `<canvas>` renderer, which is
what most charting libraries are — so the size measurement and the
accessibility gate happened to agree.

**Bars scale against the busiest bucket, not against the total.** A corpus
spread evenly across four statuses would otherwise draw four slivers at 25%,
and the shape of the distribution — which is the only thing a bar chart is
for — would be invisible.

**Mean and median, not just the mean.** The requirement asks for an average.
One comment left open for a month drags a mean somewhere no real comment
lives, and a reader with no second figure has no way to tell that happened.
The median costs six lines.

**`overTime` lists only the days that saw activity.** Filling the gaps between
the first and last comment is the textbook answer and it is wrong here: two
comments a year apart would produce 365 buckets and a chart of 363 empty bars.
The axis labels name the endpoints, so the sparseness is visible rather than
implied.

**The dashboard is filtered, `getMetrics()` is not.** The panel's filter
summary sits directly above the figures, so measuring anything other than what
the panel is showing would contradict the label right next to it. A host
calling `getMetrics()` has no notion of those filters and gets the whole
corpus. The exports follow whichever one invoked them.

**CSV is written by hand, and defused.** The whole of RFC 4180 that matters is
"quote a field containing a delimiter, a quote or a newline, and double the
quotes inside" — thirty lines against `papaparse`'s 7.03 KB, half the
headroom. Three details are not obvious and each is a real failure otherwise:
a UTF-8 BOM, without which Excel reads the bytes as its local codepage and
every accented name comes back as mojibake; a leading apostrophe on any value
starting `=`, `+`, `-` or `@`, which Excel would otherwise evaluate as a
formula on open; and `\r\n` between records, which is what the RFC specifies.

**The aggregate export is long format with untranslated keys.** One row per
bucket (`section, key, value`) rather than one wide row, because the bucket
count changes with the corpus — one row per active day — and a wide shape
would change its column count between exports and stop being joinable against
the previous one. The keys are the internal names for the same reason a
locale-dependent column cannot be joined against anything.

## The metric bars borrow the pickers' palette (amends the entry above)

The bars shipped in one flat grey. Reusing `STATUS_COLORS`, `TYPE_COLORS` and
`PRIORITY_COLORS` — the same maps the status, type and priority pickers read —
means a chip and its bar are recognisably the same thing, and nothing new had
to be chosen or documented: `in_review` is `#2E90FA` in both places because it
is one constant.

This does not weaken the accessibility rule the entry above records. Colour
here is reinforcement, not the signal: the row already states its label on one
side of the bar and its count on the other, so a reader who cannot separate the
hues loses nothing (WCAG 1.4.1). The flat grey satisfied the rule too — it was
simply saying less than it could.

The `unset` bucket needed a decision of its own. The pickers paint an unset dot
`transparent`, which is right for a dot standing in for "no value chosen"; a
bar is not, because it still has a count to draw and a transparent one would
read as zero. It takes the neutral the bars used before they were coloured at
all, which also keeps it visibly outside the palette.

## One identity, one spelling (amends the two entries above)

`authorId` landed in four places — on a comment, on a reply, in every audit
entry's `actor.id`, and as the key a reaction is stored under — and each of
them normalised it its own way. The comment and the reply kept it verbatim,
the audit log trimmed it and cut it at 64 characters, and the reaction key
took it raw. One padded id therefore arrived in three different spellings
inside a single payload, and an id longer than 64 characters arrived in two.

That is only invisible while nobody reconciles. A host joining its own records
against any two of those fields gets orphans, and a composite tenant key or a
JWT `sub` runs past 64 characters without trying.

All four now go through `normalizeActorId` in `id.js`, beside `sameId` for the
same reason: identity questions get answered in one place or they get answered
differently. It **trims but never truncates**, and the 64-character cap stays
on the display name alone. The asymmetry is the point — a clipped name is
ugly, a clipped id is wrong in silence, because two ids sharing a prefix
collapse into one person, and the id is the only field anything can be
reconciled on. What it means and how long it is belongs to the host.

**The docs said something narrower than the design.** They described the id as
what a host "correlates against its own user table", which reads as though an
application user table were where it belongs. It is not: the id is opaque, and
the display name is denormalised into every comment and every audit entry on
purpose — so a database holding nothing but comments renders the whole trail
with no lookup back into the host at all. That case is first class, not a
workaround. What the denormalisation costs is that a rename does not travel
backwards; for an audit trail that is correct, and the id is the hinge for
reconciling when you want the current name.

**A HellDots-minted anonymous id was considered and deferred.** With no `id`
from the host, two people sharing a display name collapse into one author —
a real gap, and nanoid is already bundled, so it would cost no bytes. It is
deferred on what it would be rather than what it would cost. To be stable
across page loads it has to be persisted, which makes it a browser-profile
identifier wearing the name of a user id: one person on two machines becomes
two, a shared machine becomes one, and "activity by actor" quietly starts
counting browsers. It would also be a persistent tracking identifier minted
without the integrator asking, and it would force a `localStorage` write in
`persistence: "none"` — the mode whose whole promise is that HellDots writes
nothing locally. Minting one per comment instead is worse than `null`: it
looks like an identity, is not one, and would count a single person's two
reactions as two people.

If it is ever built it should be opt-in, so the integrator accepts what it
identifies. Until then the host mints its own in three lines and keeps control
of the key, the lifetime and the consent story — documented in the README.

## The GitHub release is opened by the workflow, from the changelog

Pushing a `v*` tag already published to npm; the release page was then created
by hand, which is how `v0.4.0` and `v0.5.0` got theirs. One step now does it,
and three things about it were choices.

**The notes come from `CHANGELOG.md`, not from `--generate-notes`.** GitHub can
synthesise notes from the commits in the range, which here would be 27 commit
subjects — the internal shape of the work, not what changed for someone
installing the package. The changelog section is the text the changesets were
written to produce, and it is already the text on npm; using anything else
would mean the two pages describing one release disagree.

**The section is found by prefix, and ends at the next heading.** changesets
writes `## 0.6.0`; entries cut by hand before it carry a date
(`## 0.4.0 — 2026-08-12`). Matching the prefix covers both, and stopping at the
next `## ` avoids having to name the successor version — which the release
being cut cannot know. An empty result fails the step rather than opening a
release with blank notes.

**It runs after `npm publish`, not before.** The publish is the irreversible
half: a version number can never be reused. Failing after it leaves a
published package with no release page, which is visible and fixable in a
minute. Failing before it would leave a release page announcing something that
never shipped.

What this costs: the job's `contents` permission goes from `read` to `write`.
That is the minimum for opening a release, and the token is the ephemeral
`GITHUB_TOKEN` rather than a stored credential.

## Every change says who caused it, and what moved

Ten callbacks and the `onChange` stream reported _that_ something happened.
Building a realistic integration against them — a multi-user app with a
backend, SPA routing and shared links — surfaced three things they could not
say, and all three were load-bearing.

### Provenance: `origin`, not a flag every host reinvents

The inbox and the thread popover drive the very same public methods a host
does (`this.setCommentStatus(...)` behind an adapter object). So a host
applying a change that arrived over a socket calls the method, the method
emits, and the host sends its own write straight back to the server. Every
multi-user integration had to wrap its writes in an `applying` flag and
early-return on it — boilerplate the library was in a far better position to
provide.

`ChangeMeta.origin` is that flag: `"user"` for the widget's own UI, `"host"`
for anything else. **Additive on purpose.** It arrives as one trailing
argument on the specific callbacks and flattened onto the `onChange` event, so
an existing handler that ignores it is unaffected — which is the same promise
"the nine callbacks are kept, not deprecated" made.

Considered and rejected: a `{ silent: true }` option on each setter. It
multiplies every signature, and it makes `onChange` lie by omission — the
event simply never happens, so a host that wanted to log it locally cannot.

**How the two are told apart is structural, not a guess.** `_asUser` flips a
field for the duration of a synchronous call, and `_userActions` wraps a whole
adapter object at once, so the inbox and the popover are stamped at their one
construction site rather than at each of their ~20 actions. A new action added
to either panel inherits the stamp without anyone remembering to add it. The
helper restores the _previous_ value rather than resetting to `"host"`,
because these adapters reach public methods that reach others.

The limitation it accepts: `_asUser` is a synchronous scope. An adapter action
that grew an `await` before the mutation would leak its origin to whatever ran
in between. None do today, and the comment box — the one user-originated path
that is async — stamps its own emit directly instead of going through the
helper.

This also generalises `clearComments()`, which has always been silent on the
grounds that "the host initiated it and would only hear its own action echoed
back". That was the right instinct applied to one method; `origin` is it
applied to all of them.

### What moved: the transition was already computed and thrown away

`setCommentStatus` computes `previous` and records it in the audit trail, then
emits the serialized comment and nothing else. `setCommentType` and its two
siblings do the same with `{field, from, to}`. A host wanting to notify
"reopened" rather than "resolved", or "priority raised to high", had to diff
against its own previous copy of a record the widget had just diffed itself.

So `comment:status-changed` now carries `from`/`to`, and `comment:updated`
carries `field` as well — discriminated, so TypeScript narrows `from` and `to`
with it. Tags have no two-value transition in the _audit trail_ (a list has no
two ends worth logging), but the callback carries both arrays anyway: a host
asking "which label was added" is a different question from "what does the
timeline render".

Deliberately **not** split into `onTypeChanged` / `onPriorityChanged` /
`onTagsChanged`. That is the problem `onChange` was introduced to solve,
approached from the other end.

### The three setters get the no-op guard `setCommentStatus` always had

`setCommentType(id, sameType)` wrote to storage, refreshed the inbox and
emitted `comment:updated` for a change that did not happen — while
`setCommentStatus` had guarded against exactly that since RF5, to avoid
re-stamping `resolvedAt`. Two siblings, two behaviours, and the divergent one
was the one that mattered most under `origin`: applying a remote value that
already matches local state is the single most common thing a socket handler
does.

## A link can now ask for the comment it points at

`_openPendingDetail` already did the hard half: it keeps the pending id and
retries after every load, so a link works even when the host's fetch lands
800 ms after startup. What it could not do was tell the host _which_ id it was
waiting for.

That made "load only the comment in the link" — the reason to send someone a
link into a corpus too large to ship per page — the one flow that could not be
written. The host's only route was re-parsing the query string with its own
copy of `linkParam`: a second spelling of one setting, free to drift from the
one the widget honours.

`onCommentRequested(id)` closes it, and `DEFAULT_LINK_PARAM` /
`readCommentLinkParam` are exported for the case that happens _before_ an
overlay exists (fetch the one comment, then construct). Both are covered by
`typecheck/consistency-check.ts` now — they are public API and get the same
drift gate as the class.

Two calls worth naming:

- **Asked once per id, not once per attempt.** `_openPendingDetail` runs after
  every load and every navigation. An id the host cannot produce would
  otherwise be a request loop.
- **A returned promise is awaited and the link retried, on rejection too.**
  The comment may have arrived by another route while the fetch was failing,
  and the already-asked guard makes the retry cheap.

## Loading before the widget mounted held instead of throwing

`loadComments()` called while `document.readyState === "loading"` threw
`TypeError: Cannot read properties of null (reading 'remove')` out of a marker
engine that `initOverlay` had not built yet. Reachable from the plain
`<script>` path the README advertises, whenever a cached fetch resolves before
`DOMContentLoaded`.

The obvious fix — null-guard the marker calls and let the load proceed — is
wrong. Anchors would resolve against a half-parsed DOM, so comments whose
elements simply had not been reached yet would be filed as orphans and fire
`onAnchorLost` for each. A false orphan is worse than a crash: it is silent.

So the data is held and replayed by `initOverlay`, after the localStorage
restore, so explicit data still wins by id over anything cached.

**What this costs, stated in the type:** the counts come back as
`{0, 0, 0}` because nothing has been resolved yet. `onReady` exists partly for
this — load from there and the numbers mean something. It hands over the
instance because with the document already parsed the mount happens _inside_
the constructor, before `createCommentOverlay()` has returned anything to
assign.

`notifyNavigation()` early-returns before mount for the same reason, and the
two paths that could still be reached with no marker engine (`_removeComment`,
`clearComments`) took an optional call rather than a guard clause.

## `onError` reports what the console already knew

Four failures were survivable, warned about, and invisible to the host: a
screenshot that did not render, a localStorage write that could not be made, a
malformed record skipped on load, and now a rejected `onCommentRequested`.

For a feedback widget the first is the worst of them — the screenshot is a
large part of what the tool is for, and CSP or a tainted canvas breaks it
silently, per-user, in production. The fourth is where the host's own fetch
failed and only the widget knows.

The console warnings **stay**. A host without a handler must not lose the
diagnostic, and a host with one is nearly always logging rather than
replacing. `onError` is isolated in try/catch like every other subscriber, for
the same reason: a bad handler must not take down the operation that reported
to it.

## The state the widget owned and never reported

Three of the four gaps below are the same shape: something the widget knew,
the host needed, and no method could ask for.

### Comment mode, because the host cannot see the shortcut

An app often has to stand down while somebody is picking an element — pause a
carousel, disable its own drag-and-drop, stop a poller that re-renders the
DOM under the marker. `overlay.commentMode` was readable, and
`toggleCommentMode()` was callable, so the state was _reachable_; what was
missing was being told when it moved.

Polling a boolean is the workaround, and the reason it is not good enough is
the keyboard shortcut: `Alt+C` is handled on `document` by the widget and
never surfaces to the host at all. `onCommentModeChanged(active)` fires from
`toggleCommentMode()` itself, so every path reports — button, shortcut, the
inbox empty state, and the automatic switch-off after a save.

No no-op guard, because there is no no-op: the method always flips.

### Thread opens, because unread counts are table stakes

`onCommentOpened(comment)` fires from the two places a thread is actually
readable — the marker's popover and the inbox detail. Not from `render()` or
`refresh()`, which read `detailId` rather than going through `_openDetail`, so
a count built on this does not tick over every time a filter changes.

**The widget stores no read state itself.** It could: a set of ids in
localStorage would "work". But whose read state it is depends on an identity
HellDots does not authenticate and does not persist, and a per-browser set
that silently means "whoever last used this laptop" is worse than no feature.
The event is the honest half; the host owns the rest.

It fires for a comment the user just created, too. That is a real open — they
are looking at the thread — and the alternative is a special case that makes
"opened" mean something subtler than the word does.

### `setUser`, because identity usually arrives after the widget

`user` was read from `this.options` at every save, so the value was already
late-bound; there was simply no supported way to change it, since `options` is
not public. The workaround was `cleanup()` and a rebuild, which throws away
every loaded comment and whatever panel was open — for a session that resolved
200 ms after mount, which is the ordinary case, not an edge one.

Two calls:

- **Nothing already written is rewritten.** This changes who is acting now.
  A comment keeps the author it was created with, which is the same promise
  the audit trail makes.
- **The open thread popover is closed rather than re-rendered.** Both panels
  read the actor through a function, so the inbox refreshes in place and picks
  up which reactions are now "yours". The popover could too, but it may be
  mid-edit with a draft in it — and a draft written as Ana, silently
  reattributed to Bruno on submit, is the wrong outcome. Closing is the
  conservative half of an operation the host initiated deliberately.

`null` returns to the anonymous author, and anything that is not an object
with a non-blank `name` is refused with `false` — the same contract the other
setters have.

### The CSV exporters return what they downloaded

`exportCommentsCsv()` triggered a browser download and returned `undefined`. A
host wanting to POST the same rows to its own endpoint, or attach them to a
message, had no way to get at them: `csv.js` has pure builders, but they are
internal, so the only route was reimplementing the row mapping.

Returning the string is additive — the download still happens, and a caller
ignoring the return value sees no change. `printMetricsReport()` deliberately
stays `void`: what it produces is a print dialog, not a value.
