# Changelog

## 0.4.0 — 2026-08-12

### Upgrading from 0.3.0: locale keys

**Only affects hosts that pass a custom `strings` object.** Everyone else can
skip this section — the bundled `en` and `es` locales are complete.

The entries below each describe the keys their own change touched, but the
work landed across several releases' worth of changesets, so here is the whole
delta in one place. Six keys are gone and thirty-one are new; a `strings`
object built for 0.3.0 will render empty labels for anything it does not
supply.

Removed — safe to delete:

`inboxEmpty`, `filterUnresolved`, `filterResolved`, `filterStatusAll`,
`removeTag`, `tagsPlaceholder`

Added — copy the values from `src/locales/en.js`:

- Empty state and filters: `inboxEmptyTitle`, `inboxEmptyHintTemplate`,
  `inboxEmptyAction`, `inboxNoMatches`, `filterTitle`, `filterClear`
- Threads and replies: `replyCountOne`, `replyCountTemplate`, `replyOptions`,
  `deleteReply`
- Delete confirmation: `confirmDelete`, `confirmCancel`,
  `confirmDeleteCommentTitle`, `confirmDeleteCommentMessage`,
  `confirmDeleteThreadMessage`, `confirmDeleteReplyTitle`,
  `confirmDeleteReplyMessage`
- Copy link and editing: `copyLink`, `linkCopied`, `editComment`, `editReply`,
  `editorAriaLabel`, `editSave`, `editCancel`, `editedMark`, `editedAtPrefix`,
  `confirmDiscardTitle`, `confirmDiscardMessage`, `confirmDiscard`,
  `confirmKeepEditing`, `commentNotFound`

### Minor Changes

- bdfff0a: Stop inbox cards stating the same thing twice, and give the hover preview a
  sense of the thread behind it.

  - The hover tooltip now says how many replies a thread has, when it has any.
    Threads with no replies are unchanged.
  - The status picker carries its label like type and priority already did, so
    the current status is readable without hovering — which touch never allows.
  - Those labels are no longer capped at 72px, so "In progress" and
    "Improvement" show in full. The strip wraps to a second line in the one
    combination that no longer fits a narrow card.
  - Inbox cards no longer repeat type and priority as badges when the action
    strip above already states them. Tags and the resolution time still show —
    nothing else displays those.
  - The action strip sits directly under the author now, the same place the
    thread popover puts it, instead of in a card footer.

- 66f12bd: Ask before deleting anything.

  Deleting a comment or a reply was a single click on a menu item, and there is
  no trash and no undo to recover from it. Both now open a confirmation modal
  first, from every place they can be reached: the inbox cards, the inbox
  detail and the thread popover.

  - The warning names what goes: deleting a comment that has replies says the
    replies go with it.
  - Cancel takes focus, so the destructive button is never one stray Enter
    away. Escape and a click on the backdrop both cancel, and neither reaches
    the panel behind the dialog.
  - Seven new locale keys (`confirmDelete`, `confirmCancel`,
    `confirmDeleteCommentTitle`, `confirmDeleteCommentMessage`,
    `confirmDeleteThreadMessage`, `confirmDeleteReplyTitle`,
    `confirmDeleteReplyMessage`). Hosts passing a custom `strings` object need
    to add them.

