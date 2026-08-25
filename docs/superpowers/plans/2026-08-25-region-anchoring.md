# Region Anchoring and Rescue Tie-Breaking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drag comments anchor to the element that shows the selected region (placed at its center), and `resolveAnchor`'s rescue search stops always resolving exact ties to the ancestor.

**Architecture:** Three seams, touched independently: `CaptureFlow.onDragEnd` (what point/region a drag reports), `CommentOverlay._placeCommentAtPoint` (which element a region anchors to), and `bestMatch` in `anchor.js` (tie-breaking). No public API change, no new dependencies, no UI strings.

**Tech Stack:** Plain ES modules, vitest + jsdom, changesets, `tsc --noEmit` over JSDoc types.

Spec: `docs/superpowers/specs/2026-08-25-region-anchoring-design.md`

## Global Constraints

- Everything written into the repo is in English (code, comments, commits, changesets).
- Commit format: `<emoji> <type>(<scope>): <subject>` with the gitmoji shortcode from CONTRIBUTING.md's table (`fix` = `:bug:`, `test` = `:white_check_mark:`). A `commit-msg` hook rejects mismatches. End every commit body with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Every task's implementation must keep `npm run typecheck` green: JSDoc signatures are checked by `tsc --noEmit` with `checkJs`.
- No new user-visible strings (so no i18n work), no new dependencies (so the 50 KB size budget is unaffected), no `index.d.ts` change (no public API change).
- Do NOT touch the unrelated uncommitted changes already in the working tree (reaction pills / tooltip work in `src/components.js`, `src/reactions.js`, `src/styles.js`, `src/constants.js`, `DECISIONS.md`, their tests, and the two existing `.changeset/*.md` files). Stage only the files each task names.
- Run tests with `npx vitest run <file>` (the repo uses vitest).

---

### Task 1: Deepest-wins tie-breaking in `resolveAnchor`

**Files:**

- Modify: `src/anchor.js:244-251` (the `bestMatch` helper)
- Test: `test/anchor.test.js` (append to the existing `describe("resolveAnchor")` block)
- Create: `.changeset/rescue-deepest-tie.md`
- Modify: `DECISIONS.md` (append a new entry at the end)

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: nothing other tasks rely on. `resolveAnchor(anchor, doc?)`'s signature and thresholds are unchanged; only exact-score ties between an ancestor and its descendant flip.

- [ ] **Step 1: Write the failing tests**

Append inside `describe("resolveAnchor", ...)` in `test/anchor.test.js`. Context the existing file already has: it imports `{ createAnchor, resolveAnchor }` from `../src/anchor.js` and clears `document.body.innerHTML` in `afterEach`.

```js
it("a rescue tie between ancestor and descendant resolves to the descendant", () => {
  // Long enough that the 64-char snippet truncation makes the parent's and
  // the child's text fingerprints identical — the tie the bug needs.
  const text = "x".repeat(80);
  document.body.innerHTML = `<div><div>${text}</div></div>`;
  const inner = /** @type {HTMLElement} */ (
    document.body.querySelector("div > div")
  );

  const anchor = createAnchor(inner, 0.5, 0.5);
  // Simulate the field failure: the stored selector no longer matches
  // (e.g. it captured a transient host state class), forcing the rescue.
  anchor.selector = null;

  const result = resolveAnchor(anchor);
  expect(result?.element).toBe(inner);
});

it("a rescue tie between unrelated elements keeps document order", () => {
  document.body.innerHTML =
    "<div><span>Same text</span></div><div><span>Same text</span></div>";
  const first = /** @type {HTMLElement} */ (
    document.body.querySelector("span")
  );

  const anchor = createAnchor(first, 0.5, 0.5);
  anchor.selector = null;

  // Both spans are index 0 of 1 within their parents and carry identical
  // text: an exact tie where neither contains the other. The first in
  // document order — the original — must still win.
  const result = resolveAnchor(anchor);
  expect(result?.element).toBe(first);
});
```

- [ ] **Step 2: Run the tests to verify the first fails**

Run: `npx vitest run test/anchor.test.js`
Expected: the ancestor/descendant test FAILS (resolves to the outer `div`, not `inner`); the document-order test PASSES already (it pins current behaviour so the fix cannot overshoot).

- [ ] **Step 3: Implement the tie-break**

In `src/anchor.js`, replace the `bestMatch` helper (currently lines 244–251):

