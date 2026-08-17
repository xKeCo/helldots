import { describe, it, expect } from "vitest";
import {
  actorKeyOf,
  reactionEntriesOf,
  createReactionBar,
  normalizeReactions,
  toggleReactionOn,
  serializeReactions,
} from "../src/reactions.js";
import { CLASSES, REACTION_EMOJIS } from "../src/constants.js";
import en from "../src/locales/en.js";

const STRINGS = { anonymous: "Anonymous" };

const barFor = (reactions, actorKey = "me", extra = {}) =>
  createReactionBar({
    target: { reactions },
    actorKey,
    strings: en,
    onToggle: () => {},
    ...extra,
  });

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

describe("createReactionBar", () => {
  it("renders the emoji decoratively and the count as text", () => {
    // The count is what satisfies WCAG 1.4.1 — no pill may carry its meaning
    // through colour alone.
    const pill = pillsOf(barFor({ "👍": ["ana", "me"] }))[0];
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
    const [mine, theirs] = pillsOf(barFor({ "👍": ["me"], "🚀": ["ana"] }));
    expect(mine.getAttribute("aria-pressed")).toBe("true");
    expect(mine.classList.contains(CLASSES.REACTION_PILL_MINE)).toBe(true);
    expect(theirs.getAttribute("aria-pressed")).toBe("false");
    expect(theirs.classList.contains(CLASSES.REACTION_PILL_MINE)).toBe(false);
  });

  it("names the pill by the action it performs, never by a stored actor key", () => {
    // Stored keys are opaque ids when the host passes user.id, so they must
    // never reach the UI.
    const label = pillsOf(barFor({ "👍": ["u_8123", "me"] }))[0].getAttribute(
      "aria-label"
    );
    expect(label).toContain(en.reactionToggleOff);
    expect(label).not.toContain("u_8123");
  });

  it("keeps pill order stable when a count changes", () => {
    const target = { reactions: { "🚀": ["ana"], "👍": ["ana"] } };
    const bar = createReactionBar({
      target,
      actorKey: "me",
      strings: en,
      onToggle: (emoji) => target.reactions[emoji].push("me"),
    });
    pillsOf(bar)[0].click();
    expect(pillsOf(bar).map((p) => p.dataset.reactionEmoji)).toEqual([
      "👍",
      "🚀",
    ]);
  });

  it("repaints its own count after a toggle", () => {
    const target = { reactions: {} };
    const bar = createReactionBar({
      target,
      actorKey: "me",
      strings: en,
      onToggle: (emoji) => {
        target.reactions[emoji] = ["me"];
      },
    });
    bar.querySelector(`.${CLASSES.REACTION_PALETTE_ITEM}`).click();
    expect(
      bar.querySelector(`.${CLASSES.REACTION_PILL_COUNT}`).textContent
    ).toBe("1");
  });

  it("closes the palette before the mutation runs", () => {
    // The inbox detail rebuilds itself on every refresh, so a palette left
    // open during that rebuild would vanish mid-click.
    let expandedWhileToggling = null;
    const bar = createReactionBar({
      target: { reactions: {} },
      actorKey: "me",
      strings: en,
      onToggle: () => {
        expandedWhileToggling = bar
          .querySelector(`.${CLASSES.REACTION_ADD}`)
          .getAttribute("aria-expanded");
      },
    });
    document.body.appendChild(bar);
    bar.querySelector(`.${CLASSES.REACTION_ADD}`).click();
    bar.querySelector(`.${CLASSES.REACTION_PALETTE_ITEM}`).click();
    expect(expandedWhileToggling).toBe("false");
    bar.remove();
  });

  it("offers every emoji of the set in the palette", () => {
    const items = [
      ...barFor({}).querySelectorAll(`.${CLASSES.REACTION_PALETTE_ITEM}`),
    ];
    expect(items.map((i) => i.dataset.reactionEmoji)).toEqual(REACTION_EMOJIS);
  });

  it("renders a read-only bar with no buttons and no add control", () => {
    const bar = barFor({ "👍": ["ana"] }, "me", { interactive: false });
    expect(bar.querySelector("button")).toBeNull();
    expect(bar.querySelector(`.${CLASSES.REACTION_ADD}`)).toBeNull();
    expect(pillsOf(bar)[0].getAttribute("aria-pressed")).toBeNull();
  });

  it("renders nothing at all when a read-only target has no reactions", () => {
    // An inbox list card must not grow an empty row for a comment nobody has
    // reacted to.
    expect(barFor({}, "me", { interactive: false })).toBeNull();
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