- eb1365d: Add "Copy link" and "Edit" to the ⋯ menu, for comments and for replies.

  **Copy link** copies `<page>?helldotsComment=<id>`. Opening it anywhere the
  comments are available opens the inbox on that comment's thread. There is no
  redirect hop: the page a comment lives on is recorded on the comment, so the
  link points straight at its destination.

  - The parameter stays in the URL, so the link can be reloaded or re-copied.
  - The id is remembered and retried after every `loadComments()`, so a link
    works for hosts that fetch their comments from their own back end.
  - A link to a comment this page cannot show opens the inbox with a notice
    rather than doing nothing.
  - Under `persistence: "localStorage"` a link only works in the same browser —
    there is no server to share through.

  **Edit** replaces the body with an inline editor, in the thread popover and
  in the inbox. The draft is held as panel state, so it survives everything
  that re-renders the panel — changing a comment's status, priority or type, or
  deleting a reply, no longer discards what you were typing. Cancel, Escape,
  opening another editor, closing the panel and navigating between comments all
  ask before dropping unsaved text; a click on the page leaves the panel open
  instead of asking. Edited items carry a text "edited" mark with the exact
  time on hover.

  New API: `editComment(id, text)`, `editReply(commentId, replyId, text)`,
  `commentLink(id)`, the `linkParam` option, and the `onCommentEdited` /
  `onReplyEdited` callbacks. `SerializedComment` and `CommentReply` gained an
  optional `editedAt`.

  Fourteen new locale keys (`copyLink`, `linkCopied`, `editComment`,
  `editReply`, `editorAriaLabel`, `editSave`, `editCancel`, `editedMark`,
  `editedAtPrefix`, `confirmDiscardTitle`, `confirmDiscardMessage`,
  `confirmDiscard`, `confirmKeepEditing`, `commentNotFound`). Hosts passing a
  custom `strings` object need to add them.

- 6b3efb2: Rework the inbox's empty state. Instead of a single line of grey text it now
  shows the marker's outline, the comment shortcut spelled the way the user's
  platform spells it (⌥ on Apple, Alt elsewhere — the same string the toolbar
  tooltip shows), and a button that turns comment mode on.

  An inbox whose filters happen to match nothing is treated as a different
  state: it names that cause and offers Clear, rather than teaching a shortcut
  to someone who already has comments.

  Turning comment mode on now closes the inbox, so the panel stops covering the
  page the user is being asked to click on. This applies to the keyboard
  shortcut and the new button; turning the mode off leaves an open inbox alone.

  The `inboxEmpty` string is replaced by `inboxEmptyTitle`,
  `inboxEmptyHintTemplate`, `inboxEmptyAction` and `inboxNoMatches`. Only
  consumers passing a custom `strings` object are affected.

- 9105193: Give comments and replies collision-free ids.

  Ids were `Date.now()`, so anything created inside the same millisecond shared
  one. That is not a cosmetic problem: `mergeForStorage` deduplicates by id and
  every lookup returns the first match, so a collision silently overwrites a
  comment instead of failing. A programmatic import, or two people commenting
  from different machines into a shared back end, is enough to trigger it.

  New ids are 21-character nanoid strings — URL-safe, so they can travel in a
  link, and generated from `crypto.getRandomValues`, which works outside secure
  contexts.

  - `CommentId` is `string | number`. Comments already stored with numeric ids
    keep resolving, and `deleteComment(123)` still typechecks. Hosts that read
    `comment.id` into a variable typed `number` need to widen it.
  - nanoid is bundled into both artifacts rather than added as a runtime
    dependency, so the package still installs on Node 18 and gains no new
    dependencies. It costs ~130 B gzip.

- e2d90cf: Overlay UI pass: card density, chip filters, richer tooltip and mobile fixes

  - The per-comment action strip moved out of the header and onto its own row —
    a footer on inbox cards (shared with the reply link) and a row under the
    header in the thread popover. The author no longer wraps onto two lines in
    the inbox or truncates mid-name in the popover.
  - The inbox filter is now a chip panel: page, status, type and priority are
    all visible at once, with a clear button. Status, type and priority chips
    toggle off to clear their group.
  - The status filter takes the real lifecycle values (`open`, `in_progress`,
    `resolved`) instead of `unresolved`/`resolved`, so `in_progress` is
    filterable. A comment with no stored status still matches `open`.
  - The hover tooltip now summarises status, type, priority, tags and
    resolution time as badges instead of showing only the author and the text.
  - The marker whose thread is open is visibly marked as active, and clicking
    it again closes the thread — it works as a toggle. Clicking a different
    marker still switches threads.
  - The automatic context capture is reachable from the thread popover as a
    collapsed disclosure, not only from the inbox detail.
  - The comment box's classification row lines up with the textarea, and its
    type/priority controls are outlined.
  - The tags input was removed from the comment box. The `tags` field,
    `setCommentTags()` and the rendering of existing tags are unchanged.
  - The comment box, tooltip and thread popover are now
    `min(400px, calc(100vw - 24px))` wide and clamp to the viewport, fixing the
    horizontal overflow when creating or opening a comment on a phone.
  - The thread popover follows its marker while the page scrolls instead of
    staying fixed on screen, and hides while the marker is off-screen — coming
    back, with any half-typed reply intact, as soon as the marker returns.
  - The thread popover no longer grows past the viewport. Its body, context
    block and replies scroll inside it while the header, the action strip and
    the reply box stay pinned, so a long thread or an expanded context block is
    actually reachable.

