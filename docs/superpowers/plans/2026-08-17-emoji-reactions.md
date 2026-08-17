# Emoji Reactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anyone react to a comment or a reply with one of six fixed emoji, persisted with the comment corpus and exposed to the host through a dedicated event.

**Architecture:** One new view module (`src/reactions.js`) renders a generic reaction bar over any object carrying a `reactions` map, so comments and replies share it. Two overlay methods own every mutation; the bar repaints itself locally because the popover is built once and mutated in place. Identity is a single resolver, `actorKeyOf`, used by both the mutation and the "this one is mine" render.

**Tech Stack:** Vanilla ES modules, Shadow DOM, vitest + jsdom, esbuild.

## Global Constraints

- Everything written into the repo is in English: docs, comments, identifiers, commit messages, changesets.
- Commits follow `<emoji> <type>(<scope>): <subject>` with gitmoji shortcodes (`:sparkles:`, not ✨).
- Every user-visible string goes into **both** `src/locales/en.js` and `src/locales/es.js`. No literals in the UI.
- `dist/helldots.esm.js` must stay under 50 KB gzip (`npm run size`). Expected after this work: ~34.8 KB.
- Every new public method/option must be declared in `src/index.d.ts` or `typecheck/consistency-check.ts` stops compiling.
- No focus rings are added — a known, intentional gap documented in `DECISIONS.md`.
- `REACTION_EMOJIS = ["👍", "👎", "❤️", "🎉", "👀", "🚀"]`, fixed order, not host-configurable.
- Actor key: `user.id ?? user.name ?? strings.anonymous`.
- `npm run verify` must pass before the work is called done.

---

### Task 1: Constants, locale keys and the identity resolver

**Files:**
- Modify: `src/constants.js` (add `REACTION_EMOJIS`; add 8 keys to `CLASSES`)
- Modify: `src/locales/en.js`, `src/locales/es.js` (5 keys each)
- Create: `src/reactions.js` (only `actorKeyOf` and `reactionEntriesOf` in this task)
- Test: `test/reactions.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `REACTION_EMOJIS: string[]`
  - `CLASSES.REACTION_BAR | REACTION_PILL | REACTION_PILL_MINE | REACTION_PILL_EMOJI | REACTION_PILL_COUNT | REACTION_ADD | REACTION_PALETTE | REACTION_PALETTE_ITEM`
  - `actorKeyOf(user: {name?: string, id?: string} | undefined, strings: {anonymous: string}): string`
  - `reactionEntriesOf(target: {reactions?: Record<string,string[]>}): Array<{emoji: string, authors: string[]}>`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from "vitest";
import { actorKeyOf, reactionEntriesOf } from "../src/reactions.js";
import { REACTION_EMOJIS } from "../src/constants.js";

describe("actorKeyOf", () => {
  it("prefers the host-supplied id over the display name", () => {
    expect(actorKeyOf({ name: "Ana", id: "u_8123" }, { anonymous: "Anonymous" })).toBe("u_8123");
  });

  it("falls back to the name when no id is given", () => {
    expect(actorKeyOf({ name: "Ana" }, { anonymous: "Anonymous" })).toBe("Ana");
  });

  it("falls back to the anonymous string with no user at all", () => {
    expect(actorKeyOf(undefined, { anonymous: "Anonymous" })).toBe("Anonymous");
  });
});

describe("reactionEntriesOf", () => {
  it("returns entries in REACTION_EMOJIS order, not insertion order", () => {
    const entries = reactionEntriesOf({ reactions: { "🚀": ["a"], "👍": ["b"] } });
    expect(entries.map((e) => e.emoji)).toEqual(["👍", "🚀"]);
  });

  it("skips emoji with no authors left", () => {
    expect(reactionEntriesOf({ reactions: { "👍": [] } })).toEqual([]);
  });

  it("returns an empty list for a target with no reactions", () => {
    expect(reactionEntriesOf({})).toEqual([]);
  });

  it("exposes exactly the six agreed emoji in picker order", () => {
    expect(REACTION_EMOJIS).toEqual(["👍", "👎", "❤️", "🎉", "👀", "🚀"]);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run test/reactions.test.js`
Expected: FAIL — cannot resolve `../src/reactions.js`.

- [ ] **Step 3: Add the constants**

In `src/constants.js`, inside `CLASSES`, after the `HIGHLIGHT` entry:

```js
  REACTION_BAR: "reaction-bar",
  REACTION_PILL: "reaction-pill",
  REACTION_PILL_MINE: "reaction-pill--mine",
  REACTION_PILL_EMOJI: "reaction-pill-emoji",
  REACTION_PILL_COUNT: "reaction-pill-count",
  REACTION_ADD: "reaction-add",
  REACTION_PALETTE: "reaction-palette",
  REACTION_PALETTE_ITEM: "reaction-palette-item",
```

