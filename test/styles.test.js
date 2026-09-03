import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getStyles, getGlobalStyles } from "../src/styles.js";
import { CLASSES, IDS } from "../src/constants.js";
import { createCommentActions } from "../src/comment-actions.js";
import en from "../src/locales/en.js";

describe("styles", () => {
  it("returns a CSS string starting with a :host reset", () => {
    const css = getStyles();
    expect(typeof css).toBe("string");
    expect(css.trim().startsWith(":host")).toBe(true);
    expect(css).toContain("all: initial");
  });

  it("styles the toolbar and comment box ids", () => {
    const css = getStyles();
    expect(css).toContain(`#${IDS.TOOLBAR}`);
    expect(css).toContain(`#${IDS.COMMENT_BOX}`);
  });

  it("styles every interactive base class used by components.js", () => {
    const css = getStyles();
    [
      CLASSES.CIRCLE,
      CLASSES.TOOLTIP,
      CLASSES.THREAD_POPOVER,
      CLASSES.TOOLBAR_ACTION_BTN,
      CLASSES.ATTACH_IMAGE_BTN,
      CLASSES.THREAD_SUBMIT,
      CLASSES.LIGHTBOX,
      // Added with the reactions bar: this list is hardcoded, so it silently
      // stops covering new interactive classes unless they are named here —
      // the same lesson the constants guard already recorded.
      CLASSES.REACTION_PILL,
      CLASSES.REACTION_ADD,
      CLASSES.REACTION_PALETTE_ITEM,
      // Same lesson again, one feature later: the audit trail adds exactly
      // one button, and this list is where it stops being covered silently.
      CLASSES.AUDIT_TOGGLE,
      CLASSES.INBOX_METRICS_BTN,
      CLASSES.METRICS_EXPORT_BTN,
    ].forEach((className) => {
      expect(css.includes(`.${className}`)).toBe(true);
    });
  });

  it("gives every scrollable surface a dark scrollbar", () => {
    const css = getStyles();
    // Regression guard for the light platform scrollbar that showed through:
    // scrollbar-color is what Chromium honours once the standard properties
    // are in play, so a surface declaring scrollbar-width without it falls
    // back to the default light bar.
    [
      CLASSES.THREAD_SCROLL,
      CLASSES.TOOLTIP,
      CLASSES.INBOX_LIST,
      CLASSES.INBOX_DETAIL,
    ].forEach((className) => {
      expect(css).toContain(`.${className}::-webkit-scrollbar-thumb`);
    });
    const widthCount = css.match(/scrollbar-width: thin/g)?.length ?? 0;
    const colorCount = css.match(/scrollbar-color:/g)?.length ?? 0;
    expect(colorCount).toBe(widthCount);
  });

  it("is regenerated fresh on every call (function, not a cached constant)", () => {
    expect(getStyles()).toBe(getStyles());
    expect(typeof getStyles).toBe("function");
  });

  it("does not style the comment-cursor class (that's host-page-only, see getGlobalStyles)", () => {
    expect(getStyles()).not.toContain(`.${CLASSES.COMMENT_CURSOR}`);
  });

  it("rounds all corners of a single-button pill (only-child)", () => {
    const css = getStyles();
    // The eye button is its pill's only child, so the :first-child/:last-child
    // rules collide. The :only-child rule must win to round all corners.
    expect(
      css.includes(
        `.${CLASSES.TOOLBAR_ACTION_WRAPPER}:only-child .${CLASSES.TOOLBAR_ACTION_BTN}`
      )
    ).toBe(true);
    expect(css).toContain("border-radius: 12px");
  });

  it("computes the only-child button's border-radius to a full pill, not a partial corner", () => {
    // Behavioral companion to the string check above: a string match can't
    // tell a real cascade winner from mere presence of the text somewhere in
    // the sheet — only mounting the real stylesheet and reading the computed
    // value tells us the :only-child rule actually won over :first-child /
    // :last-child for a wrapper with exactly one button inside it.
    const styleEl = document.createElement("style");
    styleEl.textContent = getStyles();
    document.head.appendChild(styleEl);

    const wrapper = document.createElement("div");
    wrapper.className = CLASSES.TOOLBAR_ACTION_WRAPPER;
    const btn = document.createElement("button");
    btn.className = CLASSES.TOOLBAR_ACTION_BTN;
    wrapper.appendChild(btn);
    document.body.appendChild(wrapper);

    expect(getComputedStyle(btn).borderRadius).toBe("12px");

    wrapper.remove();
    styleEl.remove();
  });
});