```js
const bestMatch = (candidates, fingerprint) => {
  let best = null;
  for (const element of candidates) {
    const confidence = scoreElement(element, fingerprint);
    if (
      !best ||
      confidence > best.confidence ||
      // On an exact tie prefer the deepest candidate. Document order yields
      // ancestors first, and with the text snippet truncated to 64 chars a
      // parent and its child tie systematically — the most specific element
      // that scores the same is the better anchor (the selector cascade's
      // intuition). Ties between unrelated elements keep document order.
      (confidence === best.confidence && best.element.contains(element))
    ) {
      best = { element, confidence };
    }
  }
  return best;
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/anchor.test.js`
Expected: PASS, including every pre-existing test in the file.

- [ ] **Step 5: Write the changeset**

Create `.changeset/rescue-deepest-tie.md`:

```md
---
"helldots": patch
---

Resolve rescue-search ties to the deepest matching element. The text
fingerprint is truncated to 64 characters, so in nested DOMs a parent and
its child score identically; the strict comparison kept the first candidate
in document order — always the ancestor — so the most specific match could
never win. Ties between unrelated elements keep document order, and anchors
that resolved uniquely before resolve identically now.
```

- [ ] **Step 6: Record the decision**

Append to `DECISIONS.md` (at the end of the file):

```md
## The rescue search prefers the deepest candidate on ties

`resolveAnchor`'s tag-wide rescue scores candidates against the stored
fingerprint, and `bestMatch` kept the first best in document order. That
order puts ancestors before descendants, and ties between them are
systematic, not exotic: the text snippet is truncated to 64 characters, so
a parent whose only content is the anchored child carries the identical
snippet, and with no stable attributes the remaining position signal often
matches too. The most specific matching element could never win.

The fix is one comparison: on an _exact_ confidence tie, a candidate that
is a descendant of the current best replaces it. No weights or thresholds
move (`SELECTOR_THRESHOLD`, `RESCUE_THRESHOLD`, the 0.8 prefix bonus stay
put — moving them without corpus data is free risk), so any anchor that
resolved uniquely before resolves identically now.

One limitation accepted: when the ancestor was the _correct_ answer and a
descendant ties exactly, the descendant now wins. A tie of that shape is
inherently ambiguous — the fingerprint cannot tell the two apart — and the
more specific element is the better default.
```

- [ ] **Step 7: Commit**

```bash
git add src/anchor.js test/anchor.test.js .changeset/rescue-deepest-tie.md DECISIONS.md
git commit -m "$(cat <<'EOF'
:bug: fix(anchoring): Prefer the deepest candidate on rescue-score ties

The 64-char snippet truncation makes a parent and its anchored child tie
systematically, and document order always handed the tie to the ancestor.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: A drag reports the region's center, and the region itself

**Files:**

- Modify: `src/capture-flow.js:126-155` (`onDragEnd`) and the `onPlace` JSDoc in the constructor (line 25)
- Test: `test/capture-flow.test.js`

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: `onPlace(x: number, y: number, region?: { left: number, top: number, width: number, height: number })`. Task 3 wires the new third parameter through `CommentOverlay`. `region` is `undefined` for clicks and for drags under the existing 10×10 capture threshold; when present it is the same object shape `startRegionCapture` already receives.

- [ ] **Step 1: Update the existing assertion and write the new failing tests**

In `test/capture-flow.test.js`, the test `"returns from the gesture while the render is still running"` (line ~214) currently asserts the mouseup point. The drag there goes from (10, 10) to (200, 150), so the region is `{ left: 10, top: 10, width: 190, height: 140 }` and its center is (105, 80). Change:

```js
expect(onPlace).toHaveBeenCalledWith(200, 150);
```

to:

```js
expect(onPlace).toHaveBeenCalledWith(105, 80, {
  left: 10,
  top: 10,
  width: 190,
  height: 140,
});
```

Then add two tests to the main `describe("CaptureFlow")` block (the file already defines `move`/`up`/`down` event helpers and `makeFlow`):

```js
it("a drag places at the region's center and passes the region", async () => {
  const onPlace = vi.fn().mockResolvedValue(undefined);
  const flow = makeFlow({ onPlace });

  flow.beginDrag(down(10, 20));
  flow.onDragMove(move(110, 100));
  await flow.onDragEnd(up(110, 100));

  expect(onPlace).toHaveBeenCalledWith(60, 60, {
    left: 10,
    top: 20,
    width: 100,
    height: 80,
  });
});

