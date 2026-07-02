# Serializable Comment Anchoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Comments get a JSON-serializable anchor (cascading CSS selector + content fingerprint + relative coordinates) so the host app can persist them and restore them after a reload, with orphan detection instead of silent mis-anchoring.

**Architecture:** New pure module `src/anchor.js` (createAnchor / resolveAnchor). `CommentOverlay` captures the anchor at creation, exposes `serializeComments()` / `loadComments()` plus `onCommentCreated` / `onReplyAdded` / `onAnchorLost` callbacks, and gains a minimal Inbox panel that lists comments and flags orphans. Spec: `docs/superpowers/specs/2026-07-02-comment-anchoring-design.md`.

**Tech Stack:** Vanilla ES modules, Vitest + jsdom, checkJs typecheck, esbuild.

## Global Constraints

- ESM bundle budget: ≤ 50 KB gzip (`npm run size` audits `dist/helldots.esm.js`). No new dependencies.
- All UI strings go through `src/locales/en.js` + `es.js` (i18n, Tarea 9).
- Gates must pass: `npm run lint && npm run typecheck && npm test && npm run build && npm run size`.
- Screenshots are excluded from serialization (spec decision).
- A selector match is NEVER accepted without fingerprint verification.
- Thresholds: selector path ≥ 0.6, rescue path ≥ 0.7. Weights: text 0.5, attributes 0.3, sibling position 0.2 (redistribute per spec when a signal is missing).

---

### Task 1: `createAnchor` — selector cascade + fingerprint

**Files:**
- Create: `src/anchor.js`
- Test: `test/anchor.test.js`

**Interfaces:**
- Produces: `createAnchor(element: HTMLElement, relativeX: number, relativeY: number): CommentAnchor` where `CommentAnchor = { version: 1, selector: string|null, fingerprint: { tagName, textSnippet, attributes, siblingIndex, siblingCount }, relativeX, relativeY }`.

