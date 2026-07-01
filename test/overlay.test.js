import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import CommentOverlay from "../src/overlay.js";
import { CLASSES, IDS } from "../src/constants.js";
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The constructor already calls initOverlay() synchronously whenever
// document.readyState isn't "loading" (true in jsdom by default) — autoInit
// is only consumed by the createCommentOverlay() factory in index.js, not by
// the class itself. Calling initOverlay() again here would double-register
// every listener.
const makeOverlay = (options = {}) => new CommentOverlay(options);

describe("CommentOverlay", () => {
  let overlay;

  beforeEach(() => {
    // jsdom doesn't implement elementFromPoint; default to "nothing under
    // the cursor" so _placeCommentAtPoint falls back to document.body.
    document.elementFromPoint = () => null;
  });

  afterEach(() => {
    overlay?.cleanup?.();
    cleanupDom();
    vi.restoreAllMocks();
  });

  describe("construction", () => {
    it("initializes immediately when the document is already ready", () => {
      overlay = makeOverlay();
      expect(overlay.toolbar).toBeTruthy();
      expect(overlay.shadowRoot.getElementById(IDS.TOOLBAR)).toBeTruthy();
    });

    it("defers initOverlay until DOMContentLoaded when the document is still loading", () => {
      const readyStateSpy = vi
        .spyOn(document, "readyState", "get")
        .mockReturnValue("loading");
      const addEventListenerSpy = vi.spyOn(document, "addEventListener");

      overlay = new CommentOverlay({ autoInit: false });

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "DOMContentLoaded",
        expect.any(Function)
      );
      expect(overlay.toolbar).toBeUndefined();

      readyStateSpy.mockRestore();
    });

    it("picks the Mac shortcut hint when the user agent looks like macOS", () => {
      const uaSpy = vi
        .spyOn(navigator, "userAgent", "get")
        .mockReturnValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)");
      overlay = makeOverlay();
      expect(overlay.isMac).toBe(true);
      expect(overlay.options.shortcutKey).toBe("c");
      uaSpy.mockRestore();
    });
  });

  describe("toggleCommentMode", () => {
    it("toggles commentMode, the active class, and the host cursor class", () => {
      overlay = makeOverlay();
      expect(overlay.commentMode).toBe(false);

      overlay.toggleCommentMode();
      expect(overlay.commentMode).toBe(true);
      expect(overlay.commentBtn.classList.contains(CLASSES.ACTIVE)).toBe(true);
      expect(overlay.overlay.classList.contains(CLASSES.ACTIVE)).toBe(true);
      expect(document.body.classList.contains(CLASSES.COMMENT_CURSOR)).toBe(
        true
      );

      overlay.toggleCommentMode();
      expect(overlay.commentMode).toBe(false);
      expect(document.body.classList.contains(CLASSES.COMMENT_CURSOR)).toBe(
        false
      );
    });

    it("hides an open comment box when turning comment mode off", () => {
      overlay = makeOverlay();
      overlay.commentBox.style.display = "block";
      overlay.commentMode = true;
      overlay.toggleCommentMode();
      expect(overlay.commentBox.style.display).toBe("none");
    });

    it("clicking the toolbar comment button toggles comment mode", () => {
      overlay = makeOverlay();
      overlay.commentBtn.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
      expect(overlay.commentMode).toBe(true);
    });
  });

  describe("keyboard shortcut", () => {
    it("toggles comment mode for the default Windows shortcut (Alt+C)", () => {
      const uaSpy = vi
        .spyOn(navigator, "userAgent", "get")
        .mockReturnValue("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
      overlay = makeOverlay();
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "c", altKey: true })
      );
      expect(overlay.commentMode).toBe(true);
      uaSpy.mockRestore();
    });

    it("toggles comment mode for a fully custom shortcut", () => {
      overlay = makeOverlay({ shortcutKey: "k", shortcutModifier: "ctrl" });
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "k", ctrlKey: true })
      );
      expect(overlay.commentMode).toBe(true);
    });

    it("Escape exits comment mode when nothing else is open", () => {
      overlay = makeOverlay();
      overlay.toggleCommentMode();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      expect(overlay.commentMode).toBe(false);
    });

    it("Escape closes the comment box first, then exits comment mode", () => {
      overlay = makeOverlay();
      overlay.toggleCommentMode();
      overlay.showCommentBox(10, 10);
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      expect(overlay.commentBox.style.display).toBe("none");
    });

    it("Escape closes an open thread popover", () => {
      overlay = makeOverlay();
      const comment = {
        id: 1,
        text: "hi",
        replies: [],
        author: "A",
        createdAt: new Date().toISOString(),
        container: document.body,
      };
      overlay.renderCommentCircle(comment);
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="1"]');
      overlay.showThreadPopover(circle, comment);
      expect(overlay.activeThreadPopover).toBeTruthy();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      expect(overlay.activeThreadPopover).toBeNull();
    });

    it("Escape closes an open lightbox", () => {
      overlay = makeOverlay();
      overlay.showLightbox("data:image/png;base64,x");
      expect(overlay._activeLightbox).toBeTruthy();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      expect(overlay._activeLightbox).toBeNull();
    });

    it("re-binding the shortcut listener removes the previous handler", () => {
      overlay = makeOverlay();
      const removeSpy = vi.spyOn(document, "removeEventListener");
      overlay.setupKeyboardShortcut();
      expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
    });
  });

  describe("click-to-comment flow", () => {
    beforeEach(() => {
      document.body.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 1000,
        height: 800,
        right: 1000,
        bottom: 800,
      });
    });

    it("ignores clicks while comment mode is off", () => {
      overlay = makeOverlay();
      const addSpy = vi.spyOn(document, "addEventListener");
      document.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          composed: true,
          clientX: 5,
          clientY: 5,
        })
      );
      expect(addSpy).not.toHaveBeenCalledWith(
        "mousemove",
        expect.any(Function)
      );
    });

    it("ignores clicks on the toolbar/circle/tooltip/popover/lightbox/comment box even in comment mode", () => {
      overlay = makeOverlay();
      overlay.toggleCommentMode();
      const evt = new MouseEvent("mousedown", {
        bubbles: true,
        composed: true,
      });
      Object.defineProperty(evt, "composedPath", {
        value: () => [overlay.toolbar],
      });
      const preventSpy = vi.spyOn(evt, "preventDefault");
      document.dispatchEvent(evt);
      expect(preventSpy).not.toHaveBeenCalled();
    });

    it("a simple click (no drag) places a comment via the comment box", async () => {
      overlay = makeOverlay();
      overlay.toggleCommentMode();

      document.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          composed: true,
          button: 0,
          clientX: 100,
          clientY: 120,
        })
      );
      document.dispatchEvent(
        new MouseEvent("mouseup", {
          bubbles: true,
          clientX: 100,
          clientY: 120,
        })
      );
      await wait(10);

      expect(overlay.commentBox.style.display).toBe("block");
      expect(overlay.currentPosition).toBeTruthy();
    });

    it("dragging a large rectangle captures a screenshot via html2canvas", async () => {
      overlay = makeOverlay();
      overlay.toggleCommentMode();

      document.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          composed: true,
          button: 0,
          clientX: 50,
          clientY: 50,
        })
      );
      document.dispatchEvent(
        new MouseEvent("mousemove", {
          bubbles: true,
          clientX: 150,
          clientY: 160,
        })
      );
      document.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, clientX: 150, clientY: 160 })
      );
      await wait(10);

      expect(overlay._pendingScreenshots?.length).toBe(1);
      expect(overlay._pendingScreenshots[0]).toBe(
        "data:image/png;base64,mocked"
      );
    });

    it("logs a warning and still places the comment when html2canvas rejects", async () => {
      const html2canvas = (await import("html2canvas")).default;
      html2canvas.mockRejectedValueOnce(new Error("capture failed"));
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      overlay = makeOverlay();
      overlay.toggleCommentMode();

      document.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          composed: true,
          button: 0,
          clientX: 50,
          clientY: 50,
        })
      );
      document.dispatchEvent(
        new MouseEvent("mousemove", {
          bubbles: true,
          clientX: 150,
          clientY: 160,
        })
      );
      document.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, clientX: 150, clientY: 160 })
      );
      await wait(10);

      expect(warnSpy).toHaveBeenCalledWith(
        "Screenshot capture failed:",
        expect.any(Error)
      );
      expect(overlay.commentBox.style.display).toBe("block");
    });

    it("ignores a click inside the comment box itself", () => {
      overlay = makeOverlay();
      overlay.toggleCommentMode();
      overlay.commentBox.style.display = "block";

      const evt = new MouseEvent("mousedown", {
        bubbles: true,
        composed: true,
        button: 0,
      });
      Object.defineProperty(evt, "composedPath", {
        value: () => [overlay.commentInput, overlay.commentBox],
      });
      const preventSpy = vi.spyOn(evt, "preventDefault");
      document.dispatchEvent(evt);
      expect(preventSpy).not.toHaveBeenCalled();
    });

    it("clicking elsewhere while the comment box is open closes it and exits comment mode", () => {
      overlay = makeOverlay();
      overlay.toggleCommentMode();
      overlay.showCommentBox(10, 10);
      expect(overlay.commentBox.style.display).toBe("block");

      document.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          composed: true,
          button: 0,
          clientX: 500,
          clientY: 500,
        })
      );

      expect(overlay.commentBox.style.display).toBe("none");
      expect(overlay.commentMode).toBe(false);
    });
  });

  describe("comment box screenshots", () => {
    it("attach button click delegates to the hidden file input", () => {
      overlay = makeOverlay();
      const clickSpy = vi.spyOn(overlay.attachImageInput, "click");
      overlay.attachImageBtn.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
      expect(clickSpy).toHaveBeenCalled();
    });

    it("uploading a file via the comment box input adds it to the preview", async () => {
      overlay = makeOverlay();
      const file = new File(["x"], "x.png", { type: "image/png" });
      Object.defineProperty(overlay.attachImageInput, "files", {
        value: [file],
        configurable: true,
      });
      overlay.attachImageInput.dispatchEvent(
        new Event("change", { bubbles: true })
      );
      await wait(10);
      expect(overlay._pendingScreenshots.length).toBe(1);
      expect(overlay.attachImageInput.value).toBe("");
    });

    it("does nothing when the change event fires without a file", () => {
      overlay = makeOverlay();
      Object.defineProperty(overlay.attachImageInput, "files", {
        value: [],
        configurable: true,
      });
      overlay.attachImageInput.dispatchEvent(
        new Event("change", { bubbles: true })
      );
      expect(overlay._pendingScreenshots).toBeUndefined();
    });

    it("caps pending screenshots at 5", async () => {
      overlay = makeOverlay();
      overlay._pendingScreenshots = Array(5).fill("data:image/png;base64,x");
      const file = new File(["x"], "x.png", { type: "image/png" });
      Object.defineProperty(overlay.attachImageInput, "files", {
        value: [file],
        configurable: true,
      });
      overlay.attachImageInput.dispatchEvent(
        new Event("change", { bubbles: true })
      );
      await wait(10);
      expect(overlay._pendingScreenshots.length).toBe(5);
    });

    it("renders and removes a pending screenshot preview", () => {
      overlay = makeOverlay();
      overlay._pendingScreenshots = ["data:image/png;base64,a"];
      overlay._updateScreenshotsPreview();
      const container = overlay.commentBox.querySelector(
        `.${CLASSES.SCREENSHOTS_CONTAINER}`
      );
      expect(container.classList.contains(CLASSES.ACTIVE)).toBe(true);
      const removeBtn = container.querySelector(
        `.${CLASSES.SCREENSHOT_REMOVE}`
      );
      removeBtn.onclick({ stopPropagation: () => {} });
      expect(overlay._pendingScreenshots.length).toBe(0);
    });

    it("clears the preview and resets pending screenshots", () => {
      overlay = makeOverlay();
      overlay._pendingScreenshots = ["data:image/png;base64,a"];
      overlay._updateScreenshotsPreview();
      overlay._clearScreenshotPreview();
      expect(overlay._pendingScreenshots).toEqual([]);
      const container = overlay.commentBox.querySelector(
        `.${CLASSES.SCREENSHOTS_CONTAINER}`
      );
      expect(container.classList.contains(CLASSES.ACTIVE)).toBe(false);
    });
  });

  describe("saveComment", () => {
    beforeEach(() => {
      document.body.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 1000,
        height: 800,
        right: 1000,
        bottom: 800,
      });
    });

    it("does nothing without text or a current position", () => {
      overlay = makeOverlay();
      overlay.commentInput.value = "";
      overlay.saveComment();
      expect(overlay.comments.length).toBe(0);
    });

    it("saves a comment, renders its circle, and opens the thread popover", () => {
      overlay = makeOverlay();
      overlay._placeCommentAtPoint(100, 100);
      overlay.commentInput.value = "a new comment";
      overlay.saveComment();

      expect(overlay.comments.length).toBe(1);
      expect(
        overlay.shadowRoot.querySelector(
          `[data-comment-id="${overlay.comments[0].id}"]`
        )
      ).toBeTruthy();
      expect(overlay.activeThreadPopover).toBeTruthy();
    });

    it("Enter key in the comment input saves the comment", () => {
      overlay = makeOverlay();
      overlay._placeCommentAtPoint(50, 50);
      overlay.commentInput.value = "via enter";
      overlay.commentInput.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
      expect(overlay.comments.length).toBe(1);
    });
  });

  describe("tooltip and thread popover lifecycle", () => {
    let comment;

    beforeEach(() => {
      overlay = makeOverlay();
      comment = {
        id: 7,
        text: "hello",
        replies: [],
        author: "Author",
        createdAt: new Date().toISOString(),
        container: document.body,
      };
      overlay.comments.push(comment);
      overlay.renderCommentCircle(comment);
    });

    it("hovering the circle shows a tooltip, and it is not duplicated if already open", () => {
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="7"]');
      overlay.showCommentTooltip(circle, comment);
      expect(
        overlay.shadowRoot.querySelector(`.${CLASSES.TOOLTIP}[data-for="7"]`)
      ).toBeTruthy();

      overlay.showCommentTooltip(circle, comment);
      expect(
        overlay.shadowRoot.querySelectorAll(`.${CLASSES.TOOLTIP}[data-for="7"]`)
          .length
      ).toBe(1);
    });

    it("clicking the tooltip close button removes it", () => {
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="7"]');
      overlay.showCommentTooltip(circle, comment);
      const tooltip = overlay.shadowRoot.querySelector(
        `.${CLASSES.TOOLTIP}[data-for="7"]`
      );
      tooltip
        .querySelector(`.${CLASSES.CLOSE_TOOLTIP}`)
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(
        overlay.shadowRoot.querySelector(`.${CLASSES.TOOLTIP}[data-for="7"]`)
      ).toBeNull();
    });

    it("clicking the circle opens the thread popover and closes any tooltip", () => {
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="7"]');
      overlay.showCommentTooltip(circle, comment);
      circle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(overlay.activeThreadPopover).toBeTruthy();
      expect(
        overlay.shadowRoot.querySelector(`.${CLASSES.TOOLTIP}[data-for="7"]`)
      ).toBeNull();
    });

    it("Enter/Space on a focused circle activates it like a click (keyboard accessibility)", () => {
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="7"]');
      expect(circle.getAttribute("role")).toBe("button");
      expect(circle.getAttribute("tabindex")).toBe("0");

      circle.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
      expect(overlay.activeThreadPopover).toBeTruthy();

      overlay.closeThreadPopover();
      circle.dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", bubbles: true })
      );
      expect(overlay.activeThreadPopover).toBeTruthy();
    });

    it("opening a second thread popover closes the first", () => {
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="7"]');
      overlay.showThreadPopover(circle, comment);
      const firstPopover = overlay.activeThreadPopover;
      overlay.showThreadPopover(circle, comment);
      expect(overlay.activeThreadPopover).not.toBe(firstPopover);
      expect(overlay.shadowRoot.contains(firstPopover)).toBe(false);
    });

    it("submits a reply via the submit button and clears the input", () => {
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="7"]');
      overlay.showThreadPopover(circle, comment);
      const popover = overlay.activeThreadPopover;
      const input = popover.querySelector(`.${CLASSES.THREAD_INPUT}`);
      input.value = "a reply";
      popover
        .querySelector(`.${CLASSES.THREAD_SUBMIT}`)
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));

      expect(comment.replies.length).toBe(1);
      expect(comment.replies[0].text).toBe("a reply");
      expect(input.value).toBe("");
      expect(popover.querySelectorAll(`.${CLASSES.THREAD_REPLY}`).length).toBe(
        1
      );
    });

    it("submits a reply via Enter in the thread input", () => {
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="7"]');
      overlay.showThreadPopover(circle, comment);
      const popover = overlay.activeThreadPopover;
      const input = popover.querySelector(`.${CLASSES.THREAD_INPUT}`);
      input.value = "enter reply";
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
      expect(comment.replies.length).toBe(1);
    });

    it("does not submit an empty reply with no screenshots", () => {
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="7"]');
      overlay.showThreadPopover(circle, comment);
      const popover = overlay.activeThreadPopover;
      popover
        .querySelector(`.${CLASSES.THREAD_SUBMIT}`)
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(comment.replies.length).toBe(0);
    });

    it("clicking outside the popover and circle closes it", async () => {
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="7"]');
      overlay.showThreadPopover(circle, comment);
      await wait(10);

      const evt = new MouseEvent("mousedown", {
        bubbles: true,
        composed: true,
      });
      Object.defineProperty(evt, "composedPath", {
        value: () => [document.body],
      });
      document.dispatchEvent(evt);

      expect(overlay.activeThreadPopover).toBeNull();
    });

    it("attaching an image in the thread reply preview adds and removes it", async () => {
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="7"]');
      overlay.showThreadPopover(circle, comment);
      const popover = overlay.activeThreadPopover;
      const fileInput = popover.querySelector(
        `.${CLASSES.THREAD_INPUT_AREA} input[type="file"]`
      );

      const file = new File(["x"], "x.png", { type: "image/png" });
      Object.defineProperty(fileInput, "files", { value: [file] });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      await wait(10);

      const container = popover.querySelector(
        `.${CLASSES.THREAD_INPUT_AREA} .${CLASSES.SCREENSHOTS_CONTAINER}`
      );
      expect(container.classList.contains(CLASSES.ACTIVE)).toBe(true);

      const removeBtn = container.querySelector(
        `.${CLASSES.SCREENSHOT_REMOVE}`
      );
      removeBtn.onclick({ stopPropagation: () => {} });
      expect(container.classList.contains(CLASSES.ACTIVE)).toBe(false);
    });

    it("the thread attach button delegates to its hidden file input", () => {
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="7"]');
      overlay.showThreadPopover(circle, comment);
      const popover = overlay.activeThreadPopover;
      const fileInput = popover.querySelector(
        `.${CLASSES.THREAD_INPUT_AREA} input[type="file"]`
      );
      const attachBtn = popover.querySelector(
        `.${CLASSES.THREAD_INPUT_AREA} .${CLASSES.ATTACH_IMAGE_BTN}`
      );
      const clickSpy = vi.spyOn(fileInput, "click");
      attachBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(clickSpy).toHaveBeenCalled();
    });

    it("a reply submitted with screenshots wires up the lightbox click on the rendered image", async () => {
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="7"]');
      overlay.showThreadPopover(circle, comment);
      const popover = overlay.activeThreadPopover;
      const fileInput = popover.querySelector(
        `.${CLASSES.THREAD_INPUT_AREA} input[type="file"]`
      );
      const file = new File(["x"], "x.png", { type: "image/png" });
      Object.defineProperty(fileInput, "files", { value: [file] });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      await wait(10);

      const input = popover.querySelector(`.${CLASSES.THREAD_INPUT}`);
      input.value = "with a screenshot";
      popover
        .querySelector(`.${CLASSES.THREAD_SUBMIT}`)
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));

      const replyImg = popover.querySelector(
        `.${CLASSES.THREAD_REPLY} .${CLASSES.SCREENSHOT_IMG}`
      );
      expect(replyImg).toBeTruthy();
      const showLightboxSpy = vi.spyOn(overlay, "showLightbox");
      replyImg.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(showLightboxSpy).toHaveBeenCalledWith(replyImg.src);
    });

    it("clicking a screenshot in the main thread popover body opens the lightbox", () => {
      const screenshotComment = {
        id: 70,
        text: "with shots",
        replies: [],
        author: "Author",
        createdAt: new Date().toISOString(),
        container: document.body,
        relativeX: 0.5,
        relativeY: 0.5,
        screenshots: ["data:image/png;base64,zzz"],
      };
      overlay.comments.push(screenshotComment);
      overlay.renderCommentCircle(screenshotComment);
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="70"]');
      overlay.showThreadPopover(circle, screenshotComment);
      const popover = overlay.activeThreadPopover;

      const mainScreenshotsContainer = Array.from(popover.children).find(
        (child) => child.classList.contains(CLASSES.SCREENSHOTS_CONTAINER)
      );
      const img = mainScreenshotsContainer.querySelector(
        `.${CLASSES.SCREENSHOT_IMG}`
      );
      const showLightboxSpy = vi.spyOn(overlay, "showLightbox");
      img.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(showLightboxSpy).toHaveBeenCalledWith(img.src);
    });

    it("clicking a screenshot in the tooltip opens the lightbox", () => {
      const screenshotComment = {
        id: 71,
        text: "with shots",
        replies: [],
        author: "Author",
        createdAt: new Date().toISOString(),
        container: document.body,
        relativeX: 0.5,
        relativeY: 0.5,
        screenshots: ["data:image/png;base64,zzz"],
      };
      overlay.comments.push(screenshotComment);
      overlay.renderCommentCircle(screenshotComment);
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="71"]');
      overlay.showCommentTooltip(circle, screenshotComment);

      const tooltip = overlay.shadowRoot.querySelector(
        `.${CLASSES.TOOLTIP}[data-for="71"]`
      );
      const img = tooltip.querySelector(`.${CLASSES.SCREENSHOT_IMG}`);
      const showLightboxSpy = vi.spyOn(overlay, "showLightbox");
      img.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(showLightboxSpy).toHaveBeenCalledWith(img.src);
    });

    it("closing the thread popover via its close button works", () => {
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="7"]');
      overlay.showThreadPopover(circle, comment);
      const popover = overlay.activeThreadPopover;
      popover
        .querySelector(`.${CLASSES.CLOSE_TOOLTIP}`)
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(overlay.activeThreadPopover).toBeNull();
    });

    it("a tooltip left un-hovered is removed after the mouseleave timeout", async () => {
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="7"]');
      circle.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      expect(
        overlay.shadowRoot.querySelector(`.${CLASSES.TOOLTIP}[data-for="7"]`)
      ).toBeTruthy();

      circle.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
      await wait(300);

      expect(
        overlay.shadowRoot.querySelector(`.${CLASSES.TOOLTIP}[data-for="7"]`)
      ).toBeNull();
    });

    it("opening a tooltip is a no-op while its thread popover is already open", () => {
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="7"]');
      overlay.showThreadPopover(circle, comment);
      overlay.showCommentTooltip(circle, comment);
      expect(
        overlay.shadowRoot.querySelector(`.${CLASSES.TOOLTIP}[data-for="7"]`)
      ).toBeNull();
    });
  });

  describe("lightbox", () => {
    it("opens and closes, replacing any previously open lightbox", () => {
      overlay = makeOverlay();
      overlay.showLightbox("data:image/png;base64,a");
      const first = overlay._activeLightbox;
      overlay.showLightbox("data:image/png;base64,b");
      expect(overlay.shadowRoot.contains(first)).toBe(false);
      expect(overlay._activeLightbox).toBeTruthy();

      overlay._activeLightbox
        .querySelector(`.${CLASSES.LIGHTBOX_CLOSE}`)
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(overlay._activeLightbox).toBeNull();
    });

    it("clicking the lightbox backdrop closes it", () => {
      overlay = makeOverlay();
      overlay.showLightbox("data:image/png;base64,a");
      overlay._activeLightbox.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
      expect(overlay._activeLightbox).toBeNull();
    });
  });

  describe("addReply", () => {
    it("appends a reply with default author and empty screenshots", () => {
      overlay = makeOverlay();
      const comment = { replies: [] };
      const reply = overlay.addReply(comment, "text only");
      expect(comment.replies).toEqual([reply]);
      expect(reply.author).toBe("Anonymous");
      expect(reply.screenshots).toEqual([]);
    });
  });

  describe("position helpers", () => {
    it("validateAndCalculatePosition returns null for zero-size containers", () => {
      overlay = makeOverlay();
      const container = document.createElement("div");
      container.getBoundingClientRect = () => ({
        width: 0,
        height: 0,
        left: 0,
        top: 0,
      });
      const result = overlay.validateAndCalculatePosition(
        { container, relativeX: 0.5, relativeY: 0.5 },
        document.createElement("div")
      );
      expect(result).toBeNull();
    });

    it("validateAndCalculatePosition returns null without a container or circle", () => {
      overlay = makeOverlay();
      expect(overlay.validateAndCalculatePosition({}, null)).toBeNull();
    });

    it("positionPopoverAtCircle clamps to the viewport", () => {
      overlay = makeOverlay();
      const circle = document.createElement("div");
      circle.getBoundingClientRect = () => ({
        left: window.innerWidth - 5,
        top: 5,
        width: 28,
        height: 28,
      });
      const el = document.createElement("div");
      el.getBoundingClientRect = () => ({ height: 100 });
      overlay.positionPopoverAtCircle(el, circle);
      expect(parseFloat(el.style.left)).toBeGreaterThanOrEqual(10);
      expect(parseFloat(el.style.top)).toBeGreaterThanOrEqual(10);
    });

    it("positionPopoverAtCircle clamps the vertical position near the bottom of the viewport", () => {
      overlay = makeOverlay();
      const circle = document.createElement("div");
      circle.getBoundingClientRect = () => ({
        left: 10,
        top: window.innerHeight - 5,
        width: 28,
        height: 28,
      });
      const el = document.createElement("div");
      el.getBoundingClientRect = () => ({ height: 400 });
      overlay.positionPopoverAtCircle(el, circle);
      expect(parseFloat(el.style.top)).toBe(window.innerHeight - 400 - 10);
    });

    it("cleanupResizeObserver disconnects and removes a tracked circle", () => {
      overlay = makeOverlay();
      const observer = { disconnect: vi.fn() };
      const circle = document.createElement("div");
      document.body.appendChild(circle);
      overlay.resizeObservers.set(1, {
        circle,
        observer,
        container: document.body,
      });

      overlay.cleanupResizeObserver(1);

      expect(observer.disconnect).toHaveBeenCalled();
      expect(document.body.contains(circle)).toBe(false);
      expect(overlay.resizeObservers.has(1)).toBe(false);
    });

    it("cleanupResizeObserver is a no-op for an untracked id", () => {
      overlay = makeOverlay();
      expect(() => overlay.cleanupResizeObserver(999)).not.toThrow();
    });

    it("debugPosition logs without throwing", () => {
      overlay = makeOverlay();
      const container = document.createElement("div");
      container.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
      });
      const circle = document.createElement("div");
      circle.getBoundingClientRect = () => ({
        left: 10,
        top: 10,
        width: 28,
        height: 28,
      });
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      overlay.debugPosition(
        { id: 1, relativeX: 0.1, relativeY: 0.1, container },
        circle
      );
      expect(logSpy).toHaveBeenCalled();
      expect(overlay.debugPosition(null, null)).toBeUndefined();
    });
  });

  describe("resize/mutation handling", () => {
    it("schedules a position update on window resize and applies it via rAF", async () => {
      overlay = makeOverlay();
      const container = document.createElement("div");
      document.body.appendChild(container);
      container.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 200,
        height: 200,
      });
      const comment = {
        id: 5,
        container,
        relativeX: 0.5,
        relativeY: 0.5,
        replies: [],
      };
      overlay.comments.push(comment);
      overlay.renderCommentCircle(comment);

      window.dispatchEvent(new Event("resize"));
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const circle = overlay.shadowRoot.querySelector('[data-comment-id="5"]');
      expect(circle.style.left).toBe("114px");
    });

    it("does not update positions while validation is disabled", async () => {
      overlay = makeOverlay();
      overlay.positionValidationEnabled = false;
      overlay.scheduleUpdatePositions();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      // No throw means the early-return branch executed cleanly.
      expect(overlay.positionValidationEnabled).toBe(false);
    });

    it("also schedules a position update on window scroll and load", () => {
      overlay = makeOverlay();
      const spy = vi.spyOn(overlay, "scheduleUpdatePositions");
      window.dispatchEvent(new Event("scroll"));
      expect(spy).toHaveBeenCalledTimes(1);
      window.dispatchEvent(new Event("load"));
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it("uses a real ResizeObserver when the environment supports one", () => {
      class FakeResizeObserver {
        constructor(cb) {
          this.cb = cb;
          this.observed = [];
        }
        observe(target) {
          this.observed.push(target);
        }
        disconnect() {}
      }
      const originalRO = window.ResizeObserver;
      window.ResizeObserver = FakeResizeObserver;

      overlay = makeOverlay();
      const container = document.createElement("div");
      document.body.appendChild(container);
      container.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
      });
      const comment = {
        id: 50,
        container,
        relativeX: 0.5,
        relativeY: 0.5,
        replies: [],
      };
      overlay.comments.push(comment);
      overlay.renderCommentCircle(comment);

      const entry = overlay.resizeObservers.get(50);
      expect(entry.observer).toBeInstanceOf(FakeResizeObserver);
      expect(entry.observer.observed).toContain(container);

      const updateSpy = vi.spyOn(overlay, "updateCommentPosition");
      entry.observer.cb([{ target: container }]);
      expect(updateSpy).toHaveBeenCalledWith(comment, expect.any(HTMLElement));

      overlay.positionValidationEnabled = false;
      entry.observer.cb([{ target: container }]);
      expect(updateSpy).toHaveBeenCalledTimes(1);

      entry.observer.cb([{ target: document.createElement("div") }]);
      expect(updateSpy).toHaveBeenCalledTimes(1);

      window.ResizeObserver = originalRO;
    });

    it("warns and skips when ResizeObserver is unsupported", () => {
      const originalRO = window.ResizeObserver;
      window.ResizeObserver = undefined;
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      overlay = makeOverlay();
      const container = document.createElement("div");
      document.body.appendChild(container);
      const comment = {
        id: 51,
        container,
        relativeX: 0.5,
        relativeY: 0.5,
        replies: [],
      };
      overlay.comments.push(comment);
      overlay.renderCommentCircle(comment);

      expect(warnSpy).toHaveBeenCalled();
      expect(overlay.resizeObservers.has(51)).toBe(false);

      window.ResizeObserver = originalRO;
    });

    it("a container mutation schedules a position update", async () => {
      overlay = makeOverlay();
      const container = document.createElement("div");
      document.body.appendChild(container);
      container.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
      });
      const comment = {
        id: 6,
        container,
        relativeX: 0.5,
        relativeY: 0.5,
        replies: [],
      };
      overlay.comments.push(comment);
      overlay.renderCommentCircle(comment);

      const scheduleSpy = vi.spyOn(overlay, "scheduleUpdatePositions");
      container.setAttribute("data-x", "1");
      await wait(10);
      expect(scheduleSpy).toHaveBeenCalled();
    });

    it("re-creating a mutation observer for the same comment disconnects the old one", () => {
      overlay = makeOverlay();
      const container = document.createElement("div");
      document.body.appendChild(container);
      const comment = { id: 8, container, replies: [] };
      const circle = document.createElement("div");
      overlay.createMutationObserver(comment, circle);
      const first = overlay.mutationObservers.get(8);
      const disconnectSpy = vi.spyOn(first, "disconnect");
      overlay.createMutationObserver(comment, circle);
      expect(disconnectSpy).toHaveBeenCalled();
    });
  });

  describe("cleanup", () => {
    it("removes UI, listeners, observers, and comment circles", () => {
      overlay = makeOverlay();
      const container = document.createElement("div");
      document.body.appendChild(container);
      container.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
      });
      const comment = {
        id: 99,
        container,
        relativeX: 0.5,
        relativeY: 0.5,
        replies: [],
      };
      overlay.comments.push(comment);
      overlay.renderCommentCircle(comment);
      overlay.showLightbox("data:image/png;base64,a");

      overlay.cleanup();

      expect(overlay.shadowRoot.getElementById(IDS.TOOLBAR)).toBeNull();
      expect(overlay.shadowRoot.getElementById(IDS.COMMENT_BOX)).toBeNull();
      expect(
        overlay.shadowRoot.querySelector('[data-comment-id="99"]')
      ).toBeNull();
      expect(overlay._activeLightbox).toBeNull();
    });

    it("disconnects any tracked resize/mutation observers", () => {
      overlay = makeOverlay();
      const resizeObserver = { disconnect: vi.fn() };
      const mutationObserver = { disconnect: vi.fn() };
      overlay.resizeObservers.set(1, { observer: resizeObserver });
      overlay.mutationObservers.set(1, mutationObserver);

      overlay.cleanup();

      expect(resizeObserver.disconnect).toHaveBeenCalled();
      expect(mutationObserver.disconnect).toHaveBeenCalled();
      expect(overlay.resizeObservers.size).toBe(0);
      expect(overlay.mutationObservers.size).toBe(0);
    });

    it("does not leak the document mousedown listener across instances", () => {
      const first = makeOverlay();
      first.toggleCommentMode();
      first.cleanup();

      overlay = makeOverlay();
      overlay.toggleCommentMode();
      const evt = new MouseEvent("mousedown", {
        bubbles: true,
        composed: true,
        button: 0,
      });
      Object.defineProperty(evt, "composedPath", {
        value: () => [document.body],
      });
      const preventSpy = vi.spyOn(evt, "preventDefault");
      document.dispatchEvent(evt);

      // Only the live instance's listener should fire.
      expect(preventSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("injectStyles", () => {
    it("replaces a previously injected stylesheet instead of duplicating it", () => {
      overlay = makeOverlay();
      const first = overlay.shadowRoot.getElementById(IDS.STYLES);
      overlay.injectStyles();
      const second = overlay.shadowRoot.getElementById(IDS.STYLES);
      expect(second).not.toBe(first);
      expect(overlay.shadowRoot.querySelectorAll(`#${IDS.STYLES}`).length).toBe(
        1
      );
    });
  });
});
