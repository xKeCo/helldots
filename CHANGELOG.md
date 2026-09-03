# Changelog

## 0.11.0

### Minor Changes

- 072ec69: Editing and deleting are no longer open to everyone

  The widget recorded `authorId` on every comment and reply but never read it
  back, so the ⋯ menu offered Edit and Delete on all of them to whoever was
  looking. It now offers them only on records carrying your own identity.

  A new `can(action, target)` option overrides that rule for moderators, owner
  roles or read-only viewers. `action` is one of `"edit:comment"`,
  `"delete:comment"`, `"edit:reply"` or `"delete:reply"`; return literal `true`
  to allow. The same verdict is readable from `overlay.can(action, target)`, so
  a delete button in your own chrome can ask the one rule.

  Only those four actions are gated — status, type, priority, tags, reactions
  and replying stay open to everyone. Your own API calls are never refused:
  `can` governs clicks inside the widget, not `overlay.deleteComment(id)` from
  your code.

  Behaviour changes only for hosts that set `user`. Without one, every record
  is written by the same anonymous actor and nothing is hidden.

  This is not authorization — HellDots runs in the page. Keep checking
  `authorId` against the session on your server.

## 0.10.0

### Minor Changes

- 3886169: Add a marker visibility toggle: an eye button in its own pill beside the
  toolbar hides every comment marker to cut visual noise, and shows them
  again. The preference persists per browser, and the layer re-shows itself
  when the user enters comment mode (button or shortcut) or navigates to a
  comment from the inbox. The icon, tooltip, and accessible name flip
  together.

### Patch Changes

- 110ff07: Drop the hover tooltip from reaction pills. The emoji and the count already say
  what a pill is, so a bubble per pill turned a dense row into a wall of popups.
  The trigger beside the row keeps its tooltip, and the pills keep their
  accessible name and `aria-pressed` state.
- 87a0e72: A drag comment now anchors to the region it selected, not to the mouseup
  pixel. The comment is placed at the rectangle's center, and the anchor
  target is the topmost element at that point whose box covers at least 60%
  of the region — so a floating panel that happens to sit under the released
  mouse (and later closes) can no longer capture the anchor and leave the
  marker invisible. Plain-click placement is unchanged.
- 5ffb3a9: Show the full author name in a hover tooltip when the meta row truncates it.
  The name is measured on hover, so the bubble only appears when the ellipsis
  actually hid something — short names stay tooltip-free.
- a4bac45: Resolve anchor-matching ties to the deepest matching element — in both the
  selector match and the rescue search. The text fingerprint is truncated to
  64 characters, so in nested DOMs a parent and its child score identically;
  the strict comparison kept the first candidate in document order — always
  the ancestor — so the most specific match could never win. Ties between
  unrelated elements keep document order, and anchors that resolved uniquely
  before resolve identically now.

## 0.9.1

### Patch Changes

- 1fb00c8: Load `modern-screenshot` lazily on the first capture instead of statically.

  Bundlers now split the renderer (~10 KB gzip) into its own chunk that
  downloads when the first capture runs, so apps embedding HellDots no longer
  pay for it in their initial bundle — and pages where nobody captures never
  fetch it at all. A failed load surfaces through the existing `onError` path
  and is retried on the next capture rather than cached.

## 0.9.0

### Minor Changes

- 222d567: Declare `modern-screenshot` as a peer dependency instead of a direct one.

  The ESM bundle already treated the renderer as external, but package size
  scanners (Bundlephobia, bundlejs) resolve bare imports from `dependencies`,
  so the published package measured 51.6–54 KB gzip against a 50 KB budget the
  bundle itself meets at 44.7 KB. Both scanners attribute peer dependencies to
  their own package, so the public measurement now matches the gate.

  npm 7+, pnpm 8+ and bun install missing peer dependencies automatically, so
  `npm install helldots` is unchanged. Yarn users must add
  `modern-screenshot` alongside.

### Patch Changes