- [ ] **Step 1: Write failing tests** for the selector cascade (unique id → stable attribute → stable-class path → nth-of-type path → null), the generated-class filter, and fingerprint capture. Test cases (jsdom, `document.body.innerHTML` fixtures):
  - element with unique id → `#hero` (and CSS.escape'd ids work)
  - no id, `data-testid="cta"` → `button[data-testid="cta"]`
  - stable classes only → `section.pricing` (unique) or ancestor path `div.plans > section.card` up to 3 levels
  - CSS-in-JS classes (`css-1x2y3z`, `sc-bdVaJa`, `jsx-3812093`) are filtered out → falls to nth-of-type
  - no usable hooks → `body > div:nth-of-type(2) > p:nth-of-type(1)` (rooted at nearest ancestor with id or body, ≤ 5 levels)
  - two identical siblings where nothing disambiguates within 5 levels → `selector: null`
  - `document.body` itself → `"body"`
  - fingerprint always captured: tagName, ≤64-char normalized textSnippet, stable attributes only (drops `data-reactid`, `data-v-*`, hash-valued attrs kept as-is but generated class names irrelevant here), 0-based siblingIndex + siblingCount among same-tag siblings
  - `relativeX/relativeY` passed through, `version: 1`, result survives `JSON.parse(JSON.stringify(...))`
- [ ] **Step 2: Run tests, verify they fail** (`npx vitest run test/anchor.test.js` → module not found)
- [ ] **Step 3: Implement** `createAnchor` in `src/anchor.js` with helpers `isStableClass`, `stableAttributes`, `normalizeText`, `siblingPosition`, `escapeCss` (CSS.escape with fallback), `isUnique(selector, doc)` (try/catch → false)
- [ ] **Step 4: Run tests, verify pass**
- [ ] **Step 5: Commit** `feat(anchor): serializable anchor creation with cascading selector + fingerprint`

### Task 2: `resolveAnchor` — verification, rescue, orphan

**Files:**
- Modify: `src/anchor.js`
- Test: `test/anchor.test.js`

**Interfaces:**
- Produces: `resolveAnchor(anchor: CommentAnchor, doc = document): { element: HTMLElement, confidence: number } | null`.

- [ ] **Step 1: Write failing tests**:
  - selector resolves + fingerprint matches → element returned, confidence ≥ 0.6
  - selector resolves to a *different* element (same selector, different text content) → rejected → rescue or null (acceptance criterion #5)
  - selector broken (classes renamed) but same content elsewhere → rescue by fingerprint finds it, confidence ≥ 0.7 (criterion #3)
  - element deleted → null (criterion #4)
  - fingerprint with no text and no attributes (degenerate) → resolvable only via selector + exact sibling position; rescue skipped
  - malformed/invalid selector string → no throw, falls through to rescue
  - `anchor` null / missing fingerprint → null
  - weight redistribution: fingerprint without attributes still reaches 1.0 on exact text+position
- [ ] **Step 2: Run tests, verify fail**
- [ ] **Step 3: Implement** `resolveAnchor` + `scoreElement` (tag mismatch → 0; textSimilarity: exact=1, prefix=0.8, else Dice over tokens; attribute fraction; sibling position `1 - Δindex / max(counts)`)
- [ ] **Step 4: Run tests, verify pass**
- [ ] **Step 5: Commit** `feat(anchor): anchor resolution with fingerprint verification and rescue search`

### Task 3: Overlay integration — capture, serialize, callbacks

**Files:**
- Modify: `src/overlay.js` (`_placeCommentAtPoint`, `saveComment`, `addReply`; new `serializeComments`, `_serializeComment`)
- Test: `test/persistence.test.js` (new)

**Interfaces:**
- Consumes: `createAnchor` from Task 1.
- Produces: `overlay.serializeComments(): SerializedComment[]`; options callbacks `onCommentCreated(sc)`, `onReplyAdded(sc, reply)`; in-memory comment gains `anchor` and `anchorState: "anchored"`.

- [ ] **Step 1: Write failing tests** (reuse patterns from `test/overlay.test.js`: mock html2canvas, `document.elementFromPoint = () => null` or a fixture element, drive via `_placeCommentAtPoint` + `commentInput.value` + `saveComment()`):
  - saving a comment attaches `anchor` (selector/fingerprint/relative coords) and `anchorState: "anchored"`
  - `onCommentCreated` fires with a serialized comment (no `container`, no `screenshots`, JSON-round-trippable)
  - `addReply` fires `onReplyAdded(serializedComment, reply)`
  - `serializeComments()` returns all comments serialized
- [ ] **Step 2: Run, verify fail**
- [ ] **Step 3: Implement** (anchor captured in `_placeCommentAtPoint` into `currentPosition`; `saveComment` attaches + fires callback; replies serialized as `{id,text,author,timestamp}`)
- [ ] **Step 4: Run, verify pass** (plus full `npm test` for regressions)
- [ ] **Step 5: Commit** `feat(persistence): capture anchors at creation and expose serialization + callbacks`

### Task 4: `loadComments` — restore, orphans, `onAnchorLost`

**Files:**
- Modify: `src/overlay.js`
- Test: `test/persistence.test.js`

**Interfaces:**
- Consumes: `resolveAnchor` (Task 2), `serializeComments` (Task 3).
- Produces: `overlay.loadComments(data): { anchored: number, orphaned: number }`; orphans stay in `this.comments` with `anchorState: "orphaned"`, `container: null`, no circle.

- [ ] **Step 1: Write failing tests**:
  - round-trip: create → `serializeComments()` → `cleanup()` → new overlay on identical DOM → `loadComments()` re-renders circles at same relative position (criterion #2)
  - broken selector + intact content → re-anchored via rescue (criterion #3)
  - element removed → orphaned: no circle, `onAnchorLost` fired, counted in return value (criterion #4)
  - idempotence: loading the same id twice doesn't duplicate circles/comments
  - malformed entries (no anchor → orphan if id+text present; garbage → skipped with console.warn, no throw)
- [ ] **Step 2: Run, verify fail**
- [ ] **Step 3: Implement** `loadComments` + `_removeComment(id)` (removes circle, disconnects observers via existing `cleanupResizeObserver` + mutationObservers map, splices `this.comments`)
- [ ] **Step 4: Run, verify pass** (full `npm test`)
- [ ] **Step 5: Commit** `feat(persistence): restore serialized comments with orphan detection`

### Task 5: Minimal Inbox panel

**Files:**
- Modify: `src/constants.js` (CLASSES: `INBOX_PANEL`, `INBOX_ITEM`, `INBOX_ITEM_TEXT`, `INBOX_ORPHAN_BADGE`, `INBOX_EMPTY`), `src/components.js` (`createInboxPanel(comments, strings, locale)`), `src/styles.js` (panel styles near toolbar), `src/locales/en.js` + `es.js` (`inboxAriaLabel`, `inboxEmpty`, `orphanedBadge`), `src/overlay.js` (toggle on `TOOLBAR_MENU_BTN` click, item click → scroll+popover for anchored / centered popover for orphaned, Escape + outside-click close, cleanup)
- Test: `test/persistence.test.js` (or `test/overlay.test.js`)

**Interfaces:**
- Consumes: `comment.anchorState` (Tasks 3-4), `showThreadPopover` (modified to accept `circle = null` → centered positioning).

- [ ] **Step 1: Write failing tests**:
  - clicking Inbox opens a panel listing every comment (text, author) inside the shadow root
  - orphaned comments show the orphan badge (i18n: "Unanchored"/"Desanclado"); anchored ones don't
  - empty state string when no comments
  - clicking an orphaned item opens its thread popover (centered — no circle)
  - Escape closes the panel; toggling the button closes it
- [ ] **Step 2: Run, verify fail**
- [ ] **Step 3: Implement** (panel re-rendered on each open from `this.comments`; `showThreadPopover(null, comment)` centers via viewport when `circle` is null and skips circle-based outside-click check)
- [ ] **Step 4: Run, verify pass** (full `npm test`)
- [ ] **Step 5: Commit** `feat(inbox): minimal inbox panel with orphaned-comment badges`

### Task 6: Types, consistency check, gates, docs

**Files:**
- Modify: `src/index.d.ts` (new `CommentAnchor`, `CommentAnchorFingerprint`, `SerializedComment`, `AnchorState`; extend `CommentOverlayOptions` with the 3 callbacks; extend `Comment` with `anchor`, `anchorState`, `container: HTMLElement | null`; extend `CommentOverlay` with `serializeComments`, `loadComments`), `typecheck/consistency-check.ts`, `DECISIONS.md` (new section documenting anchor format decisions), `.changeset/` (new changeset, minor)
- Test: existing gates

- [ ] **Step 1: Update `src/index.d.ts`** with the exact spec types
- [ ] **Step 2: Update `typecheck/consistency-check.ts`** so the new public methods/options are asserted against the implementation
- [ ] **Step 3: Run all gates**: `npm run lint && npm run typecheck && npm test && npm run build && npm run size` — all must pass, size ≤ 50 KB gzip
- [ ] **Step 4: Document decisions** in `DECISIONS.md` (no XPath — why; thresholds; screenshots excluded from v1 serialization; inbox minimal scope) and add a changeset
- [ ] **Step 5: Commit** `feat(types): serializable anchoring public API types + docs`

## Verification against acceptance criteria

Each criterion from the spec maps to: #1 → Task 1/3 tests, #2 → Task 4 round-trip test, #3 → Task 2 & 4 rescue tests, #4 → Task 4/5 orphan tests, #5 → Task 2 rejection test, #6 → Task 3/4 callback tests, #7 → Task 6 gates.
