# Region anchoring and rescue tie-breaking — design

Date: 2026-08-25
Status: approved, ready for implementation

Two independent anchoring fixes, motivated by a field report from a real
host (MARLO, a classic multi-page dashboard). Both are behaviour fixes to
existing code paths; neither touches the public API.

## Problem

**1. A drag comment anchors to the mouseup pixel, not to the region.**
`CaptureFlow.onDragEnd` uses the selection rectangle only to crop the
screenshot; placement goes through `onPlace(e.clientX, e.clientY)` — the
point where the mouse was released. `_placeCommentAtPoint` then derives
`container` and `targetSelector` from `document.elementFromPoint` at that
point. A ~553×81 px selection over a phase bar collapses to one pixel, and
in the reported case that pixel fell inside an open search panel that the
host later closed (a shadow-DOM retargeting quirk in the host's
click-outside handler closed it mid-flow). The comment's `targetSelector`
ended up pointing at an input that measures 0×0 whenever the panel is
closed, so `_isAnchorTargetVisible` hid the marker: the comment was born
invisible, with the user certain they had commented on the visible bar.

**2. The rescue search systematically resolves to the ancestor on ties.**
`resolveAnchor`'s tag-wide rescue scores candidates with
`textSimilarity` (which awards 0.8 on a prefix match) over a text snippet
truncated to 64 characters. In nested DOMs a parent and its child share the
same truncated snippet; with no stable attributes they tie exactly, and
`bestMatch`'s strict `>` comparison keeps the first candidate in document
order — always the ancestor. The most specific matching element can never
win a tie.

## Non-goals

- **No rejection of "ephemeral" targets** (dialogs, popovers). A comment
  deliberately left on an element inside a modal *should* hide with the
  modal — that is a recorded decision (DECISIONS.md, "The playground modal
  uses `class="modal-content"`"). The reported bug is an *accidental*
  anchor, which the region fix removes at the source.
- **No degraded rendering** of a marker whose target is hidden. The
  marker's position is derived from the anchor, never invented; a marker
  painted where nothing is would be worse than a hidden one. The comment
  remains reachable through the inbox.
- **No changes to scoring weights or thresholds** (`SELECTOR_THRESHOLD`,
  `RESCUE_THRESHOLD`, the 0.8 prefix bonus). Moving them without corpus
  data is free risk.
- **No migration of stored anchors.** Existing comments keep the anchors
  they were saved with.

## Design

### A. Drag comments anchor to the region

When the gesture is a drag, the comment is placed at the **center of the
selection rectangle**, and the target element is chosen from the elements
that actually represent the region:

1. `CaptureFlow.onDragEnd` calls `onPlace(centerX, centerY, region)` for
   every drag (`_isDragging`), passing `region` only when it cleared the
   existing 10×10 capture threshold. A sub-threshold drag places at its
   center with no region — indistinguishable from a click, as today. The
   plain-click path is untouched.
2. `_placeCommentAtPoint(clientX, clientY, region?)`: with no region,
   behaviour is exactly today's. With a region, instead of taking the
   topmost element at the point, read the full hit-test stack with
   `document.elementsFromPoint(centerX, centerY)` and pick the **first
   element in the stack whose intersection with the region covers at least
   60% of the region's area** (`REGION_COVERAGE_MIN`, a named constant).
   - This rejects a partial overlay sitting above the intended content (a
     310 px-wide panel cannot cover 60% of a 553 px-wide selection) and
     lands on the element the user framed.
   - Using the stack rather than walking ancestors also handles overlays
     rendered in portals, which are not ancestors of anything useful.
3. Fallbacks: if no element in the stack reaches the coverage threshold
   (a selection spanning unrelated sections), or if
   `document.elementsFromPoint` is not a function (jsdom — same guard as
   `_isMarkerOccluded`), fall back to today's `elementFromPoint` result.
4. Everything downstream is unchanged: `container =
   target.closest(SELECTORS.CONTAINER) || body`, `targetSelector` via
   `generateElementSelector` when target ≠ container, `relativeX/Y`
   against the container rect, preview circle and comment box at the
   passed point — which is now the region's center.

**Why 60% coverage and not strict containment:** human selections
overshoot the element they mean by a few pixels; requiring the element's
rect to contain the region would skip to the parent almost every time.
60% tolerates overshoot while still rejecting partial overlays. Elements
in the stack above the widget's own shadow host are already excluded by
the existing pointer-events toggle during the hit-test.

**Visible UX change, accepted:** the marker and comment box now appear at
the region's center rather than wherever the mouse was released. That is
what the gesture means, and it keeps the marker and the anchor pointing at
the same thing.

### B. Deepest-wins tie-breaking in `resolveAnchor`

In `bestMatch`, when a candidate's confidence **exactly equals** the
current best's and the candidate is a **descendant of the current best**
(`best.element.contains(element)`), the candidate replaces it. The deepest
element that scores identically is the most specific one — the same
intuition as the selector cascade. No weights or thresholds change, so any
anchor that resolves uniquely today resolves identically tomorrow; only
exact parent/child ties flip, from "always the ancestor" to "the most
specific match".

## Error handling

- Zero-size or detached elements in the hit-test stack contribute zero
  intersection and are naturally skipped.
- A region with zero area cannot occur (guarded by `_isDragging` +
  center-point placement); coverage division uses the region's area, which
  is > 0 whenever `region` is passed.
- `elementsFromPoint` absent → silent fallback to the current path, never
  a throw.

## Testing

- `test/capture-flow.test.js`: a drag calls `onPlace` with the rectangle's
  center and the region; a sub-threshold drag passes no region; a click
  passes no region.
- `test/overlay.test.js`: with a mocked `elementsFromPoint` stack, the
  target is the first element meeting 60% coverage, skipping a partial
  overlay above it; with no element meeting coverage, the current
  (topmost-element) behaviour applies; with `elementsFromPoint` missing,
  same fallback.
- `test/anchor.test.js`: a parent and child with identical truncated text
  and no attributes resolve to the child; a non-tied case resolves as
  before; a tie between siblings (neither contains the other) keeps
  document order.

## Process

- Two `patch` changesets (one per fix), two DECISIONS.md entries (the 60%
  coverage heuristic; deepest-wins tie-breaking).
- No new user-visible strings → no i18n work. No public API change → no
  `index.d.ts` change.
- `npm run verify` before claiming completion.

## Accepted limitations

- A selection that genuinely spans several unrelated containers still
  anchors like a click at its center — there is no "right" single element
  in that case, and the fallback is today's behaviour, not something worse.
- The tie-break cannot recover an anchor whose ancestor was the *correct*
  answer when a descendant ties exactly; ties of that shape are inherently
  ambiguous, and the descendant is the better default.
