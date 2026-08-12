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