And after `PRIORITY_COLORS`:

```js
// Emoji reactions. Order is load-bearing twice over: it is the order of the
// palette AND of the pills, so a pill never moves out from under the pointer
// when a count changes. Fixed rather than host-configurable — see DECISIONS.md.
export const REACTION_EMOJIS = ["👍", "👎", "❤️", "🎉", "👀", "🚀"];
```

- [ ] **Step 4: Add the locale keys**

`src/locales/en.js`:

```js
  reactionsLabel: "Reactions",
  addReaction: "Add reaction",
  reactionToggleOn: "Add your reaction",
  reactionToggleOff: "Remove your reaction",
  reactionPickerLabel: "Choose a reaction",
```

`src/locales/es.js`:

```js
  reactionsLabel: "Reacciones",
  addReaction: "Añadir reacción",
  reactionToggleOn: "Añadir tu reacción",
  reactionToggleOff: "Quitar tu reacción",
  reactionPickerLabel: "Elegir una reacción",
```

- [ ] **Step 5: Create `src/reactions.js` with the two helpers**

```js
import { REACTION_EMOJIS } from "./constants.js";

/**
 * The key a reaction is stored under. One resolver, used by both the toggle
 * and the "this one is mine" render — resolved separately in two places, a
 * host that swaps `user` at runtime would paint pills nobody can switch off.
 *
 * `id` is identity only and is never rendered: the display name stays the
 * thing shown as an author.
 */
export const actorKeyOf = (user, strings) =>
  user?.id || user?.name || strings.anonymous;

/**
 * Reads a reaction map into a stable, ordered list, dropping emoji nobody
 * holds any more.
 */
export const reactionEntriesOf = (target) => {
  const map = target?.reactions;
  if (!map || typeof map !== "object") return [];
  return REACTION_EMOJIS.filter((emoji) => map[emoji]?.length > 0).map(
    (emoji) => ({ emoji, authors: [...map[emoji]] })
  );
};
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run test/reactions.test.js test/i18n.test.js test/constants.test.js`
Expected: PASS. `i18n.test.js` proves en/es key parity; `constants.test.js` will FAIL the dead-constant guard until Task 2 references the classes — if it does, continue to Task 2 before committing.

- [ ] **Step 7: Commit**

```bash
git add src/constants.js src/locales/en.js src/locales/es.js src/reactions.js test/reactions.test.js
git commit -m ":sparkles: feat(reactions): Add the emoji set, locale keys and identity resolver"
```

---

### Task 2: The reaction bar component and its stylesheet

**Files:**
- Modify: `src/reactions.js` (add `createReactionBar`)
- Modify: `src/styles.js` (CSS block)
- Modify: `test/styles.test.js:21` (extend the hardcoded interactive-class list)
- Test: `test/reactions.test.js`

**Interfaces:**
- Consumes: `actorKeyOf`, `reactionEntriesOf`, `CLASSES.REACTION_*`, `REACTION_EMOJIS`, `attachMenuToggle(button, menu)` from `src/menus.js`.
- Produces: `createReactionBar({ target, actorKey, strings, onToggle, interactive })` → `HTMLElement`. `onToggle(emoji: string) => void`. `interactive` defaults to `true`; `false` renders `<span>` pills, no `aria-pressed`, no add button.

- [ ] **Step 1: Write the failing tests**