- b395335: Fix a blue focus ring appearing around the inbox panel when a comment is
  opened from a copied link.

  The panel takes focus as it opens so a screen reader lands inside the dialog.
  Opened by a click that is quiet, but a link opens it during page load with no
  pointer interaction behind it, which is enough for Chrome's `:focus-visible`
  heuristic to paint its default ring. The panel carries `tabindex="-1"` and is
  never reachable by Tab, so the ring marked nothing anyone could act on.

  Focus still moves into the dialog; only the ring is suppressed. The focus
  rings on the confirm dialog's buttons are untouched.

- 5f21bb5: Cap the thread header's meta row at 280px so it stops claiming the full width
  of the popover.

## 0.8.0

### Minor Changes

- 4d352a8: Add `fastCapture`, an opt-in that narrows the screenshot renderer's
  computed-style enumeration to a curated allow-list instead of every property
  the browser exposes. That enumeration is ~91% of a capture's cost and scales
  with element count; the list cuts the dominant phase by about 2.7x, measured
  pixel-identical to a full capture on the pages it was verified against.

  Off by default: a property the list does not name is absent from the image,
  so the trade belongs to the host. See the README for when to turn it on.

- 4d352a8: Add `skipIframeContent`, an opt-in that renders embedded documents as blank
  instead of cloning them. A same-origin iframe's cost is invisible from the
  host page — the renderer clones the whole embedded document, so a page of
  242 elements can be a capture of 9 245.

  The `<iframe>` element is kept, so its box and the layout below it stay
  where the page put them. Off by default: on a same-origin frame the content
  you lose is real.

- 4d352a8: Add `captureTimeout`, bounding how long one remote asset may hold a capture
  up while the renderer re-fetches the page's images and fonts to inline them.

  The default is unchanged. A dead asset URL stalls a capture for about a
  minute — the renderer's own 30 second deadline, paid twice because the number
  drives two waits in sequence, one for the image on the page to load and one
  for the fetch that inlines it — and the capture still succeeds with that asset
  replaced by a placeholder. The wait is bounded rather than multiplied: one
  dead asset and ten cost the same.

  Left at the default because a shorter one drops assets that were only slow
  and leaves holes in the image with nothing to say so. Set it if you have
  measured your own page. Only a finite positive number is honoured: 0 means
  "never give up" to the renderer, and `Infinity` is coerced to no wait at all.

- 4d352a8: Dragging a region no longer waits for the screenshot. The marker and the
  comment box appear as soon as the mouse is released, and the crop drops into
  a "Capturing…" slot in the attachment strip when its render lands. On a
  heavy page that removes over a second between the gesture and being able to
  type; Send waits for the crop if you get there first.

  Adds `capturingScreenshot` to both locales.

### Patch Changes

- 4d352a8: Fix captures coming back blank on very long pages. Past the browser's canvas
  ceiling — 65 535px in a dimension, and an area cap besides — a canvas accepts
  its size, hands out a context, takes every draw call and holds no pixels, so
  every screenshot off it was empty with nothing said about it.

  Renders now fit their scale to what the browser will actually paint, verify
  that the result holds pixels, and retry smaller if it does not. Pages below
  the ceiling are unchanged; past it the capture goes soft rather than blank,
  and a render that cannot be produced at all reports through `onError` instead
  of attaching an empty image.

- 4d352a8: Screenshot capture no longer freezes the page. The clone traversal now hands
  the main thread back to the browser on an 8 ms budget, so the page keeps
  painting and accepting input while a render is in flight — on heavy pages
  that render could block for over a second. Wall-clock capture time is
  unchanged; what changes is that it is no longer a freeze.

## 0.7.0

### Minor Changes

