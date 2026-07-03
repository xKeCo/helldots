# Inbox Sidebar + localStorage Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** localStorage persistence option, runtime "hidden" marker state, right-side inbox sidebar (filter, cards with copy-agent-context/delete, thread detail view), `user` option, playground modal, end-to-end browser verification.

**Architecture:** New focused modules — `src/storage.js` (localStorage adapter), `src/agent-context.js` (copy template), `src/inbox.js` (`InboxView` class rendering list/detail inside the shadow root) — orchestrated by `src/overlay.js`. The previous bottom-center inbox panel is replaced. Spec: `docs/superpowers/specs/2026-07-03-inbox-sidebar-persistence-design.md`.

**Tech Stack:** Vanilla ES modules, Vitest + jsdom, checkJs, esbuild, Playwright MCP for manual verification.

## Global Constraints

- ESM bundle ≤ 50 KB gzip (`npm run size`). No new dependencies.
- All UI strings via `src/locales/en.js` + `es.js`.
- localStorage errors never throw: `console.warn` and continue.
- Gates: `npm run lint && npm run typecheck && npm run format:check && npm test && npm run build && npm run size`.
- Serialization now INCLUDES screenshots (amends v1 spec); `page: string` added to `SerializedComment`.
- `AnchorState` becomes `"anchored" | "orphaned" | "inactive"`; `hidden` is a separate runtime boolean, never serialized.

---

### Task 1: `src/storage.js` — localStorage adapter

**Files:** Create `src/storage.js`; Test `test/storage.test.js`.

**Interfaces produced:**

- `readStoredComments(): SerializedComment[]` — `[]` on missing/corrupt/unavailable storage.
- `writeStoredComments(comments: SerializedComment[]): void` — merges nothing, writes the given array verbatim; warns and no-ops on failure.
- `mergeForStorage(stored: SerializedComment[], current: SerializedComment[], currentPage: string): SerializedComment[]` — pure: keeps stored entries from other pages not present in `current` (by id), replaces/removes same-page ones (memory is the source of truth for the current page), appends `current`.
- `STORAGE_KEY = "helldots-comments"`.

**Steps:** (TDD)

- [ ] Failing tests: read returns [] when key missing / JSON corrupt / localStorage throws (mock `getItem` throwing); write+read round-trip; write warns and survives `setItem` throwing (quota); merge keeps other-page entries, drops same-page entries missing from memory (deleted), replaces same-page by id, appends current.
- [ ] Verify fail → implement → verify pass.
- [ ] Commit `feat(storage): localStorage adapter with cross-page merge`.

### Task 2: Serialization v2 — `page`, screenshots, `user` option

**Files:** Modify `src/overlay.js` (`_serializeComment`, `_serializeReply`, `saveComment`, `addReply`, `loadComments`); Test `test/persistence.test.js`.

**Interfaces produced:**

- `SerializedComment` now `{ id, text, anchor, page, replies, author, createdAt, screenshots }`; replies keep `screenshots` when present.
- New option `user?: { name: string }` — author for comments and replies.
- `loadComments` accepts entries with `page`; restores `comment.page` (defaults to `location.pathname` for legacy data) and `comment.screenshots`.

**Steps:**

- [ ] Failing tests: serialized comment includes `page === location.pathname` and `screenshots` array; reply screenshots survive serialize; `user: { name: "Kevin Collazos" }` becomes author of comments and replies; loadComments restores screenshots and page. Update the two existing tests that assert `screenshots`/`page` are `undefined`.
- [ ] Verify fail → implement → full `npm test` → commit `feat(persistence): serialize page + screenshots, user option`.

### Task 3: `anchorState: "inactive"` — cross-page loading

**Files:** Modify `src/overlay.js` (`loadComments`); Test `test/persistence.test.js`.

**Interfaces produced:** entries whose `page !== location.pathname` get `anchorState: "inactive"`, no circle, no `resolveAnchor` attempt, no `onAnchorLost`; counted in the return as `{ anchored, orphaned, inactive }` (return type gains `inactive: number`).

**Steps:**

- [ ] Failing tests: loading a comment with `page: "/other"` → inactive, no circle, `onAnchorLost` NOT called, `{ anchored: 0, orphaned: 0, inactive: 1 }`; legacy entry without `page` still resolves normally.
- [ ] Verify fail → implement → verify pass → commit `feat(persistence): inactive state for other-page comments`.

### Task 4: `persistence: "localStorage"` wiring + `deleteComment`

**Files:** Modify `src/overlay.js` (constructor/init, `saveComment`, `addReply`, `loadComments`, new `deleteComment`, new `_syncStorage`); Test `test/persistence.test.js`.

**Interfaces produced:**