```js
import { createReactionBar } from "../src/reactions.js";
import { CLASSES } from "../src/constants.js";
import en from "../src/locales/en.js";

const barFor = (reactions, actorKey = "me", extra = {}) =>
  createReactionBar({
    target: { reactions },
    actorKey,
    strings: en,
    onToggle: () => {},
    ...extra,
  });

describe("createReactionBar", () => {
  it("renders the emoji decoratively and the count as text", () => {
    const bar = barFor({ "👍": ["ana", "me"] });
    const pill = bar.querySelector(`.${CLASSES.REACTION_PILL}`);
    expect(pill.querySelector(`.${CLASSES.REACTION_PILL_EMOJI}`).getAttribute("aria-hidden")).toBe("true");
    expect(pill.querySelector(`.${CLASSES.REACTION_PILL_COUNT}`).textContent).toBe("2");
  });

  it("marks the pill the current actor holds, and only that one", () => {
    const bar = barFor({ "👍": ["me"], "🚀": ["ana"] });
    const [mine, theirs] = bar.querySelectorAll(`.${CLASSES.REACTION_PILL}`);
    expect(mine.getAttribute("aria-pressed")).toBe("true");
    expect(mine.classList.contains(CLASSES.REACTION_PILL_MINE)).toBe(true);
    expect(theirs.getAttribute("aria-pressed")).toBe("false");
    expect(theirs.classList.contains(CLASSES.REACTION_PILL_MINE)).toBe(false);
  });

  it("names the pill by the action it performs, never by a stored actor key", () => {
    const bar = barFor({ "👍": ["u_8123", "me"] });
    const label = bar.querySelector(`.${CLASSES.REACTION_PILL}`).getAttribute("aria-label");
    expect(label).toContain(en.reactionToggleOff);
    expect(label).not.toContain("u_8123");
  });

  it("keeps pill order stable when a count changes", () => {
    const target = { reactions: { "🚀": ["ana"], "👍": ["ana"] } };
    const bar = createReactionBar({ target, actorKey: "me", strings: en, onToggle: (emoji) => {
      target.reactions[emoji] = [...(target.reactions[emoji] || []), "me"];
    }});
    bar.querySelector(`.${CLASSES.REACTION_PILL}`).click();
    const order = [...bar.querySelectorAll(`.${CLASSES.REACTION_PILL}`)].map((p) => p.dataset.reactionEmoji);
    expect(order).toEqual(["👍", "🚀"]);
  });

  it("closes the palette before the mutation runs", () => {
    let openWhileToggling = null;
    const bar = createReactionBar({
      target: { reactions: {} },
      actorKey: "me",
      strings: en,
      onToggle: () => {
        openWhileToggling = bar
          .querySelector(`.${CLASSES.REACTION_PALETTE}`)
          .classList.contains(CLASSES.ACTIVE);
      },
    });
    document.body.appendChild(bar);
    bar.querySelector(`.${CLASSES.REACTION_ADD}`).click();
    bar.querySelector(`.${CLASSES.REACTION_PALETTE_ITEM}`).click();
    expect(openWhileToggling).toBe(false);
    bar.remove();
  });

  it("renders a read-only bar with no buttons and no add control", () => {
    const bar = barFor({ "👍": ["ana"] }, "me", { interactive: false });
    expect(bar.querySelector("button")).toBeNull();
    expect(bar.querySelector(`.${CLASSES.REACTION_ADD}`)).toBeNull();
    expect(bar.querySelector(`.${CLASSES.REACTION_PILL}`).getAttribute("aria-pressed")).toBeNull();
  });

  it("renders nothing at all when a read-only target has no reactions", () => {
    expect(barFor({}, "me", { interactive: false })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run test/reactions.test.js`
Expected: FAIL — `createReactionBar is not a function`.

- [ ] **Step 3: Implement `createReactionBar`**

Append to `src/reactions.js` (imports at the top of the file grow to include
`CLASSES` and `attachMenuToggle`):