it("a drag too small to capture places at its center, with no region", async () => {
  const onPlace = vi.fn().mockResolvedValue(undefined);
  const flow = makeFlow({ onPlace });

  // Past the 5px drag threshold, under the 10px capture threshold.
  flow.beginDrag(down(10, 10));
  flow.onDragMove(move(18, 18));
  await flow.onDragEnd(up(18, 18));

  expect(onPlace).toHaveBeenCalledWith(14, 14, undefined);
});
```

The pre-existing `"a sub-threshold gesture places at the mousedown point"` test (a 2 px move, `_isDragging` never set) keeps passing unchanged: the click path still calls `onPlace(x, y)` with two arguments.

- [ ] **Step 2: Run the tests to verify the new/changed ones fail**

Run: `npx vitest run test/capture-flow.test.js`
Expected: the two new tests and the updated assertion FAIL (`onPlace` still receives the mouseup point); everything else PASSES.

- [ ] **Step 3: Implement**

In `src/capture-flow.js`, replace the `_isDragging` branch of `onDragEnd` (keep the `else` branch as is):

```js
if (this._isDragging) {
  const left = Math.min(this._dragStart.x, e.clientX);
  const top = Math.min(this._dragStart.y, e.clientY);
  const width = Math.abs(e.clientX - this._dragStart.x);
  const height = Math.abs(e.clientY - this._dragStart.y);

  this._selectionRect?.remove();
  this._selectionRect = null;

  const region =
    width > 10 && height > 10 ? { left, top, width, height } : undefined;
  if (region) this.startRegionCapture(region);

  // NOT awaited any more. This used to sit behind the render, which on
  // a heavy page meant a second or more between releasing the mouse and
  // the box appearing — the gesture read as having been ignored. The
  // crop arrives through `onRegionCaptured` and drops into the slot the
  // box is already showing.
  //
  // The point is the region's CENTER, not the mouseup pixel: the gesture
  // names the rectangle, and anchoring to wherever the mouse happened to
  // be released let a transient overlay under that one pixel claim the
  // comment (see the region-anchoring design doc).
  await this.onPlace(left + width / 2, top + height / 2, region);
} else {
  await this.onPlace(this._dragStart.x, this._dragStart.y);
}
```

And update the `onPlace` JSDoc in the constructor's `deps` typedef (line 25) from:

```js
   *   onPlace: (x: number, y: number) => Promise<void>,
```

to:

```js
   *   onPlace: (x: number, y: number, region?: { left: number, top: number, width: number, height: number }) => Promise<void>,
```

- [ ] **Step 4: Run the tests to verify they pass, and typecheck**

Run: `npx vitest run test/capture-flow.test.js && npm run typecheck`
Expected: all tests PASS; `tsc --noEmit` exits clean.

- [ ] **Step 5: Commit**

```bash
git add src/capture-flow.js test/capture-flow.test.js
git commit -m "$(cat <<'EOF'
:bug: fix(capture): Place a drag comment at the region's center

The rectangle only fed the screenshot crop; placement used the mouseup
pixel, which is not what the gesture names. onPlace now also receives the
region so the overlay can anchor to the element that shows it.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

(The changeset for the whole drag fix lands with Task 3, which completes the user-visible behaviour.)

---

### Task 3: The overlay anchors a region to the element that shows it

**Files:**

- Modify: `src/overlay.js:261` (the `onPlace` wiring) and `src/overlay.js:800-854` (`_placeCommentAtPoint`), plus a new module-level constant and private helper
- Test: `test/overlay.test.js` (new `describe` block)
- Create: `.changeset/drag-anchors-region.md`
- Modify: `DECISIONS.md` (append a new entry at the end)

**Interfaces:**

- Consumes: `onPlace(x, y, region?)` from Task 2 — `region` is `{ left, top, width, height }` in viewport coordinates or `undefined`.
- Produces: nothing later tasks rely on. `_placeCommentAtPoint(clientX, clientY, region?)` stays private; `overlay.currentPosition` keeps its existing shape.

- [ ] **Step 1: Write the failing tests**

Add a new top-level `describe` block to `test/overlay.test.js`, next to the other placement suites. The file already provides `makeOverlay`, `stubBodyRect`, a `beforeEach` that stubs `document.elementFromPoint = () => null`, and an `afterEach` that cleans the DOM. jsdom has no `elementsFromPoint`, so tests assign it directly and must delete it afterwards.