- Option `persistence?: "localStorage" | "none"` (default `"none"`).
- `_syncStorage()` — when persistence active: `writeStoredComments(mergeForStorage(readStoredComments(), this.serializeComments(), location.pathname))`.
- `deleteComment(id: number): boolean` — `_removeComment(id)` + storage sync + `onCommentDeleted?.(id)`; returns false when id unknown.
- On init with persistence: `loadComments(readStoredComments())` after UI mount.

**Steps:**

- [ ] Failing tests: with persistence on — create → new overlay same DOM → comments auto-restored; reply persists; deleteComment removes circle+memory+storage and fires `onCommentDeleted`; without the option localStorage stays untouched; delete of unknown id returns false.
- [ ] Verify fail → implement → verify pass → commit `feat(persistence): localStorage option and deleteComment`.

### Task 5: Runtime hidden state

**Files:** Modify `src/overlay.js` (`updateCommentPosition`, `validateAndCalculatePosition`); Test `test/persistence.test.js`.

**Interfaces produced:** `comment.hidden: boolean` (runtime only); circle `style.display = "none"` while container rect is 0×0, restored to `""` when it regains size. The old `console.warn` for zero-size containers is removed.

**Steps:**

- [ ] Failing tests: mock container `getBoundingClientRect` → 0×0 → after `updateCommentPosition` circle hidden + `comment.hidden === true`; restore size + update → visible + `hidden === false`; `hidden` absent from `serializeComments()` output.
- [ ] Verify fail → implement → verify pass → commit `feat(overlay): hide markers whose anchor element is not visible`.

### Task 6: `src/agent-context.js` — copy template

**Files:** Create `src/agent-context.js`; Test `test/agent-context.test.js`.

**Interfaces produced:** `buildAgentContext(comment, { viewportWidth, viewportHeight }): string` — plain-text block with `Page:`, `Viewport:`, `Anchor state:` (`hidden` shown when `comment.hidden`, else `anchorState`), `Selector:` (`(none)` fallback), `Element:` (live container opening tag, else reconstructed from fingerprint `<tag id="…" …attrs>`), `DOM path:` (body→element, `tag#id.cls1.cls2` max 2 classes per level; `(unavailable)` when container dead), `Nearby text:`, `Comment by <author> (<createdAt>):` + quoted text, `Replies (n):` + `- author: "text"` lines (omitted when none).

**Steps:**

- [ ] Failing tests: anchored live comment produces every section with real values; orphaned comment → element from fingerprint + `(unavailable)` path; hidden comment → `Anchor state: hidden`; no replies → no `Replies` section.
- [ ] Verify fail → implement → verify pass → commit `feat(agent-context): copyable context template for agents`.

### Task 7: i18n strings + constants for the sidebar

**Files:** Modify `src/constants.js`, `src/locales/en.js`, `src/locales/es.js`.

**Interfaces produced:**

- CLASSES: `INBOX_PANEL`, `INBOX_HEADER`, `INBOX_FILTER`, `INBOX_FILTER_MENU`, `INBOX_FILTER_OPTION`, `INBOX_CLOSE`, `INBOX_LIST`, `INBOX_CARD`, `INBOX_CARD_HEADER`, `INBOX_CARD_ACTIONS`, `INBOX_CARD_TEXT`, `INBOX_CARD_TAG`, `INBOX_CARD_REPLY_LINK`, `INBOX_ACTION_BTN`, `INBOX_STATUS_DOT`, `INBOX_MENU`, `INBOX_MENU_ITEM`, `INBOX_DETAIL`, `INBOX_DETAIL_HEADER`, `INBOX_BACK`, `INBOX_NAV_BTN`, `INBOX_REPLIES`, `INBOX_EMPTY` (keep), remove `INBOX_ITEM`/`INBOX_ITEM_TEXT`/`INBOX_ORPHAN_BADGE` after Task 8 swaps usage.
- Strings (en/es): `filterAll` "All comments"/"Todos los comentarios", `filterCurrentPage` "Current page"/"Página actual", `hiddenBadge` "Hidden"/"Oculto", `back` "Back"/"Volver", `deleteComment` "Delete"/"Eliminar", `copyAgentContext` "Copy agent context"/"Copiar contexto de agente", `copied` "Copied"/"Copiado", `statusLabel` "Status"/"Estado", `prevComment` "Previous comment"/"Comentario anterior", `nextComment` "Next comment"/"Comentario siguiente", `replyLink` "Reply"/"Responder", `commentOptions` "Comment options"/"Opciones del comentario".
- Folded into Task 8's test cycle (no standalone tests). Commit together with Task 8.

### Task 8: `src/inbox.js` — InboxView (list + filter + cards)

**Files:** Create `src/inbox.js`; Modify `src/overlay.js` (replace `showInbox`/`closeInbox` internals with InboxView), `src/styles.js` (replace old inbox styles with sidebar styles per spec layout), `src/components.js` (delete `createInboxPanel`); Test `test/inbox.test.js` (new; migrate/replace the 6 old inbox tests from `test/persistence.test.js`).

