import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import CommentOverlay from "../src/overlay.js";
import { CLASSES } from "../src/constants.js";
import { TAG_NAME } from "../src/root-element.js";

vi.mock("../src/capture.js", () => ({
  captureRegion: vi.fn().mockResolvedValue("data:image/png;base64,mocked"),
  renderPage: vi.fn().mockResolvedValue({ width: 0, height: 0 }),
  cropRegion: vi.fn().mockReturnValue("data:image/png;base64,mocked"),
  cropViewport: vi.fn().mockReturnValue("data:image/jpeg;base64,mocked"),
  withHiddenOverlay: vi.fn((fn) => fn()),
  AUTO_SCALE: 0.5,
}));

const cleanupDom = () => {
  document.querySelectorAll(TAG_NAME).forEach((el) => el.remove());
  document.body.className = "";
  document.body.innerHTML = "";
};

const makeOverlay = (options = {}) => new CommentOverlay(options);

const giveSize = (el) => {
  el.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: 300,
    bottom: 200,
    width: 300,
    height: 200,
  });
};

const createCommentOn = async (overlay, container, text = "A test comment") => {
  document.elementFromPoint = () => container;
  overlay.commentMode = true;
  await overlay._placeCommentAtPoint(10, 10);
  overlay.commentInput.value = text;
  overlay.saveComment();
  return overlay.comments[overlay.comments.length - 1];
};

const click = (el) =>
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));

const openInbox = (ov) => {
  click(ov.toolbar.querySelector(`.${CLASSES.TOOLBAR_MENU_BTN}`));
  return ov.shadowRoot.querySelector(`.${CLASSES.INBOX_PANEL}`);
};

const otherPageComment = (id = 500) => ({
  id,
  text: "comment from another page",
  page: "/otra-pagina",
  anchor: null,
  replies: [],
  author: "Remote",
  createdAt: "2026-07-03T00:00:00.000Z",
  screenshots: [],
});

