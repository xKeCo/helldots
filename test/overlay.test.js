import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import CommentOverlay from "../src/overlay.js";
import { CLASSES, IDS } from "../src/constants.js";
import { TAG_NAME } from "../src/root-element.js";
import en from "../src/locales/en.js";
import { domToCanvas } from "modern-screenshot";

vi.mock("modern-screenshot", () => ({ domToCanvas: vi.fn() }));

// renderPage/withHiddenOverlay/cropViewport/AUTO_SCALE are kept REAL (via
// importOriginal) — the "automatic context capture" suite below drives them
// through the real domToCanvas mock above and asserts on real host-hiding
// and cropping behaviour. Only cropRegion is faked: the drag-path tests
// predate that plumbing and assert on a fixed data URL rather than on real
// canvas output (jsdom has no canvas backing).
vi.mock("../src/capture.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    cropRegion: vi.fn().mockReturnValue("data:image/png;base64,mocked"),
  };
});

const cleanupDom = () => {
  document.querySelectorAll(TAG_NAME).forEach((el) => el.remove());
  document.body.className = "";
  document.body.innerHTML = "";
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Polls instead of betting on a fixed delay. FileReader resolves on its own
// schedule, so a flat `wait(10)` passes or fails depending on how loaded the
// machine is — which is exactly how it started failing intermittently once
// the suite grew.
const waitFor = async (predicate, timeout = 2000) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error("waitFor: timed out");
    await wait(5);
  }
};

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

    it("does not mount when cleanup() runs before DOMContentLoaded fires", () => {
      // React 18 StrictMode in an SSR app does exactly this: construct,
      // clean up, all while the document is still loading. The deferred
      // initOverlay must die with the instance instead of mounting a
      // zombie UI nobody holds a handle to.
      const readyStateSpy = vi
        .spyOn(document, "readyState", "get")
        .mockReturnValue("loading");

      overlay = new CommentOverlay({});
      overlay.cleanup();
      readyStateSpy.mockRestore();

      document.dispatchEvent(new Event("DOMContentLoaded"));

      expect(overlay.toolbar).toBeUndefined();
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
        "HellDots: screenshot capture failed:",
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

  describe("narrow-viewport positioning", () => {
    // jsdom never lays anything out, so the measured width the real code
    // reads has to be stubbed. The point of these tests is the arithmetic
    // around that width, which is where the mobile overflow came from.
    const withViewport = (width, fn) => {
      const original = window.innerWidth;
      Object.defineProperty(window, "innerWidth", {
        value: width,
        configurable: true,
      });
      try {
        fn();
      } finally {
        Object.defineProperty(window, "innerWidth", {
          value: original,
          configurable: true,
        });
      }
    };

    const stubWidth = (el, width) => {
      vi.spyOn(el, "getBoundingClientRect").mockReturnValue(
        /** @type {any} */ ({ width, height: 200, top: 0, left: 0 })
      );
    };

    it("keeps the comment box inside a phone-width viewport", () => {
      overlay = makeOverlay();
      // `min(400px, 100vw - 24px)` at 375px wide.
      stubWidth(overlay.commentBox, 351);

      withViewport(375, () => {
        overlay.showCommentBox(300, 40);
        const left = parseFloat(overlay.commentBox.style.left);
        expect(left).toBeGreaterThanOrEqual(0);
        expect(left + 351).toBeLessThanOrEqual(375);
      });
    });

    it("keeps a popover pinned to a marker inside a phone-width viewport", () => {
      overlay = makeOverlay();
      const el = document.createElement("div");
      const circle = document.createElement("div");
      stubWidth(el, 351);
      vi.spyOn(circle, "getBoundingClientRect").mockReturnValue(
        /** @type {any} */ ({ width: 28, height: 28, top: 40, left: 320 })
      );

      withViewport(375, () => {
        overlay.positionPopoverAtCircle(el, circle);
        const left = parseFloat(el.style.left);
        expect(left).toBeGreaterThanOrEqual(0);
        expect(left + 351).toBeLessThanOrEqual(375);
      });
    });

    it("still flips the comment box to the left of the marker when there is room", () => {
      overlay = makeOverlay();
      stubWidth(overlay.commentBox, 400);

      withViewport(1024, () => {
        overlay.showCommentBox(900, 40);
        // 914 (centre) - 24 (offset) - 400 = 490
        expect(parseFloat(overlay.commentBox.style.left)).toBe(490);
      });
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
      await waitFor(() => overlay._pendingScreenshots.length === 1);
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

    it("marks the circle whose thread is open, and unmarks it on close", () => {
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="7"]');
      expect(circle.classList.contains(CLASSES.CIRCLE_ACTIVE)).toBe(false);

      overlay.showThreadPopover(circle, comment);
      expect(circle.classList.contains(CLASSES.CIRCLE_ACTIVE)).toBe(true);

      overlay.closeThreadPopover();
      expect(circle.classList.contains(CLASSES.CIRCLE_ACTIVE)).toBe(false);
    });

    it("moves the active marker when a different comment's thread is opened", () => {
      const other = {
        id: 8,
        text: "second",
        replies: [],
        author: "Author",
        createdAt: new Date().toISOString(),
        container: document.body,
      };
      overlay.comments.push(other);
      overlay.renderCommentCircle(other);

      const first = overlay.shadowRoot.querySelector('[data-comment-id="7"]');
      const second = overlay.shadowRoot.querySelector('[data-comment-id="8"]');

      overlay.showThreadPopover(first, comment);
      overlay.showThreadPopover(second, other);

      expect(first.classList.contains(CLASSES.CIRCLE_ACTIVE)).toBe(false);
      expect(second.classList.contains(CLASSES.CIRCLE_ACTIVE)).toBe(true);
    });

    it("deletes a reply from the popover through its ⋯ menu, once confirmed", async () => {
      const reply = overlay.addReply(comment, "first reply");
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="7"]');
      overlay.showThreadPopover(circle, comment);

      const replyEl = overlay.activeThreadPopover.querySelector(
        `.${CLASSES.THREAD_REPLY}`
      );
      const menuBtn = replyEl.querySelector(
        `.${CLASSES.THREAD_REPLY_ACTIONS} [data-action="menu"]`
      );
      menuBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      // By label: the reply ⋯ carries Edit and Delete, and "the first item"
      // would quietly start meaning Edit.
      [...replyEl.querySelectorAll(`.${CLASSES.INBOX_MENU_ITEM}`)]
        .find((el) => el.textContent === en.deleteReply)
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));

      expect(comment.replies.map((r) => r.id)).toContain(reply.id);
      overlay.shadowRoot
        .querySelector(`.${CLASSES.CONFIRM_ACCEPT}`)
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(comment.replies.map((r) => r.id)).not.toContain(reply.id);
      expect(
        overlay.activeThreadPopover.querySelector(`.${CLASSES.THREAD_REPLY}`)
      ).toBeNull();
    });

    it("offers the ⋯ menu on a reply added during the session", () => {
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="7"]');
      overlay.showThreadPopover(circle, comment);

      const input = overlay.activeThreadPopover.querySelector(
        `.${CLASSES.THREAD_INPUT}`
      );
      input.value = "sent now";
      overlay.activeThreadPopover
        .querySelector(`.${CLASSES.THREAD_SUBMIT}`)
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));

      expect(
        overlay.activeThreadPopover.querySelector(
          `.${CLASSES.THREAD_REPLY} .${CLASSES.THREAD_REPLY_ACTIONS}`
        )
      ).toBeTruthy();
    });

    it("deleteReply reports failure for ids that do not resolve", () => {
      overlay.addReply(comment, "only reply");
      expect(overlay.deleteReply(comment.id, 999)).toBe(false);
      expect(overlay.deleteReply(999, comment.replies[0].id)).toBe(false);
      expect(comment.replies).toHaveLength(1);
    });

    it("deleteReply notifies the host and leaves the comment standing", () => {
      const onReplyDeleted = vi.fn();
      overlay.options.onReplyDeleted = onReplyDeleted;
      const reply = overlay.addReply(comment, "bye");

      expect(overlay.deleteReply(comment.id, reply.id)).toBe(true);
      expect(comment.replies).toHaveLength(0);
      expect(overlay.comments).toContain(comment);
      expect(onReplyDeleted).toHaveBeenCalledWith(
        expect.objectContaining({ id: comment.id }),
        expect.objectContaining({ id: reply.id, text: "bye" })
      );
    });

    it("renders the context capture in the popover as a disclosure collapsed by default", () => {
      comment.context = { url: "https://example.test/checkout" };
      comment.contextScreenshot = "data:image/png;base64,ctx";
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="7"]');
      overlay.showThreadPopover(circle, comment);

      const block = overlay.activeThreadPopover.querySelector(
        `.${CLASSES.CONTEXT_BLOCK}`
      );
      expect(block).toBeTruthy();

      const toggle = block.querySelector(`.${CLASSES.CONTEXT_TOGGLE}`);
      const body = block.querySelector(`.${CLASSES.CONTEXT_BODY}`);
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      expect(body.style.display).toBe("none");

      toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      expect(body.style.display).toBe("");
      expect(body.textContent).toContain("https://example.test/checkout");
    });

    it("omits the context disclosure for comments saved before it was captured", () => {
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="7"]');
      overlay.showThreadPopover(circle, comment);
      expect(
        overlay.activeThreadPopover.querySelector(`.${CLASSES.CONTEXT_BLOCK}`)
      ).toBeNull();
    });

    it("keeps the popover pinned beside its marker as the page scrolls", () => {
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="7"]');
      overlay.showThreadPopover(circle, comment);
      const popover = overlay.activeThreadPopover;

      const rectAt = (top, left) =>
        /** @type {any} */ ({
          top,
          left,
          bottom: top + 28,
          right: left + 28,
          width: 28,
          height: 28,
        });
      const rect = vi.spyOn(circle, "getBoundingClientRect");

      rect.mockReturnValue(rectAt(100, 200));
      overlay.syncThreadPopoverToMarker();
      expect(popover.style.top).toBe("100px");

      // The marker moved up 300px with the page; the popover follows it.
      rect.mockReturnValue(rectAt(400, 200));
      overlay.syncThreadPopoverToMarker();
      expect(popover.style.top).toBe("400px");
    });

    it("hides the popover while its marker is off-screen and brings it back with the marker", () => {
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="7"]');
      overlay.showThreadPopover(circle, comment);
      const popover = overlay.activeThreadPopover;
      const rect = vi.spyOn(circle, "getBoundingClientRect");

      rect.mockReturnValue(
        /** @type {any} */ ({
          top: -200,
          bottom: -172,
          left: 200,
          right: 228,
          width: 28,
          height: 28,
        })
      );
      overlay.syncThreadPopoverToMarker();
      expect(popover.style.display).toBe("none");

      rect.mockReturnValue(
        /** @type {any} */ ({
          top: 120,
          bottom: 148,
          left: 200,
          right: 228,
          width: 28,
          height: 28,
        })
      );
      overlay.syncThreadPopoverToMarker();
      expect(popover.style.display).toBe("");
      expect(overlay.activeThreadPopover).toBe(popover);
    });

    it("hides rather than closes, so a half-typed reply survives scrolling out of view", () => {
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="7"]');
      overlay.showThreadPopover(circle, comment);
      const popover = overlay.activeThreadPopover;
      const input = popover.querySelector(`.${CLASSES.THREAD_INPUT}`);
      input.value = "half-typed";

      vi.spyOn(circle, "getBoundingClientRect").mockReturnValue(
        /** @type {any} */ ({
          top: -500,
          bottom: -472,
          left: 0,
          right: 28,
          width: 28,
          height: 28,
        })
      );
      overlay.syncThreadPopoverToMarker();

      expect(overlay.shadowRoot.contains(popover)).toBe(true);
      expect(popover.querySelector(`.${CLASSES.THREAD_INPUT}`).value).toBe(
        "half-typed"
      );
    });

    it("leaves a centered popover alone — an orphaned comment has no marker to track", () => {
      overlay.showThreadPopover(null, comment);
      const popover = overlay.activeThreadPopover;
      popover.style.top = "42px";
      overlay.syncThreadPopoverToMarker();
      expect(popover.style.top).toBe("42px");
      expect(popover.style.display).toBe("");
    });

    it("follows the marker on a window scroll event", async () => {
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="7"]');
      overlay.showThreadPopover(circle, comment);
      const spy = vi.spyOn(overlay, "syncThreadPopoverToMarker");

      window.dispatchEvent(new Event("scroll"));
      await new Promise((resolve) => requestAnimationFrame(resolve));

      expect(spy).toHaveBeenCalled();
    });

    it("scrolls its body internally instead of growing past the viewport", () => {
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="7"]');
      overlay.showThreadPopover(circle, comment);
      const popover = overlay.activeThreadPopover;

      const scroll = popover.querySelector(`.${CLASSES.THREAD_SCROLL}`);
      expect(scroll).toBeTruthy();
      // The body and the replies scroll; the header, the action strip and
      // the reply box stay pinned outside the scrolling area.
      expect(scroll.querySelector(`.${CLASSES.THREAD_BODY}`)).toBeTruthy();
      expect(scroll.querySelector(`.${CLASSES.THREAD_REPLIES}`)).toBeTruthy();
      expect(scroll.querySelector(`.${CLASSES.THREAD_HEADER}`)).toBeNull();
      expect(scroll.querySelector(`.${CLASSES.THREAD_ACTIONS_ROW}`)).toBeNull();
      expect(scroll.querySelector(`.${CLASSES.THREAD_INPUT_AREA}`)).toBeNull();
    });

    it("puts the context disclosure inside the scrolling area", () => {
      comment.context = { url: "https://example.test/x" };
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="7"]');
      overlay.showThreadPopover(circle, comment);
      const scroll = overlay.activeThreadPopover.querySelector(
        `.${CLASSES.THREAD_SCROLL}`
      );
      expect(scroll.querySelector(`.${CLASSES.CONTEXT_BLOCK}`)).toBeTruthy();
    });

    it("clicking the active marker again closes its thread and clears the active state", () => {
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="7"]');

      circle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(overlay.activeThreadPopover).toBeTruthy();
      expect(circle.classList.contains(CLASSES.CIRCLE_ACTIVE)).toBe(true);

      circle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(overlay.activeThreadPopover).toBeNull();
      expect(circle.classList.contains(CLASSES.CIRCLE_ACTIVE)).toBe(false);

      // Still opens again on a third click — the toggle has no sticky state.
      circle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(overlay.activeThreadPopover).toBeTruthy();
    });

    it("Enter on the active marker toggles it closed too", () => {
      const circle = overlay.shadowRoot.querySelector('[data-comment-id="7"]');
      circle.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
      expect(overlay.activeThreadPopover).toBeTruthy();

      circle.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
      expect(overlay.activeThreadPopover).toBeNull();
    });

    it("clicking a different marker switches threads instead of closing", () => {
      const other = {
        id: 8,
        text: "second",
        replies: [],
        author: "Author",
        createdAt: new Date().toISOString(),
        container: document.body,
      };
      overlay.comments.push(other);
      overlay.renderCommentCircle(other);

      const first = overlay.shadowRoot.querySelector('[data-comment-id="7"]');
      const second = overlay.shadowRoot.querySelector('[data-comment-id="8"]');

      first.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      second.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      expect(overlay.activeThreadPopover?.dataset.for).toBe("8");
      expect(first.classList.contains(CLASSES.CIRCLE_ACTIVE)).toBe(false);
      expect(second.classList.contains(CLASSES.CIRCLE_ACTIVE)).toBe(true);
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
      // Same accessible shape as the comment-box and inbox copies of this
      // preview: a11y drift here is what code duplication cost us once.
      expect(removeBtn.getAttribute("type")).toBe("button");
      expect(removeBtn.getAttribute("aria-label")).toBe(
        overlay.strings.removeScreenshot
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

      const mainScreenshotsContainer = popover.querySelector(
        `.${CLASSES.THREAD_SCROLL} > .${CLASSES.SCREENSHOTS_CONTAINER}`
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

    // Regression: the lightbox is opened *from* the thread popover and the
    // inbox but is mounted as their sibling in the shadow root, so their
    // "click landed outside me" test used to read every click on it — its
    // own close button included — as a click away, and tore the panel down
    // behind the image.
    describe("does not tear down the surface that opened it", () => {
      const withScreenshots = (id) => ({
        id,
        text: "with shots",
        replies: [],
        author: "Author",
        createdAt: new Date().toISOString(),
        container: document.body,
        relativeX: 0.5,
        relativeY: 0.5,
        screenshots: ["data:image/png;base64,zzz"],
      });

      const mousedown = (el) =>
        el.dispatchEvent(
          new MouseEvent("mousedown", { bubbles: true, composed: true })
        );

      it("keeps the thread popover open while the lightbox is used and closed", async () => {
        overlay = makeOverlay();
        const comment = withScreenshots(90);
        overlay.comments.push(comment);
        overlay.renderCommentCircle(comment);
        const circle = overlay.shadowRoot.querySelector(
          '[data-comment-id="90"]'
        );
        overlay.showThreadPopover(circle, comment);
        // The outside-click handler is registered on a macrotask.
        await wait(5);

        const img = overlay.activeThreadPopover.querySelector(
          `.${CLASSES.SCREENSHOT_IMG}`
        );
        img.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(overlay._activeLightbox).toBeTruthy();

        mousedown(
          overlay._activeLightbox.querySelector(`.${CLASSES.LIGHTBOX_IMG}`)
        );
        expect(overlay.activeThreadPopover).toBeTruthy();

        const closeBtn = overlay._activeLightbox.querySelector(
          `.${CLASSES.LIGHTBOX_CLOSE}`
        );
        mousedown(closeBtn);
        closeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        expect(overlay._activeLightbox).toBeNull();
        expect(overlay.activeThreadPopover).toBeTruthy();
      });

      it("keeps the inbox open while the lightbox is used", async () => {
        overlay = makeOverlay();
        overlay.showInbox();
        await wait(5);
        expect(overlay.inboxView.isOpen()).toBe(true);

        overlay.showLightbox("data:image/png;base64,a");
        mousedown(
          overlay._activeLightbox.querySelector(`.${CLASSES.LIGHTBOX_CLOSE}`)
        );

        expect(overlay.inboxView.isOpen()).toBe(true);
      });
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

    it("positionPopoverAtCircle anchors to the bottom edge when the popover does not fit below the marker", () => {
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
      // Bottom-anchored rather than top-clamped: further growth has to push
      // the popover upward so the reply box stays on screen.
      expect(el.style.top).toBe("auto");
      expect(el.style.bottom).toBe("10px");
    });

    it("positionPopoverAtCircle keeps the marker-aligned top when the popover fits below it", () => {
      overlay = makeOverlay();
      const circle = document.createElement("div");
      circle.getBoundingClientRect = () => ({
        left: 10,
        top: 100,
        width: 28,
        height: 28,
      });
      const el = document.createElement("div");
      el.getBoundingClientRect = () => ({ height: 120 });
      overlay.positionPopoverAtCircle(el, circle);
      expect(el.style.bottom).toBe("auto");
      expect(parseFloat(el.style.top)).toBe(100);
    });

    it("a bottom-anchored popover returns to top anchoring once it fits again", () => {
      overlay = makeOverlay();
      const circle = document.createElement("div");
      circle.getBoundingClientRect = () => ({
        left: 10,
        top: 200,
        width: 28,
        height: 28,
      });
      const el = document.createElement("div");
      el.getBoundingClientRect = () => ({ height: window.innerHeight });
      overlay.positionPopoverAtCircle(el, circle);
      expect(el.style.top).toBe("auto");

      el.getBoundingClientRect = () => ({ height: 80 });
      overlay.positionPopoverAtCircle(el, circle);
      expect(el.style.bottom).toBe("auto");
      expect(parseFloat(el.style.top)).toBe(200);
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

      // Watched by the page-wide observer (there is no per-comment one),
      // whose attribute filter covers the layout-affecting set.
      const scheduleSpy = vi.spyOn(overlay, "scheduleUpdatePositions");
      container.classList.add("collapsed");
      await wait(10);
      expect(scheduleSpy).toHaveBeenCalled();
    });
  });

  describe("batched position updates", () => {
    const nextFrame = () =>
      new Promise((resolve) => requestAnimationFrame(() => resolve()));

    const anchorComment = (overlay, id) => {
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
        text: "batch test",
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

    it("refreshes the inbox once when several markers flip in one batch", async () => {
      overlay = makeOverlay();
      const first = anchorComment(overlay, 61);
      const second = anchorComment(overlay, 62);
      overlay.showInbox();
      const refreshSpy = vi.spyOn(overlay.inboxView, "refresh");

      const zeroRect = () => ({ left: 0, top: 0, width: 0, height: 0 });
      first.container.getBoundingClientRect = zeroRect;
      second.container.getBoundingClientRect = zeroRect;

      overlay.scheduleUpdatePositions();
      await nextFrame();

      expect(first.hidden).toBe(true);
      expect(second.hidden).toBe(true);
      expect(refreshSpy).toHaveBeenCalledTimes(1);
    });

    it("skips the occlusion hit test on batches inside the throttle window", async () => {
      overlay = makeOverlay();
      const comment = anchorComment(overlay, 63);
      const host = document.querySelector(TAG_NAME);
      const hits = vi.fn(() => [host, comment.container]);
      document.elementsFromPoint = hits;

      overlay.scheduleUpdatePositions();
      await nextFrame();
      const afterFirstBatch = hits.mock.calls.length;
      expect(afterFirstBatch).toBeGreaterThan(0);

      overlay.scheduleUpdatePositions();
      await nextFrame();
      expect(hits.mock.calls.length).toBe(afterFirstBatch);
    });

    it("runs a trailing occlusion pass after a throttled burst settles", async () => {
      overlay = makeOverlay();
      const comment = anchorComment(overlay, 64);
      const host = document.querySelector(TAG_NAME);
      const hits = vi.fn(() => [host, comment.container]);
      document.elementsFromPoint = hits;

      overlay.scheduleUpdatePositions();
      await nextFrame();
      overlay.scheduleUpdatePositions();
      await nextFrame();
      const afterBurst = hits.mock.calls.length;

      // No further scheduling: the trailing pass must re-check on its own
      // once the throttle window has passed.
      await wait(260);
      expect(hits.mock.calls.length).toBeGreaterThan(afterBurst);
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

    it("disconnects any tracked resize observers", () => {
      overlay = makeOverlay();
      const resizeObserver = { disconnect: vi.fn() };
      overlay.resizeObservers.set(1, { observer: resizeObserver });

      overlay.cleanup();

      expect(resizeObserver.disconnect).toHaveBeenCalled();
      expect(overlay.resizeObservers.size).toBe(0);
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

describe("deep links to a single comment", () => {
  let overlay;

  const remoteComment = (id) => ({
    id,
    text: "linked comment",
    page: location.pathname,
    anchor: null,
    replies: [],
    author: "Remote",
    createdAt: "2026-07-03T00:00:00.000Z",
    screenshots: [],
  });

  const withUrl = (search) =>
    window.history.replaceState({}, "", `${location.pathname}${search}`);

  afterEach(() => {
    overlay?.cleanup?.();
    cleanupDom();
    withUrl("");
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("opens the inbox on the linked comment when the data is already there", () => {
    withUrl("?helldotsComment=abc123");
    overlay = makeOverlay();
    overlay.loadComments([remoteComment("abc123")]);

    expect(
      overlay.shadowRoot.querySelector(`.${CLASSES.INBOX_DETAIL}`)
    ).toBeTruthy();
    expect(overlay.inboxView.detailId).toBe("abc123");
  });

  it("says so rather than doing nothing when the comment is not here", () => {
    // Clicking a link and having nothing at all happen is indistinguishable
    // from a broken widget.
    withUrl("?helldotsComment=missing");
    overlay = makeOverlay();

    const panel = overlay.shadowRoot.querySelector(`.${CLASSES.INBOX_PANEL}`);
    expect(panel).toBeTruthy();
    expect(panel.querySelector(`.${CLASSES.INBOX_NOTICE}`).textContent).toBe(
      overlay.strings.commentNotFound
    );
  });

  it("keeps waiting and opens the comment when the host's data lands later", () => {
    // The setup a shared link is actually for: a host that fetches its
    // comments from its own back end has not called loadComments() yet at
    // startup.
    withUrl("?helldotsComment=late");
    overlay = makeOverlay();
    expect(
      overlay.shadowRoot.querySelector(`.${CLASSES.INBOX_NOTICE}`)
    ).toBeTruthy();

    overlay.loadComments([remoteComment("late")]);

    expect(
      overlay.shadowRoot.querySelector(`.${CLASSES.INBOX_NOTICE}`)
    ).toBeNull();
    expect(overlay.inboxView.detailId).toBe("late");
  });

  it("leaves the parameter in the URL so the link can be reloaded or re-copied", () => {
    withUrl("?helldotsComment=abc123");
    overlay = makeOverlay();
    overlay.loadComments([remoteComment("abc123")]);

    expect(location.search).toContain("helldotsComment=abc123");
  });

  it("honours a host-supplied parameter name", () => {
    withUrl("?thread=abc123");
    overlay = makeOverlay({ linkParam: "thread" });
    overlay.loadComments([remoteComment("abc123")]);

    expect(overlay.inboxView.detailId).toBe("abc123");
    expect(overlay.commentLink("abc123")).toContain("thread=abc123");
  });

  it("commentLink returns null for an id it does not know", () => {
    overlay = makeOverlay();
    expect(overlay.commentLink("nope")).toBeNull();
  });

  it("copies the link from the ⋯ menu and says so before closing", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    overlay = makeOverlay();
    overlay.loadComments([remoteComment("abc123")]);
    overlay.showInbox();
    const panel = overlay.shadowRoot.querySelector(`.${CLASSES.INBOX_PANEL}`);

    panel
      .querySelector(`[data-action="menu"]`)
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const item = [
      ...panel.querySelectorAll(
        `.${CLASSES.INBOX_MENU_ITEM}:not([data-picker-option])`
      ),
    ].find((el) => el.textContent === en.copyLink);
    item.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain("helldotsComment=abc123");
    // Copying succeeds invisibly, so the item has to say it happened before
    // the menu goes away.
    expect(item.textContent).toBe(en.linkCopied);
  });
});
