import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import CommentOverlay from "../src/overlay.js";
import { CLASSES, IDS } from "../src/constants.js";
import { TAG_NAME } from "../src/root-element.js";
import { domToCanvas } from "modern-screenshot";

vi.mock("modern-screenshot", () => ({ domToCanvas: vi.fn() }));

// renderPage/withHiddenOverlay/cropViewport/AUTO_SCALE are kept REAL (via
// importOriginal) — the "automatic context capture" suite below drives them
// through the real domToCanvas mock above and asserts on real host-hiding
// and cropping behaviour. Only cropRegion and captureRegion are faked: the
// drag-path tests predate that plumbing and assert on a fixed data URL
// rather than on real canvas output (jsdom has no canvas backing).
vi.mock("../src/capture.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    captureRegion: vi.fn().mockResolvedValue("data:image/png;base64,mocked"),
    cropRegion: vi.fn().mockReturnValue("data:image/png;base64,mocked"),
  };
});

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

    it("renders English UI text by default", () => {
      overlay = makeOverlay();
      const commentLabel = overlay.toolbar.querySelector(
        `.${CLASSES.TOOLBAR_TEXT}`
      );
      expect(commentLabel.textContent).toBe("Comment");
      expect(overlay.commentInput.placeholder).toBe("Type your comment...");
    });

    it("switching locale to 'es' visibly changes the rendered UI text", () => {
      overlay = makeOverlay({ locale: "es" });
      const commentLabel = overlay.toolbar.querySelector(
        `.${CLASSES.TOOLBAR_TEXT}`
      );
      expect(commentLabel.textContent).toBe("Comentar");
      expect(overlay.commentInput.placeholder).toBe("Escribe tu comentario...");
      expect(overlay.commentBox.getAttribute("aria-label")).toBe(
        "Nuevo comentario"
      );
    });

    it("auto-detects the locale from the browser language when none is passed", () => {
      const langSpy = vi
        .spyOn(navigator, "language", "get")
        .mockReturnValue("es-ES");
      overlay = makeOverlay();
      expect(overlay.locale).toBe("es");
      expect(
        overlay.toolbar.querySelector(`.${CLASSES.TOOLBAR_TEXT}`).textContent
      ).toBe("Comentar");
      langSpy.mockRestore();
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

    it("dragging a large rectangle captures a screenshot of the region", async () => {
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

    it("logs a warning and still places the comment when capture rejects", async () => {
      // The drag path now renders via renderPage (domToCanvas) instead of
      // the old captureRegion wrapper — reject one level lower to simulate
      // the same render failure.
      vi.mocked(domToCanvas).mockRejectedValueOnce(new Error("capture failed"));
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

    it("saves a comment, renders its circle, and opens the thread popover", async () => {
      overlay = makeOverlay();
      await overlay._placeCommentAtPoint(100, 100);
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

    it("Enter key in the comment input saves the comment", async () => {
      overlay = makeOverlay();
      await overlay._placeCommentAtPoint(50, 50);
      overlay.commentInput.value = "via enter";
      overlay.commentInput.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
      expect(overlay.comments.length).toBe(1);
    });

    it("resets the classification row between comments", async () => {
      const overlay = makeOverlay({ autoScreenshot: false });
      overlay.commentBox.classify.getTags(); // row is mounted

      const pick = (value) =>
        [...overlay.commentBox.querySelectorAll("[data-picker-option]")]
          .find((i) => i.dataset.pickerOption === value)
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));

      pick("bug");
      expect(overlay.commentBox.classify.getType()).toBe("bug");

      overlay.hideCommentBox();
      expect(overlay.commentBox.classify.getType()).toBeNull();
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

    it("changing priority from the popover updates the comment", () => {
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="7"]');
      overlay.showThreadPopover(circle, comment);
      const popover = overlay.activeThreadPopover;

      popover
        .querySelector(`[data-action="priority"]`)
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      popover
        .querySelector(`[data-picker-option="high"]`)
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));

      expect(comment.priority).toBe("high");
      expect(overlay.comments[0].priority).toBe("high");
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

  describe("marker occlusion by host-page overlays", () => {
    const anchorComment = (overlay, id = 7) => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      container.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 200,
        height: 200,
      });
      const comment = {
        id,
        text: "occlusion test",
        author: "Tester",
        createdAt: new Date().toISOString(),
        container,
        relativeX: 0.5,
        relativeY: 0.5,
        replies: [],
        status: "open",
        anchorState: "anchored",
      };
      overlay.comments.push(comment);
      overlay.renderCommentCircle(comment);
      return comment;
    };

    afterEach(() => {
      delete document.elementsFromPoint;
    });

    it("hides the marker when an unrelated overlay covers its point and restores it when uncovered", () => {
      overlay = makeOverlay();
      const comment = anchorComment(overlay);
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="7"]');
      expect(circle.style.display).not.toBe("none");

      // A modal backdrop unrelated to the anchor sits on top; our own
      // shadow host (the marker itself) is skipped by the hit test.
      const backdrop = document.createElement("div");
      document.body.appendChild(backdrop);
      const host = document.querySelector(TAG_NAME);
      document.elementsFromPoint = () => [host, backdrop];

      overlay.updateCommentPosition(comment, circle);
      expect(circle.style.display).toBe("none");
      expect(comment.hidden).toBe(true);

      document.elementsFromPoint = () => [host, comment.container];
      overlay.updateCommentPosition(comment, circle);
      expect(circle.style.display).toBe("");
      expect(comment.hidden).toBe(false);
    });

    it("keeps the marker when the element on top belongs to the anchored subtree", () => {
      overlay = makeOverlay();
      const comment = anchorComment(overlay, 8);
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="8"]');

      const child = document.createElement("span");
      comment.container.appendChild(child);
      document.elementsFromPoint = () => [child];

      overlay.updateCommentPosition(comment, circle);
      expect(circle.style.display).toBe("");
      expect(comment.hidden).toBe(false);
    });

    it("hides the marker when a modal layer inside its broad container covers it", () => {
      overlay = makeOverlay();
      const comment = anchorComment(overlay, 10);
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="10"]');

      // Broad containers (body-like wrappers) also contain the page's
      // modals: a fixed, viewport-covering backdrop inside the container.
      const backdrop = document.createElement("div");
      backdrop.style.position = "fixed";
      backdrop.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: window.innerWidth,
        height: window.innerHeight,
      });
      comment.container.appendChild(backdrop);
      const modalContent = document.createElement("p");
      backdrop.appendChild(modalContent);

      document.elementsFromPoint = () => [modalContent];
      overlay.updateCommentPosition(comment, circle);
      expect(circle.style.display).toBe("none");
      expect(comment.hidden).toBe(true);
    });

    it("treats explicit dialog semantics as an occluding layer", () => {
      overlay = makeOverlay();
      const comment = anchorComment(overlay, 11);
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="11"]');

      const dialog = document.createElement("div");
      dialog.setAttribute("role", "dialog");
      comment.container.appendChild(dialog);

      document.elementsFromPoint = () => [dialog];
      overlay.updateCommentPosition(comment, circle);
      expect(circle.style.display).toBe("none");
    });

    it("keeps the marker of a comment whose target lives inside the open modal", () => {
      overlay = makeOverlay();
      const comment = anchorComment(overlay, 12);
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="12"]');

      const backdrop = document.createElement("div");
      backdrop.setAttribute("role", "dialog");
      comment.container.appendChild(backdrop);
      const modalText = document.createElement("p");
      modalText.getBoundingClientRect = () => ({
        left: 10,
        top: 10,
        width: 100,
        height: 20,
      });
      backdrop.appendChild(modalText);
      comment.target = modalText;

      document.elementsFromPoint = () => [modalText];
      overlay.updateCommentPosition(comment, circle);
      expect(circle.style.display).toBe("");
    });

    it("closes the comment's open thread popover when its marker gets covered", () => {
      overlay = makeOverlay();
      const comment = anchorComment(overlay, 13);
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="13"]');

      circle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(
        overlay.shadowRoot.querySelector(`.${CLASSES.THREAD_POPOVER}`)
      ).toBeTruthy();

      const backdrop = document.createElement("div");
      document.body.appendChild(backdrop);
      document.elementsFromPoint = () => [backdrop];
      overlay.updateCommentPosition(comment, circle);

      expect(circle.style.display).toBe("none");
      expect(
        overlay.shadowRoot.querySelector(`.${CLASSES.THREAD_POPOVER}`)
      ).toBeNull();
    });

    it("skips the hit test when the marker point falls outside the viewport", () => {
      overlay = makeOverlay();
      const comment = anchorComment(overlay, 9);
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="9"]');

      // Scrolled far off-screen: container is above the viewport.
      comment.container.getBoundingClientRect = () => ({
        left: 0,
        top: -5000,
        width: 200,
        height: 200,
      });
      const backdrop = document.createElement("div");
      document.body.appendChild(backdrop);
      document.elementsFromPoint = () => [backdrop];

      overlay.updateCommentPosition(comment, circle);
      expect(circle.style.display).toBe("");
      expect(comment.hidden).toBe(false);
    });

    it("watches page-wide DOM changes (modal toggles) and disconnects on cleanup", async () => {
      overlay = makeOverlay();
      expect(overlay._globalMutationObserver).toBeTruthy();

      const spy = vi.spyOn(overlay, "scheduleUpdatePositions");
      const backdrop = document.createElement("div");
      document.body.appendChild(backdrop);
      backdrop.style.display = "block";
      // MutationObserver callbacks are microtasks.
      await Promise.resolve();
      expect(spy).toHaveBeenCalled();

      overlay.cleanup();
      expect(overlay._globalMutationObserver).toBeNull();
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

    it("also injects the comment-cursor rule into document.head, since it targets document.body outside the shadow root", () => {
      overlay = makeOverlay();
      const globalStyle = document.getElementById(IDS.GLOBAL_STYLES);
      expect(globalStyle).toBeTruthy();
      expect(globalStyle.parentNode).toBe(document.head);
      expect(globalStyle.textContent).toContain(`.${CLASSES.COMMENT_CURSOR}`);

      const first = globalStyle;
      overlay.injectStyles();
      const second = document.getElementById(IDS.GLOBAL_STYLES);
      expect(second).not.toBe(first);
      expect(
        document.head.querySelectorAll(`#${IDS.GLOBAL_STYLES}`).length
      ).toBe(1);
    });

    it("cleanup() removes the global cursor stylesheet from document.head", () => {
      overlay = makeOverlay();
      overlay.cleanup();
      expect(document.getElementById(IDS.GLOBAL_STYLES)).toBeNull();
    });
  });

  describe("classification setters", () => {
    const seed = (overlay) =>
      overlay.loadComments([
        {
          id: 20,
          text: "t",
          anchor: null,
          page: location.pathname,
          replies: [],
          author: "Ana",
          createdAt: "2026-01-01T00:00:00.000Z",
          screenshots: [],
          status: "open",
        },
      ]);

    it("sets and clears the type", () => {
      const overlay = makeOverlay();
      seed(overlay);
      expect(overlay.setCommentType(20, "bug")).toBe(true);
      expect(overlay.comments[0].type).toBe("bug");
      expect(overlay.setCommentType(20, null)).toBe(true);
      expect(overlay.comments[0].type).toBeNull();
    });

    it("sets and clears the priority", () => {
      const overlay = makeOverlay();
      seed(overlay);
      expect(overlay.setCommentPriority(20, "high")).toBe(true);
      expect(overlay.comments[0].priority).toBe("high");
      expect(overlay.setCommentPriority(20, null)).toBe(true);
      expect(overlay.comments[0].priority).toBeNull();
    });

    it("rejects unknown values and unknown ids without side effects", () => {
      const overlay = makeOverlay();
      seed(overlay);
      overlay.setCommentType(20, "bug");

      expect(overlay.setCommentType(20, "nope")).toBe(false);
      expect(overlay.setCommentPriority(20, "urgent")).toBe(false);
      expect(overlay.setCommentType(999, "bug")).toBe(false);
      expect(overlay.setCommentTags(999, ["x"])).toBe(false);

      expect(overlay.comments[0].type).toBe("bug");
    });

    it("normalises tags: trims, lowercases, drops blanks and duplicates", () => {
      const overlay = makeOverlay();
      seed(overlay);
      overlay.setCommentTags(20, ["  Checkout ", "iOS", "checkout", "", "   "]);
      expect(overlay.comments[0].tags).toEqual(["checkout", "ios"]);
    });

    it("rejects a non-array tags value", () => {
      const overlay = makeOverlay();
      seed(overlay);
      expect(overlay.setCommentTags(20, "checkout")).toBe(false);
    });

    it("fires onCommentUpdated for all three setters", () => {
      const onCommentUpdated = vi.fn();
      const overlay = makeOverlay({ onCommentUpdated });
      seed(overlay);

      overlay.setCommentType(20, "bug");
      overlay.setCommentPriority(20, "low");
      overlay.setCommentTags(20, ["a"]);

      expect(onCommentUpdated).toHaveBeenCalledTimes(3);
      expect(onCommentUpdated.mock.calls[2][0]).toMatchObject({
        id: 20,
        type: "bug",
        priority: "low",
        tags: ["a"],
      });
    });

    it("does not fire onCommentStatusChanged", () => {
      // The existing callback keeps its exact meaning.
      const onCommentStatusChanged = vi.fn();
      const overlay = makeOverlay({ onCommentStatusChanged });
      seed(overlay);
      overlay.setCommentType(20, "bug");
      expect(onCommentStatusChanged).not.toHaveBeenCalled();
    });
  });
});