describe("inbox sidebar", () => {
  let overlay;

  beforeEach(() => {
    document.elementFromPoint = () => null;
    document.body.innerHTML = `<section id="target">Compare our plans and pick one today</section>`;
    giveSize(document.getElementById("target"));
  });

  afterEach(() => {
    overlay?.cleanup?.();
    cleanupDom();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("list view", () => {
    it("lists only current-page comments by default", async () => {
      overlay = makeOverlay();
      const target = document.getElementById("target");
      await createCommentOn(overlay, target, "first comment");
      await createCommentOn(overlay, target, "second comment");
      overlay.loadComments([otherPageComment()]);

      const panel = openInbox(overlay);
      const cards = panel.querySelectorAll(`.${CLASSES.INBOX_CARD}`);
      expect(cards).toHaveLength(2);
      expect(panel.textContent).not.toContain("comment from another page");
    });

    it("the page filter shows all comments with a page tag on foreign ones", async () => {
      overlay = makeOverlay();
      await createCommentOn(overlay, document.getElementById("target"), "mine");
      overlay.loadComments([otherPageComment()]);

      const panel = openInbox(overlay);
      click(panel.querySelector(`.${CLASSES.INBOX_FILTER}`));
      click(panel.querySelector(`[data-filter-page="all"]`));

      const cards = panel.querySelectorAll(`.${CLASSES.INBOX_CARD}`);
      expect(cards).toHaveLength(2);
      const tags = [...panel.querySelectorAll(`.${CLASSES.INBOX_CARD_TAG}`)];
      expect(tags.some((t) => t.textContent === "/otra-pagina")).toBe(true);
    });

    it("the filter menu has a chip group per dimension, with the active chip checked", () => {
      overlay = makeOverlay({ locale: "en" });
      const panel = openInbox(overlay);
      click(panel.querySelector(`.${CLASSES.INBOX_FILTER}`));

      const menu = panel.querySelector(`.${CLASSES.INBOX_FILTER_MENU}`);
      expect(menu.textContent).toContain("Page");
      expect(menu.textContent).toContain("Status");
      expect(menu.textContent).toContain("Type");
      expect(menu.textContent).toContain("Priority");

      const checkedPage = menu.querySelector(
        `[data-filter-page][aria-checked="true"]`
      );
      expect(checkedPage.dataset.filterPage).toBe("page");
      // Status/type/priority have no "all" chip: nothing checked *is* "all".
      expect(
        menu.querySelector(`[data-filter-status][aria-checked="true"]`)
      ).toBeNull();
    });

    it("toggling the active status chip clears that group back to all", () => {
      overlay = makeOverlay({ locale: "en" });
      const panel = openInbox(overlay);

      click(panel.querySelector(`.${CLASSES.INBOX_FILTER}`));
      click(panel.querySelector(`[data-filter-status="open"]`));
      expect(overlay.inboxView.statusFilter).toBe("open");

      click(panel.querySelector(`.${CLASSES.INBOX_FILTER}`));
      click(panel.querySelector(`[data-filter-status="open"]`));
      expect(overlay.inboxView.statusFilter).toBe("all");
    });

    it("the clear button resets every group and is disabled while nothing is filtered", () => {
      overlay = makeOverlay({ locale: "en" });
      const panel = openInbox(overlay);

      click(panel.querySelector(`.${CLASSES.INBOX_FILTER}`));
      expect(
        panel.querySelector(`.${CLASSES.INBOX_FILTER_CLEAR}`).disabled
      ).toBe(true);

      click(panel.querySelector(`[data-filter-status="resolved"]`));
      click(panel.querySelector(`.${CLASSES.INBOX_FILTER}`));
      click(panel.querySelector(`[data-filter-type="bug"]`));
      click(panel.querySelector(`.${CLASSES.INBOX_FILTER}`));
      click(panel.querySelector(`[data-filter-page="all"]`));

      click(panel.querySelector(`.${CLASSES.INBOX_FILTER}`));
      const clear = panel.querySelector(`.${CLASSES.INBOX_FILTER_CLEAR}`);
      expect(clear.disabled).toBe(false);
      click(clear);

      expect(overlay.inboxView.statusFilter).toBe("all");
      expect(overlay.inboxView.typeFilter).toBe("all");
      expect(overlay.inboxView.priorityFilter).toBe("all");
      expect(overlay.inboxView.pageFilter).toBe("page");
    });

    it("combines the status filter with the page filter", async () => {
      overlay = makeOverlay();
      const target = document.getElementById("target");
      const open1 = await createCommentOn(overlay, target, "still open");
      const resolved1 = await createCommentOn(
        overlay,
        target,
        "already resolved"
      );
      overlay.setCommentStatus(resolved1.id, "resolved");
      overlay.loadComments([otherPageComment()]);

      const panel = openInbox(overlay);

      // current page + open
      click(panel.querySelector(`.${CLASSES.INBOX_FILTER}`));
      click(panel.querySelector(`[data-filter-status="open"]`));
      let cards = [...panel.querySelectorAll(`.${CLASSES.INBOX_CARD}`)];
      expect(cards.map((c) => c.dataset.commentId)).toEqual([String(open1.id)]);

      // all pages + resolved
      click(panel.querySelector(`.${CLASSES.INBOX_FILTER}`));
      click(panel.querySelector(`[data-filter-page="all"]`));
      click(panel.querySelector(`.${CLASSES.INBOX_FILTER}`));
      click(panel.querySelector(`[data-filter-status="resolved"]`));
      cards = [...panel.querySelectorAll(`.${CLASSES.INBOX_CARD}`)];
      expect(cards.map((c) => c.dataset.commentId)).toEqual([
        String(resolved1.id),
      ]);
    });

    it("shows a combined label when a status filter is active", () => {
      overlay = makeOverlay({ locale: "es" });
      const panel = openInbox(overlay);
      const label = () =>
        panel.querySelector(`.${CLASSES.INBOX_FILTER} span`).textContent;
      expect(label()).toBe("Página actual");

      click(panel.querySelector(`.${CLASSES.INBOX_FILTER}`));
      click(panel.querySelector(`[data-filter-status="open"]`));
      expect(label()).toBe("Página actual · Abierto");
    });

    it("includes the type filter in the collapsed label", () => {
      overlay = makeOverlay();
      const panel = openInbox(overlay);
      const label = () =>
        panel.querySelector(`.${CLASSES.INBOX_FILTER} span`).textContent;

      click(panel.querySelector(`.${CLASSES.INBOX_FILTER}`));
      click(panel.querySelector(`[data-filter-type="bug"]`));
      expect(label()).toBe("Current page · Bug");
    });

    it("includes the priority filter in the collapsed label", () => {
      overlay = makeOverlay();
      const panel = openInbox(overlay);
      const label = () =>
        panel.querySelector(`.${CLASSES.INBOX_FILTER} span`).textContent;

      click(panel.querySelector(`.${CLASSES.INBOX_FILTER}`));
      click(panel.querySelector(`[data-filter-priority="high"]`));
      expect(label()).toBe("Current page · High");
    });

    it("composes all four active filters in order in the collapsed label", () => {
      overlay = makeOverlay();
      const panel = openInbox(overlay);
      const label = () =>
        panel.querySelector(`.${CLASSES.INBOX_FILTER} span`).textContent;

      click(panel.querySelector(`.${CLASSES.INBOX_FILTER}`));
      click(panel.querySelector(`[data-filter-status="open"]`));
      click(panel.querySelector(`.${CLASSES.INBOX_FILTER}`));
      click(panel.querySelector(`[data-filter-type="bug"]`));
      click(panel.querySelector(`.${CLASSES.INBOX_FILTER}`));
      click(panel.querySelector(`[data-filter-priority="high"]`));
      expect(label()).toBe("Current page · Open · Bug · High");
    });

    it("keeps the author on its own row, with the action strip on the next", async () => {
      overlay = makeOverlay();
      const target = document.getElementById("target");
      await createCommentOn(overlay, target, "spacing");
      const panel = openInbox(overlay);

      const card = panel.querySelector(`.${CLASSES.INBOX_CARD}`);
      const header = card.querySelector(`.${CLASSES.INBOX_CARD_HEADER}`);
      const actionsRow = card.querySelector(`.${CLASSES.THREAD_ACTIONS_ROW}`);

      // The controls used to share the header row with the author, which
      // left the name ~90px and wrapped it onto two lines.
      expect(header.querySelector(`.${CLASSES.INBOX_CARD_ACTIONS}`)).toBeNull();
      expect(header.querySelector(`.${CLASSES.THREAD_AUTHOR}`)).toBeTruthy();
      expect(
        actionsRow.querySelector(`.${CLASSES.INBOX_CARD_ACTIONS}`)
      ).toBeTruthy();
      // Same order as the thread popover: meta, then the strip.
      expect(header.nextElementSibling).toBe(actionsRow);
      expect(
        card.querySelector(`.${CLASSES.INBOX_CARD_REPLY_LINK}`)
      ).toBeTruthy();
    });

    it("labels status alongside type and priority in the action strip", async () => {
      overlay = makeOverlay({ locale: "en" });
      const target = document.getElementById("target");
      const comment = await createCommentOn(overlay, target, "labelled");
      overlay.setCommentStatus(comment.id, "in_progress");

      const panel = openInbox(overlay);
      const strip = panel.querySelector(`.${CLASSES.INBOX_CARD_ACTIONS}`);
      const labelled = [
        ...strip.querySelectorAll(`.${CLASSES.INBOX_ACTION_BTN_LABELED}`),
      ];

      expect(labelled.map((b) => b.dataset.action)).toEqual([
        "status",
        "type",
        "priority",
      ]);
      // Spelled out, not just a coloured dot — there is no hover on touch.
      expect(
        strip.querySelector(
          `[data-action="status"] .${CLASSES.INBOX_ACTION_LABEL}`
        ).textContent
      ).toBe("In progress");
    });

    it("drops the badges the action strip already states, keeping the ones it does not", async () => {
      overlay = makeOverlay({ locale: "en" });
      const target = document.getElementById("target");
      const comment = await createCommentOn(overlay, target, "no duplication");
      overlay.setCommentType(comment.id, "bug");
      overlay.setCommentPriority(comment.id, "high");

      let panel = openInbox(overlay);
      let card = panel.querySelector(`.${CLASSES.INBOX_CARD}`);
      // Type and priority are in the strip above; repeating them as badges
      // was the same fact twice, so the row goes away entirely.
      expect(card.querySelector(`.${CLASSES.INBOX_BADGES}`)).toBeNull();

      // Tags and the resolution time have no control anywhere, so they stay.
      overlay.setCommentTags(comment.id, ["checkout"]);
      overlay.setCommentStatus(comment.id, "resolved");
      overlay.inboxView.render();
      card = panel.querySelector(`.${CLASSES.INBOX_CARD}`);
      const badges = card.querySelector(`.${CLASSES.INBOX_BADGES}`);
      expect(badges.querySelector(`.${CLASSES.BADGE_TAG}`).textContent).toBe(
        "checkout"
      );
      expect(badges.querySelector(`.${CLASSES.BADGE_DURATION}`)).toBeTruthy();
      expect(badges.querySelector(`.${CLASSES.BADGE_TYPE}`)).toBeNull();
      expect(badges.querySelector(`.${CLASSES.BADGE_PRIORITY}`)).toBeNull();
    });

    it("sorts resolved comments to the bottom and styles their card", async () => {
      overlay = makeOverlay();
      const target = document.getElementById("target");
      const resolvedFirst = await createCommentOn(
        overlay,
        target,
        "resolved early"
      );
      const openLater = await createCommentOn(overlay, target, "open later");
      overlay.setCommentStatus(resolvedFirst.id, "resolved");

      const panel = openInbox(overlay);
      const cards = [...panel.querySelectorAll(`.${CLASSES.INBOX_CARD}`)];
      expect(cards.map((c) => c.dataset.commentId)).toEqual([
        String(openLater.id),
        String(resolvedFirst.id),
      ]);
      expect(
        cards[1].classList.contains(`${CLASSES.INBOX_CARD}--resolved`)
      ).toBe(true);
      expect(
        cards[0].classList.contains(`${CLASSES.INBOX_CARD}--resolved`)
      ).toBe(false);
    });

    it("teaches the shortcut in the localized empty state", () => {
      overlay = makeOverlay({ locale: "es" });
      const panel = openInbox(overlay);
      const empty = panel.querySelector(`.${CLASSES.INBOX_EMPTY}`);

      expect(
        empty.querySelector(`.${CLASSES.INBOX_EMPTY_TITLE}`).textContent
      ).toBe("Todavía no hay comentarios");
      expect(empty.querySelector(`.${CLASSES.INBOX_EMPTY_ICON}`)).toBeTruthy();
      // The chord is a real <kbd>, and it is the same one the toolbar shows.
      const kbd = empty.querySelector(`.${CLASSES.INBOX_EMPTY_KBD}`);
      expect(kbd.tagName).toBe("KBD");
      expect(
        overlay.toolbar.querySelector(`.${CLASSES.SHORTCUT_HINT}`).textContent
      ).toBe(kbd.textContent);
      expect(empty.textContent).toContain("haz clic en cualquier parte");
    });

    it("renders the shortcut with the modifier the platform uses", () => {
      const withUserAgent = (ua, fn) => {
        const spy = vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
        try {
          return fn();
        } finally {
          spy.mockRestore();
        }
      };

      const chordFor = (ua) =>
        withUserAgent(ua, () => {
          const ov = makeOverlay({ locale: "en" });
          const panel = openInbox(ov);
          const text = panel.querySelector(
            `.${CLASSES.INBOX_EMPTY_KBD}`
          ).textContent;
          ov.cleanup();
          return text;
        });

      expect(chordFor("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe(
        "⌥ + C"
      );
      expect(chordFor("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(
        "Alt + C"
      );
    });

    it("its button turns comment mode on and closes the inbox", () => {
      overlay = makeOverlay();
      const panel = openInbox(overlay);
      expect(overlay.commentMode).toBe(false);

      click(panel.querySelector(`.${CLASSES.INBOX_EMPTY_ACTION}`));

      expect(overlay.commentMode).toBe(true);
      expect(overlay.inboxView.isOpen()).toBe(false);
    });

    it("closes the inbox when comment mode is turned on by the shortcut", () => {
      overlay = makeOverlay();
      openInbox(overlay);
      expect(overlay.inboxView.isOpen()).toBe(true);

      // The panel covers the page it is about to ask the user to click on.
      overlay.toggleCommentMode();

      expect(overlay.commentMode).toBe(true);
      expect(overlay.inboxView.isOpen()).toBe(false);
    });

    it("leaves the inbox alone when comment mode is turned off", () => {
      overlay = makeOverlay();
      overlay.toggleCommentMode();
      openInbox(overlay);

      overlay.toggleCommentMode();

      expect(overlay.commentMode).toBe(false);
      expect(overlay.inboxView.isOpen()).toBe(true);
    });

    it("distinguishes an empty inbox from filters that match nothing", async () => {
      overlay = makeOverlay({ locale: "en" });
      await createCommentOn(
        overlay,
        document.getElementById("target"),
        "an open comment"
      );

      const panel = openInbox(overlay);
      click(panel.querySelector(`.${CLASSES.INBOX_FILTER}`));
      click(panel.querySelector(`[data-filter-status="resolved"]`));

      const empty = panel.querySelector(`.${CLASSES.INBOX_EMPTY}`);
      expect(
        empty.querySelector(`.${CLASSES.INBOX_EMPTY_TITLE}`).textContent
      ).toBe("No comments match these filters");
      // Teaching the shortcut to someone who already has comments is noise;
      // what they need is a way out of the filter.
      expect(empty.querySelector(`.${CLASSES.INBOX_EMPTY_KBD}`)).toBeNull();

      click(empty.querySelector(`.${CLASSES.INBOX_EMPTY_ACTION}`));
      expect(overlay.inboxView.statusFilter).toBe("all");
      expect(panel.querySelectorAll(`.${CLASSES.INBOX_CARD}`)).toHaveLength(1);
    });

    it("tags orphaned comments", () => {
      overlay = makeOverlay({ locale: "es" });
      overlay.loadComments([
        {
          id: 9,
          text: "orphaned one",
          page: location.pathname,
          anchor: {
            version: 1,
            selector: "#does-not-exist",
            fingerprint: {
              tagName: "ARTICLE",
              textSnippet: "gone forever",
              attributes: {},
              siblingIndex: 0,
              siblingCount: 1,
            },
            relativeX: 0.5,
            relativeY: 0.5,
          },
          replies: [],
          author: "X",
          createdAt: "2026-07-03T00:00:00.000Z",
          screenshots: [],
        },
      ]);

      const panel = openInbox(overlay);
      const tags = [...panel.querySelectorAll(`.${CLASSES.INBOX_CARD_TAG}`)];
      expect(tags.some((t) => t.textContent === "Desanclado")).toBe(true);
    });

    it("tags hidden comments and does not tag visible anchored ones", async () => {
      overlay = makeOverlay();
      const target = document.getElementById("target");
      const visible = await createCommentOn(overlay, target, "visible one");
      const hiddenComment = await createCommentOn(
        overlay,
        target,
        "hidden one"
      );
      hiddenComment.hidden = true;

      const panel = openInbox(overlay);
      const cards = [...panel.querySelectorAll(`.${CLASSES.INBOX_CARD}`)];
      const cardOf = (c) =>
        cards.find((el) => el.dataset.commentId === String(c.id));
      expect(
        cardOf(hiddenComment).querySelector(`.${CLASSES.INBOX_CARD_TAG}`)
          .textContent
      ).toBe("Hidden");
      expect(
        cardOf(visible).querySelector(`.${CLASSES.INBOX_CARD_TAG}`)
      ).toBeNull();
    });

    it("copies the agent context from the copy button", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
      });
      overlay = makeOverlay();
      await createCommentOn(
        overlay,
        document.getElementById("target"),
        "copy me"
      );

      const panel = openInbox(overlay);
      click(
        panel.querySelector(`.${CLASSES.INBOX_ACTION_BTN}[data-action="copy"]`)
      );

      expect(writeText).toHaveBeenCalledTimes(1);
      const copied = writeText.mock.calls[0][0];
      expect(copied).toContain("Page: ");
      expect(copied).toContain("Selector: #target");
      expect(copied).toContain('"copy me"');
    });

    it("deletes a comment from the ⋯ menu", async () => {
      overlay = makeOverlay();
      const comment = await createCommentOn(
        overlay,
        document.getElementById("target"),
        "doomed"
      );

      const panel = openInbox(overlay);
      click(
        panel.querySelector(`.${CLASSES.INBOX_ACTION_BTN}[data-action="menu"]`)
      );
      click(
        panel.querySelector(
          `.${CLASSES.INBOX_MENU_ITEM}:not([data-picker-option])`
        )
      );

      expect(overlay.comments).toHaveLength(0);
      expect(
        overlay.shadowRoot.querySelector(`[data-comment-id="${comment.id}"]`)
      ).toBeNull();
      expect(panel.querySelectorAll(`.${CLASSES.INBOX_CARD}`)).toHaveLength(0);
    });

    it("closes via X, Escape and toggling the toolbar button", () => {
      overlay = makeOverlay();
      let panel = openInbox(overlay);
      click(panel.querySelector(`.${CLASSES.INBOX_CLOSE}`));
      expect(
        overlay.shadowRoot.querySelector(`.${CLASSES.INBOX_PANEL}`)
      ).toBeNull();

      openInbox(overlay);
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
      expect(
        overlay.shadowRoot.querySelector(`.${CLASSES.INBOX_PANEL}`)
      ).toBeNull();

      openInbox(overlay);
      openInbox(overlay);
      expect(
        overlay.shadowRoot.querySelector(`.${CLASSES.INBOX_PANEL}`)
      ).toBeNull();
    });
  });

  describe("detail view", () => {
    it("clicking a card opens its detail with text, replies and input", async () => {
      overlay = makeOverlay();
      const comment = await createCommentOn(
        overlay,
        document.getElementById("target"),
        "detailed"
      );
      overlay.addReply(comment, "existing reply");

      const panel = openInbox(overlay);
      click(panel.querySelector(`.${CLASSES.INBOX_CARD}`));

      const detail = panel.querySelector(`.${CLASSES.INBOX_DETAIL}`);
      expect(detail).toBeTruthy();
      expect(detail.textContent).toContain("detailed");
      expect(detail.textContent).toContain("existing reply");
      expect(detail.querySelector(`.${CLASSES.THREAD_INPUT}`)).toBeTruthy();
    });

    it("scrolls to the marker, not to the anchor container", async () => {
      overlay = makeOverlay();
      await createCommentOn(
        overlay,
        document.getElementById("target"),
        "far below the fold"
      );
      // The anchor container now sits 1500px down the viewport, so the
      // marker derived from it is below the fold.
      document.getElementById("target").getBoundingClientRect = () =>
        /** @type {any} */ ({ top: 1500, left: 0, width: 300, height: 200 });
      const scrollTo = vi
        .spyOn(window, "scrollTo")
        .mockImplementation(() => {});

      const panel = openInbox(overlay);
      click(panel.querySelector(`.${CLASSES.INBOX_CARD}`));

      // relativeY is 0.05 (placed at y=10 in a 200px container), so the
      // marker centre is 1500 + 10 + 14 and gets centred in the viewport.
      expect(scrollTo).toHaveBeenCalledWith({
        top: 1524 - window.innerHeight / 2,
      });
    });

    it("does not centre the anchor container, which falls back to <body>", async () => {
      overlay = makeOverlay();
      // No section/container ancestor — exactly the case that used to scroll
      // to the middle of the whole document.
      document.elementFromPoint = () => document.body;
      giveSize(document.body);
      const comment = await createCommentOn(
        overlay,
        document.body,
        "anchored on bare body"
      );
      expect(comment.container).toBe(document.body);

      const bodyScroll = vi.fn();
      document.body.scrollIntoView = bodyScroll;
      vi.spyOn(window, "scrollTo").mockImplementation(() => {});

      const panel = openInbox(overlay);
      click(panel.querySelector(`.${CLASSES.INBOX_CARD}`));

      expect(bodyScroll).not.toHaveBeenCalled();
    });

    it("reads the anchor's live rect rather than the marker's rendered position", async () => {
      overlay = makeOverlay();
      const target = document.getElementById("target");
      const comment = await createCommentOn(overlay, target, "scroll to me");

      // The circle's coordinates are only refreshed in a rAF on scroll, so a
      // click landing in the same tick as a scroll sees a stale position.
      // Anything reading the circle would compute the wrong offset here.
      const circle = overlay.shadowRoot.querySelector(
        `[data-comment-id="${comment.id}"]`
      );
      vi.spyOn(circle, "getBoundingClientRect").mockReturnValue(
        /** @type {any} */ ({ top: -9999, height: 28, width: 28 })
      );
      target.getBoundingClientRect = () =>
        /** @type {any} */ ({ top: 800, left: 0, width: 300, height: 400 });

      const scrollTo = vi
        .spyOn(window, "scrollTo")
        .mockImplementation(() => {});

      const panel = openInbox(overlay);
      click(panel.querySelector(`.${CLASSES.INBOX_CARD}`));

      // 800 + clamp(0.05 * 400) + 14 = 834 — from the container, not the circle.
      expect(scrollTo).toHaveBeenCalledWith({
        top: 834 - window.innerHeight / 2,
      });
    });

    it("submitting a reply appends it to the thread and the comment", async () => {
      overlay = makeOverlay();
      const comment = await createCommentOn(
        overlay,
        document.getElementById("target"),
        "reply here"
      );

      const panel = openInbox(overlay);
      click(panel.querySelector(`.${CLASSES.INBOX_CARD}`));

      const input = panel.querySelector(`.${CLASSES.THREAD_INPUT}`);
      input.value = "a fresh reply";
      click(panel.querySelector(`.${CLASSES.THREAD_SUBMIT}`));

      expect(comment.replies).toHaveLength(1);
      expect(comment.replies[0].text).toBe("a fresh reply");
      expect(
        panel.querySelector(`.${CLASSES.INBOX_DETAIL}`).textContent
      ).toContain("a fresh reply");
    });

    it("marks the comment's marker active while its detail is open", async () => {
      overlay = makeOverlay();
      const comment = await createCommentOn(
        overlay,
        document.getElementById("target"),
        "select me"
      );
      const circle = overlay.shadowRoot.querySelector(
        `[data-comment-id="${comment.id}"]`
      );

      const panel = openInbox(overlay);
      expect(circle.classList.contains(CLASSES.CIRCLE_ACTIVE)).toBe(false);

      click(panel.querySelector(`.${CLASSES.INBOX_CARD}`));
      expect(circle.classList.contains(CLASSES.CIRCLE_ACTIVE)).toBe(true);

      click(panel.querySelector(`.${CLASSES.INBOX_BACK}`));
      expect(circle.classList.contains(CLASSES.CIRCLE_ACTIVE)).toBe(false);
    });

    it("moves the active marker when navigating to the next comment", async () => {
      overlay = makeOverlay();
      const target = document.getElementById("target");
      const first = await createCommentOn(overlay, target, "first");
      const second = await createCommentOn(overlay, target, "second");

      const marker = (comment) =>
        overlay.shadowRoot.querySelector(`[data-comment-id="${comment.id}"]`);

      const panel = openInbox(overlay);
      click(panel.querySelector(`.${CLASSES.INBOX_CARD}`));
      expect(marker(first).classList.contains(CLASSES.CIRCLE_ACTIVE)).toBe(
        true
      );

      // Second nav button is "next" — the first one is "previous".
      click(panel.querySelectorAll(`.${CLASSES.INBOX_NAV_BTN}`)[1]);
      expect(marker(first).classList.contains(CLASSES.CIRCLE_ACTIVE)).toBe(
        false
      );
      expect(marker(second).classList.contains(CLASSES.CIRCLE_ACTIVE)).toBe(
        true
      );
    });

    it("clears the active marker when the inbox is closed from the detail", async () => {
      overlay = makeOverlay();
      const comment = await createCommentOn(
        overlay,
        document.getElementById("target"),
        "close me"
      );
      const circle = overlay.shadowRoot.querySelector(
        `[data-comment-id="${comment.id}"]`
      );

      const panel = openInbox(overlay);
      click(panel.querySelector(`.${CLASSES.INBOX_CARD}`));
      expect(circle.classList.contains(CLASSES.CIRCLE_ACTIVE)).toBe(true);

      click(panel.querySelector(`.${CLASSES.INBOX_CLOSE}`));
      expect(circle.classList.contains(CLASSES.CIRCLE_ACTIVE)).toBe(false);
    });

    it("marks nothing for a comment that has no marker on the page", async () => {
      overlay = makeOverlay();
      const comment = await createCommentOn(
        overlay,
        document.getElementById("target"),
        "resolved has no marker"
      );
      const circle = overlay.shadowRoot.querySelector(
        `[data-comment-id="${comment.id}"]`
      );
      overlay.setCommentStatus(comment.id, "resolved");

      const panel = openInbox(overlay);
      click(panel.querySelector(`.${CLASSES.INBOX_CARD}`));

      expect(panel.querySelector(`.${CLASSES.INBOX_DETAIL}`)).toBeTruthy();
      expect(circle.classList.contains(CLASSES.CIRCLE_ACTIVE)).toBe(false);
    });

    it("Back returns to the list", async () => {
      overlay = makeOverlay();
      await createCommentOn(
        overlay,
        document.getElementById("target"),
        "go back"
      );

      const panel = openInbox(overlay);
      click(panel.querySelector(`.${CLASSES.INBOX_CARD}`));
      click(panel.querySelector(`.${CLASSES.INBOX_BACK}`));

      expect(panel.querySelector(`.${CLASSES.INBOX_DETAIL}`)).toBeNull();
      expect(panel.querySelectorAll(`.${CLASSES.INBOX_CARD}`)).toHaveLength(1);
    });

    it("navigates between comments with the arrows, disabled at the edges", async () => {
      overlay = makeOverlay();
      const target = document.getElementById("target");
      await createCommentOn(overlay, target, "first entry");
      await createCommentOn(overlay, target, "second entry");

      const panel = openInbox(overlay);
      click(panel.querySelectorAll(`.${CLASSES.INBOX_CARD}`)[0]);

      const [up, down] = panel.querySelectorAll(`.${CLASSES.INBOX_NAV_BTN}`);
      expect(up.disabled).toBe(true);
      expect(down.disabled).toBe(false);

      click(down);
      expect(
        panel.querySelector(`.${CLASSES.INBOX_DETAIL}`).textContent
      ).toContain("second entry");
      const [up2, down2] = panel.querySelectorAll(`.${CLASSES.INBOX_NAV_BTN}`);
      expect(up2.disabled).toBe(false);
      expect(down2.disabled).toBe(true);
    });

    it("deleting the open comment returns to the list", async () => {
      overlay = makeOverlay();
      await createCommentOn(overlay, document.getElementById("target"), "bye");

      const panel = openInbox(overlay);
      click(panel.querySelector(`.${CLASSES.INBOX_CARD}`));
      click(
        panel.querySelector(`.${CLASSES.INBOX_ACTION_BTN}[data-action="menu"]`)
      );
      click(
        panel.querySelector(
          `.${CLASSES.INBOX_MENU_ITEM}:not([data-picker-option])`
        )
      );

      expect(panel.querySelector(`.${CLASSES.INBOX_DETAIL}`)).toBeNull();
      expect(overlay.comments).toHaveLength(0);
    });
  });

  describe("cross-page navigation", () => {
    afterEach(() => {
      sessionStorage.clear();
    });

    it("clicking an inactive card stores the pending id and navigates to its page", () => {
      overlay = makeOverlay();
      overlay._navigateTo = vi.fn();
      overlay.loadComments([otherPageComment(500)]);

      const panel = openInbox(overlay);
      click(panel.querySelector(`.${CLASSES.INBOX_FILTER}`));
      click(panel.querySelector(`[data-filter-page="all"]`));
      click(panel.querySelector(`.${CLASSES.INBOX_CARD}`));

      expect(sessionStorage.getItem("helldots-pending-detail")).toBe("500");
      expect(overlay._navigateTo).toHaveBeenCalledWith("/otra-pagina");
      // no detail opened here — it opens after the navigation
      expect(panel.querySelector(`.${CLASSES.INBOX_DETAIL}`)).toBeNull();
    });

    it("on init with a pending id, opens the inbox directly on that detail and clears the key", async () => {
      // Seed storage with a comment belonging to the *current* page
      overlay = makeOverlay({ persistence: "localStorage" });
      const comment = await createCommentOn(
        overlay,
        document.getElementById("target"),
        "arrived via redirect"
      );
      overlay.cleanup();
      sessionStorage.setItem("helldots-pending-detail", String(comment.id));

      overlay = makeOverlay({ persistence: "localStorage" });

      const panel = overlay.shadowRoot.querySelector(`.${CLASSES.INBOX_PANEL}`);
      expect(panel).toBeTruthy();
      const detail = panel.querySelector(`.${CLASSES.INBOX_DETAIL}`);
      expect(detail).toBeTruthy();
      expect(detail.textContent).toContain("arrived via redirect");
      expect(sessionStorage.getItem("helldots-pending-detail")).toBeNull();
    });

    it("a pending id that no longer exists is ignored and cleared", () => {
      sessionStorage.setItem("helldots-pending-detail", "424242");
      overlay = makeOverlay({ persistence: "localStorage" });
      expect(
        overlay.shadowRoot.querySelector(`.${CLASSES.INBOX_DETAIL}`)
      ).toBeNull();
      expect(sessionStorage.getItem("helldots-pending-detail")).toBeNull();
    });
  });

  describe("hover highlight", () => {
    const hover = (el, type) =>
      el.dispatchEvent(new MouseEvent(type, { bubbles: true }));

    const circleOf = (ov, comment) =>
      ov.shadowRoot.querySelector(`[data-comment-id="${comment.id}"]`);

    it("highlights the comment's marker on card hover and clears it on leave", async () => {
      overlay = makeOverlay();
      const target = document.getElementById("target");
      const comment = await createCommentOn(overlay, target, "highlight me");
      const circle = circleOf(overlay, comment);

      const panel = openInbox(overlay);
      const card = panel.querySelector(`.${CLASSES.INBOX_CARD}`);

      hover(card, "mouseenter");
      expect(circle.classList.contains(CLASSES.HIGHLIGHT)).toBe(true);
      expect(target.classList.contains(CLASSES.HIGHLIGHT)).toBe(false);

      hover(card, "mouseleave");
      expect(circle.classList.contains(CLASSES.HIGHLIGHT)).toBe(false);
    });

    it("does not highlight resolved comments (no on-page marker)", async () => {
      overlay = makeOverlay();
      const target = document.getElementById("target");
      const comment = await createCommentOn(overlay, target, "resolved one");
      overlay.setCommentStatus(comment.id, "resolved");
      const circle = circleOf(overlay, comment);

      const panel = openInbox(overlay);
      hover(panel.querySelector(`.${CLASSES.INBOX_CARD}`), "mouseenter");
      expect(circle.classList.contains(CLASSES.HIGHLIGHT)).toBe(false);
    });

    it("closing the panel clears any active highlight", async () => {
      overlay = makeOverlay();
      const target = document.getElementById("target");
      const comment = await createCommentOn(
        overlay,
        target,
        "sticky highlight"
      );
      const circle = circleOf(overlay, comment);

      const panel = openInbox(overlay);
      hover(panel.querySelector(`.${CLASSES.INBOX_CARD}`), "mouseenter");
      expect(circle.classList.contains(CLASSES.HIGHLIGHT)).toBe(true);

      click(panel.querySelector(`.${CLASSES.INBOX_CLOSE}`));
      expect(circle.classList.contains(CLASSES.HIGHLIGHT)).toBe(false);
    });
  });

  describe("status lifecycle from the UI", () => {
    it("changing status from an inbox card persists it", async () => {
      overlay = makeOverlay({ persistence: "localStorage" });
      const comment = await createCommentOn(
        overlay,
        document.getElementById("target"),
        "to progress"
      );

      const panel = openInbox(overlay);
      click(
        panel.querySelector(
          `.${CLASSES.INBOX_ACTION_BTN}[data-action="status"]`
        )
      );
      click(panel.querySelector(`[data-picker-option="in_progress"]`));

      expect(comment.status).toBe("in_progress");
      const stored = JSON.parse(localStorage.getItem("helldots-comments"));
      expect(stored[0].status).toBe("in_progress");
    });

    it("resolving from an inbox card re-renders the list immediately", async () => {
      overlay = makeOverlay();
      const target = document.getElementById("target");
      const first = await createCommentOn(overlay, target, "resolve me");
      await createCommentOn(overlay, target, "still open");

      const panel = openInbox(overlay);
      const card = panel.querySelector(
        `.${CLASSES.INBOX_CARD}[data-comment-id="${first.id}"]`
      );
      click(card.querySelector(`[data-action="status"]`));
      click(card.querySelector(`[data-picker-option="resolved"]`));

      // The list is re-rendered on the spot: resolved card sinks to the
      // bottom and gets the resolved styling.
      const cards = panel.querySelectorAll(`.${CLASSES.INBOX_CARD}`);
      expect(cards[1].dataset.commentId).toBe(String(first.id));
      expect(
        cards[1].classList.contains(`${CLASSES.INBOX_CARD}--resolved`)
      ).toBe(true);
    });
  });

  describe("type and priority pickers from an inbox card", () => {
    const findCard = (panel, comment) =>
      panel.querySelector(
        `.${CLASSES.INBOX_CARD}[data-comment-id="${comment.id}"]`
      );

    it("changing type from an inbox card persists it on the comment", async () => {
      overlay = makeOverlay({ persistence: "localStorage" });
      const comment = await createCommentOn(
        overlay,
        document.getElementById("target"),
        "needs a type"
      );

      const panel = openInbox(overlay);
      const card = findCard(panel, comment);
      click(card.querySelector(`[data-action="type"]`));
      click(card.querySelector(`[data-picker-option="bug"]`));

      expect(comment.type).toBe("bug");
      const stored = JSON.parse(localStorage.getItem("helldots-comments"));
      expect(stored[0].type).toBe("bug");
    });

    it("changing priority from an inbox card persists it on the comment", async () => {
      overlay = makeOverlay({ persistence: "localStorage" });
      const comment = await createCommentOn(
        overlay,
        document.getElementById("target"),
        "needs a priority"
      );

      const panel = openInbox(overlay);
      const card = findCard(panel, comment);
      click(card.querySelector(`[data-action="priority"]`));
      click(card.querySelector(`[data-picker-option="high"]`));

      expect(comment.priority).toBe("high");
      const stored = JSON.parse(localStorage.getItem("helldots-comments"));
      expect(stored[0].priority).toBe("high");
    });

    it("selecting Unset on the type picker clears it back to null", async () => {
      overlay = makeOverlay();
      const comment = await createCommentOn(
        overlay,
        document.getElementById("target"),
        "round-trips through unset"
      );

      const panel = openInbox(overlay);
      let card = findCard(panel, comment);
      click(card.querySelector(`[data-action="type"]`));
      click(card.querySelector(`[data-picker-option="bug"]`));
      expect(comment.type).toBe("bug");

      // The inbox list is re-rendered in place after each classification
      // change, so the card element must be re-queried before acting on it
      // again.
      card = findCard(panel, comment);
      click(card.querySelector(`[data-action="type"]`));
      click(card.querySelector(`[data-picker-option=""]`));

      expect(comment.type).toBeNull();
    });
  });

  describe("thread popover actions", () => {
    // Saving a comment already opens its thread, and the marker toggles —
    // clicking it here would close what we came to inspect.
    const openPopover = (ov, comment) => {
      const open = ov.shadowRoot.querySelector(`.${CLASSES.THREAD_POPOVER}`);
      if (open?.dataset.for === String(comment.id)) return open;
      click(ov.shadowRoot.querySelector(`[data-comment-id="${comment.id}"]`));
      return ov.shadowRoot.querySelector(`.${CLASSES.THREAD_POPOVER}`);
    };

    it("shows copy, status and more actions in the popover header", async () => {
      overlay = makeOverlay();
      const comment = await createCommentOn(
        overlay,
        document.getElementById("target"),
        "popover actions"
      );

      const popover = openPopover(overlay, comment);
      expect(popover.querySelector(`[data-action="copy"]`)).toBeTruthy();
      expect(popover.querySelector(`[data-action="status"]`)).toBeTruthy();
      expect(popover.querySelector(`[data-action="menu"]`)).toBeTruthy();
      expect(
        popover.querySelector(`[data-action="copy"]`).dataset.hdTooltip
      ).toBe("Copy agent context");
    });

    it("changing status from the popover updates the comment", async () => {
      const onCommentStatusChanged = vi.fn();
      overlay = makeOverlay({ onCommentStatusChanged });
      const comment = await createCommentOn(
        overlay,
        document.getElementById("target"),
        "status via popover"
      );

      const popover = openPopover(overlay, comment);
      click(popover.querySelector(`[data-action="status"]`));
      click(popover.querySelector(`[data-picker-option="resolved"]`));

      expect(comment.status).toBe("resolved");
      expect(onCommentStatusChanged).toHaveBeenCalledTimes(1);
    });

    it("deleting from the popover closes it and removes the comment", async () => {
      overlay = makeOverlay();
      const comment = await createCommentOn(
        overlay,
        document.getElementById("target"),
        "delete via popover"
      );

      const popover = openPopover(overlay, comment);
      click(popover.querySelector(`[data-action="menu"]`));
      click(
        popover.querySelector(
          `.${CLASSES.INBOX_MENU_ITEM}:not([data-picker-option])`
        )
      );

      expect(
        overlay.shadowRoot.querySelector(`.${CLASSES.THREAD_POPOVER}`)
      ).toBeNull();
      expect(overlay.comments).toHaveLength(0);
    });

    it("copies the agent context including the status line", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
      });
      overlay = makeOverlay();
      const comment = await createCommentOn(
        overlay,
        document.getElementById("target"),
        "copy from popover"
      );
      overlay.setCommentStatus(comment.id, "in_progress");

      const popover = openPopover(overlay, comment);
      click(popover.querySelector(`[data-action="copy"]`));

      expect(writeText).toHaveBeenCalledTimes(1);
      expect(writeText.mock.calls[0][0]).toContain("Status: in_progress");
    });
  });

  describe("card badges", () => {
    const base = {
      id: 1,
      text: "t",
      author: "Ana",
      createdAt: "2026-01-01T00:00:00.000Z",
      page: location.pathname,
      replies: [],
      screenshots: [],
      status: "open",
      type: null,
      priority: null,
      tags: [],
      resolvedAt: null,
      anchorState: "anchored",
    };

    it("renders no badge row when the comment is fully neutral", () => {
      overlay = makeOverlay();
      overlay.loadComments([{ ...base }]);
      const panel = openInbox(overlay);
      expect(panel.querySelector(`.${CLASSES.INBOX_BADGES}`)).toBeNull();
    });

    it("states type and priority once, in the action strip", () => {
      overlay = makeOverlay();
      overlay.loadComments([{ ...base, type: "bug", priority: "high" }]);
      const panel = openInbox(overlay);

      const labels = [
        ...panel.querySelectorAll(`.${CLASSES.INBOX_ACTION_LABEL}`),
      ].map((l) => l.textContent);
      expect(labels).toContain("Bug");
      expect(labels).toContain("High");
      // ...and not a second time as badges underneath.
      expect(panel.querySelector(`.${CLASSES.BADGE_TYPE}`)).toBeNull();
      expect(panel.querySelector(`.${CLASSES.BADGE_PRIORITY}`)).toBeNull();
    });

    it("renders one badge per tag", () => {
      overlay = makeOverlay();
      overlay.loadComments([{ ...base, tags: ["checkout", "ios"] }]);
      const panel = openInbox(overlay);
      const tags = panel.querySelectorAll(`.${CLASSES.BADGE_TAG}`);
      expect([...tags].map((t) => t.textContent)).toEqual(["checkout", "ios"]);
    });

    it("shows the resolution time on resolved comments", () => {
      overlay = makeOverlay();
      overlay.loadComments([
        {
          ...base,
          status: "resolved",
          createdAt: "2026-01-01T00:00:00.000Z",
          resolvedAt: "2026-01-03T04:00:00.000Z",
        },
      ]);
      const panel = openInbox(overlay);
      const badge = panel.querySelector(`.${CLASSES.BADGE_DURATION}`);
      expect(badge.textContent).toBe("Resolved in 2d 4h");
    });

    it("shows an em dash for legacy resolved comments with no resolvedAt", () => {
      // Never invent a duration from data that doesn't exist.
      overlay = makeOverlay();
      overlay.loadComments([{ ...base, status: "resolved", resolvedAt: null }]);
      const panel = openInbox(overlay);
      expect(
        panel.querySelector(`.${CLASSES.BADGE_DURATION}`).textContent
      ).toBe("Resolved in —");
    });

    it("shows no duration badge on unresolved comments", () => {
      overlay = makeOverlay();
      overlay.loadComments([{ ...base, status: "in_progress" }]);
      const panel = openInbox(overlay);
      expect(panel.querySelector(`.${CLASSES.BADGE_DURATION}`)).toBeNull();
    });
  });

  describe("type and priority filters", () => {
    const make = (id, type, priority) => ({
      id,
      text: `c${id}`,
      author: "Ana",
      createdAt: "2026-01-01T00:00:00.000Z",
      page: location.pathname,
      replies: [],
      screenshots: [],
      status: "open",
      tags: [],
      resolvedAt: null,
      anchorState: "anchored",
      type,
      priority,
    });

    const comments = [
      make(1, "bug", "high"),
      make(2, "suggestion", "low"),
      make(3, null, null),
    ];

    it("defaults to showing everything", () => {
      overlay = makeOverlay();
      overlay.loadComments(comments);
      openInbox(overlay);
      expect(overlay.inboxView.filteredComments()).toHaveLength(3);
    });

    it("filters by type", () => {
      overlay = makeOverlay();
      overlay.loadComments(comments);
      openInbox(overlay);
      overlay.inboxView.typeFilter = "bug";
      expect(overlay.inboxView.filteredComments().map((c) => c.id)).toEqual([
        1,
      ]);
    });

    it("filters by priority", () => {
      overlay = makeOverlay();
      overlay.loadComments(comments);
      openInbox(overlay);
      overlay.inboxView.priorityFilter = "low";
      expect(overlay.inboxView.filteredComments().map((c) => c.id)).toEqual([
        2,
      ]);
    });

    it("combines type and priority with AND", () => {
      overlay = makeOverlay();
      overlay.loadComments(comments);
      openInbox(overlay);
      overlay.inboxView.typeFilter = "bug";
      overlay.inboxView.priorityFilter = "low";
      expect(overlay.inboxView.filteredComments()).toHaveLength(0);
    });

    it("combines with the existing status filter", () => {
      overlay = makeOverlay();
      const resolved = { ...make(4, "bug", "high"), status: "resolved" };
      overlay.loadComments([...comments, resolved]);
      openInbox(overlay);
      overlay.inboxView.typeFilter = "bug";
      overlay.inboxView.statusFilter = "open";
      expect(overlay.inboxView.filteredComments().map((c) => c.id)).toEqual([
        1,
      ]);
    });

    it("renders a chip per type and per priority", () => {
      overlay = makeOverlay();
      overlay.loadComments(comments);
      const panel = openInbox(overlay);
      overlay.inboxView.render();
      // One chip per value and no "all" chip — clearing is the toggle.
      expect(panel.querySelectorAll("[data-filter-type]")).toHaveLength(4);
      expect(panel.querySelectorAll("[data-filter-priority]")).toHaveLength(3);
    });

    it("selecting a type option applies the filter", () => {
      overlay = makeOverlay();
      overlay.loadComments(comments);
      const panel = openInbox(overlay);
      overlay.inboxView.render();
      click(panel.querySelector('[data-filter-type="bug"]'));
      expect(overlay.inboxView.typeFilter).toBe("bug");
    });
  });
});

