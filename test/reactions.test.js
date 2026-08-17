import { describe, it, expect } from "vitest";
import {
  actorKeyOf,
  reactionEntriesOf,
  createReactionsUi,
  normalizeReactions,
  toggleReactionOn,
  serializeReactions,
} from "../src/reactions.js";
import { CLASSES, REACTION_EMOJIS } from "../src/constants.js";
import en from "../src/locales/en.js";

const STRINGS = { anonymous: "Anonymous" };

// The UI object is per-thread, so every helper below builds its own and the
// tests stay independent of each other's repaint registrations.
const uiFor = (onToggle = () => {}, actorKey = "me") =>
  createReactionsUi({ actorKey: () => actorKey, strings: en, onToggle });

const barFor = (reactions, actorKey = "me", onToggle = () => {}) => {
  const target = { reactions };
  return uiFor((t, emoji) => onToggle(t, emoji), actorKey).bar(target);
};

const pillsOf = (bar) => [...bar.querySelectorAll(`.${CLASSES.REACTION_PILL}`)];

describe("actorKeyOf", () => {
  it("prefers the host-supplied id over the display name", () => {
    // The name is what gets shown; the id is what a reaction is keyed on, so
    // two teammates called "Ana" don't share one reaction.
    expect(actorKeyOf({ name: "Ana", id: "u_8123" }, STRINGS)).toBe("u_8123");
  });

  it("falls back to the name when no id is given", () => {
    expect(actorKeyOf({ name: "Ana" }, STRINGS)).toBe("Ana");
  });

  it("falls back to the anonymous string with no user at all", () => {
    expect(actorKeyOf(undefined, STRINGS)).toBe("Anonymous");
  });
});

describe("reactionEntriesOf", () => {
  it("returns entries in REACTION_EMOJIS order, not insertion order", () => {
    const entries = reactionEntriesOf({
      reactions: { "🚀": ["a"], "👍": ["b"] },
    });
    expect(entries.map((e) => e.emoji)).toEqual(["👍", "🚀"]);
  });

  it("skips emoji with no authors left", () => {
    expect(reactionEntriesOf({ reactions: { "👍": [] } })).toEqual([]);
  });

  it("returns an empty list for a target with no reactions", () => {
    expect(reactionEntriesOf({})).toEqual([]);
    expect(reactionEntriesOf(undefined)).toEqual([]);
  });

  it("copies the author arrays so a caller cannot mutate stored state", () => {
    const target = { reactions: { "👍": ["ana"] } };
    reactionEntriesOf(target)[0].authors.push("mallory");
    expect(target.reactions["👍"]).toEqual(["ana"]);
  });
});

describe("REACTION_EMOJIS", () => {
  it("exposes exactly the six agreed emoji in picker order", () => {
    expect(REACTION_EMOJIS).toEqual(["👍", "👎", "❤️", "🎉", "👀", "🚀"]);
  });
});