```js
const PLUS_ICON_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;

/**
 * The reaction bar for one comment or one reply — `target` is anything with a
 * `reactions` map, so both levels share this component.
 *
 * The bar owns its own repaint: the thread popover is built once and mutated
 * in place, so a toggle there has nothing else to re-render it.
 *
 * A pill's accessible name is composed from the action, the emoji and the
 * count ("Remove your reaction: 👍 (3)"). Stored actor keys never reach the
 * UI: they are display names when the host passes no `user.id` and opaque
 * ids when it does, so rendering them would be inconsistent at best.
 *
 * `interactive: false` is the inbox list card — pills as static spans, no
 * add button. Returns null there when nothing has been reacted to, so a card
 * does not grow an empty row.
 *
 * @param {{
 *   target: { reactions?: Record<string, string[]> },
 *   actorKey: string,
 *   strings: Record<string, string>,
 *   onToggle: (emoji: string) => void,
 *   interactive?: boolean,
 * }} config
 * @returns {HTMLElement | null}
 */
export const createReactionBar = ({
  target,
  actorKey,
  strings,
  onToggle,
  interactive = true,
}) => {
  if (!interactive && reactionEntriesOf(target).length === 0) return null;

  const bar = document.createElement("div");
  bar.className = CLASSES.REACTION_BAR;
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", strings.reactionsLabel);

  /** @type {HTMLElement | null} */
  let addWrapper = null;

  const renderPills = () => {
    bar
      .querySelectorAll(`.${CLASSES.REACTION_PILL}`)
      .forEach((pill) => pill.remove());

    for (const { emoji, authors } of reactionEntriesOf(target)) {
      const mine = authors.includes(actorKey);
      const pill = document.createElement(interactive ? "button" : "span");
      pill.className = CLASSES.REACTION_PILL;
      if (mine) pill.classList.add(CLASSES.REACTION_PILL_MINE);
      pill.dataset.reactionEmoji = emoji;

      if (interactive) {
        /** @type {HTMLButtonElement} */ (pill).type = "button";
        const action = mine
          ? strings.reactionToggleOff
          : strings.reactionToggleOn;
        // A toggle has to say which way it is about to flip; the count alone
        // does not.
        pill.setAttribute("aria-pressed", String(mine));
        pill.dataset.hdTooltip = action;
        pill.setAttribute(
          "aria-label",
          `${action}: ${emoji} (${authors.length})`
        );
        pill.addEventListener("click", (e) => {
          e.stopPropagation();
          onToggle(emoji);
          renderPills();
        });
      }

      const emojiEl = document.createElement("span");
      emojiEl.className = CLASSES.REACTION_PILL_EMOJI;
      emojiEl.textContent = emoji;
      // Decorative: the accessible name above already spells out the
      // reaction and its count, and screen readers announce emoji unevenly.
      emojiEl.setAttribute("aria-hidden", "true");

      const count = document.createElement("span");
      count.className = CLASSES.REACTION_PILL_COUNT;
      count.textContent = String(authors.length);

      pill.appendChild(emojiEl);
      pill.appendChild(count);
      if (addWrapper) bar.insertBefore(pill, addWrapper);
      else bar.appendChild(pill);
    }
  };

  if (interactive) {
    addWrapper = document.createElement("div");
    addWrapper.style.position = "relative";

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = CLASSES.REACTION_ADD;
    addBtn.dataset.hdTooltip = strings.addReaction;
    addBtn.setAttribute("aria-label", strings.addReaction);
    addBtn.innerHTML = PLUS_ICON_SVG;

    const palette = document.createElement("div");
    palette.className = CLASSES.REACTION_PALETTE;
    palette.setAttribute("role", "menu");
    palette.setAttribute("aria-label", strings.reactionPickerLabel);

    // Same helper every other dropdown uses, so the palette inherits the
    // single-open rule, aria-expanded, the upward flip when it would be
    // clipped, and outside-click close — and the resolved-card dim, which
    // keys off a generic [aria-expanded="true"], covers it for free.
    const toggle = attachMenuToggle(addBtn, palette);

    for (const emoji of REACTION_EMOJIS) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = CLASSES.REACTION_PALETTE_ITEM;
      item.setAttribute("role", "menuitem");
      item.dataset.reactionEmoji = emoji;
      item.textContent = emoji;
      item.setAttribute("aria-label", emoji);
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        // Closed before mutating: the inbox detail rebuilds itself on every
        // refresh, and a palette still open during that rebuild vanishes
        // mid-click.
        toggle.close();
        onToggle(emoji);
        renderPills();
      });
      palette.appendChild(item);
    }

    addWrapper.appendChild(addBtn);
    addWrapper.appendChild(palette);
    bar.appendChild(addWrapper);
  }

  renderPills();
  return bar;
};
```

- [ ] **Step 4: Add the stylesheet block**

Append to the sheet in `src/styles.js`, next to the inbox action styles, using
the tokens already in the file (`#f2f2f7`, `#8e8e93`, `#2e90fa`, `#1c1c1e`).
Include `.reaction-palette.active { display: flex; }` — `attachMenuToggle`
toggles `CLASSES.ACTIVE`.

- [ ] **Step 5: Extend the styles guard**

In `test/styles.test.js`, add `CLASSES.REACTION_PILL` and `CLASSES.REACTION_ADD`
to the hardcoded list in `styles every interactive base class used by
components.js` — the same lesson the repo already recorded about hardcoded
lists silently stopping coverage.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run test/reactions.test.js test/styles.test.js test/constants.test.js`
Expected: PASS, including the dead-constants guard now that every class is referenced.

- [ ] **Step 7: Commit**

```bash
git add src/reactions.js src/styles.js test/reactions.test.js test/styles.test.js
git commit -m ":sparkles: feat(reactions): Add the reaction bar component"
```

---

### Task 3: Overlay data plumbing — normalize, serialize, toggle, emit

**Files:**
- Modify: `src/reactions.js` (add `normalizeReactions`, `toggleReactionOn`, `serializeReactions`)
- Modify: `src/overlay.js` (`CHANGE_CALLBACKS`, `_serializeComment`, `_serializeReply`, `loadComments` normalisation, two public methods)
- Modify: `src/index.d.ts`
- Test: `test/reactions.test.js`, `test/overlay.test.js`, `test/persistence.test.js`

**Interfaces:**
- Consumes: `reactionEntriesOf`, `actorKeyOf`, `REACTION_EMOJIS`.
- Produces:
  - `normalizeReactions(raw: unknown): Record<string,string[]> | null`
  - `toggleReactionOn(target, emoji: string, actorKey: string): boolean`
  - `serializeReactions(reactions): Record<string,string[]> | null`
  - `overlay.toggleCommentReaction(commentId, emoji): boolean`
  - `overlay.toggleReplyReaction(commentId, replyId, emoji): boolean`
  - event `"reaction:toggled"` → `onReactionToggled(comment, reply | null)`

- [ ] **Step 1: Write the failing unit tests for the pure helpers**

```js
import { normalizeReactions, toggleReactionOn, serializeReactions } from "../src/reactions.js";