// Behavioral for the same reason as the block above: the guarantee the
// !important on this rule exists for is that it wins over an inline
// `display` the marker engine itself wrote during a visibility pass (see
// marker-engine.js), not merely that the rule's text is present somewhere in
// the sheet.
describe("the hidden marker layer", () => {
  /** @type {HTMLStyleElement} */
  let styleEl;

  beforeEach(() => {
    styleEl = document.createElement("style");
    styleEl.textContent = getStyles();
    document.head.appendChild(styleEl);
  });

  afterEach(() => {
    styleEl.remove();
    document.body.innerHTML = "";
  });

  it("computes display: none for a circle even though it carries an inline display", () => {
    const container = document.createElement("div");
    container.classList.add(CLASSES.MARKERS_HIDDEN);

    const circle = document.createElement("div");
    circle.className = CLASSES.CIRCLE;
    // What the marker engine actually writes on a visibility pass — the
    // layer class has to beat this, not just a plain stylesheet default.
    circle.style.display = "block";

    container.appendChild(circle);
    document.body.appendChild(container);

    expect(getComputedStyle(circle).display).toBe("none");
  });
});

// Behavioural, not a string match: the bug this guards against was a real
// cascade/compositing interaction, and asserting that the rule's *text* is
// present would have passed just as happily while the menu stayed see-through.
describe("the resolved dim and open dropdowns", () => {
  /** @type {HTMLStyleElement} */
  let styleEl;

  beforeEach(() => {
    styleEl = document.createElement("style");
    styleEl.textContent = getStyles();
    document.head.appendChild(styleEl);
  });

  afterEach(() => {
    styleEl.remove();
    document.body.innerHTML = "";
  });

  const mountResolvedCard = () => {
    const card = document.createElement("div");
    card.className = `${CLASSES.INBOX_CARD} ${CLASSES.INBOX_CARD}--resolved`;
    card.appendChild(
      createCommentActions(
        { id: 1, text: "resolved comment", status: "resolved" },
        {
          strings: en,
          onCopy: () => {},
          onSetStatus: () => {},
          onSetType: () => {},
          onSetPriority: () => {},
          onDelete: () => {},
        }
      )
    );
    document.body.appendChild(card);
    return card;
  };

  it("dims a resolved card at rest", () => {
    expect(getComputedStyle(mountResolvedCard()).opacity).toBe("0.75");
  });

  it("drops the dim while a dropdown inside the card is open", () => {
    const card = mountResolvedCard();
    card
      .querySelector('[data-action="status"]')
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));

    // `opacity` composites the card and every descendant as one translucent
    // layer, so a dropdown opened from a resolved card was painted on top of
    // the context block (hit-testing agreed) and still showed it through
    // itself. Group opacity cannot be undone by a child, so the only fix is
    // for the group to stop existing while a menu is open.
    expect(getComputedStyle(card).opacity).toBe("1");
  });

  it("restores the dim once the dropdown closes", () => {
    const card = mountResolvedCard();
    const btn = card.querySelector('[data-action="status"]');
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(getComputedStyle(card).opacity).toBe("0.75");
  });

  it("covers every dropdown in the strip, not just the status one", () => {
    for (const action of ["type", "priority", "menu"]) {
      const card = mountResolvedCard();
      card
        .querySelector(`[data-action="${action}"]`)
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(getComputedStyle(card).opacity).toBe("1");
      card.remove();
    }
  });
});

// Behavioural for the same reason as the block above: what broke was the
// zero-height flex item still collecting the column's 12px gap on both sides,
// and only the cascade can say whether the element is out of the layout.
describe("the replies container with nothing in it", () => {
  /** @type {HTMLStyleElement} */
  let styleEl;

  beforeEach(() => {
    styleEl = document.createElement("style");
    styleEl.textContent = getStyles();
    document.head.appendChild(styleEl);
  });

  afterEach(() => {
    styleEl.remove();
    document.body.innerHTML = "";
  });

  const mountReplies = () => {
    const replies = document.createElement("div");
    replies.className = CLASSES.INBOX_REPLIES;
    document.body.appendChild(replies);
    return replies;
  };

  it("is out of the layout, so it cannot open a hole under the context block", () => {
    expect(getComputedStyle(mountReplies()).display).toBe("none");
  });

  it("lays out again as soon as it holds a reply", () => {
    const replies = mountReplies();
    replies.appendChild(document.createElement("div"));
    expect(getComputedStyle(replies).display).toBe("flex");
  });

  // Deleting the last reply drops its row in place rather than re-rendering
  // the detail view (that would discard a half-typed reply), so the collapse
  // has to happen without the builder running again.
  it("collapses again when the last reply is removed in place", () => {
    const replies = mountReplies();
    replies.appendChild(document.createElement("div"));
    replies.firstElementChild.remove();
    expect(getComputedStyle(replies).display).toBe("none");
  });
});

describe("getGlobalStyles", () => {
  it("styles the comment-cursor class meant for document.body", () => {
    const css = getGlobalStyles();
    expect(css).toContain(`.${CLASSES.COMMENT_CURSOR}`);
    expect(css).toContain("cursor: url(");
  });

  it("forces the cursor on every descendant too, overriding elements with their own cursor style (e.g. links/buttons)", () => {
    const css = getGlobalStyles();
    expect(css).toContain(`.${CLASSES.COMMENT_CURSOR} *`);
    expect(css).toContain("!important");
  });
});