- a616711: Four additions for hosts integrating the widget into a real app.

  - **`onCommentModeChanged(active)`** — comment mode turned on or off, however
    it was flipped. The keyboard shortcut is the reason: it never reaches the
    host, so an app that has to stand down while somebody picks an element had
    no signal at all.
  - **`onCommentOpened(comment)`** — somebody opened a comment's thread, from
    its marker or from the inbox detail. This is what an unread count is built
    on; it does not fire when the inbox merely re-renders. HellDots stores no
    read state of its own, because whose read it is depends on an identity only
    the host can persist.
  - **`setUser(user)`** — replaces the identity new comments, replies and
    reactions are attributed to, without rebuilding the widget. For a session
    that resolves after mount, or a user switching account. Nothing already
    written is rewritten; `null` returns to the anonymous author.
  - **`exportCommentsCsv()` / `exportMetricsCsv()` now return the CSV text** as
    well as downloading it, so the rows can be sent somewhere instead of handed
    to the user as a file. `printMetricsReport()` still returns nothing — what
    it produces is a print dialog.

- 57e8cda: **`transformScreenshot`** — swap every image the widget acquires for a string
  of your own, so a ~33 KB base64 data URL per comment does not end up in your
  database.

  Called with `(dataUrl, { kind, commentId })` for the automatic viewport
  capture (`kind: "context"`), drag-crop regions, and file attachments on
  comments and replies (`kind: "attachment"`). Return the string to store —
  typically a URL into your own object storage.

  It runs at two moments: everything on a comment transforms as the comment is
  saved, while a reply attachment transforms when the file is picked, because
  `addReply()` is synchronous. Either way the record may never arrive — an
  abandoned draft, or a box dismissed mid-upload — so sweep for unreferenced
  blobs rather than assuming every URL you hand back gets stored.

  Fail-open: a rejection, a throw, or a resolved value that is not a non-empty
  string keeps the original data URL and reports the new
  `onError(error, "transform")`. Not called for records passed to
  `loadComments()`, nor for screenshots handed to `addReply()` directly.

  The comment box's submit button is now disabled while a save is in flight,
  since that save may be waiting on an upload.

- 318a284: Callbacks now say who caused a change and what moved, and a shared link can
  ask for the comment it points at.

  - **`meta.origin`** — every callback takes one extra trailing argument, and
    `onChange` events carry the same fields flattened onto them. `"user"` is
    somebody acting inside the widget, `"host"` is your own code calling a
    method. Multi-user apps needed this to stop echoing their own remote writes
    back to the server. Existing handlers that ignore the argument are
    unaffected.
  - **`meta.from` / `meta.to` / `meta.field`** — `comment:status-changed` now
    carries both ends of the move (so a reopen is told apart from a resolve),
    and `comment:updated` says which of type, priority or tags it was about.
    `field` narrows `from`/`to` in TypeScript.
  - **`onCommentRequested(id)`** — fires when a "Copy link" URL points at a
    comment the widget does not hold, once per id. Fetch it, hand it to
    `loadComments()`, and the inbox opens on it; return a promise and the link
    is retried once it settles. This is what makes loading only the linked
    comment possible. `DEFAULT_LINK_PARAM` and `readCommentLinkParam` are also
    exported now, for reading the id before an overlay exists.
  - **`onReady(overlay)`** — the widget has mounted and every method is safe to
    call. `loadComments()` before that no longer throws: the data is held and
    applied at mount, though the counts come back as zeroes until then.
  - **`onError(error, context)`** — failures the widget survives but only the
    console used to hear about: `"capture"`, `"storage"`, `"load"`, `"link"`.
  - `setCommentType`, `setCommentPriority` and `setCommentTags` now no-op when
    the value does not change, matching `setCommentStatus`. They previously
    wrote to storage and emitted an event for a change that did not happen.

### Patch Changes

- 6993d78: A save that outlives its own comment box no longer lands on a different one.
  The guard after the awaits in `_saveCommentNow` asked whether _a_ box was
  open rather than whether it was still _the same_ one — a window that a host's
  `transformScreenshot` upload stretches to seconds. Dismissing the box, opening
  a second comment elsewhere and letting the upload resolve wrote the first
  draft onto the second one's anchor and tore the second draft down. The draft
  is now snapshotted before the first await and compared by identity.

  (The same release adds `transformScreenshot`; a reply attachment sent while
  its upload was in flight could be dropped in the first cut of that feature,
  and is not in any published version.)