describe("normalizeReactions", () => {
  it("drops emoji outside the fixed set", () => {
    expect(normalizeReactions({ "💩": ["ana"], "👍": ["ana"] })).toEqual({ "👍": ["ana"] });
  });

  it("drops values that are not arrays and entries that are not strings", () => {
    expect(normalizeReactions({ "👍": "ana", "🚀": ["ana", 7, null] })).toEqual({ "🚀": ["ana"] });
  });

  it("de-duplicates actor keys so a count cannot be inflated", () => {
    expect(normalizeReactions({ "👍": ["ana", "ana", " ana "] })).toEqual({ "👍": ["ana"] });
  });

  it("returns null for junk and for an empty result", () => {
    expect(normalizeReactions(undefined)).toBeNull();
    expect(normalizeReactions("nope")).toBeNull();
    expect(normalizeReactions({ "👍": [] })).toBeNull();
  });
});

describe("toggleReactionOn", () => {
  it("adds, then removes, and deletes the emoji key when the last actor leaves", () => {
    const target = {};
    expect(toggleReactionOn(target, "👍", "me")).toBe(true);
    expect(target.reactions).toEqual({ "👍": ["me"] });
    expect(toggleReactionOn(target, "👍", "me")).toBe(true);
    expect(target.reactions["👍"]).toBeUndefined();
  });

  it("refuses an emoji outside the set and an empty actor key", () => {
    const target = {};
    expect(toggleReactionOn(target, "💩", "me")).toBe(false);
    expect(toggleReactionOn(target, "👍", "")).toBe(false);
    expect(target.reactions).toBeUndefined();
  });
});