describe("the inbox panel's focus ring", () => {
  // The panel is `tabindex="-1"` and takes focus programmatically when it
  // opens, so a screen reader lands inside the dialog instead of at the top
  // of the page. Chrome decides `:focus-visible` from what the user did last:
  // after a click it stays quiet, but a panel opened from a copied link opens
  // during page load with no pointer interaction behind it, so the browser
  // paints its default ring — a blue border around the whole panel.
  it("does not let the browser paint one", () => {
    expect(getStyles()).toMatch(
      new RegExp(`\\.${CLASSES.INBOX_PANEL}:focus[^{]*\\{[^}]*outline:\\s*none`)
    );
  });

  it("leaves the confirm dialog's rings alone", () => {
    // Those are deliberate and documented: the dialog traps Tab between two
    // buttons, one destructive. Suppressing the panel's ring must not reach
    // them. Anchored to the class rather than to the bare declaration: the
    // widget-wide rings below use the same colour and width, so matching the
    // string alone would pass with these two rules deleted.
    expect(getStyles()).toMatch(
      new RegExp(
        `\\.${CLASSES.CONFIRM_ACCEPT}:focus-visible[^{]*\\{[^}]*` +
          `outline:\\s*2px solid #2E90FA`
      )
    );
  });
});

describe("focus indicators (WCAG 2.1 AA, 2.4.7 Focus Visible)", () => {
  // These rings were once added and then reverted for visual parity, because
  // they were bound to `:focus` and so fired on a mouse click too. They are
  // back on `:focus-visible`, which the browser only matches for keyboard
  // focus, so both requirements hold at once. This suite exists so a second
  // revert has to be deliberate: it fails the build instead of passing quietly.
  const ring = /outline:\s*2px solid #2E90FA/;

  it("rings every button reached by keyboard", () => {
    expect(getStyles()).toMatch(
      new RegExp(`button:focus-visible[^{]*\\{[^}]*${ring.source}`)
    );
  });

  it("rings the controls that are focusable without being buttons", () => {
    // The marker circles, the screenshot thumbnails and the inbox cards are
    // divs and imgs carrying tabindex="0". Selecting on the attribute rather
    // than on their classes is what keeps the next one covered for free.
    expect(getStyles()).toMatch(
      new RegExp(`\\[tabindex="0"\\]:focus-visible[^{]*\\{[^}]*${ring.source}`)
    );
  });

  it("does not ring the inbox panel, which is tabindex=-1", () => {
    // A ring around the whole panel marks nothing anyone can act on. The
    // [tabindex="0"] selector has to stay exact for that to keep holding.
    expect(getStyles()).not.toContain("[tabindex]:focus-visible");
  });

  it("underlines the borderless text fields instead of ringing them", () => {
    // Browsers match :focus-visible on a text field even when it was clicked,
    // so a ring here would come back on the pointer — the exact regression
    // that caused the revert. An inset underline reads as a field affordance.
    const css = getStyles();
    [IDS.COMMENT_INPUT, CLASSES.THREAD_INPUT].forEach((selector) => {
      expect(css).toContain(`${selector}:focus-visible`);
    });
    expect(css).toMatch(
      new RegExp(
        `${CLASSES.THREAD_INPUT}:focus-visible[^{]*\\{[^}]*` +
          `box-shadow:\\s*inset 0 -2px 0 #2E90FA`
      )
    );
  });

  it("keeps the indicator rules last so the suppressors above lose", () => {
    // `:focus-visible` is a subset of `:focus`, so both rules match at once
    // and the cascade decides. `#comment-input:focus { box-shadow: none }`
    // and `.thread-input:focus { outline: none }` are equally specific to
    // their `:focus-visible` counterparts — source order is the only thing
    // that makes the indicator win.
    const css = getStyles();
    expect(
      css.lastIndexOf(`#${IDS.COMMENT_INPUT}:focus-visible`)
    ).toBeGreaterThan(css.lastIndexOf(`#${IDS.COMMENT_INPUT}:focus {`));
    expect(
      css.lastIndexOf(`.${CLASSES.THREAD_INPUT}:focus-visible`)
    ).toBeGreaterThan(css.lastIndexOf(`.${CLASSES.THREAD_INPUT}:focus {`));
  });

  it("leaves the inline editor's existing border cue alone", () => {
    // It is the one text field with a border, and it already turns blue on
    // focus — a visible indicator that predates this work and needs nothing.
    expect(getStyles()).toMatch(
      new RegExp(
        `\\.${CLASSES.EDITOR_INPUT}:focus[^-][^{]*\\{[^}]*border-color`
      )
    );
  });
});