```js
describe("region anchoring", () => {
  /** Direct assignment, same convention as stubBodyRect — see its comment. */
  const rectOf = (el, { left, top, width, height }) => {
    el.getBoundingClientRect = () => ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
    });
  };

  afterEach(() => {
    // Assigned per-test below; jsdom has no own implementation to restore.
    delete document.elementsFromPoint;
  });

  it("targets the stack element that covers the region, not the overlay above its center", async () => {
    overlay = makeOverlay();
    stubBodyRect();

    // A 310px-wide floating panel sits above a full-width bar — the MARLO
    // shape. The region (553x81) is mostly bar; the panel covers ~56% of it.
    const panel = document.createElement("div");
    const bar = document.createElement("section");
    document.body.append(panel, bar);
    rectOf(panel, { left: 300, top: 0, width: 310, height: 400 });
    rectOf(bar, { left: 0, top: 100, width: 800, height: 100 });
    document.elementsFromPoint = () => [panel, bar, document.body];

    const region = { left: 100, top: 110, width: 553, height: 81 };
    await overlay._placeCommentAtPoint(376, 150, region);

    expect(overlay.currentPosition.target).toBe(bar);
    expect(overlay.currentPosition.container).toBe(bar);
  });

  it("falls back to the point element when elementsFromPoint is missing", async () => {
    overlay = makeOverlay();
    stubBodyRect();

    const el = document.createElement("section");
    document.body.append(el);
    document.elementFromPoint = () => el;
    // No document.elementsFromPoint at all (jsdom reality).

    const region = { left: 0, top: 0, width: 100, height: 100 };
    await overlay._placeCommentAtPoint(50, 50, region);

    expect(overlay.currentPosition.target).toBe(el);
  });

  it("without a region, placement behaves exactly as before", async () => {
    overlay = makeOverlay();
    stubBodyRect();

    const el = document.createElement("section");
    document.body.append(el);
    document.elementFromPoint = () => el;
    // elementsFromPoint present but must not be consulted for a click.
    document.elementsFromPoint = vi.fn(() => [document.body]);

    await overlay._placeCommentAtPoint(50, 50);

    expect(overlay.currentPosition.target).toBe(el);
    expect(document.elementsFromPoint).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/overlay.test.js`
Expected: the first and third new tests FAIL (`_placeCommentAtPoint` ignores its third argument today, so the first test targets `null`→body and the third passes `elementsFromPoint` untouched — verify the first fails; the fallback tests may pass by construction). Every pre-existing test PASSES.

- [ ] **Step 3: Implement**

In `src/overlay.js`:

1. Wiring (line 261):

```js
      onPlace: (x, y, region) => this._placeCommentAtPoint(x, y, region),
```

2. Add a module-level constant near the top of the file, next to the other module constants:

```js
// A drag names a region, and the region means the element that shows (most
// of) it — not whatever sits on top of its center pixel. Coverage rather
// than strict containment because human selections overshoot by a few
// pixels; 60% tolerates the overshoot while still rejecting a partial
// overlay (a floating panel, a dropdown) hovering above the framed content.
const REGION_COVERAGE_MIN = 0.6;
```

3. Add the private helper (place it right above `_placeCommentAtPoint`; `TAG_NAME` is already imported at the top of the file):

```js
  /**
   * The element a drag-selected region should anchor to: the topmost element
   * in the hit-test stack at the region's center whose intersection with the
   * region covers at least REGION_COVERAGE_MIN of its area. Reading the
   * stack (rather than walking ancestors) also handles overlays rendered in
   * portals, which are not ancestors of anything useful. Null when nothing
   * qualifies or the environment has no `elementsFromPoint` (jsdom).
   * @param {{ left: number, top: number, width: number, height: number }} region
   * @param {number} centerX
   * @param {number} centerY
   * @returns {Element | null}
   */
  _regionTarget(region, centerX, centerY) {
    if (typeof document.elementsFromPoint !== "function") return null;
    const area = region.width * region.height;
    if (!(area > 0)) return null;

    for (const el of document.elementsFromPoint(centerX, centerY)) {
      // Our own shadow host can appear in the stack even with the overlay's
      // pointer-events off (the toolbar, an open panel) — never a target.
      if (el.tagName.toLowerCase() === TAG_NAME.toLowerCase()) continue;
      const rect = el.getBoundingClientRect();
      const overlapX =
        Math.min(rect.right, region.left + region.width) -
        Math.max(rect.left, region.left);
      const overlapY =
        Math.min(rect.bottom, region.top + region.height) -
        Math.max(rect.top, region.top);
      if (overlapX <= 0 || overlapY <= 0) continue;
      if ((overlapX * overlapY) / area >= REGION_COVERAGE_MIN) return el;
    }
    return null;
  }
```

4. In `_placeCommentAtPoint`, change the signature and the hit-test (lines 800–808). The signature gains an optional param and a JSDoc block (the method has none today — add one so `tsc` types the new param):