describe("serializeReactions", () => {
  it("omits an empty map entirely", () => {
    expect(serializeReactions({})).toBeNull();
    expect(serializeReactions(undefined)).toBeNull();
  });

  it("copies rather than references the stored arrays", () => {
    const reactions = { "👍": ["ana"] };
    const out = serializeReactions(reactions);
    out["👍"].push("mallory");
    expect(reactions["👍"]).toEqual(["ana"]);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run test/reactions.test.js`
Expected: FAIL — the three helpers are not exported.

- [ ] **Step 3: Implement the helpers in `src/reactions.js`**

```js
/**
 * Persisted reactions arrive from localStorage or from the host's backend, so
 * nothing about their shape can be trusted: an unknown glyph would render a
 * pill this build cannot toggle, and a duplicated actor key would inflate a
 * count. Returns null when there is nothing worth keeping, so callers can
 * leave the field absent instead of storing `{}`.
 */
export const normalizeReactions = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  for (const emoji of REACTION_EMOJIS) {
    const authors = raw[emoji];
    if (!Array.isArray(authors)) continue;
    const kept = [];
    for (const author of authors) {
      if (typeof author !== "string") continue;
      const clean = author.trim();
      if (clean && !kept.includes(clean)) kept.push(clean);
    }
    if (kept.length > 0) out[emoji] = kept;
  }
  return Object.keys(out).length > 0 ? out : null;
};

/**
 * Flips one actor's reaction on a comment or a reply. Mutates in place and
 * reports whether anything changed, so the caller decides what to persist.
 */
export const toggleReactionOn = (target, emoji, actorKey) => {
  if (!REACTION_EMOJIS.includes(emoji) || !actorKey) return false;
  if (!target.reactions) target.reactions = {};
  const authors = target.reactions[emoji] || [];
  const index = authors.indexOf(actorKey);
  if (index >= 0) authors.splice(index, 1);
  else authors.push(actorKey);
  // Never store an empty array: absent and "nobody" are the same state, and
  // one spelling of it keeps the serialized payload honest.
  if (authors.length > 0) target.reactions[emoji] = authors;
  else delete target.reactions[emoji];
  return true;
};

/**
 * Serializer half. Copied rather than referenced, like `tags`: a host mutating
 * serializeComments() output must not reach back into overlay internals.
 */
export const serializeReactions = (reactions) => {
  const entries = Object.entries(reactions || {}).filter(
    ([, authors]) => authors?.length > 0
  );
  return entries.length > 0
    ? Object.fromEntries(entries.map(([emoji, authors]) => [emoji, [...authors]]))
    : null;
};
```

- [ ] **Step 4: Write the failing overlay tests**

Add to `test/overlay.test.js` (follow the file's existing setup helpers):

```js
describe("reactions", () => {
  it("toggles a reaction on a comment and fires the paired event and callback", () => {
    const onReactionToggled = vi.fn();
    const onChange = vi.fn();
    const overlay = makeOverlay({ user: { name: "Ana" }, onReactionToggled, onChange });
    const comment = overlay.addComment(...);            // existing helper
    expect(overlay.toggleCommentReaction(comment.id, "👍")).toBe(true);
    expect(comment.reactions).toEqual({ "👍": ["Ana"] });
    expect(onReactionToggled).toHaveBeenCalledWith(expect.objectContaining({ id: comment.id }), null);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ type: "reaction:toggled" }));
  });

  it("keys the reaction on user.id when the host supplies one", () => {
    const overlay = makeOverlay({ user: { name: "Ana", id: "u_8123" } });
    const comment = overlay.addComment(...);
    overlay.toggleCommentReaction(comment.id, "👍");
    expect(comment.reactions).toEqual({ "👍": ["u_8123"] });
  });

  it("carries the reply on a reply-level reaction", () => {
    const onReactionToggled = vi.fn();
    const overlay = makeOverlay({ user: { name: "Ana" }, onReactionToggled });
    const comment = overlay.addComment(...);
    const reply = overlay.addReply(comment, "yes");
    expect(overlay.toggleReplyReaction(comment.id, reply.id, "🎉")).toBe(true);
    expect(onReactionToggled).toHaveBeenCalledWith(
      expect.objectContaining({ id: comment.id }),
      expect.objectContaining({ id: reply.id })
    );
  });

  it("returns false for an unknown emoji, an unknown comment and an unknown reply", () => {
    const overlay = makeOverlay({ user: { name: "Ana" } });
    const comment = overlay.addComment(...);
    expect(overlay.toggleCommentReaction(comment.id, "💩")).toBe(false);
    expect(overlay.toggleCommentReaction("nope", "👍")).toBe(false);
    expect(overlay.toggleReplyReaction(comment.id, "nope", "👍")).toBe(false);
  });
});
```

And to `test/persistence.test.js`:

```js
it("round-trips reactions and omits the field when there are none", () => { /* serializeComments → loadComments */ });
it("normalises hostile persisted reactions on load", () => { /* unknown emoji, non-array, dupes dropped */ });
```

- [ ] **Step 5: Run them to make sure they fail**

Run: `npx vitest run test/overlay.test.js test/persistence.test.js`
Expected: FAIL — `toggleCommentReaction is not a function`.

- [ ] **Step 6: Wire the overlay**

1. `CHANGE_CALLBACKS` gains `"reaction:toggled": "onReactionToggled"`.
2. `_serializeReply` and `_serializeComment` each gain
   `reactions: serializeReactions(x.reactions)`.
3. `loadComments`: `reactions: normalizeReactions(item.reactions)` for the
   comment, and the same inside the reply `.map()`.
4. Two public methods, next to `setCommentStatus`:

```js
  /**
   * Flips the current actor's reaction on a comment. The actor key is
   * `user.id ?? user.name ?? anonymous` — see actorKeyOf.
   * @param {import('./index.d.ts').CommentId} id
   * @param {string} emoji
   * @returns {boolean} false when the id or the emoji is unknown
   */
  toggleCommentReaction(id, emoji) {
    const comment = this._findComment(id);
    if (!comment) return false;
    if (!toggleReactionOn(comment, emoji, this._actorKey())) return false;
    this._syncStorage();
    const serialized = this._serializeComment(comment);
    this._emit("reaction:toggled", [serialized, null], {
      comment: serialized,
      reply: null,
    });
    return true;
  }
```

plus the reply twin (`toggleReplyReaction`), which resolves the reply with
`sameId` and emits the serialized reply instead of `null`. A private
`_actorKey()` wraps `actorKeyOf(this.options.user, this.strings)`.

- [ ] **Step 7: Declare everything in `src/index.d.ts`**

`user?: { name: string; id?: string }`; `reactions?: Record<string, string[]> | null`
on `SerializedComment`, `Comment` and `CommentReply`; the two methods on the
`CommentOverlay` interface; `onReactionToggled?: (comment: SerializedComment, reply: CommentReply | null) => void`;
and `"reaction:toggled"` in the `ChangeEvent` type union.

- [ ] **Step 8: Run the tests and the typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/reactions.js src/overlay.js src/index.d.ts test/
git commit -m ":sparkles: feat(reactions): Persist, serialize and expose reaction toggles"
```

---

### Task 4: Thread popover wiring

**Files:**
- Modify: `src/components.js` (`createThreadPopover`, `createReplyElement`)
- Modify: `src/popover-controller.js` (open path, `submitReply` path, deps)
- Modify: `src/overlay.js` (`PopoverController` deps: two more actions)
- Test: `test/components.test.js`