describe("context block in the detail view", () => {
  let overlay;

  beforeEach(() => {
    document.elementFromPoint = () => null;
  });

  afterEach(() => {
    overlay?.cleanup?.();
    cleanupDom();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  const withContext = {
    id: 1,
    text: "t",
    author: "Ana",
    createdAt: "2026-01-01T00:00:00.000Z",
    page: location.pathname,
    replies: [],
    screenshots: [],
    status: "open",
    type: null,
    priority: null,
    tags: [],
    resolvedAt: null,
    anchorState: "anchored",
    contextScreenshot: "data:image/jpeg;base64,auto",
    context: {
      version: 1,
      url: "https://example.test/pricing",
      viewport: { width: 1440, height: 900 },
      screen: { width: 2560, height: 1440 },
      devicePixelRatio: 2,
      userAgent: "ua",
      browser: { name: "Chrome", version: "120" },
      os: { name: "macOS", version: "14.2" },
      language: "es-CO",
    },
  };

  it("lists url, viewport, screen, browser and OS", () => {
    overlay = makeOverlay();
    overlay.loadComments([withContext]);
    const panel = openInbox(overlay);
    overlay.inboxView.openDetail(1);
    const text = panel.querySelector(`.${CLASSES.CONTEXT_BLOCK}`).textContent;

    expect(text).toContain("https://example.test/pricing");
    expect(text).toContain("1440×900");
    expect(text).toContain("2560×1440");
    expect(text).toContain("Chrome 120");
    expect(text).toContain("macOS 14.2");
  });

  it("renders the automatic screenshot with its own label", () => {
    overlay = makeOverlay();
    overlay.loadComments([withContext]);
    const panel = openInbox(overlay);
    overlay.inboxView.openDetail(1);
    const block = panel.querySelector(`.${CLASSES.CONTEXT_BLOCK}`);
    const img = block.querySelector("img");

    expect(img.src).toBe("data:image/jpeg;base64,auto");
    expect(img.alt).toBe("Automatic context");
    expect(
      block.querySelector(`.${CLASSES.CONTEXT_SCREENSHOT_CAPTION}`)?.textContent
    ).toBe("Automatic context");
  });

  it("opens the lightbox when the automatic screenshot is clicked", () => {
    overlay = makeOverlay();
    overlay.loadComments([withContext]);
    const panel = openInbox(overlay);
    overlay.inboxView.openDetail(1);
    const showLightboxSpy = vi.spyOn(overlay, "showLightbox");
    panel
      .querySelector(`.${CLASSES.CONTEXT_BLOCK} img`)
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(showLightboxSpy).toHaveBeenCalledWith("data:image/jpeg;base64,auto");
  });

  it("renders nothing for legacy comments with no context", () => {
    overlay = makeOverlay();
    overlay.loadComments([
      { ...withContext, context: null, contextScreenshot: null },
    ]);
    const panel = openInbox(overlay);
    overlay.inboxView.openDetail(1);
    expect(panel.querySelector(`.${CLASSES.CONTEXT_BLOCK}`)).toBeNull();
  });

  it("renders the block with only a screenshot and no metadata", () => {
    overlay = makeOverlay();
    overlay.loadComments([{ ...withContext, context: null }]);
    const panel = openInbox(overlay);
    overlay.inboxView.openDetail(1);
    const block = panel.querySelector(`.${CLASSES.CONTEXT_BLOCK}`);
    expect(block.querySelector("img")).not.toBeNull();
    expect(block.querySelectorAll(`.${CLASSES.CONTEXT_ROW}`)).toHaveLength(0);
  });

  it("renders metadata rows with no image and no caption when the automatic screenshot is absent", () => {
    overlay = makeOverlay();
    overlay.loadComments([{ ...withContext, contextScreenshot: null }]);
    const panel = openInbox(overlay);
    overlay.inboxView.openDetail(1);
    const block = panel.querySelector(`.${CLASSES.CONTEXT_BLOCK}`);

    expect(block.querySelector("img")).toBeNull();
    expect(
      block.querySelector(`.${CLASSES.CONTEXT_SCREENSHOT_CAPTION}`)
    ).toBeNull();
    expect(
      block.querySelectorAll(`.${CLASSES.CONTEXT_ROW}`).length
    ).toBeGreaterThan(0);
  });
});