```js
  /**
   * @param {number} clientX
   * @param {number} clientY
   * @param {{ left: number, top: number, width: number, height: number }} [region]
   *   Present when the placement comes from a drag: the selected rectangle,
   *   in viewport coordinates. `clientX/clientY` is then its center.
   */
  async _placeCommentAtPoint(clientX, clientY, region) {
```

and replace the `underlying` lookup:

```js
const prevPointerEvents = this.overlay.style.pointerEvents;
this.overlay.style.pointerEvents = "none";
const underlying =
  (region ? this._regionTarget(region, clientX, clientY) : null) ||
  document.elementFromPoint(clientX, clientY);
this.overlay.style.pointerEvents = prevPointerEvents || "";
```

Everything downstream (`container = underlying?.closest?.(SELECTORS.CONTAINER) || document.body`, `targetSelector`, `relativeX/Y`, preview circle, comment box) is untouched.

- [ ] **Step 4: Run the tests and gates**

Run: `npx vitest run test/overlay.test.js test/capture-flow.test.js && npm run typecheck && npm run lint`
Expected: all PASS, typecheck and lint clean.

- [ ] **Step 5: Write the changeset**

Create `.changeset/drag-anchors-region.md`:

```md
---
"helldots": patch
---

A drag comment now anchors to the region it selected, not to the mouseup
pixel. The comment is placed at the rectangle's center, and the anchor
target is the topmost element at that point whose box covers at least 60%
of the region — so a floating panel that happens to sit under the released
mouse (and later closes) can no longer capture the anchor and leave the
marker invisible. Plain-click placement is unchanged.
```

- [ ] **Step 6: Record the decision**

Append to `DECISIONS.md` (at the end of the file):

```md
## A drag anchors to the region it framed, not the mouseup pixel

`onDragEnd` used the selection rectangle only to crop the screenshot;
placement went through `elementFromPoint` at the released-mouse position.
A field report showed the failure mode: a ~553×81 selection over a phase
bar, released over an open search panel, anchored the comment's
`targetSelector` to an input inside that panel — an element that measures
0×0 whenever the panel is closed, so the marker was born hidden and the
comment looked lost (it was still in the inbox).

Now a drag places the comment at the region's center, and the target is
chosen from `document.elementsFromPoint` at that center: the topmost
element whose intersection with the region covers at least 60% of the
region's area (`REGION_COVERAGE_MIN`).

- **Coverage, not strict containment**: human selections overshoot the
  element they mean by a few pixels; requiring the element's rect to
  contain the region would skip to a parent almost every time. 60%
  tolerates overshoot and still rejects partial overlays.
- **The stack, not an ancestor walk**: an overlay rendered in a portal is
  not an ancestor of the content it covers; the hit-test stack sees
  through it to the element underneath.
- **Rejected: refusing "ephemeral" targets** (dialogs, popovers) at anchor
  time. A comment deliberately left inside a modal must hide with it —
  that contract is already recorded ("The playground modal uses
  `class="modal-content"`"). The bug was an _accidental_ anchor, and this
  fix removes the accident instead of breaking the contract.
- **Rejected: degrading a hidden-target marker** to a container-relative
  position. The marker's position is derived from the anchor, never
  invented.

A visible UX change is accepted: the marker and the comment box open at
the region's center rather than wherever the mouse was released — which is
what the gesture means, and keeps the marker and the anchor pointing at
the same thing.
```

- [ ] **Step 7: Commit**

```bash
git add src/overlay.js test/overlay.test.js .changeset/drag-anchors-region.md DECISIONS.md
git commit -m "$(cat <<'EOF'
:bug: fix(anchoring): Anchor drag comments to the element the region frames

The target is now the topmost element at the region's center covering at
least 60% of it, so a transient panel under the mouseup pixel can no
longer claim the anchor and leave the marker invisible when it closes.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Full verification gate

**Files:** none (verification only).

**Interfaces:**

- Consumes: the committed state of Tasks 1–3.
- Produces: the evidence for claiming completion.

- [ ] **Step 1: Run the full gate**

Run: `npm run verify`
Expected: lint → typecheck → format → test → build → size all PASS. Note: the working tree also carries unrelated in-progress changes (reaction pills work); if a failure points at those files, report it as pre-existing rather than fixing it here.

- [ ] **Step 2: Report**

State the verify output honestly (per CLAUDE.md: never claim a gate passes without having run it and read the output). Do not push — the branch state and push are decided with the user.