**Interfaces:**
- Consumes: `createReactionBar`, `overlay.toggleCommentReaction`, `overlay.toggleReplyReaction`.
- Produces: both component factories accept an optional
  `reactions?: { actorKey: string, onToggle: (target, emoji) => void }` handler.
  When absent, no bar is rendered — every existing caller and test keeps working.

- [ ] **Step 1: Write the failing tests**

```js
it("mounts a reaction bar for the comment and for each reply when handlers are given", () => {
  const comment = { id: "c1", text: "hi", author: "Ana", createdAt: new Date().toISOString(), replies: [{ id: "r1", text: "yes", author: "Bo", timestamp: new Date().toISOString() }] };
  const popover = createThreadPopover(comment, en, "en", {
    reactions: { actorKey: "me", onToggle: () => {} },
  });
  expect(popover.querySelectorAll(`.${CLASSES.REACTION_BAR}`).length).toBe(2);
});

it("renders no reaction bar when no handler is given", () => {
  const popover = createThreadPopover({ id: "c1", text: "hi", author: "Ana", createdAt: new Date().toISOString(), replies: [] }, en, "en", {});
  expect(popover.querySelector(`.${CLASSES.REACTION_BAR}`)).toBeNull();
});

it("routes a pill click to the toggle with the clicked target and emoji", () => {
  const reply = { id: "r1", text: "yes", author: "Bo", timestamp: new Date().toISOString(), reactions: { "👍": ["bo"] } };
  const calls = [];
  const el = createReplyElement(reply, en, "en", {
    reactions: { actorKey: "me", onToggle: (target, emoji) => calls.push([target.id, emoji]) },
  });
  el.querySelector(`.${CLASSES.REACTION_PILL}`).click();
  expect(calls).toEqual([["r1", "👍"]]);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run test/components.test.js`
Expected: FAIL — no `.reaction-bar` in the popover.

- [ ] **Step 3: Mount the bar in the components**

In `createReplyElement`, after the screenshots block, so the bar is the last
child of the reply:

```js
  if (reactions) {
    const bar = createReactionBar({
      target: reply,
      actorKey: reactions.actorKey,
      strings,
      onToggle: (emoji) => reactions.onToggle(reply, emoji),
    });
    if (bar) replyEl.appendChild(bar);
  }
```

In `createThreadPopover`, the same for the root comment, appended to `scroll`
after the screenshots and before `replies`, and `reactions` forwarded into
every `createReplyElement` call.

- [ ] **Step 4: Wire the controller**

`popover-controller.js` builds the handler once and passes it to both
`createThreadPopover` and the `createReplyElement` call inside `submitReply`:

```js
    const reactions = {
      actorKey: this.deps.actorKey(),
      onToggle: (target, emoji) =>
        target === comment
          ? this.deps.actions.toggleCommentReaction(comment.id, emoji)
          : this.deps.actions.toggleReplyReaction(comment.id, target.id, emoji),
    };
```

After a toggle the controller calls `this.deps.refreshInbox()` so open inbox
cards do not keep stale counts. `overlay.js` adds `actorKey: () => this._actorKey()`
to the deps and the two actions to `actions`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components.js src/popover-controller.js src/overlay.js test/components.test.js
git commit -m ":sparkles: feat(reactions): Wire reactions into the thread popover"
```

---

### Task 5: Inbox wiring — read-only pills on cards, full bars in the detail

**Files:**
- Modify: `src/inbox.js` (`_buildCard`, `_renderDetail`, `_cardFingerprint`, callbacks)
- Modify: `src/overlay.js` (inbox callbacks)
- Test: `test/inbox.test.js`

**Interfaces:**
- Consumes: `createReactionBar`, `reactionEntriesOf`, `callbacks.onToggleCommentReaction(commentId, emoji)`, `callbacks.onToggleReplyReaction(commentId, replyId, emoji)`, `callbacks.actorKey()`.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing tests**

```js
it("shows read-only pills on a list card", () => {
  const view = openInboxWith([commentWith({ reactions: { "👍": ["ana"] } })]);
  const card = view.el.querySelector(`.${CLASSES.INBOX_CARD}`);
  const pill = card.querySelector(`.${CLASSES.REACTION_PILL}`);
  expect(pill.tagName).toBe("SPAN");
  expect(card.querySelector(`.${CLASSES.REACTION_ADD}`)).toBeNull();
});

it("shows an interactive bar in the detail view", () => {
  const view = openDetailFor(commentWith({ reactions: { "👍": ["ana"] } }));
  expect(view.el.querySelector(`.${CLASSES.REACTION_ADD}`)).not.toBeNull();
});