## 0.6.0

### Minor Changes

- 599e9f0: Add emoji reactions to comments and replies. One of six fixed reactions
  (👍 👎 ❤️ 🎉 👀 🚀) is added from the emoji button in the action strip — the
  same strip the thread popover and every inbox card share — and once something
  has been reacted to, a row of pills appears under the comment (below its
  screenshot when there is one) with a trailing button for adding one more.
  Reacting again with the same emoji removes it, and the row disappears with the
  last reaction.

  The action strip is now split in two: status, type and priority on the left,
  and the tools — react, copy context, ⋯ — on the right. Replies carry the same
  pair of controls on their meta line.

  Two new methods, `toggleCommentReaction(id, emoji)` and
  `toggleReplyReaction(commentId, replyId, emoji)`, plus a `reaction:toggled`
  event and its `onReactionToggled(comment, reply)` callback — `reply` is `null`
  when the reaction is on the root comment.

  `user` gained an optional `id`. It is never displayed: it is what a reaction is
  keyed on, so two teammates who share a display name do not share a reaction.
  Without it the name is used, exactly as authorship already does.

  Reactions travel in `serializeComments()` output as an `{ emoji: actorKey[] }`
  map, `null` when nobody has reacted, and hostile or stale persisted values are
  scrubbed on load. Costs 2 KB gzip and no new dependency.

- 1d23150: Persist the host-supplied user identity as `authorId` on comments and replies.

  `user.id` already keyed reactions; it is now also stored alongside `author` on
  everything that user creates, so two teammates who share a display name stay
  distinguishable in the record. The id is opaque to HellDots — point it at your
  user table, at a comments-only store, or at nothing. The display name is still
  the only thing rendered, and it travels with the record, so a store holding
  nothing but comments renders every author without a lookup.

  The field is additive and optional: records written before this change load
  unchanged with `authorId: null`, and no migration is involved. A non-string id
  arriving through `loadComments` is dropped rather than trusted.

  One identifier now has exactly one spelling. The id is trimmed — and never
  truncated — in every place it lands: `authorId` on comments and replies, the
  `actor.id` of each audit entry, and the key a reaction is stored under. They
  each normalised it differently before, so a padded or long id could arrive in
  three different forms inside one payload.

  HellDots still authenticates nobody. Whatever the host declares in `user` is
  recorded as-is.

- d353b7b: Add an append-only audit trail to every comment: who created it, edited its
  text, moved its status or changed its classification, and when. It shows as a
  folded `History (n)` disclosure in the inbox detail and rides along in
  `serializeComments()` output as `history`.

  Resolution time is now derived from that log instead of read off a stored
  figure, so a comment that was resolved, reopened and resolved again reports the
  duration of the resolution currently in force — and the superseded ones are
  listed under **Previous resolutions** in the same disclosure.

  Replies and reactions are deliberately not recorded: a reply already carries
  its own author and timestamp, and reactions are high-frequency signal with no
  audit value. That keeps a typical comment at three to five entries.

  The field is additive and optional — a corpus written before this change loads
  unchanged with `history: null`, and no migration is involved. Entries arriving
  through `loadComments` are scrubbed: an unknown event type or an unparseable
  timestamp is dropped rather than trusted.

  HellDots still authenticates nobody, so the trail records what the host
  declared in `user` at the moment of each action. It is attributive, not
  evidential.