describe("automatic context capture", () => {
  let overlay;

  beforeEach(() => {
    // jsdom doesn't implement elementFromPoint; default to "nothing under
    // the cursor" so _placeCommentAtPoint falls back to document.body.
    document.elementFromPoint = () => null;
    // domToCanvas is real capture.js's dependency (renderPage calls it for
    // real in this suite) — its call history otherwise carries over from
    // the drag-path tests above, which also exercise the real renderPage.
    vi.mocked(domToCanvas).mockClear();
  });

  afterEach(() => {
    overlay?.cleanup?.();
    cleanupDom();
    vi.restoreAllMocks();
  });

  const fakeOutCanvas = () => ({
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: vi.fn() }),
    toDataURL: vi.fn(() => "data:image/jpeg;base64,auto"),
  });

  const clickAt = async (overlay, x, y) => {
    overlay.toggleCommentMode();
    overlay.handleDocumentClick(
      new MouseEvent("mousedown", { clientX: x, clientY: y, button: 0 })
    );
    await overlay._onDragEnd(
      new MouseEvent("mouseup", { clientX: x, clientY: y })
    );
  };

  it("renders at AUTO_SCALE on the no-drag path", async () => {
    vi.mocked(domToCanvas).mockResolvedValue({ width: 10, height: 10 });
    vi.spyOn(document, "createElement").mockImplementation((tag) =>
      tag === "canvas"
        ? /** @type {any} */ (fakeOutCanvas())
        : Object.getPrototypeOf(document).createElement.call(document, tag)
    );

    overlay = makeOverlay();
    await clickAt(overlay, 50, 50);

    expect(domToCanvas).toHaveBeenCalledTimes(1);
    expect(domToCanvas).toHaveBeenCalledWith(
      document.body,
      expect.objectContaining({ scale: 0.5 })
    );
  });

  it("does not render at all when autoScreenshot is false", async () => {
    vi.mocked(domToCanvas).mockResolvedValue({ width: 10, height: 10 });
    overlay = makeOverlay({ autoScreenshot: false });
    await clickAt(overlay, 50, 50);
    expect(domToCanvas).not.toHaveBeenCalled();
  });

  it("hides the host during the render", async () => {
    let displayDuringRender = null;
    vi.mocked(domToCanvas).mockImplementation(async () => {
      const host = document.querySelector(TAG_NAME);
      displayDuringRender = /** @type {HTMLElement} */ (host)?.style.display;
      return { width: 10, height: 10 };
    });

    overlay = makeOverlay();
    await clickAt(overlay, 50, 50);

    expect(displayDuringRender).toBe("none");
    const host = /** @type {HTMLElement} */ (document.querySelector(TAG_NAME));
    expect(host.style.display).not.toBe("none");
  });

  it("saves the capture and the context onto the comment", async () => {
    vi.mocked(domToCanvas).mockResolvedValue({ width: 10, height: 10 });
    vi.spyOn(document, "createElement").mockImplementation((tag) =>
      tag === "canvas"
        ? /** @type {any} */ (fakeOutCanvas())
        : Object.getPrototypeOf(document).createElement.call(document, tag)
    );

    overlay = makeOverlay();
    await clickAt(overlay, 50, 50);
    overlay.commentInput.value = "a bug";
    overlay.saveComment();

    const [comment] = overlay.comments;
    expect(comment.contextScreenshot).toBe("data:image/jpeg;base64,auto");
    expect(comment.context.version).toBe(1);
    expect(comment.context.url).toBe(location.href);
    expect(comment.context.viewport.width).toBe(window.innerWidth);
  });

  it("still saves the comment when the render fails", async () => {
    // A capture failure must never cost the user their comment.
    vi.mocked(domToCanvas).mockRejectedValue(new Error("render failed"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    overlay = makeOverlay();
    await clickAt(overlay, 50, 50);
    overlay.commentInput.value = "still saved";
    overlay.saveComment();

    expect(overlay.comments).toHaveLength(1);
    expect(overlay.comments[0].contextScreenshot).toBeNull();
    expect(overlay.comments[0].context).not.toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it("does not leak a pending capture into the next comment", async () => {
    vi.mocked(domToCanvas).mockResolvedValue({ width: 10, height: 10 });
    vi.spyOn(document, "createElement").mockImplementation((tag) =>
      tag === "canvas"
        ? /** @type {any} */ (fakeOutCanvas())
        : Object.getPrototypeOf(document).createElement.call(document, tag)
    );

    overlay = makeOverlay();
    await clickAt(overlay, 50, 50);
    // Without stubbing the canvas above, jsdom's getContext("2d") returns
    // null, cropViewport bails out early, and _pendingContextScreenshot is
    // already null before hideCommentBox() runs — making the assertion
    // below pass for the wrong reason. Assert it's actually populated first.
    expect(overlay._pendingContextScreenshot).toBe(
      "data:image/jpeg;base64,auto"
    );

    overlay.hideCommentBox();
    expect(overlay._pendingContextScreenshot).toBeNull();
  });
});