it("re-renders a cached card when only its reactions changed", () => {
  // _cardFingerprint must include the reaction summary, or the cached node is
  // reused verbatim and the counts freeze.
  const comment = commentWith({ reactions: { "👍": ["ana"] } });
  const view = openInboxWith([comment]);
  const before = view.el.querySelector(`.${CLASSES.REACTION_PILL_COUNT}`).textContent;
  comment.reactions["👍"].push("bo");
  view.refresh();
  const after = view.el.querySelector(`.${CLASSES.REACTION_PILL_COUNT}`).textContent;
  expect([before, after]).toEqual(["1", "2"]);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run test/inbox.test.js`
Expected: FAIL — no pills rendered.

- [ ] **Step 3: Add the fingerprint entry**

In `_cardFingerprint`, append to the array:

```js
      reactionEntriesOf(comment).map(({ emoji, authors }) => [emoji, authors.length]),
```

- [ ] **Step 4: Mount the bars**

In `_buildCard`, after the screenshots block. Note the existing `interactive`
flag means "this is a list card that navigates on click", which is the
**read-only** case for reactions:

```js
    const reactionBar = createReactionBar({
      target: comment,
      actorKey: this.callbacks.actorKey(),
      strings: this.strings,
      // A list card navigates on click and already carries four controls; the
      // signal belongs there, the affordance does not.
      interactive: !interactive,
      onToggle: (emoji) => {
        this.callbacks.onToggleCommentReaction(comment.id, emoji);
        this.refresh();
      },
    });
    if (reactionBar) card.appendChild(reactionBar);
```

In `_renderDetail`, pass a `reactions` handler into each `createReplyElement`
call, routing to `onToggleReplyReaction` and then `this.refresh()`.

- [ ] **Step 5: Wire the overlay callbacks**

```js
          actorKey: () => this._actorKey(),
          onToggleCommentReaction: (id, emoji) => this.toggleCommentReaction(id, emoji),
          onToggleReplyReaction: (commentId, replyId, emoji) =>
            this.toggleReplyReaction(commentId, replyId, emoji),
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/inbox.js src/overlay.js test/inbox.test.js
git commit -m ":sparkles: feat(reactions): Show reactions in the inbox cards and detail"
```

---

### Task 6: Docs, gates and browser verification

**Files:**
- Modify: `README.md` (`user` option row, the two methods, the callbacks table)
- Modify: `DECISIONS.md` (new entries; the old "out of scope" entry stays — it is a living log)
- Create: `.changeset/<name>.md` (minor)
- Modify: `playground/index.html` only if it needs a `user.id` to demo identity

- [ ] **Step 1: Update the README**

`user` row becomes `{ name: string; id?: string }` with a note that `id` keys
reactions while `name` stays what is displayed. Add both methods to the API
list and `onReactionToggled` to the callbacks table.

- [ ] **Step 2: Add the DECISIONS entries**

One entry per decision that had a defensible alternative: the fixed six-emoji
set with no library (with the measured +2.07 KB gzip and the rejected picker),
identity as `user.id ?? user.name`, the tooltip that never shows third-party
actor keys, a dedicated `reaction:toggled` rather than reusing
`onCommentUpdated`, and read-only pills on list cards.

- [ ] **Step 3: Write the changeset**

```md
---
"helldots": minor
---

Add emoji reactions to comments and replies...
```

- [ ] **Step 4: Run the full gate**

Run: `npm run verify`
Expected: lint → typecheck → format → test → build → size all pass, with the
size line under 50 KB. Read the output; do not assume.

- [ ] **Step 5: Verify in the browser**

Start the playground preview, then: react to a comment from the thread
popover, confirm the count and the `--mine` highlight; toggle it off; react
from the inbox detail; confirm the list card shows the pill read-only; reload
and confirm the reaction survived `localStorage`; check the console for errors.

- [ ] **Step 6: Commit**

```bash
git add README.md DECISIONS.md .changeset/
git commit -m ":memo: docs(reactions): Document the reactions API and decisions"
```

---

## Self-Review

**Spec coverage:** data model → Task 3; identity → Tasks 1 and 3; tooltip rule → Task 2; dedicated event → Task 3; component and surfaces → Tasks 2, 4, 5; both refresh hazards → Task 2 (palette closes before mutating) and Task 5 (fingerprint); i18n → Task 1; tests → every task; gates → Tasks 2, 3 and 6; out-of-scope items appear in no task.

**Placeholders:** none — every code step carries real code, and the two doc steps name their exact content.

**Type consistency:** `actorKeyOf(user, strings)`, `reactionEntriesOf(target)`, `toggleReactionOn(target, emoji, actorKey)`, `normalizeReactions(raw)`, `serializeReactions(reactions)`, `createReactionBar({ target, actorKey, strings, onToggle, interactive })` are used with those exact names and arities in Tasks 2–5. `onToggle` takes `(emoji)` inside the component and the call sites close over their target; the components' `reactions.onToggle` takes `(target, emoji)`.
