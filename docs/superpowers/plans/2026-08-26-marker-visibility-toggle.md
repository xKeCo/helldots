# Marker Visibility Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An eye button in a second pill beside the comment toolbar hides and shows every comment marker, persisted per browser, auto-reshown when the user enters comment mode or navigates to a comment from the inbox.

**Architecture:** Two seams. `createToolbar` (src/components.js) grows an absolutely-positioned second pill so the main pill never moves; `CommentOverlay` (src/overlay.js) owns one internal setter `_setMarkersHidden(hidden)` that flips state, a CSS class on the marker mount container, the button's icon/ARIA/tooltip, and localStorage — so they can never disagree. Hiding is pure CSS (`display: none` on circles and marker tooltips under the class); the marker engine keeps running so re-show is instant and correctly positioned.

**Tech Stack:** Plain ES modules, vitest + jsdom, changesets, `tsc --noEmit` over JSDoc.

Spec: `docs/superpowers/specs/2026-08-26-marker-visibility-toggle-design.md`

## Global Constraints

- Everything written into the repo is in English (code, comments, commits, changesets).
- Commit format: `<emoji> <type>(<scope>): <subject>` with the gitmoji shortcode from CONTRIBUTING.md's table (`feat` = `:sparkles:`). A `commit-msg` hook rejects mismatches. End every commit body with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Every user-visible string goes into BOTH `src/locales/en.js` and `src/locales/es.js` — never a literal in the UI; a regression test scans `src/components.js` for hardcoded English.
- No public API: nothing in `src/index.d.ts` changes. No new dependencies (50 KB gzip budget). `npm run typecheck` must stay green.
- Run tests with `npx vitest run <file>`; run the full suite plus `npm run typecheck` and `npm run lint` once before each commit.
- The working tree is clean at plan start; stage exactly the files each task names.

---

### Task 1: The visibility pill in the toolbar

**Files:**

- Modify: `src/constants.js` (add three CLASSES entries near the other TOOLBAR\_\* keys, ~line 82)
- Modify: `src/components.js` (two SVG constants next to `COMMENT_BUBBLE_SVG`/`MENU_ICON_SVG` at ~line 163; extend `createToolbar` at ~line 266; export the SVGs)
- Modify: `src/locales/en.js` and `src/locales/es.js` (two strings next to `toolbarComment`/`toolbarInbox`, line ~37)
- Modify: `src/styles.js` (share the pill visual, position the second pill; the pill visual lives on `.${CLASSES.TOOLBAR_ACTIONS}` at ~line 132)
- Test: `test/components.test.js`

**Interfaces:**

- Consumes: existing `createActionWithTooltip(btnClass, btnSvg, tooltipContent, label)` helper in src/components.js (~line 247), existing `CLASSES.TOOLBAR_TEXT`, `CLASSES.TOOLBAR_ACTION_WRAPPER`.
- Produces (Task 2 relies on these exact names): `CLASSES.TOOLBAR_VISIBILITY = "toolbar-visibility"`, `CLASSES.TOOLBAR_EYE_BTN = "toolbar-eye-btn"`, `CLASSES.MARKERS_HIDDEN = "markers-hidden"`; exported `EYE_ICON_SVG` and `EYE_OFF_ICON_SVG` from src/components.js; locale keys `toolbarHideComments` and `toolbarShowComments`; the eye button inside the toolbar DOM with class `toolbar-eye-btn`, `aria-pressed="false"`, `aria-label = strings.toolbarHideComments`, and a `.toolbar-text` label inside its wrapper's tooltip.

- [ ] **Step 1: Write the failing test**

Add to `test/components.test.js` (the file already imports `createToolbar`, `CLASSES`, and `getStrings` — check its imports and extend them if any of these are missing):

