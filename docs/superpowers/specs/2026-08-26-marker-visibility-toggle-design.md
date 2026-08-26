# Marker visibility toggle — design

Date: 2026-08-26
Status: approved, ready for implementation

A second pill beside the comment toolbar with one eye button that hides and
shows every comment marker on the page. Reviewers asked for it as a
noise-control measure: a page dense with markers is hard to read _as a
page_. UI-only — no public API.

## Problem

Markers are always on. On a page with many comments the circles cover the
content under review, and the only ways to quiet them today are resolving
comments or removing the widget. There is no "let me just look at the page"
switch.

## Non-goals

- **No public API.** No `setMarkersHidden`, no host callback, no
  `index.d.ts` change. If a host asks, that is a later spec.
- **No per-comment hiding.** The toggle is the whole marker layer.
- **No change to the inbox or the toolbar.** Both stay fully operational
  while markers are hidden; hiding governs the on-page circles only.
- **No keyboard shortcut** for the toggle itself.

## Design

### UI

`createToolbar` grows a second pill: a sibling of `.toolbar-actions`
inside the existing `#comment-toolbar` element, carrying one button built
with the existing `createActionWithTooltip` helper (same hover tooltip the
Comment and Inbox buttons use). Styling reuses the `.toolbar-actions`
visual (background, blur, radius, shadow) via a shared rule.

Positioning: the second pill is `position: absolute; left: calc(100% +
12px); top: 0` inside `#comment-toolbar`. Because it is out of flow, the
main pill keeps exactly its current centered position
(`left: 50%; translateX(-50%)`) — the mockup's layout, with no movement of
`.comment-toolbar`.

Button states (WCAG 1.4.1 — never color alone):

| state   | icon             | tooltip + `aria-label` (en / es)    |
| ------- | ---------------- | ----------------------------------- |
| visible | eye              | Hide comments / Ocultar comentarios |
| hidden  | eye with a slash | Show comments / Mostrar comentarios |

The eye is an **action button**, not a toggle button: its accessible name,
tooltip, and icon swap together to describe the action a click performs
next, and it carries no `aria-pressed`. This is a deliberate contrast with
the Comment button, whose name never changes ("Comment") and which
therefore keeps `aria-pressed` as the only thing that distinguishes its two
states. Pairing a swapping name with `aria-pressed` would read backwards to
a screen reader — announcing "Show comments, toggle button, pressed" while
comments are in fact hidden, i.e. while nothing named "Show comments" is
active. The swapping name is already the state signal, matching the
swapping icon and tooltip; see DECISIONS.md for the full reasoning.

Both strings land in `src/locales/en.js` AND `src/locales/es.js`
(`toolbarHideComments`, `toolbarShowComments`) — the i18n regression scan
enforces this. The two eye SVGs live next to the toolbar's existing icon
constants.

### Behavior

**Hiding** adds a class (`CLASSES.MARKERS_HIDDEN`) to the overlay element
the circles mount into; CSS hides every `.comment-circle` under it. The
marker engine keeps running — positions stay current, so re-showing is
instant and correct. Hiding also dismisses any open thread popover and any
marker tooltip: floating UI anchored to an invisible marker is orphaned
noise. The comment toolbar, the comment box, and the inbox are unaffected.

**Re-showing** happens three ways, all funneled through one internal
setter so state, class, icon, ARIA, tooltip, and storage can never
disagree:

1. Clicking the eye again.
2. Entering comment mode — by the toolbar button or the keyboard
   shortcut. Both already funnel through `toggleCommentMode`, which is the
   hook point: someone about to comment wants to see the existing
   comments. (Leaving comment mode does NOT re-hide; the user can hide
   again with one click.)
3. Navigating to a comment from the inbox (`scrollMarkerIntoView`), which
   would otherwise scroll to nothing.

A comment created or loaded while hidden gets a circle like any other; the
layer class keeps it invisible until the layer shows again.

**Persistence:** the flag lives under its own localStorage key
(`helldots-markers-hidden`), independent of the widget's
`persistence` option — it is a viewer preference, not comment data. Read
once at mount, written on every change (including the automatic re-shows,
so a later reload matches what the viewer last saw). Every read and write
is wrapped so a blocked or full localStorage silently degrades to
"visible" — the same never-throws contract as `src/storage.js`.

## Error handling

- localStorage unavailable/throws → toggle still works for the session;
  preference just does not persist.
- Toggling with zero comments is a no-op visually but still flips state,
  icon, label, and storage — no special case.
- `destroy()`/`cleanup()` removes the second pill with the toolbar it
  lives in (same DOM subtree; no extra teardown).

## Testing

- `test/components.test.js`: `createToolbar` renders the second pill with
  the eye button, no `aria-pressed` attribute, the localized label, and
  the tooltip wrapper.
- `test/overlay.test.js`:
  - clicking the eye adds `CLASSES.MARKERS_HIDDEN` to the mount container,
    flips the label/icon (and confirms no `aria-pressed` is written), and
    writes the storage key;
  - clicking again removes all of it;
  - an open thread popover closes when markers hide;
  - `toggleCommentMode()` (the shortcut path's funnel) re-shows;
  - `scrollMarkerIntoView` re-shows;
  - a stored `"true"` hides markers from mount; a throwing localStorage
    stub leaves the widget usable and visible.
- `test/styles.test.js`: mounts the real stylesheet and asserts, via
  `getComputedStyle`, that a `.comment-circle` carrying an inline
  `display` (as the marker engine writes on a visibility pass) still
  computes to `display: none` inside a `CLASSES.MARKERS_HIDDEN` container —
  the guarantee the rule's `!important` exists for.

## Process

- One `minor` changeset (new user-visible capability).
- One DECISIONS.md entry: why the preference persists, why comment mode
  and inbox navigation force re-show, and why there is no public API yet.
- New strings in both locales; no new dependencies; no `index.d.ts`
  change; `npm run verify` before completion.

## Accepted limitations

- The preference is per-browser, not per-user: two reviewers sharing a
  machine share the flag. Fine for a viewer preference.
- Auto-re-show on comment mode means the eye's stored value can flip
  without the eye being touched. Deliberate: the alternative (commenting
  blind among invisible markers) is worse, and the stored value always
  mirrors what is actually on screen.
- On viewports narrower than the toolbar plus the visibility pill's
  offset (`left: calc(100% + 5px)`), the eye pill can clip off-screen.
  The layout is the approved mockup's positioning, and no responsive
  fallback (e.g. wrapping the pill under the toolbar, or shrinking the
  offset) is included.
