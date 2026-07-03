import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import CommentOverlay from "../src/overlay.js";
import { CLASSES } from "../src/constants.js";
import { TAG_NAME } from "../src/root-element.js";

vi.mock("html2canvas", () => ({
  default: vi.fn().mockResolvedValue({
    toDataURL: () => "data:image/png;base64,mocked",
  }),
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

const createCommentOn = (overlay, container, text = "A test comment") => {
  document.elementFromPoint = () => container;
  overlay.commentMode = true;
  overlay._placeCommentAtPoint(10, 10);
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
    it("lists only current-page comments by default", () => {
      overlay = makeOverlay();
      const target = document.getElementById("target");
      createCommentOn(overlay, target, "first comment");
      createCommentOn(overlay, target, "second comment");
      overlay.loadComments([otherPageComment()]);

      const panel = openInbox(overlay);
      const cards = panel.querySelectorAll(`.${CLASSES.INBOX_CARD}`);
      expect(cards).toHaveLength(2);
      expect(panel.textContent).not.toContain("comment from another page");
    });

    it("the filter switch shows all comments with a page tag on foreign ones", () => {
      overlay = makeOverlay();
      createCommentOn(overlay, document.getElementById("target"), "mine");
      overlay.loadComments([otherPageComment()]);

      const panel = openInbox(overlay);
      click(panel.querySelector(`.${CLASSES.INBOX_FILTER}`));
      const options = panel.querySelectorAll(`.${CLASSES.INBOX_FILTER_OPTION}`);
      click(options[0]); // "All comments"

      const cards = panel.querySelectorAll(`.${CLASSES.INBOX_CARD}`);
      expect(cards).toHaveLength(2);
      const tags = [...panel.querySelectorAll(`.${CLASSES.INBOX_CARD_TAG}`)];
      expect(tags.some((t) => t.textContent === "/otra-pagina")).toBe(true);
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

    it("tags hidden comments and does not tag visible anchored ones", () => {
      overlay = makeOverlay();
      const target = document.getElementById("target");
      const visible = createCommentOn(overlay, target, "visible one");
      const hiddenComment = createCommentOn(overlay, target, "hidden one");
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
      createCommentOn(overlay, document.getElementById("target"), "copy me");

      const panel = openInbox(overlay);
      click(panel.querySelector(`.${CLASSES.INBOX_ACTION_BTN}[data-action="copy"]`));

      expect(writeText).toHaveBeenCalledTimes(1);
      const copied = writeText.mock.calls[0][0];
      expect(copied).toContain("Page: ");
      expect(copied).toContain("Selector: #target");
      expect(copied).toContain('"copy me"');
    });

    it("deletes a comment from the ⋯ menu", () => {
      overlay = makeOverlay();
      const comment = createCommentOn(
        overlay,
        document.getElementById("target"),
        "doomed"
      );

      const panel = openInbox(overlay);
      click(panel.querySelector(`.${CLASSES.INBOX_ACTION_BTN}[data-action="menu"]`));
      click(panel.querySelector(`.${CLASSES.INBOX_MENU_ITEM}`));

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

      panel = openInbox(overlay);
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
    it("clicking a card opens its detail with text, replies and input", () => {
      overlay = makeOverlay();
      const comment = createCommentOn(
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

    it("scrolls the anchored element into view when opening the detail", () => {
      overlay = makeOverlay();
      const target = document.getElementById("target");
      target.scrollIntoView = vi.fn();
      createCommentOn(overlay, target, "scroll to me");

      const panel = openInbox(overlay);
      click(panel.querySelector(`.${CLASSES.INBOX_CARD}`));

      expect(target.scrollIntoView).toHaveBeenCalled();
    });

    it("submitting a reply appends it to the thread and the comment", () => {
      overlay = makeOverlay();
      const comment = createCommentOn(
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

    it("Back returns to the list", () => {
      overlay = makeOverlay();
      createCommentOn(overlay, document.getElementById("target"), "go back");

      const panel = openInbox(overlay);
      click(panel.querySelector(`.${CLASSES.INBOX_CARD}`));
      click(panel.querySelector(`.${CLASSES.INBOX_BACK}`));

      expect(panel.querySelector(`.${CLASSES.INBOX_DETAIL}`)).toBeNull();
      expect(panel.querySelectorAll(`.${CLASSES.INBOX_CARD}`)).toHaveLength(1);
    });

    it("navigates between comments with the arrows, disabled at the edges", () => {
      overlay = makeOverlay();
      const target = document.getElementById("target");
      createCommentOn(overlay, target, "first entry");
      createCommentOn(overlay, target, "second entry");

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

    it("deleting the open comment returns to the list", () => {
      overlay = makeOverlay();
      createCommentOn(overlay, document.getElementById("target"), "bye");

      const panel = openInbox(overlay);
      click(panel.querySelector(`.${CLASSES.INBOX_CARD}`));
      click(
        panel.querySelector(`.${CLASSES.INBOX_ACTION_BTN}[data-action="menu"]`)
      );
      click(panel.querySelector(`.${CLASSES.INBOX_MENU_ITEM}`));

      expect(panel.querySelector(`.${CLASSES.INBOX_DETAIL}`)).toBeNull();
      expect(overlay.comments).toHaveLength(0);
    });
  });
});
