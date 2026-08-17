// Emoji reactions on comments and replies. One module holds the identity
// resolver, the reaction-map helpers and the bar component, because all three
// have to agree on what "mine" means — split across files, the toggle and the
// render drift apart and pills stop matching the actor who owns them.

import { CLASSES, REACTION_EMOJIS } from "./constants.js";
import { attachMenuToggle } from "./menus.js";

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
  user?.id || user?.name || strings.anonymous;

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

const PLUS_ICON_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;

/**
 * The reaction bar for one comment or one reply — `target` is anything with a
 * `reactions` map, so both levels share this component and neither knows
 * which one it is.
 *
 * The bar owns its own repaint: the thread popover is built once and mutated
 * in place, so a toggle there has nothing else that would re-render it.
 *
 * A pill's accessible name is composed from the action, the emoji and the
 * count ("Remove your reaction: 👍 (3)") rather than translated as a
 * sentence: `formatTemplate` has no plural forms, and the repo already
 * decided against pluralising counts in copy. Stored actor keys never reach
 * the UI — they are display names when the host passes no `user.id` and
 * opaque ids when it does, so rendering them would be inconsistent at best.
 *
 * `interactive: false` is the inbox list card: static spans, no add button,
 * and null when nothing has been reacted to, so a card does not grow an empty
 * row.
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

  /** The add-button wrapper, so repainted pills stay in front of it. */
  let addWrapper = /** @type {HTMLElement | null} */ (null);

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
        // does not, and the highlight is colour, which never stands alone.
        pill.setAttribute("aria-pressed", String(mine));
        pill.dataset.hdTooltip = action;
        pill.setAttribute(
          "aria-label",
          `${action}: ${emoji} (${authors.length})`
        );
        pill.addEventListener("click", (e) => {
          // The inbox list card navigates on click, and the popover closes on
          // an outside click — neither may fire because a pill was pressed.
          e.stopPropagation();
          onToggle(emoji);
          renderPills();
        });
      }

      const emojiEl = document.createElement("span");
      emojiEl.className = CLASSES.REACTION_PILL_EMOJI;
      emojiEl.textContent = emoji;
      // Decorative: the accessible name above already spells out the reaction
      // and its count, and screen readers announce emoji unevenly.
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

    // The same helper every other dropdown uses, so the palette inherits the
    // single-open rule, aria-expanded, the upward flip when it would be
    // clipped, and outside-click close — and the resolved-card dim, which
    // keys off a generic [aria-expanded="true"], then covers it for free.
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
        // refresh, and a palette still open through that rebuild is left
        // orphaned mid-click.
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
