import { describe, it, expect } from "vitest";
import {
  createToolbar,
  createCommentBox,
  createCommentCircle,
  createTooltip,
  createThreadPopover,
  createReplyElement,
  createClassifyRow,
  createBadgeRow,
  getShortcutText,
  wireScreenshotInput,
  wireScreenshotLightbox,
} from "../src/components.js";
import { getStrings } from "../src/i18n.js";
import { CLASSES, IDS } from "../src/constants.js";

describe("components", () => {
  describe("getShortcutText", () => {
    it("localizes every modifier on non-Mac platforms, shift included", () => {
      // jsdom's UA is not a Mac, so the localized text path runs. shift
      // used to be a hardcoded "⇧" on every platform while alt/ctrl were
      // localized — the one modifier that skipped the dictionary.
      const strings = getStrings("en");
      expect(
        getShortcutText(
          { shortcutModifier: "shift", shortcutKey: "k" },
          strings
        )
      ).toBe(`${strings.modifierShift} + K`);
    });
  });

  describe("wireScreenshotInput", () => {
    it("ignores files that are not images", async () => {
      // Reading a PDF or .txt into a data URL renders a broken <img> and
      // bloats the stored payload — reject anything that isn't image/*.
      const input = document.createElement("input");
      input.type = "file";
      const screenshots = [];
      const rerender = () => {};
      wireScreenshotInput(input, () => screenshots, rerender);

      const file = new File(["not an image"], "notes.txt", {
        type: "text/plain",
      });
      Object.defineProperty(input, "files", { value: [file] });
      input.dispatchEvent(new Event("change"));
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(screenshots).toHaveLength(0);
    });
  });

  describe("wireScreenshotLightbox", () => {
    it("makes thumbnails keyboard-operable", () => {
      // Every lightbox entry point used to be a bare <img> with a click
      // handler — mouse-only. Same role="button" + tabindex + keydown
      // pattern the marker circles use (see DECISIONS.md, Accessibility).
      const root = document.createElement("div");
      const img = document.createElement("img");
      img.className = CLASSES.SCREENSHOT_IMG;
      img.src = "data:image/png;base64,x";
      img.alt = "Attached screenshot";
      root.appendChild(img);

      const onShow = [];
      wireScreenshotLightbox(root, (src) => onShow.push(src));

      expect(img.getAttribute("role")).toBe("button");
      expect(img.getAttribute("tabindex")).toBe("0");
      img.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
      expect(onShow).toHaveLength(1);
    });
  });

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

    it("gives every icon-only toolbar button an accessible name", () => {
      const toolbar = createToolbar();
      const commentBtn = toolbar.querySelector(
        `.${CLASSES.TOOLBAR_COMMENT_BTN}`
      );
      const menuBtn = toolbar.querySelector(`.${CLASSES.TOOLBAR_MENU_BTN}`);
      expect(commentBtn.getAttribute("aria-label")).toBe("Comment");
      expect(commentBtn.getAttribute("aria-pressed")).toBe("false");
      expect(menuBtn.getAttribute("aria-label")).toBe("Inbox");
      expect(commentBtn.type).toBe("button");
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
      expect(box.getAttribute("role")).toBe("dialog");
      expect(
        box.querySelector(`#${IDS.COMMENT_INPUT}`).getAttribute("aria-label")
      ).toBeTruthy();
    });
  });

  describe("createCommentCircle", () => {
    it("tags the circle with the comment id as a data attribute", () => {
      const circle = createCommentCircle({ id: 42, text: "hello world" });
      expect(circle.className).toBe(CLASSES.CIRCLE);
      expect(circle.dataset.commentId).toBe("42");
    });

    it("is keyboard-focusable and exposes an accessible name", () => {
      const circle = createCommentCircle({ id: 1, text: "hello" });
      expect(circle.getAttribute("role")).toBe("button");
      expect(circle.getAttribute("tabindex")).toBe("0");
      expect(circle.getAttribute("aria-label")).toContain("hello");
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
      expect(tooltip.getAttribute("role")).toBe("dialog");
      const closeBtn = tooltip.querySelector(`.${CLASSES.CLOSE_TOOLTIP}`);
      expect(closeBtn.tagName).toBe("BUTTON");
      expect(closeBtn.getAttribute("aria-label")).toBe("Close");
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

    it("summarises status, type and priority as badges", () => {
      const tooltip = createTooltip({
        id: 4,
        text: "x",
        createdAt: new Date().toISOString(),
        status: "in_progress",
        type: "bug",
        priority: "high",
      });
      const badges = tooltip.querySelector(`.${CLASSES.INBOX_BADGES}`);
      expect([...badges.children].map((b) => b.textContent)).toEqual([
        "In progress",
        "Bug",
        "High",
      ]);
    });

    it("still shows the status badge on an unclassified comment — the tooltip has no status control of its own", () => {
      const tooltip = createTooltip({
        id: 5,
        text: "x",
        createdAt: new Date().toISOString(),
      });
      const badges = tooltip.querySelector(`.${CLASSES.INBOX_BADGES}`);
      expect([...badges.children].map((b) => b.textContent)).toEqual(["Open"]);
    });

    it("counts the thread's replies, pluralised", () => {
      const withReplies = (n) =>
        createTooltip({
          id: 20 + n,
          text: "x",
          createdAt: new Date().toISOString(),
          replies: Array.from({ length: n }, () => ({ text: "r" })),
        }).querySelector(`.${CLASSES.TOOLTIP_REPLY_COUNT}`);

      expect(withReplies(1).textContent).toBe("1 reply");
      expect(withReplies(4).textContent).toBe("4 replies");
    });

    it("omits the reply count when the thread has none", () => {
      // "0 replies" is noise: the absence of the line already says it.
      const noReplies = createTooltip({
        id: 30,
        text: "x",
        createdAt: new Date().toISOString(),
        replies: [],
      });
      const undefinedReplies = createTooltip({
        id: 31,
        text: "x",
        createdAt: new Date().toISOString(),
      });
      expect(
        noReplies.querySelector(`.${CLASSES.TOOLTIP_REPLY_COUNT}`)
      ).toBeNull();
      expect(
        undefinedReplies.querySelector(`.${CLASSES.TOOLTIP_REPLY_COUNT}`)
      ).toBeNull();
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
      expect(popover.getAttribute("role")).toBe("dialog");
      expect(
        popover
          .querySelector(`.${CLASSES.THREAD_INPUT}`)
          .getAttribute("aria-label")
      ).toBeTruthy();
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
        `.${CLASSES.THREAD_SCROLL} > .${CLASSES.SCREENSHOTS_CONTAINER}`
      );
      expect(gallery).toBeTruthy();
    });
  });
});