**Interfaces produced:**

- `new InboxView({ shadowRoot, strings, locale, currentPage, getComments, callbacks })` where callbacks = `{ onOpenDetailScroll(comment), onReply(comment, text, screenshots), onDelete(id), onCopy(comment), onClose(), onShowLightbox(src) }`.
- Methods: `open()`, `close()`, `isOpen()`, `refresh()`, `el` (root element).
- Filter default `"page"`; `"all"` shows other-page comments with their pathname as tag.
- Card layout per spec (author+time left; copy / status dot / ⋯-menu right; text; screenshots; tags orphaned/hidden/page; Reply link). Click card (or Enter/Space) → detail view.
- Overlay: `toggleInbox()` now delegates; Escape/outside-click behavior preserved; `updateCommentPosition` hidden-state changes call `refresh()` only if open (cheap re-render).

**Steps:**

- [ ] Failing tests: open lists current-page comments only by default; switching filter to all shows other-page comment with pathname tag; orphan shows "Desanclado" (es) tag; hidden shows hidden tag; empty state; copy button calls clipboard with `buildAgentContext` output (mock `navigator.clipboard`); ⋯ menu → Delete calls `overlay.deleteComment` and card disappears; Reply link opens detail; X/Escape/outside-click close.
- [ ] Verify fail → implement (InboxView list rendering + styles + overlay wiring + remove old panel code) → full `npm test` → commit `feat(inbox): right-side sidebar with page filter and action cards`.

### Task 9: InboxView detail view + thread

**Files:** Modify `src/inbox.js`, `src/styles.js`; Test `test/inbox.test.js`.

**Interfaces produced:** detail view with Back / ↑ / ↓ / X header; comment card + replies list + reply input (`createInputArea` reuse, attach + send, Enter submits); navigation moves within the filtered list and disables at ends; reply persists via `callbacks.onReply` (which runs `addReply` + `_syncStorage`); deleting the open comment returns to list; opening detail of an anchored visible comment triggers `callbacks.onOpenDetailScroll`.

**Steps:**

- [ ] Failing tests: click card → detail shows text+replies+input; submit reply → appears in detail and in `overlay.comments`; Back returns to list; ↓ navigates to next comment's detail, disabled on last; delete from detail returns to list; scroll callback fired for anchored comment.
- [ ] Verify fail → implement → full `npm test` → commit `feat(inbox): detail view with thread, reply and navigation`.

### Task 10: Types, playground modal, docs, gates

**Files:** Modify `src/index.d.ts`, `typecheck/consistency-check.ts` (only if signature assertions need updating), `playground/index.html` (modal markup/JS + overlay config `persistence`/`user`), `DECISIONS.md`, new `.changeset/inbox-sidebar.md` (minor).

**Steps:**

- [ ] Update `index.d.ts`: `CommentOverlayOptions` += `persistence?: "localStorage" | "none"`, `user?: { name: string }`, `onCommentDeleted?: (id: number) => void`; `SerializedComment` += `page: string; screenshots: string[]`; `CommentReply` += `screenshots?: string[]`; `AnchorState` += `"inactive"`; `Comment` += `page: string; hidden: boolean; screenshots: string[]`; `CommentOverlay` += `deleteComment(id: number): boolean`; `loadComments` return += `inactive: number`.
- [ ] Playground: add "Open modal" button + modal (backdrop, dialog with heading/paragraph/image, close button, `display:none` when closed); init with `persistence: "localStorage"`, `user: { name: "Kevin Collazos" }`.
- [ ] DECISIONS.md entry (screenshots-in-serialization amendment, inactive state, hidden-vs-orphaned distinction) + changeset.
- [ ] All gates: `npm run lint && npm run typecheck && npm run format:check && npm test && npm run build && npm run size`.
- [ ] Commit `feat(types,playground): sidebar API types, playground modal + local persistence`.

### Task 11: End-to-end verification (Playwright MCP)

Serve the playground (`npx serve` or python http.server), then with the Playwright browser: create a comment inside the modal → assert anchor targets modal content; close modal → circle hidden, inbox shows hidden tag; reload → comments restored; narrow viewport (slogan-img hidden by media query) → hidden tag; inject an other-page comment into localStorage → appears only under "All comments" with page tag; copy → clipboard contains template; delete via ⋯ → gone from page/inbox/localStorage. Fix anything found, re-run gates, commit fixes.

## Verification against acceptance criteria

#1→T4, #2→T3+T8, #3→T5, #4→T8, #5→T8+T9, #6→T6+T8, #7→T4+T8, #8→T2, #9→T10+T11, #10→T10.