- ba46d13: Add a metrics dashboard and report exports.

  The inbox header gains a **Metrics** button that swaps the list for a
  dashboard: totals, resolved and reopened counts, average and median resolution
  time, bars per status, type and priority, and a daily distribution. Each bar is
  painted in the same colour that value already carries in its picker. It measures
  whatever the panel is filtered to; `overlay.getMetrics()` returns the same
  shape over the whole corpus.

  Three exports, from the dashboard or directly:

  - `overlay.exportCommentsCsv()` — one row per comment
  - `overlay.exportMetricsCsv()` — the aggregate figures in `section, key, value`
  - `overlay.printMetricsReport()` — the browser's print dialog, where "Save as
    PDF" produces a real PDF

  The CSVs are RFC 4180 with a UTF-8 BOM so Excel reads accents correctly, and
  values that a spreadsheet would evaluate as formulas are neutralised. No new
  dependency: the charts are hand-drawn SVG and the PDF is the browser's own, so
  the whole feature costs 4.28 KB gzip.

  Also fixes `mountStyles` constructing its stylesheet in the calling realm
  rather than the target's, which prevented styles from being adopted into a
  document other than the caller's.

- 6405f7c: Add an **In review** state to the comment lifecycle, between _In progress_ and
  _Resolved_. It is available in the status picker, in the inbox status filter
  and through `setCommentStatus(id, "in_review")`, and it carries the blue that
  `open` used to have.

  `open` moves to an unsaturated off-white grey, so the states somebody actively
  moved a comment into are the ones that stand out. `CommentStatus` gains
  `"in_review"`; stored comments need no migration.

### Patch Changes

- 448c0d9: Close the gap under the context block in the inbox detail view. A comment
  with no replies still rendered its replies container, and as a zero-height
  flex item it collected 24px of the column gap — most visible with the
  context block collapsed.
- ae9049d: Fix dropdowns rendering see-through on resolved comments. A resolved card is
  dimmed with `opacity`, which composites it and everything inside it as a single
  translucent layer — so the status, type, priority and `...` menus opened from
  one were painted above the context block and still showed it through
  themselves. The dim is now lifted while a dropdown inside the card is open.

  Most visible in the inbox detail view, where the context screenshot sits
  directly behind the menu.

- d186cbb: Fix the inbox detail header: its prev/next/close buttons reuse the card
  action strip, whose `space-between` scattered them across the row instead
  of grouping them opposite `Back`. They now align to the end of the strip,
  which keeps its full width.
- 494ecbf: Keep dropdowns inside the surface that clips them on the horizontal axis
  too. The status picker leads the action strip, so its menu hung 45px past
  the left edge of the inbox panel and was cut in half; it now aligns to the
  button's left edge when — and only when — it fits that way.

## 0.5.0

### Minor Changes

- a68131b: SPA support: new `notifyNavigation()` re-syncs the widget after a client-side navigation — comments reclassify against the new pathname, anchors re-resolve against the new DOM, markers rebuild and the inbox moves onto the new page (deep links and the cross-page handoff included). New `navigate` option routes the widget's own cross-page jumps through the host's router instead of a full reload, and `autoDetectNavigation: true` opts into automatic re-sync on popstate.
- db81943: New `onChange` option: one subscription point that fires for every change, typed as a discriminated union on `event.type` (`comment:created`, `reply:added`, `comment:status-changed`, …). The nine existing callbacks are unchanged and keep firing at the same moments — this is additive. Handlers that throw are now caught and warned about instead of propagating out of the mutation that already happened.
- 34bf6a8: The inbox detail's Context section is now a disclosure you can fold away. It still opens expanded — that view is where you go to read everything — but the automatic screenshot and the environment rows can be collapsed to bring a long thread into view, the same control the thread popover already had. The choice sticks: it survives the rebuilds the detail does on every change, and stays put while stepping through comments with prev/next.
- 3785b66: Two API additions: `addReply` now accepts a comment id as well as the live object (every sibling mutator already took ids; it returns `null` for an unknown id), and `clearComments()` removes every comment at once — markers, memory and their persisted entries — as the bulk reset a host needs to reconcile against its backend before a fresh `loadComments`. It deliberately fires no per-comment callbacks.

### Patch Changes

