// Emoji reactions on comments and replies. One module holds the identity
// resolver, the reaction-map helpers and the bar component, because all three
// have to agree on what "mine" means — split across files, the toggle and the
// render drift apart and pills stop matching the actor who owns them.

import { CLASSES, REACTION_EMOJIS } from "./constants.js";
import { attachMenuToggle } from "./menus.js";
import { normalizeActorId } from "./id.js";

/**
 * The key a reaction is stored under.
 *
 * One resolver, used by both the toggle and the "this one is mine" render:
 * resolved separately in two places, a host that swaps `user` at runtime
 * would paint pills nobody can switch off.
 *
 * `id` is identity only and is never rendered — the display name stays what
 * gets shown as an author.
 *
 * @param {{ name?: string, id?: string } | undefined} user
 * @param {{ anonymous: string }} strings
 * @returns {string}
 */
export const actorKeyOf = (user, strings) =>
  normalizeActorId(user?.id) || user?.name || strings.anonymous;

/**
 * Reads a reaction map into a stable, ordered list, dropping emoji nobody
 * holds any more. The author arrays are copied: a caller sorting or pushing
 * into what it got back must not reach into stored state.
 *
 * @param {{ reactions?: Record<string, string[]> } | undefined} target
 * @returns {Array<{ emoji: string, authors: string[] }>}
 */
export const reactionEntriesOf = (target) => {
  const map = target?.reactions;
  if (!map || typeof map !== "object") return [];
  return REACTION_EMOJIS.filter((emoji) => map[emoji]?.length > 0).map(
    (emoji) => ({ emoji, authors: [...map[emoji]] })
  );
};

/**
 * Persisted reactions arrive from localStorage or from the host's backend, so
 * nothing about their shape can be trusted: an unknown glyph would render a
 * pill this build cannot toggle, and a duplicated actor key would inflate a
 * count that looks like consensus. Returns null when there is nothing worth
 * keeping, so callers leave the field absent instead of storing `{}`.
 *
 * @param {unknown} raw
 * @returns {Record<string, string[]> | null}
 */
export const normalizeReactions = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const out = /** @type {Record<string, string[]>} */ ({});
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
 * Flips one actor's reaction on a comment or a reply, in place, and reports
 * whether anything changed so the caller decides what to persist and emit.
 *
 * @param {{ reactions?: Record<string, string[]> }} target
 * @param {string} emoji
 * @param {string} actorKey
 * @returns {boolean} false when the emoji is not in the set, or there is no
 *   actor to attribute the reaction to
 */
export const toggleReactionOn = (target, emoji, actorKey) => {
  if (!REACTION_EMOJIS.includes(emoji) || !actorKey) return false;
  if (!target.reactions) target.reactions = {};
  const authors = target.reactions[emoji] || [];
  const index = authors.indexOf(actorKey);
  if (index >= 0) authors.splice(index, 1);
  else authors.push(actorKey);
  // Never store an empty array: absent and "nobody" are the same state, and
  // keeping one spelling of it is what lets the serializer omit the field.
  if (authors.length > 0) target.reactions[emoji] = authors;
  else delete target.reactions[emoji];
  return true;
};

/**
 * Serializer half. Copied rather than referenced, like `tags`: a host mutating
 * serializeComments() output must not be able to reach back into overlay
 * internals. Null (not `{}`) when there is nothing, so a corpus nobody reacted
 * to costs no bytes.
 *
 * @param {Record<string, string[]> | undefined | null} reactions
 * @returns {Record<string, string[]> | null}
 */
export const serializeReactions = (reactions) => {
  const entries = Object.entries(reactions || {}).filter(
    ([, authors]) => authors?.length > 0
  );
  return entries.length > 0
    ? Object.fromEntries(
        entries.map(([emoji, authors]) => [emoji, [...authors]])
      )
    : null;
};

// The "add reaction" affordance, in both places it appears: the action row at
// the top of a comment (or a reply's meta line) and, once something has been
// reacted to, at the end of the pill row. A smiley with a plus rather than a
// bare plus — the bar sits among pills that are already emoji, and a lone "+"
// there read as "add something", not "add a reaction".
const EMOJI_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.94 11.08A9 9 0 1 1 12.92 3.06"/><path d="M8.5 14.2a4.6 4.6 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01"/><path d="M19 2.6v4M17 4.6h4"/></svg>`;

/**
 * @typedef {Object} ReactionsUi
 * @property {(target: any) => HTMLElement} bar the pill row for one target
 * @property {(target: any, config: { className: string, tooltip?: boolean }) => HTMLElement} trigger
 *   a button that opens the emoji palette
 * @property {(target: any) => void} refresh repaint the target's live rows
 */

/**
 * A reaction UI bound to one thread: it hands out the palette buttons and the
 * pill rows, and keeps every row it created for a given target in step.
 *
 * It exists because a reaction can now be added from a control that does not
 * own the row it changes — the action row's button sits above the pills, and
 * on a comment those two are built by different modules (the popover header is
 * assembled after `createThreadPopover` returns). Rather than thread refresh
 * handles through both, each row registers itself here and any pick repaints
 * whatever rows for that target are still on screen.
 *
 * `actorKey` is a getter, not a value: a host may swap `user` while the widget
 * is mounted, and a key captured at build time would leave pills nobody can
 * switch off.
 *
 * @param {{
 *   actorKey: () => string,
 *   strings: Record<string, string>,
 *   onToggle: (target: any, emoji: string) => void,
 * }} config
 * @returns {ReactionsUi}
 */