describe("createBadgeRow", () => {
  const strings = getStrings("en");

  it("returns null when there is nothing to show", () => {
    expect(createBadgeRow({ status: "open" }, strings)).toBeNull();
  });

  it("omits the status badge unless asked for it", () => {
    const row = createBadgeRow({ status: "in_progress", type: "bug" }, strings);
    expect([...row.children].map((b) => b.textContent)).toEqual(["Bug"]);
  });

  it("includes status, type and priority when status is requested", () => {
    const row = createBadgeRow(
      { status: "in_progress", type: "bug", priority: "high" },
      strings,
      { includeStatus: true }
    );
    expect([...row.children].map((b) => b.textContent)).toEqual([
      "In progress",
      "Bug",
      "High",
    ]);
  });

  it("treats a missing status as open", () => {
    const row = createBadgeRow({}, strings, { includeStatus: true });
    expect(row.children[0].textContent).toBe("Open");
  });

  it("carries colour on the border only, never as the sole signal", () => {
    const row = createBadgeRow({ type: "bug" }, strings);
    const badge = row.children[0];
    expect(badge.textContent).toBe("Bug");
    expect(badge.style.borderColor).toBeTruthy();
    expect(badge.style.backgroundColor).toBe("");
  });

  it("still renders tags stored on older comments", () => {
    const row = createBadgeRow({ tags: ["checkout", "ios"] }, strings);
    expect([...row.children].map((b) => b.textContent)).toEqual([
      "checkout",
      "ios",
    ]);
  });
});

describe("createClassifyRow", () => {
  const strings = getStrings("en");

  it("starts neutral", () => {
    const row = createClassifyRow(strings);
    expect(row.getType()).toBeNull();
    expect(row.getPriority()).toBeNull();
  });

  it("has no tags input: tags are no longer authored in the widget", () => {
    const row = createClassifyRow(strings);
    expect(row.getTags).toBeUndefined();
    expect(row.container.querySelector("input")).toBeNull();
  });

  it("records a type and a priority selection", () => {
    const row = createClassifyRow(strings);
    const pick = (value) =>
      [...row.container.querySelectorAll("[data-picker-option]")]
        .find((i) => i.dataset.pickerOption === value)
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));

    pick("bug");
    pick("high");

    expect(row.getType()).toBe("bug");
    expect(row.getPriority()).toBe("high");
  });

  it("reset() rebuilds the type picker's DOM back to neutral, not just its accessor", () => {
    const row = createClassifyRow(strings);
    const pick = (value) =>
      [...row.container.querySelectorAll("[data-picker-option]")]
        .find((i) => i.dataset.pickerOption === value)
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));

    pick("bug");

    const typeWrapper = row.container.querySelector(
      '[data-action="type"]'
    ).parentElement;
    expect(
      typeWrapper
        .querySelector('[data-action="type"]')
        .getAttribute("aria-label")
    ).toBe(`${strings.typeLabel}: ${strings.typeBug}`);

    row.reset();

    // The button/tooltip must reflect "Unset" again — a reset() that only
    // cleared the `type` closure variable while leaving createPicker's own
    // `current` selection in place would still show "Bug" here even though
    // getType() returns null.
    const typeBtnAfter = row.container.querySelector('[data-action="type"]');
    expect(typeBtnAfter.getAttribute("aria-label")).toBe(
      `${strings.typeLabel}: ${strings.unset}`
    );

    const unsetOption = typeBtnAfter.parentElement.querySelector(
      '[data-picker-option=""]'
    );
    expect(unsetOption.getAttribute("aria-checked")).toBe("true");
    expect(row.getType()).toBeNull();
  });
});

describe("createCommentBox", () => {
  it("exposes the classification row", () => {
    const box = createCommentBox(getStrings("en"));
    expect(box.querySelector(`.${CLASSES.CLASSIFY_ROW}`)).not.toBeNull();
    expect(box.classify.getType()).toBeNull();
  });
});