```js
describe("createToolbar visibility pill", () => {
  it("renders the eye button in its own pill, to the right of the actions", () => {
    const toolbar = createToolbar({}, getStrings("en"));

    const pill = toolbar.querySelector(`.${CLASSES.TOOLBAR_VISIBILITY}`);
    expect(pill).toBeTruthy();
    // A sibling of the actions pill, not a third button inside it.
    expect(pill.parentElement).toBe(toolbar);
    expect(pill.closest(`.${CLASSES.TOOLBAR_ACTIONS}`)).toBeNull();

    const btn = pill.querySelector(`.${CLASSES.TOOLBAR_EYE_BTN}`);
    expect(btn).toBeTruthy();
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(btn.getAttribute("aria-label")).toBe(
      getStrings("en").toolbarHideComments
    );
    expect(btn.querySelector("svg")).toBeTruthy();
  });

  it("gives the eye button the same hover tooltip pattern as the others", () => {
    const toolbar = createToolbar({}, getStrings("es"));
    const wrapper = toolbar
      .querySelector(`.${CLASSES.TOOLBAR_EYE_BTN}`)
      .closest(`.${CLASSES.TOOLBAR_ACTION_WRAPPER}`);

    const label = wrapper.querySelector(`.${CLASSES.TOOLBAR_TEXT}`);
    expect(label.textContent).toBe(getStrings("es").toolbarHideComments);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/components.test.js`
Expected: both new tests FAIL (`.toolbar-visibility` does not exist); every pre-existing test PASSES.

- [ ] **Step 3: Implement**

1. `src/constants.js` — add to `CLASSES`, next to the other `TOOLBAR_*` keys:

```js
  TOOLBAR_VISIBILITY: "toolbar-visibility",
  TOOLBAR_EYE_BTN: "toolbar-eye-btn",
  MARKERS_HIDDEN: "markers-hidden",
```

2. `src/locales/en.js`, next to `toolbarInbox`:

```js
  toolbarHideComments: "Hide comments",
  toolbarShowComments: "Show comments",
```

`src/locales/es.js`, same spot:

```js
  toolbarHideComments: "Ocultar comentarios",
  toolbarShowComments: "Mostrar comentarios",
```