- 3785b66: Accessibility: dropdown menus honor the keyboard contract their `role="menu"` promises — Escape closes just the menu (never the popover behind it) and returns focus to its button, and Arrow/Home/End walk the items. Screenshot thumbnails are keyboard-operable (the lightbox was mouse-only). The lightbox announces itself as a dialog, takes focus on open and returns it on close; the inbox panel receives focus when it opens; the delete confirmation announces its message via `aria-describedby`; the page-filter chips sit in a proper `radiogroup`; and an edited comment's marker updates its accessible name.
- 17c5b9e: Screenshots taken on a page shorter than the viewport no longer come out with
  a solid black band below the content. The render covers the `<body>` box, so
  anything past it was left at the canvas's transparent black and JPEG flattened
  it to black; crops now lay the page's own background down first, which is what
  the browser paints across the viewport there. Applies to both the automatic
  capture and drag selections.
- 60ffb2f: `cleanup()` called while the document is still loading now cancels the deferred mount. Previously the instance kept its `DOMContentLoaded` listener and mounted a zombie UI nobody held a handle to — exactly the construct-then-cleanup shape React 18 StrictMode produces in SSR apps.
- 146bfdf: The automatic-context screenshot — the one the thread popover and the inbox
  detail render under "Context" — can now be opened from the keyboard. It wired
  its own click listener instead of going through the shared thumbnail helper,
  so unlike every other screenshot in the widget it carried no `role="button"`,
  no `tabindex` and no Enter/Space handler, leaving it reachable by mouse only.
- 17c5b9e: The automatic screenshot now works under a strict `style-src` Content
  Security Policy. `modern-screenshot` embeds web fonts through a `<style>` in
  a detached document, which inherits the page's CSP; where the policy blocks
  it the render threw and the capture was lost entirely. The widget now detects
  that case up front and renders without font embedding, so the screenshot is
  taken and only downloaded fonts are substituted inside the image. Hosts
  without such a policy are unaffected and keep full font fidelity.
- 60ffb2f: Dead code found by the library audit is gone: `debugPosition()` (the only `console.log` in the bundle), the unreachable `captureRegion` export, the never-assigned `comment-circle-wrapper` class and its stylesheet block, and the never-read `data-comment-text` attribute markers duplicated the full comment text into. See DECISIONS.md for what was kept and why.
- 96f5ae4: Dropdowns now open upward when there is no room below them, instead of being clipped. The ⋯ menu on a thread reply extended past the bottom edge of the thread's scroll container, so reading it meant scrolling the thread first. The measurement is shared by every dropdown in the widget — the status, type and priority pickers, both ⋯ menus and the inbox filter — and is redone on each open. A menu that fits in neither direction still opens downward.
- 17c5b9e: Drag-selected screenshots no longer come back holding the wrong glyphs on
  pages whose web font is served cross-origin (Google Fonts and the like).
  Reading `cssRules` on such a stylesheet throws, so its `@font-face` rules
  never reached the renderer, the captured text fell back to a different face,
  and its different metrics shifted every glyph sideways — a short drag over a
  few letters came out clipped on one side with dead space on the other. Those
  rules can now be fetched and made readable for the duration of the render, so
  the capture matches the page.

  This is opt-in through the new `embedCrossOriginFonts` option, default
  `false`: re-fetching a third party's stylesheet mid-capture is network the
  host did not sign up for by mounting a comment widget. Left off, such a page
  captures exactly as it did before. A host that would rather fix it at the
  source can self-host the font or add `crossorigin` to the `<link>`, which
  makes the stylesheet readable and costs no requests at capture time.