export const createReactionsUi = ({ actorKey, strings, onToggle }) => {
  /**
   * target → the repaints of its live rows. A WeakMap so entries die with the
   * comments they belong to; detached rows are dropped on the next repaint,
   * since the inbox rebuilds its detail view on every refresh.
   * @type {WeakMap<object, Set<{ el: HTMLElement, repaint: () => void }>>}
   */
  const rows = new WeakMap();

  const refresh = (target) => {
    const set = rows.get(target);
    if (!set) return;
    for (const entry of set) {
      if (entry.el.isConnected) entry.repaint();
      else set.delete(entry);
    }
  };

  const pick = (target, emoji) => {
    onToggle(target, emoji);
    refresh(target);
  };

  /**
   * A button that opens the emoji palette. `className` decides which of the
   * two looks it takes: the action row's icon button or the pill row's
   * trailing one.
   * @param {any} target
   * @param {{ className: string, tooltip?: boolean }} config
   * @returns {HTMLElement} a positioned wrapper holding the button and its menu
   */
  const trigger = (target, { className, tooltip = true }) => {
    const wrapper = document.createElement("div");
    wrapper.className = CLASSES.REACTION_TRIGGER;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = className;
    btn.dataset.action = "react";
    if (tooltip) btn.dataset.hdTooltip = strings.addReaction;
    btn.setAttribute("aria-label", strings.addReaction);
    btn.innerHTML = EMOJI_ICON_SVG;

    const palette = document.createElement("div");
    palette.className = CLASSES.REACTION_PALETTE;
    palette.setAttribute("role", "menu");
    palette.setAttribute("aria-label", strings.reactionPickerLabel);

    // The same helper every other dropdown uses, so the palette inherits the
    // single-open rule, aria-expanded, the upward flip when it would be
    // clipped, and outside-click close — and the resolved-card dim, which
    // keys off a generic [aria-expanded="true"], then covers it for free.
    const toggle = attachMenuToggle(btn, palette);

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
        // refresh, and a palette still open through that rebuild is left
        // orphaned mid-click.
        toggle.close();
        pick(target, emoji);
      });
      palette.appendChild(item);
    }

    wrapper.appendChild(btn);
    wrapper.appendChild(palette);
    return wrapper;
  };

  /**
   * The pill row for one target. Always returns an element — hidden while
   * nothing has been reacted to, because the first reaction arrives from a
   * control outside this row and the row has to be there to receive it.
   *
   * A pill's accessible name is composed from the action, the emoji and the
   * count ("Remove your reaction: 👍 (3)") rather than translated as a
   * sentence: `formatTemplate` has no plural forms, and the repo already
   * decided against pluralising counts in copy. Stored actor keys never reach
   * the UI — they are display names when the host passes no `user.id` and
   * opaque ids when it does, so rendering them would be inconsistent at best.
   *
   * @param {any} target
   * @returns {HTMLElement}
   */
  const bar = (target) => {
    const el = document.createElement("div");
    el.className = CLASSES.REACTION_BAR;
    el.setAttribute("role", "group");
    el.setAttribute("aria-label", strings.reactionsLabel);

    const repaint = () => {
      el.replaceChildren();
      const entries = reactionEntriesOf(target);
      const me = actorKey();
      // Nothing reacted to means no row at all: the only way in is the
      // trigger in the action row above.
      el.hidden = entries.length === 0;
      if (el.hidden) return;

      for (const { emoji, authors } of entries) {
        const mine = authors.includes(me);
        const pill = document.createElement("button");
        pill.type = "button";
        pill.className = CLASSES.REACTION_PILL;
        if (mine) pill.classList.add(CLASSES.REACTION_PILL_MINE);
        pill.dataset.reactionEmoji = emoji;

        const action = mine
          ? strings.reactionToggleOff
          : strings.reactionToggleOn;
        // A toggle has to say which way it is about to flip; the count alone
        // does not, and the highlight is colour, which never stands alone.
        pill.setAttribute("aria-pressed", String(mine));
        // No hover bubble on any pill: the emoji and count are already there,
        // and a bubble on every one of them turned a dense row into a wall of
        // popups. The trigger beside the row keeps its tooltip — it is the
        // only control whose icon does not say what it does. The accessible
        // name still carries the action for assistive tech.
        pill.setAttribute(
          "aria-label",
          `${action}: ${emoji} (${authors.length})`
        );
        pill.addEventListener("click", (e) => {
          // The inbox list card navigates on click, and the popover closes on
          // an outside click — neither may fire because a pill was pressed.
          e.stopPropagation();
          pick(target, emoji);
        });

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
        el.appendChild(pill);
      }

      // Trailing "one more" affordance, only ever next to existing pills.
      el.appendChild(trigger(target, { className: CLASSES.REACTION_ADD }));
    };

    let set = rows.get(target);
    if (!set) rows.set(target, (set = new Set()));
    set.add({ el, repaint });

    repaint();
    return el;
  };

  return { bar, trigger, refresh };
};
