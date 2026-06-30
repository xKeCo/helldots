import { describe, it, expect } from "vitest";
import {
  createToolbar,
  createCommentBox,
  createCommentCircle,
  createTooltip,
  createThreadPopover,
  createReplyElement,
} from "../src/components.js";
import { CLASSES, IDS } from "../src/constants.js";

describe("components", () => {
  describe("createToolbar", () => {
    it("renders the comment and inbox actions with the configured shortcut hint", () => {
      const toolbar = createToolbar({
        shortcutKey: "k",
        shortcutModifier: "ctrl",
      });
      expect(toolbar.id).toBe(IDS.TOOLBAR);
      expect(
        toolbar.querySelector(`.${CLASSES.TOOLBAR_COMMENT_BTN}`)
      ).toBeTruthy();
      expect(
        toolbar.querySelector(`.${CLASSES.TOOLBAR_MENU_BTN}`)
      ).toBeTruthy();
      expect(
        toolbar.querySelector(`.${CLASSES.SHORTCUT_HINT}`).textContent
      ).toContain("K");
    });

    it("falls back to default shortcut text when no options are given", () => {
      const toolbar = createToolbar();
      expect(
        toolbar.querySelector(`.${CLASSES.SHORTCUT_HINT}`).textContent.length
      ).toBeGreaterThan(0);
    });
  });

  describe("createCommentBox", () => {
    it("renders a hidden box with the comment input area", () => {
      const box = createCommentBox();
      expect(box.id).toBe(IDS.COMMENT_BOX);
      expect(box.style.display).toBe("none");
      expect(box.querySelector(`#${IDS.COMMENT_INPUT}`)).toBeTruthy();
      expect(box.querySelector(`#${IDS.SUBMIT_COMMENT}`)).toBeTruthy();
      expect(box.querySelector(`#${IDS.ATTACH_IMAGE_INPUT}`)).toBeTruthy();
      expect(
        box.querySelector(`.${CLASSES.SCREENSHOTS_CONTAINER}`)
      ).toBeTruthy();
    });
  });

  describe("createCommentCircle", () => {
    it("tags the circle with the comment id and text as data attributes", () => {
      const circle = createCommentCircle({ id: 42, text: "hello world" });
      expect(circle.className).toBe(CLASSES.CIRCLE);
      expect(circle.dataset.commentId).toBe("42");
      expect(circle.dataset.commentText).toBe("hello world");
    });
  });

  describe("createTooltip", () => {
    it("renders author, time, and body text", () => {
      const tooltip = createTooltip({
        id: 1,
        text: "a comment",
        author: "Jane",
        createdAt: new Date().toISOString(),
      });
      expect(tooltip.dataset.for).toBe("1");
      expect(
        tooltip.querySelector(`.${CLASSES.THREAD_AUTHOR}`).textContent
      ).toBe("Jane");
      expect(tooltip.querySelector(`.${CLASSES.THREAD_BODY}`).textContent).toBe(
        "a comment"
      );
      expect(
        tooltip.querySelectorAll(`.${CLASSES.SCREENSHOTS_CONTAINER}`).length
      ).toBe(0);
    });

    it("defaults the author to Anonymous when missing", () => {
      const tooltip = createTooltip({
        id: 2,
        text: "x",
        createdAt: new Date().toISOString(),
      });
      expect(
        tooltip.querySelector(`.${CLASSES.THREAD_AUTHOR}`).textContent
      ).toBe("Anonymous");
    });

    it("renders a screenshots gallery when the comment has screenshots", () => {
      const tooltip = createTooltip({
        id: 3,
        text: "x",
        createdAt: new Date().toISOString(),
        screenshots: ["data:image/png;base64,aaa", "data:image/png;base64,bbb"],
      });
      const gallery = tooltip.querySelector(
        `.${CLASSES.SCREENSHOTS_CONTAINER}`
      );
      expect(gallery).toBeTruthy();
      expect(
        gallery.querySelectorAll(`.${CLASSES.SCREENSHOT_IMG}`).length
      ).toBe(2);
    });

    it("falls back to the legacy single-screenshot field", () => {
      const tooltip = createTooltip({
        id: 4,
        text: "x",
        createdAt: new Date().toISOString(),
        screenshot: "data:image/png;base64,legacy",
      });
      expect(
        tooltip.querySelectorAll(`.${CLASSES.SCREENSHOT_IMG}`).length
      ).toBe(1);
    });
  });

  describe("createReplyElement", () => {
    it("renders the reply author/time/text", () => {
      const reply = createReplyElement({
        author: "Bob",
        timestamp: new Date().toISOString(),
        text: "a reply",
      });
      expect(reply.querySelector(`.${CLASSES.THREAD_AUTHOR}`).textContent).toBe(
        "Bob"
      );
      expect(reply.querySelector(`.${CLASSES.THREAD_BODY}`).textContent).toBe(
        "a reply"
      );
    });

    it("renders screenshots attached to the reply", () => {
      const reply = createReplyElement({
        author: "Bob",
        timestamp: new Date().toISOString(),
        text: "a reply",
        screenshots: ["data:image/png;base64,ccc"],
      });
      expect(reply.querySelector(`.${CLASSES.SCREENSHOT_IMG}`)).toBeTruthy();
    });
  });

  describe("createThreadPopover", () => {
    it("renders header, body, replies and the reply input area", () => {
      const popover = createThreadPopover({
        id: 9,
        text: "root comment",
        author: "Ann",
        createdAt: new Date().toISOString(),
        replies: [
          { author: "Bob", timestamp: new Date().toISOString(), text: "r1" },
        ],
      });
      expect(popover.dataset.for).toBe("9");
      expect(popover.querySelector(`.${CLASSES.THREAD_BODY}`).textContent).toBe(
        "root comment"
      );
      expect(popover.querySelectorAll(`.${CLASSES.THREAD_REPLY}`).length).toBe(
        1
      );
      expect(popover.querySelector(`.${CLASSES.THREAD_INPUT}`)).toBeTruthy();
      expect(popover.querySelector(`.${CLASSES.THREAD_SUBMIT}`)).toBeTruthy();
    });

    it("renders without replies or screenshots when absent", () => {
      const popover = createThreadPopover({
        id: 10,
        text: "no replies",
        author: "Ann",
        createdAt: new Date().toISOString(),
      });
      expect(popover.querySelectorAll(`.${CLASSES.THREAD_REPLY}`).length).toBe(
        0
      );
    });

    it("renders the root comment's screenshots gallery when present", () => {
      const popover = createThreadPopover({
        id: 11,
        text: "with shots",
        author: "Ann",
        createdAt: new Date().toISOString(),
        screenshots: ["data:image/png;base64,ddd"],
      });
      const gallery = popover.querySelector(
        `:scope > .${CLASSES.SCREENSHOTS_CONTAINER}`
      );
      expect(gallery).toBeTruthy();
    });
  });
});