- 60ffb2f: Host-supplied comment ids containing quotes or backslashes no longer make marker lookups throw. `loadComments` accepts arbitrary ids, and every lookup interpolated them raw into an attribute selector, so a `"` in an id crashed `querySelector` mid-load and inside the position loop.
- 746092c: The package is now explicitly ESM-only, and the UMD build dropped its misleading CommonJS footer: `module.exports = HellDots.default` implied a `require()` story the exports map never offered, and it exported only the factory, silently losing `CommentOverlay`. Plain `<script>` usage keeps the `HellDots` global via the CDN build; `require("helldots")` was already unsupported and now the docs say so.
- b496999: Internal: `overlay.js` (~2,500 lines) is split into three modules along its real seams — `capture-flow.js` (drag + screenshot orchestration), `popover-controller.js` (thread popover lifecycle and editing) and `marker-engine.js` (positioning, occlusion, observers). No public API or behavior change; the overlay keeps compatibility facades for its internal surface.
- c599bcb: The inbox list no longer rebuilds itself from scratch on every refresh: cards reconcile by comment id, unchanged cards (and their decoded thumbnails) are reused, and the scrolling container survives — so the list keeps its scroll position when a comment changes, resolves, or a marker's visibility flips mid-scroll.
- 7fd0bb8: The widget now works under a strict `style-src` Content Security Policy: styles are delivered as constructed stylesheets (`adoptedStyleSheets`), which CSP does not block, falling back to an injected `<style>` where the platform lacks them. Previously a policy without `'unsafe-inline'` blocked both stylesheets and left the widget unstyled and unusable. `cleanup()` detaches the adopted sheet, and stylesheets the host app had already adopted are preserved.
- d76c557: `cleanup()` removes the now-empty `helldots-root` host element from the page, and `loadComments` drops non-string entries from comment and reply `screenshots[]` arrays instead of rendering silently broken thumbnails.
- 5b0c2a7: Fix: the hover tooltip, thread popover and reply-row lookups escape host ids before interpolating them into attribute selectors, matching the marker lookups. A comment or reply id containing a quote or backslash (accepted via `loadComments`) crashed the marker UI on hover.
- a898a44: Fix: the storage merge and the inbox detail lookups compare ids on their string form like every other entry point, so a numeric legacy id and its string spelling can never duplicate a stored entry or miss the detail view.
- 16e7546: Accessibility: the screenshot lightbox declares `aria-modal` and traps Tab on its close button — keyboard focus no longer walks into the page behind the backdrop while the dialog is open.
- 13708a7: Performance: clicking to place a comment opens the comment box immediately — the automatic context capture renders in the background and is awaited at save time, instead of gating the box for hundreds of ms on heavy pages. Captures now exclude the widget from the render via a clone filter rather than hiding the whole UI, so nothing flashes off screen. Saving is guarded against double-submit while a capture is in flight.
- 0d4e713: Fix: per-comment ResizeObservers are tracked by the id's string form, so deleting a legacy numeric-id comment through its string spelling (or vice versa) disconnects its observer instead of leaking it against a detached marker.
- 5056c9d: Fix: configuring a custom shortcut now disables the default Alt+C — the hardcoded fallback chords fired unconditionally and could not be turned off. Custom Alt chords also work on macOS now: the matcher accepts the physical key (`e.code`) for Alt combinations, where Option+letter types a dead character and `e.key` never spells the configured letter.
- 3785b66: i18n hardening: a locale missing individual keys now falls back to English per key instead of rendering literal `undefined`; the hardcoded-string regression test scans every file in `src/` instead of only `components.js`; the `locale` option is typed `string` (unknown codes degrade to English, never break); and the Shift modifier label is localized like Alt and Ctrl always were.
- 0f9fb09: The inbox no longer leaves its outside-click listener on `document`. Like the thread popover's, it is armed from a timer, so `closeInbox()` — and `cleanup()` through it — could be outrun and leave a listener nothing remained to remove. Re-opening an already-open inbox also overwrote both the pending timer and the handler, orphaning the previous pair; `notifyNavigation()` re-reads the deep link on every route change, so a long-lived SPA session accumulated one dead listener per navigation, each pinning the overlay it closed over.
- 60ffb2f: `deleteComment`, `deleteReply`, `setCommentStatus`, `setCommentType`, `setCommentPriority` and `setCommentTags` now resolve a legacy numeric id in either spelling (number or string), as the type declarations always promised. They compared ids strictly, so an id that had crossed a JSON or URL boundary could be edited but silently not deleted or reclassified. Every id lookup now goes through one shared helper.
- eec2cac: Markers no longer drift upward when a comment is left on a short element such as a navbar row. The position was clamped so that the marker's whole 28px box fit inside its anchor container, which is impossible in a container shorter than the marker — so every marker in a 36px navbar was pulled to 8px from its top, roughly 10px above the point the preview circle had just shown, and up to 25px for a click near the row's bottom edge. The clamp now keeps the clicked point inside the container and lets the marker's body overhang it. "Scroll to this comment" derives its target through the same clamp, so it can no longer disagree with where the marker was drawn.
- b56408b: The injected stylesheet ships minified: esbuild never touches template-literal contents, so the sheet used to travel with its full indentation and internal CSS comments (~15 KB raw / ~2.3 KB gzip). A build plugin now strips comments and collapses whitespace inside `styles.js`'s templates — the ESM bundle drops from 31.8 to 29.5 KB gzip. Both builds also pin `target: "es2022"` so a future esbuild default can't silently raise the browser floor.
- 875658a: The per-frame position loop no longer degrades with the number of comments: marker circles are indexed in a Map instead of a shadow-tree query per comment per frame, every pass measures all markers before writing any style (no more forced layout per marker), the occlusion hit-test runs at most every 150ms during scroll bursts (with a trailing pass to settle the end state), and flipping N markers in one frame refreshes the inbox once instead of N times. The per-comment MutationObservers — redundant with the page-wide one — are gone, along with their N callbacks per DOM mutation.
- 875658a: With `persistence: "localStorage"`, every mutation used to re-read and JSON.parse the whole cross-page corpus (megabytes once context screenshots accumulate) before writing it back. The parsed corpus is now cached and kept in step with what the instance writes; a `storage` event from another tab drops the cache so the next sync re-reads instead of clobbering the other tab's write.
- 95fe9f2: `cleanup()` can no longer be outrun by the thread popover's outside-click listener. The listener is armed from a timer, so tearing the widget down in the same tick as opening a thread left it to land on `document` afterwards, with nothing remaining to remove it — and because it closes over the popover controller, it kept that instance, its shadow root and its comments alive. A host that mounts and unmounts the widget (a route change, a React StrictMode double-invoke) accumulated one dead listener per mount.
- 60ffb2f: The thread popover's remove-screenshot button regained `type="button"` and its localized `aria-label`, matching the comment-box and inbox copies of the same preview. Its capture warning also gained the `HellDots:` prefix every other diagnostic carries.
- 17c5b9e: Drag-selected screenshots line up with the selection again. The render was
  anchored to `<body>`, and the clone lands in a document where the user-agent's
  `body { margin: 8px }` applies once more — even on a page that zeroed it — so
  every element in normal flow sat 8px right and 8px down inside a canvas that
  did not grow, losing 8px off the right edge and putting every crop 8px out.
  Rendering `<html>` instead removes the offset: page coordinates and canvas
  pixels now map 1:1, which is what the crops always assumed.
- ed9af41: A reply's ⋯ menu now offers "Edit reply" as soon as the reply is created. The path that appends a just-submitted reply wired only the delete handler, so editing required closing the thread popover and opening it again — on the reply most likely to need a correction.
- 3785b66: Schema hardening: serialized comments carry `schemaVersion: 1` (additive — future breaking changes get a hinge to detect newer payloads); an anchor written by a newer schema version resolves as orphaned instead of half-interpreted; malformed replies are dropped on load with the same id+text gate the comment itself passes; and file attachments reject non-images before reading them into data URLs.
- 875658a: The screenshot-attachment pipeline (preview strip, file input with its 5-attachment cap, lightbox wiring) existed copied three to five times across the comment box, thread popover and inbox — and had already drifted once. It is now one set of shared helpers, and the marker size, caret icon, platform check and inbox filter reset each live in one place.
- 60ffb2f: Type declarations caught up with the implementation: `addReply` declares its optional `screenshots` parameter (TS hosts no longer need a cast to attach reply screenshots) and `Comment` declares `editedAt`.
- 66ea445: The UMD bundle's banner now credits modern-screenshot (MIT), which that artifact redistributes — same reasoning as the existing nanoid notice.

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