- 453b71b: Make long threads usable: a scrollbar that matches the panel, a popover that
  grows the right way, and a way to remove a single reply.

  - Scrollbars in the thread popover, the hover preview and both inbox panes
    are now dark. They were rendering as the light platform default, because
    Chromium ignores `::-webkit-scrollbar-*` rules on any element that also
    sets `scrollbar-width`.
  - A thread popover that no longer fits below its marker anchors to the bottom
    of the viewport, so new replies extend it upward instead of pushing the
    reply box off screen. It goes back to sitting beside the marker as soon as
    it fits again.
  - Sending a reply scrolls the thread to it, rather than leaving it below the
    fold.
  - Each reply carries the same ⋯ menu as its comment, with a "Delete reply"
    option. Available in the thread popover and in the inbox detail view.
  - New `deleteReply(commentId, replyId)` method and matching `onReplyDeleted`
    callback, so hosts that persist comments themselves can mirror the change.

### Patch Changes

- 6e42c32: Stop comment anchors from capturing HellDots' own `comment-cursor` class.
  That class is on `<body>` only while comment mode is active — exactly when
  anchors are created — so a comment anchored on `<body>` was stored as
  `body.comment-cursor` and its selector stopped matching as soon as the mode
  ended, forcing every reload through the fuzzy fingerprint rescue path.
  Anchors now store a plain `body`. Existing comments are unaffected: they keep
  resolving through the rescue path as they already did.
- f0d62b1: Fix the comment-mode cursor reverting to the default arrow near the edges of
  the page. The image was 48x48, and Chromium drops custom cursors larger than
  32x32 device-independent pixels once they can intersect native browser UI.
  The canvas is now 32x32 with the artwork unchanged at 28px, so the cursor
  looks identical and keeps its shape all the way to the edge. The blue drop
  shadow is gone — it needed more margin than the smaller canvas allows; the
  white outline that carries contrast is unchanged.
- 6e42c32: Mark the on-page marker as active while its comment's detail is open in the
  inbox, matching what already happens when the thread is opened from the
  marker itself. Going back to the list, navigating to another comment, or
  closing the inbox moves or clears the state. Comments with no marker on the
  page — resolved, orphaned or hidden — are unaffected.
- 6e42c32: Fix opening a comment from the inbox scrolling to an unrelated part of the
  page. The scroll targeted the comment's anchor container, which falls back to
  `<body>` whenever the commented element has no `section`/container ancestor —
  centring `<body>` lands halfway down the document. It now scrolls to the
  marker's own position, derived from the anchor so it is correct even when the
  marker's rendered coordinates have not been refreshed yet.
- 6504703: Fix two overlay dismissal bugs

  - Opening a screenshot in the lightbox no longer tears down the surface
    behind it. The lightbox is mounted as a sibling of the inbox and the thread
    popover, so their "the click landed outside me, close" rule used to read
    every click on it — its own close button included — as a click away, and
    closed the panel underneath.
  - The status, type and priority pickers (and the ⋯ menu, and the inbox
    filter) now follow a single-open rule: opening one closes the others,
    instead of leaving three menus stacked on top of each other in the thread
    popover. Any click outside the open menu closes it too, and the toggles
    report `aria-expanded`.

## 0.3.0 — 2026-07-30

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
