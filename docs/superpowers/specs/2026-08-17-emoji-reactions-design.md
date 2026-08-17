# Emoji reactions on comments and replies — design

Date: 2026-08-17
Status: approved, ready for implementation

## Problem

A HellDots thread has exactly one way to signal agreement: writing a reply.
Triaging a board of feedback therefore gives no cheap way to say "I see this
too", "shipped", or "watching this", and the inbox shows no aggregate signal
about which comments the team cares about.

Emoji reactions were explicitly deferred once already, with the data shape
reserved so no migration would be needed later (`DECISIONS.md`: "Emoji
reactions are out of scope: `reactions?: Record<string, string[]>` (emoji →
authors) is reserved"). This spec cashes that reservation in.

## Measured cost

A draft of this exact shape (component, toggles, normalizer, serializer,
6 i18n keys in both locales, CSS block) was bundled against `src/index.js`
with the real build options, including the CSS-in-template minifier:

|                | raw       | gzip         |
| -------------- | --------- | ------------ |
| baseline       | 119.62 KB | 32.77 KB     |
| with reactions | 125.88 KB | 34.84 KB     |
| delta          | +6.26 KB  | **+2.07 KB** |

Budget is 50 KB gzip, so roughly 15 KB of headroom survives. No new runtime
dependency: a fixed emoji set is six string literals, and glyphs render in the
platform emoji font. An emoji picker library was rejected outright — the
dataset alone exceeds the remaining headroom.

## Decisions

### Fixed set of six emoji, not configurable

```js
export const REACTION_EMOJIS = ["👍", "👎", "❤️", "🎉", "👀", "🚀"];
```

Order is load-bearing: the bar renders in this order so a pill never moves out
from under the pointer when a count changes. `👎` is included deliberately —
the team can signal disagreement without writing a reply.

A host-configurable set (`reactionEmojis?: string[]`) is rejected for v1: it
adds a public option to validate, document and declare, and forces a decision
about persisted reactions whose emoji is no longer in the configured set.

### Identity: `user.id ?? user.name ?? anonymous`

`CommentOverlayOptions.user` grows an optional `id`:

```ts
user?: { name: string; id?: string };
```

One resolver, `actorKeyOf()`, produces the key stored in the reaction arrays.
It lives in exactly one place because the toggle and the "this one is mine"
render must always agree — resolved twice, a host that swaps `user` at runtime
would paint pills the user cannot switch off.

Authorship of comments and replies keeps using `user.name` exactly as today.
`id` exists for identity only and is never rendered.

Without any `user`, every actor collapses to the anonymous string and
reactions are effectively single-actor. That is the same limitation authorship
already has, and it is the host's to fix by passing `user`.

### Tooltip never shows third-party identities

Stored keys are names when the host passes no `id` and opaque (`u_8123`) when
it does, so rendering them would be inconsistent at best and a leak at worst.

- pill tooltip: the action — `Add your reaction` / `Remove your reaction`
- count: the visible digit inside the pill
- "mine": `aria-pressed` plus the `--mine` highlight

No prose carries a number anywhere. `formatTemplate` only substitutes `{n}`
and has no plural forms, and the repo already decided against pluralising
counts in copy ("two wordings rather than a reply count … avoids pluralising a
number in every locale").

### A dedicated event, not `onCommentUpdated`

Replies are in scope, and `onCommentUpdated(comment)` cannot say _which_
reply changed — a host syncing to a backend would have to diff the thread.
So: a new `reaction:toggled` entry in the `CHANGE_CALLBACKS` table paired with

```ts
onReactionToggled?: (comment: SerializedComment, reply: CommentReply | null) => void;
```

`reply` is `null` for a root-comment reaction. The table structurally prevents
the event and its callback from drifting apart.

## Data model

Both `Comment`/`SerializedComment` and `CommentReply` gain:

```ts
reactions?: Record<string, string[]>;   // emoji → actor keys
```

Absent by default. Rules:

- Removing the last actor of an emoji deletes the key; never store `[]`.
- The serializer emits `reactions` only when at least one emoji is live, so a
  corpus nobody reacted to grows by zero bytes.
- No migration: existing records simply lack the field.

`loadComments` normalises the field defensively, at the same level as the
existing malformed-reply filter:

- drop emoji outside `REACTION_EMOJIS`
- drop values that are not arrays
- drop entries that are not strings, and trim them
- de-duplicate actor keys
- drop emoji left with no actors

A hostile backend or a corrupt `localStorage` must not be able to inject an
arbitrary glyph or inflate a count with duplicates.

Storage needs no changes: a reaction is ~40 bytes against a ~33 KB screenshot,
so the quota-shedding path is untouched, and the cross-tab `storage` listener
already drops the cache, so reactions ride along.

## Components

### `src/reactions.js` (new)

```js
createReactionBar({ target, actorKey, strings, onToggle, interactive });
```

`target` is anything carrying `reactions` — comment or reply; the component
does not know the difference. The bar owns its `renderPills()` and repaints
itself after a toggle, because the popover is built once and mutated in place.

Pill anatomy: a `<button>` holding an `aria-hidden` emoji span (the accessible
name already states the reaction, and screen readers verbalise emoji
inconsistently) and the count as text. State via `aria-pressed` and a `--mine`
class. The visible count is what satisfies WCAG 1.4.1 — no pill carries
meaning through colour alone.

`interactive: false` renders `<span>` pills with no `aria-pressed` and no add
button, for the inbox card.

The palette reuses `attachMenuToggle` (`src/menus.js`), inheriting the
single-open rule, `aria-expanded`, the upward flip when it would be clipped,
outside-click close — and the resolved-card dim, which keys off a generic
`:has([aria-expanded="true"])` selector and therefore needs no CSS change.

Placement rule: the bar is always the last child of the block it belongs to —
after the text and after any screenshot thumbnails.

### Surfaces

| Surface        | Comment                        | Replies  |
| -------------- | ------------------------------ | -------- |
| Thread popover | full bar                       | full bar |
| Inbox detail   | full bar                       | full bar |
| Inbox card     | read-only pills, no add button | —        |

The card stays read-only on purpose: it already carries a header, four
controls, text, badges and a replies link, and another dropdown would turn it
into a form. The signal is visible while triaging; reacting happens where the
thread is read.

### Overlay API

```js
overlay.toggleCommentReaction(commentId, emoji); // → boolean
overlay.toggleReplyReaction(commentId, replyId, emoji); // → boolean
```

One method per level, matching `addReply`/`editReply`/`deleteReply`. Both
return `false` with no side effects when the id does not resolve or the emoji
is not in the set, mirroring `setCommentStatus`. A no-op writes nothing and
emits nothing. Both call `_syncStorage()` before emitting.

## Two refresh hazards

1. **Close the palette before mutating.** The inbox detail is rebuilt on every
   `refresh()`, and a palette left open during that rebuild vanishes mid-click.
2. **`_cardFingerprint()` must include a reaction summary.** The inbox caches
   card nodes and reuses any whose fingerprint is unchanged; without the new
   entry a card with fresh pills is reused verbatim and its counts freeze.

## i18n

Five keys, in both `src/locales/en.js` and `src/locales/es.js`:

| key                   | used on                 | en                   | es                  |
| --------------------- | ----------------------- | -------------------- | ------------------- |
| `reactionsLabel`      | the bar's group label   | Reactions            | Reacciones          |
| `addReaction`         | the `+` button          | Add reaction         | Añadir reacción     |
| `reactionToggleOn`    | a pill that is not mine | Add your reaction    | Añadir tu reacción  |
| `reactionToggleOff`   | a pill that is mine     | Remove your reaction | Quitar tu reacción  |
| `reactionPickerLabel` | the palette             | Choose a reaction    | Elegir una reacción |

A pill's accessible name is composed, not translated: the toggle string, the
emoji, and the count — `Add your reaction: 👍 (3)`. The emoji stays in the
accessible name (screen readers announce its name) while being `aria-hidden`
in the visual span, so it is never announced twice.

## Testing

New `test/reactions.test.js`:

- pill anatomy: `aria-hidden` emoji, count as text, correct `aria-pressed`
- own reaction carries `--mine`; someone else's does not
- pill order follows `REACTION_EMOJIS` and does not reshuffle when a count
  changes
- the palette closes before the mutation runs
- the read-only variant emits no buttons and no `aria-pressed`

Additions to existing suites:

- `overlay.test.js` — `false` for unknown emoji and unknown id; a second
  toggle by the same actor removes the reaction and deletes the emoji key;
  `reaction:toggled` fires with `reply: null` at root and with the right reply
  one level down
- `persistence.test.js` — round-trip; an empty map is omitted; normalisation
  drops unknown emoji, non-arrays, non-strings and duplicates
- `inbox.test.js` — the fingerprint changes when reactions change; card pills
  are not buttons
- `i18n.test.js` — passes unchanged: key parity is already enforced and emoji
  literals do not trip the hardcoded-English scanner (its regex only matches
  `"[A-Z]…`)

## Gates

| Gate                | Requirement                                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `constants.test.js` | the new classes live in `CLASSES` (not a separate object) and are referenced from `src/`                                                                    |
| `styles.test.js`    | its interactive-class list is hardcoded — add `REACTION_PILL` and `REACTION_ADD` or the guard silently stops covering them                                  |
| `typecheck`         | declare `toggleCommentReaction`, `toggleReplyReaction`, `onReactionToggled`, `user.id`, and `reactions` on `SerializedComment` / `CommentReply` / `Comment` |
| `size`              | expected ~34.8 KB gzip of 50; verified with `npm run size`, never assumed                                                                                   |
| Docs                | changeset, `DECISIONS.md` entry (identity, tooltip, fixed set, no library), README (`user` row, methods, callbacks table)                                   |

Focus rings are deliberately not added — a known, documented gap.

## Out of scope

Sorting or filtering the inbox by reactions, a host-configurable emoji set, a
searchable picker, reactions on screenshots, notifications.