describe("the reaction bar", () => {
  it("renders the emoji decoratively and the count as text", () => {
    // The count is what satisfies WCAG 1.4.1 — no pill may carry its meaning
    // through colour alone.
    const pill = pillsOf(barFor({ "\u{1F44D}": ["ana", "me"] }))[0];
    expect(
      pill
        .querySelector(`.${CLASSES.REACTION_PILL_EMOJI}`)
        .getAttribute("aria-hidden")
    ).toBe("true");
    expect(
      pill.querySelector(`.${CLASSES.REACTION_PILL_COUNT}`).textContent
    ).toBe("2");
  });

  it("marks the pill the current actor holds, and only that one", () => {
    const [mine, theirs] = pillsOf(
      barFor({ "\u{1F44D}": ["me"], "\u{1F680}": ["ana"] })
    );
    expect(mine.getAttribute("aria-pressed")).toBe("true");
    expect(mine.classList.contains(CLASSES.REACTION_PILL_MINE)).toBe(true);
    expect(theirs.getAttribute("aria-pressed")).toBe("false");
    expect(theirs.classList.contains(CLASSES.REACTION_PILL_MINE)).toBe(false);
  });

  it("names the pill by the action it performs, never by a stored actor key", () => {
    // Stored keys are opaque ids when the host passes user.id, so they must
    // never reach the UI.
    const label = pillsOf(
      barFor({ "\u{1F44D}": ["u_8123", "me"] })
    )[0].getAttribute("aria-label");
    expect(label).toContain(en.reactionToggleOff);
    expect(label).not.toContain("u_8123");
  });

  it("gives a hover tooltip only to a pill the actor does not hold", () => {
    // On their own pill the highlight already says it is theirs, and the
    // bubble only repeated what clicking would do. The accessible name keeps
    // carrying the action either way.
    const [mine, theirs] = pillsOf(
      barFor({ "\u{1F44D}": ["me"], "\u{1F680}": ["ana"] })
    );
    expect(mine.dataset.hdTooltip).toBeUndefined();
    expect(mine.getAttribute("aria-label")).toContain(en.reactionToggleOff);
    expect(theirs.dataset.hdTooltip).toBe(en.reactionToggleOn);
  });

  it("keeps pill order stable when a count changes", () => {
    const target = {
      reactions: { "\u{1F680}": ["ana"], "\u{1F44D}": ["ana"] },
    };
    const bar = uiFor((t, emoji) => t.reactions[emoji].push("me")).bar(target);
    document.body.appendChild(bar);
    pillsOf(bar)[0].click();
    expect(pillsOf(bar).map((p) => p.dataset.reactionEmoji)).toEqual([
      "\u{1F44D}",
      "\u{1F680}",
    ]);
    bar.remove();
  });

  it("repaints its own count after a toggle", () => {
    const target = { reactions: { "\u{1F44D}": ["ana"] } };
    const bar = uiFor((t, emoji) => t.reactions[emoji].push("me")).bar(target);
    document.body.appendChild(bar);
    pillsOf(bar)[0].click();
    expect(
      bar.querySelector(`.${CLASSES.REACTION_PILL_COUNT}`).textContent
    ).toBe("2");
    bar.remove();
  });

  it("is hidden and empty until something has been reacted to", () => {
    // The row is mounted but silent: the first reaction can only arrive from
    // the trigger in the action row above it.
    const bar = barFor({});
    expect(bar.hidden).toBe(true);
    expect(bar.children.length).toBe(0);
  });

  it("appears when the first reaction arrives from a trigger elsewhere", () => {
    const target = { reactions: {} };
    const ui = uiFor((t, emoji) => {
      t.reactions[emoji] = ["me"];
    });
    const bar = ui.bar(target);
    const trigger = ui.trigger(target, {
      className: CLASSES.INBOX_ACTION_BTN,
    });
    document.body.append(bar, trigger);

    trigger.querySelector(`.${CLASSES.REACTION_PALETTE_ITEM}`).click();

    expect(bar.hidden).toBe(false);
    expect(pillsOf(bar)).toHaveLength(1);
    bar.remove();
    trigger.remove();
  });

  it("carries a trailing trigger only while it has pills", () => {
    expect(barFor({}).querySelector(`.${CLASSES.REACTION_ADD}`)).toBeNull();
    expect(
      barFor({ "\u{1F44D}": ["ana"] }).querySelector(`.${CLASSES.REACTION_ADD}`)
    ).not.toBeNull();
  });

  it("closes the palette before the mutation runs", () => {
    // The inbox detail rebuilds itself on every refresh, so a palette left
    // open during that rebuild would vanish mid-click.
    let expandedWhileToggling = null;
    const target = { reactions: { "\u{1F44D}": ["ana"] } };
    const bar = uiFor(() => {
      expandedWhileToggling = bar
        .querySelector(`.${CLASSES.REACTION_ADD}`)
        .getAttribute("aria-expanded");
    }).bar(target);
    document.body.appendChild(bar);
    bar.querySelector(`.${CLASSES.REACTION_ADD}`).click();
    bar.querySelector(`.${CLASSES.REACTION_PALETTE_ITEM}`).click();
    expect(expandedWhileToggling).toBe("false");
    bar.remove();
  });

  it("offers every emoji of the set in the palette", () => {
    const items = [
      ...uiFor()
        .trigger({}, { className: CLASSES.INBOX_ACTION_BTN })
        .querySelectorAll(`.${CLASSES.REACTION_PALETTE_ITEM}`),
    ];
    expect(items.map((i) => i.dataset.reactionEmoji)).toEqual(REACTION_EMOJIS);
  });

  it("reads the actor key at paint time, not at build time", () => {
    // A host may swap `user` while the widget is mounted.
    let who = "ana";
    const target = { reactions: { "\u{1F44D}": ["ana"] } };
    const ui = createReactionsUi({
      actorKey: () => who,
      strings: en,
      onToggle: () => {},
    });
    expect(
      pillsOf(ui.bar(target))[0].classList.contains(CLASSES.REACTION_PILL_MINE)
    ).toBe(true);
    who = "someone-else";
    expect(
      pillsOf(ui.bar(target))[0].classList.contains(CLASSES.REACTION_PILL_MINE)
    ).toBe(false);
  });
});

describe("normalizeReactions", () => {
  it("drops emoji outside the fixed set", () => {
    // A glyph this build has no palette entry for would render a pill nobody
    // can toggle off.
    expect(normalizeReactions({ "💩": ["ana"], "👍": ["ana"] })).toEqual({
      "👍": ["ana"],
    });
  });

  it("drops values that are not arrays and entries that are not strings", () => {
    expect(normalizeReactions({ "👍": "ana", "🚀": ["ana", 7, null] })).toEqual(
      {
        "🚀": ["ana"],
      }
    );
  });

  it("de-duplicates actor keys so a count cannot be inflated", () => {
    expect(normalizeReactions({ "👍": ["ana", "ana", " ana "] })).toEqual({
      "👍": ["ana"],
    });
  });

  it("returns null for junk and for an empty result", () => {
    expect(normalizeReactions(undefined)).toBeNull();
    expect(normalizeReactions("nope")).toBeNull();
    expect(normalizeReactions({ "👍": [] })).toBeNull();
  });
});

describe("toggleReactionOn", () => {
  it("adds, then removes, deleting the emoji key when the last actor leaves", () => {
    const target = {};
    expect(toggleReactionOn(target, "👍", "me")).toBe(true);
    expect(target.reactions).toEqual({ "👍": ["me"] });
    expect(toggleReactionOn(target, "👍", "me")).toBe(true);
    expect(target.reactions["👍"]).toBeUndefined();
  });

  it("leaves other actors alone when one of them leaves", () => {
    const target = { reactions: { "👍": ["ana", "me", "bo"] } };
    toggleReactionOn(target, "👍", "me");
    expect(target.reactions["👍"]).toEqual(["ana", "bo"]);
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
    expect(serializeReactions({ "👍": [] })).toBeNull();
  });

  it("copies rather than references the stored arrays", () => {
    const reactions = { "👍": ["ana"] };
    serializeReactions(reactions)["👍"].push("mallory");
    expect(reactions["👍"]).toEqual(["ana"]);
  });
});