3. `src/components.js` — next to `MENU_ICON_SVG` add the two icons (Feather's eye / eye-off outlines, stroke-based so the slash reads at 16px), and export them (Task 2 swaps them from the overlay):

```js
export const EYE_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;

export const EYE_OFF_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
```

4. `src/components.js` — in `createToolbar`, after `actions.appendChild(inboxWrapper); toolbar.appendChild(actions);` and before `return toolbar;`:

```js
const visibilityLabel = document.createElement("span");
visibilityLabel.className = CLASSES.TOOLBAR_TEXT;
visibilityLabel.textContent = strings.toolbarHideComments;

const visibilityWrapper = createActionWithTooltip(
  CLASSES.TOOLBAR_EYE_BTN,
  EYE_ICON_SVG,
  [visibilityLabel],
  strings.toolbarHideComments
);
visibilityWrapper
  .querySelector(`.${CLASSES.TOOLBAR_EYE_BTN}`)
  ?.setAttribute("aria-pressed", "false");

// Its own pill, out of flow: the main pill keeps its exact centered
// position, and this one hangs off its right edge (the mockup's layout).
const visibility = document.createElement("div");
visibility.className = CLASSES.TOOLBAR_VISIBILITY;
visibility.appendChild(visibilityWrapper);
toolbar.appendChild(visibility);
```

5. `src/styles.js` — the pill visual currently sits on `.${CLASSES.TOOLBAR_ACTIONS}` (~line 132). Make it shared and position the new pill. Change the selector of that rule from:

```css
    .${CLASSES.TOOLBAR_ACTIONS} {
```

to:

```css
    .${CLASSES.TOOLBAR_ACTIONS},
    .${CLASSES.TOOLBAR_VISIBILITY} {
```

and add, right after that rule:

```css
    .${CLASSES.TOOLBAR_VISIBILITY} {
        position: absolute;
        left: calc(100% + 12px);
        top: 0;
    }
```

(Both rules keep `display: flex; flex-direction: row;` etc. from the shared block; the second only adds positioning.)

6. In `src/components.js`, the eye's stroke-based SVG inherits `color` like the fill-based ones (`currentColor`) — no extra CSS needed for the icon itself.

- [ ] **Step 4: Run the tests to verify they pass, plus gates**

Run: `npx vitest run test/components.test.js test/i18n.test.js && npm run typecheck && npm run lint`
Expected: PASS (the i18n suite covers the locale-key parity the repo enforces).

- [ ] **Step 5: Commit**

```bash
git add src/constants.js src/components.js src/locales/en.js src/locales/es.js src/styles.js test/components.test.js
git commit -m "$(cat <<'EOF'
:sparkles: feat(toolbar): Add the visibility pill with the eye button

A second pill hangs off the toolbar's right edge (absolute, out of flow,
so the main pill never moves). Rendering only — the toggle behavior lands
in the next commit.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The toggle behavior, persistence, and auto-reshow

**Files:**

- Modify: `src/constants.js` (one exported storage-key constant)
- Modify: `src/overlay.js` (wire the button, the setter, the mount read, two auto-reshow hooks)
- Modify: `src/styles.js` (the hide rule)
- Create: `.changeset/eye-markers-toggle.md`
- Modify: `DECISIONS.md` (append one entry)
- Test: `test/overlay.test.js`

**Interfaces:**

- Consumes from Task 1: `CLASSES.TOOLBAR_EYE_BTN`, `CLASSES.MARKERS_HIDDEN`, `CLASSES.TOOLBAR_ACTION_WRAPPER`, `CLASSES.TOOLBAR_TEXT`, exported `EYE_ICON_SVG`/`EYE_OFF_ICON_SVG` from `src/components.js`, locale keys `toolbarHideComments`/`toolbarShowComments`.
- Consumes from the existing codebase: `this.toolbar` (built in the constructor, ~line 217), `this.overlay` (the element markers mount into — `MarkerEngine` gets it as `container` at ~line 309), `this.closeThreadPopover()` (~line 1359), `toggleCommentMode()` (~line 986), `scrollMarkerIntoView(comment)` (~line 2255), `bindEventListeners()` (where `commentBtn`'s click is wired, ~line 679).
- Produces: nothing outside this task — `_setMarkersHidden` stays private, no public API.

- [ ] **Step 1: Write the failing tests**

Add a new top-level describe to `test/overlay.test.js`, near the other toolbar-related suites. The file already provides `makeOverlay` and cleans the DOM per test; `MARKERS_HIDDEN_STORAGE_KEY` must be added to the existing `CLASSES` import line from `../src/constants.js`.

```js
describe("marker visibility toggle", () => {
  const eyeBtnOf = (o) =>
    o.toolbar.querySelector(`.${CLASSES.TOOLBAR_EYE_BTN}`);

  afterEach(() => {
    localStorage.removeItem(MARKERS_HIDDEN_STORAGE_KEY);
  });

  it("hides the marker layer, closes the popover, and persists the flag", () => {
    overlay = makeOverlay();
    const close = vi.spyOn(overlay, "closeThreadPopover");
    const btn = eyeBtnOf(overlay);

    btn.click();

    expect(overlay.overlay.classList.contains(CLASSES.MARKERS_HIDDEN)).toBe(
      true
    );
    expect(close).toHaveBeenCalled();
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.getAttribute("aria-label")).toBe(
      getStrings("en").toolbarShowComments
    );
    expect(localStorage.getItem(MARKERS_HIDDEN_STORAGE_KEY)).toBe("true");
  });

  it("a second click shows everything again", () => {
    overlay = makeOverlay();
    const btn = eyeBtnOf(overlay);

    btn.click();
    btn.click();

    expect(overlay.overlay.classList.contains(CLASSES.MARKERS_HIDDEN)).toBe(
      false
    );
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(btn.getAttribute("aria-label")).toBe(
      getStrings("en").toolbarHideComments
    );
    expect(localStorage.getItem(MARKERS_HIDDEN_STORAGE_KEY)).toBe("false");
  });

  it("entering comment mode re-shows the markers (the shortcut funnels here too)", () => {
    overlay = makeOverlay();
    eyeBtnOf(overlay).click();

    overlay.toggleCommentMode();

    expect(overlay.overlay.classList.contains(CLASSES.MARKERS_HIDDEN)).toBe(
      false
    );
    expect(localStorage.getItem(MARKERS_HIDDEN_STORAGE_KEY)).toBe("false");
    // Leaving comment mode does NOT re-hide.
    overlay.toggleCommentMode();
    expect(overlay.overlay.classList.contains(CLASSES.MARKERS_HIDDEN)).toBe(
      false
    );
  });

  it("navigating to a marker from the inbox re-shows the layer first", () => {
    overlay = makeOverlay();
    const scroll = vi
      .spyOn(overlay.markers, "scrollMarkerIntoView")
      .mockImplementation(() => {});
    eyeBtnOf(overlay).click();

    overlay.scrollMarkerIntoView({ id: "c1" });

    expect(overlay.overlay.classList.contains(CLASSES.MARKERS_HIDDEN)).toBe(
      false
    );
    expect(scroll).toHaveBeenCalled();
  });

  it("a stored flag hides the layer from mount", () => {
    localStorage.setItem(MARKERS_HIDDEN_STORAGE_KEY, "true");
    overlay = makeOverlay();

    expect(overlay.overlay.classList.contains(CLASSES.MARKERS_HIDDEN)).toBe(
      true
    );
    expect(eyeBtnOf(overlay).getAttribute("aria-pressed")).toBe("true");
  });

  it("a throwing localStorage leaves the widget usable and visible", () => {
    const get = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    const set = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });

    overlay = makeOverlay();
    expect(overlay.overlay.classList.contains(CLASSES.MARKERS_HIDDEN)).toBe(
      false
    );

    // The toggle still works for the session; only persistence is lost.
    eyeBtnOf(overlay).click();
    expect(overlay.overlay.classList.contains(CLASSES.MARKERS_HIDDEN)).toBe(
      true
    );

    get.mockRestore();
    set.mockRestore();
  });
});
```

If `getStrings` is not already imported in `test/overlay.test.js`, add it from `../src/i18n.js`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/overlay.test.js`
Expected: every new test FAILS (no wiring yet; the class never appears); all pre-existing tests PASS.

