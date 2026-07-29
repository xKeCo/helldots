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

    it("the filter menu has page and status sections with checkmarks on the active options", () => {
      overlay = makeOverlay({ locale: "en" });
      const panel = openInbox(overlay);
      click(panel.querySelector(`.${CLASSES.INBOX_FILTER}`));

      const menu = panel.querySelector(`.${CLASSES.INBOX_FILTER_MENU}`);
      expect(menu.textContent).toContain("Filter by Page");
      expect(menu.textContent).toContain("Filter by Status");

      const checkedPage = menu.querySelector(
        `[data-filter-page][aria-checked="true"]`
      );
      const checkedStatus = menu.querySelector(
        `[data-filter-status][aria-checked="true"]`
      );
      expect(checkedPage.dataset.filterPage).toBe("page");
      expect(checkedStatus.dataset.filterStatus).toBe("all");
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

      // current page + unresolved
      click(panel.querySelector(`.${CLASSES.INBOX_FILTER}`));
      click(panel.querySelector(`[data-filter-status="unresolved"]`));
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
      click(panel.querySelector(`[data-filter-status="unresolved"]`));
      expect(label()).toBe("Página actual · Sin resolver");
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

    it("shows the localized empty state", () => {
      overlay = makeOverlay({ locale: "es" });
      const panel = openInbox(overlay);
      expect(panel.querySelector(`.${CLASSES.INBOX_EMPTY}`).textContent).toBe(
        "Aún no hay comentarios"
      );
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

    it("scrolls the anchored element into view when opening the detail", async () => {
      overlay = makeOverlay();
      const target = document.getElementById("target");
      target.scrollIntoView = vi.fn();
      await createCommentOn(overlay, target, "scroll to me");

      const panel = openInbox(overlay);
      click(panel.querySelector(`.${CLASSES.INBOX_CARD}`));

      expect(target.scrollIntoView).toHaveBeenCalled();
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
    const openPopover = (ov, comment) => {
      const circle = ov.shadowRoot.querySelector(
        `[data-comment-id="${comment.id}"]`
      );
      click(circle);
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
});