- [ ] **Step 3: Implement**

1. `src/constants.js` — next to the other exported constants (not inside `CLASSES`):

```js
// The eye toggle's persisted preference. Its own key, independent of the
// widget's `persistence` option: it is a viewer preference, not comment data.
export const MARKERS_HIDDEN_STORAGE_KEY = "helldots-markers-hidden";
```

2. `src/overlay.js` — imports: add `MARKERS_HIDDEN_STORAGE_KEY` to the constants import, and `EYE_ICON_SVG, EYE_OFF_ICON_SVG` to the components import.

3. In the constructor, right after `this.inboxBtn = ...` (~line 229):

```js
this.eyeBtn = this.toolbar.querySelector(`.${CLASSES.TOOLBAR_EYE_BTN}`);
/** Whether the on-page marker layer is hidden (the eye toggle). */
this.markersHidden = false;
```

and after `this.markers.start();` (~line 321), the mount read:

```js
// The eye toggle's preference survives reloads; a blocked localStorage
// just means the layer starts visible.
try {
  if (localStorage.getItem(MARKERS_HIDDEN_STORAGE_KEY) === "true") {
    this._setMarkersHidden(true);
  }
} catch {
  /* storage unavailable — stay visible */
}
```

4. The setter — one place flips everything, so state, class, icon, ARIA, tooltip and storage can never disagree. Add it near `toggleCommentMode`:

```js
  /**
   * The eye toggle's single entry point: the button, the mount read, and
   * both auto-reshow paths all land here. Hiding is CSS-only (the marker
   * engine keeps running, so re-showing is instant and correctly placed),
   * plus dismissing the floating UI a hidden marker would orphan.
   * @param {boolean} hidden
   */
  _setMarkersHidden(hidden) {
    this.markersHidden = hidden;
    this.overlay.classList.toggle(CLASSES.MARKERS_HIDDEN, hidden);
    if (hidden) this.closeThreadPopover();

    if (this.eyeBtn) {
      this.eyeBtn.setAttribute("aria-pressed", String(hidden));
      const label = hidden
        ? this.strings.toolbarShowComments
        : this.strings.toolbarHideComments;
      this.eyeBtn.setAttribute("aria-label", label);
      this.eyeBtn.innerHTML = hidden ? EYE_OFF_ICON_SVG : EYE_ICON_SVG;
      const text = this.eyeBtn
        .closest(`.${CLASSES.TOOLBAR_ACTION_WRAPPER}`)
        ?.querySelector(`.${CLASSES.TOOLBAR_TEXT}`);
      if (text) text.textContent = label;
    }

    // Written on every change — including the automatic re-shows — so a
    // later reload matches what the viewer last saw.
    try {
      localStorage.setItem(MARKERS_HIDDEN_STORAGE_KEY, String(hidden));
    } catch {
      /* preference just does not persist */
    }
  }
```

5. Wire the click in `bindEventListeners`, next to the `commentBtn` listener (~line 679):

```js
this.eyeBtn?.addEventListener("click", () =>
  this._setMarkersHidden(!this.markersHidden)
);
```

6. Auto-reshow hooks. In `toggleCommentMode` (~line 986), right after `if (this.commentMode) this.closeInbox();`:

```js
// Someone about to comment wants to see the existing comments; the
// shortcut funnels through here too. Leaving the mode does not re-hide.
if (this.commentMode && this.markersHidden) this._setMarkersHidden(false);
```

In `scrollMarkerIntoView` (~line 2255), before the delegation:

```js
  scrollMarkerIntoView(comment) {
    // Scrolling to an invisible marker would scroll to nothing.
    if (this.markersHidden) this._setMarkersHidden(false);
    this.markers.scrollMarkerIntoView(comment);
  }
```

7. `src/styles.js` — the hide rule, next to the marker/circle styles:

```css
    /* The eye toggle: hiding is a class on the mount container, so every
       circle — and the hover tooltip a marker owns — vanishes as one layer.
       The engine keeps positioning them; re-show is instant. */
    .${CLASSES.MARKERS_HIDDEN} .${CLASSES.CIRCLE},
    .${CLASSES.MARKERS_HIDDEN} .${CLASSES.TOOLTIP} {
        display: none !important;
    }
```

(`!important` because circles carry inline `display` state from the engine's visibility passes; the layer switch must win over per-marker inline styles.)

- [ ] **Step 4: Run the tests to verify they pass, plus gates**

Run: `npx vitest run test/overlay.test.js test/components.test.js && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Write the changeset**

Create `.changeset/eye-markers-toggle.md`:

```md
---
"helldots": minor
---

Add a marker visibility toggle: an eye button in its own pill beside the
toolbar hides every comment marker to cut visual noise, and shows them
again. The preference persists per browser, and the layer re-shows itself
when the user enters comment mode (button or shortcut) or navigates to a
comment from the inbox. The icon, tooltip, accessible name, and
`aria-pressed` state all flip together.
```

- [ ] **Step 6: Record the decision**

Append to `DECISIONS.md` (at the end of the file):

```md
## The eye toggle persists, and anything that needs a marker re-shows it

The marker layer can now be hidden from a second pill beside the toolbar —
a noise-control measure for pages dense with comments. Three choices worth
recording:

- **The preference persists per browser** (its own localStorage key,
  `helldots-markers-hidden`, independent of the `persistence` option — it
  is a viewer preference, not comment data). The risk of persistence is
  "where did my comments go?" after a forgotten toggle; it is contained by
  the next point.
- **Entering comment mode re-shows the layer**, whether by the toolbar
  button or the keyboard shortcut (both funnel through
  `toggleCommentMode`), and so does navigating to a comment from the inbox
  (`scrollMarkerIntoView`) — scrolling to an invisible marker would scroll
  to nothing. The stored flag follows every automatic re-show, so a reload
  always matches what was last on screen. Leaving comment mode does not
  re-hide: one click hides again.
- **Hiding is CSS-only** (a class on the mount container) and the marker
  engine keeps running, so re-showing is instant and correctly positioned.
  An open thread popover closes on hide — floating UI anchored to an
  invisible marker is orphaned noise.

No public API yet (`setMarkersHidden` was considered and dropped as YAGNI);
a host that asks for it gets its own spec.
```

- [ ] **Step 7: Commit**

```bash
git add src/constants.js src/overlay.js src/styles.js test/overlay.test.js .changeset/eye-markers-toggle.md DECISIONS.md
git commit -m "$(cat <<'EOF'
:sparkles: feat(toolbar): Hide and show every marker from the eye toggle

Persisted per browser; entering comment mode or navigating from the inbox
re-shows the layer, so nothing ever interacts with an invisible marker.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Full verification gate

**Files:** none (verification only).

**Interfaces:**

- Consumes: the committed state of Tasks 1–2.
- Produces: the evidence for claiming completion.

- [ ] **Step 1: Run the full gate**

Run: `npm run verify`
Expected: lint → typecheck → format:check → test → build → size all PASS. The size step matters here: two SVGs and the new logic are small, but read the reported KB and confirm it is under the 50 KB budget.

- [ ] **Step 2: Report**

State the verify output honestly (per CLAUDE.md: never claim a gate passes without having run it and read the output). Do not push — that is decided with the user.
