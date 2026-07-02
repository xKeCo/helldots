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

// Creates a comment anchored to `container` by driving the real pipeline:
// point placement (anchor capture) followed by saveComment().
const createCommentOn = (overlay, container, text = "A test comment") => {
  document.elementFromPoint = () => container;
  overlay.commentMode = true;
  overlay._placeCommentAtPoint(10, 10);
  overlay.commentInput.value = text;
  overlay.saveComment();
  return overlay.comments[overlay.comments.length - 1];
};

describe("persistence", () => {
  let overlay;

  beforeEach(() => {
    document.elementFromPoint = () => null;
    document.body.innerHTML = `<section id="target">Compare our plans and pick one today</section>`;
  });

  afterEach(() => {
    overlay?.cleanup?.();
    cleanupDom();
    vi.restoreAllMocks();
  });

  describe("anchor capture on save", () => {
    it("attaches a serializable anchor and anchorState to new comments", () => {
      overlay = makeOverlay();
      const target = document.getElementById("target");
      const comment = createCommentOn(overlay, target);

      expect(comment.anchorState).toBe("anchored");
      expect(comment.anchor.version).toBe(1);
      expect(comment.anchor.selector).toBe("#target");
      expect(comment.anchor.fingerprint.tagName).toBe("SECTION");
      expect(comment.anchor.relativeX).toBe(comment.relativeX);
      expect(comment.anchor.relativeY).toBe(comment.relativeY);
    });

    it("fires onCommentCreated with a JSON-safe serialized comment", () => {
      const onCommentCreated = vi.fn();
      overlay = makeOverlay({ onCommentCreated });
      const target = document.getElementById("target");
      createCommentOn(overlay, target, "Callback test");

      expect(onCommentCreated).toHaveBeenCalledTimes(1);
      const serialized = onCommentCreated.mock.calls[0][0];
      expect(serialized.text).toBe("Callback test");
      expect(serialized.anchor.selector).toBe("#target");
      expect(serialized.container).toBeUndefined();
      expect(serialized.screenshots).toBeUndefined();
      expect(JSON.parse(JSON.stringify(serialized))).toEqual(serialized);
    });
  });

  describe("replies", () => {
    it("fires onReplyAdded with the serialized comment and the reply", () => {
      const onReplyAdded = vi.fn();
      overlay = makeOverlay({ onReplyAdded });
      const comment = createCommentOn(overlay, document.getElementById("target"));

      const reply = overlay.addReply(comment, "A reply");

      expect(onReplyAdded).toHaveBeenCalledTimes(1);
      const [serialized, sentReply] = onReplyAdded.mock.calls[0];
      expect(serialized.id).toBe(comment.id);
      expect(sentReply.text).toBe("A reply");
      expect(sentReply.id).toBe(reply.id);
    });
  });

  describe("serializeComments", () => {
    it("returns every comment in serializable form", () => {
      overlay = makeOverlay();
      const target = document.getElementById("target");
      createCommentOn(overlay, target, "first");
      // saveComment toggles comment mode off; re-arm before the second one
      createCommentOn(overlay, target, "second");

      const data = overlay.serializeComments();
      expect(data).toHaveLength(2);
      expect(data.map((c) => c.text)).toEqual(["first", "second"]);
      for (const item of data) {
        expect(item.anchor).toBeTruthy();
        expect(item.container).toBeUndefined();
        expect(JSON.parse(JSON.stringify(item))).toEqual(item);
      }
    });

    it("serializes replies without screenshots", () => {
      overlay = makeOverlay();
      const comment = createCommentOn(overlay, document.getElementById("target"));
      overlay.addReply(comment, "with screenshot", ["data:image/png;base64,x"]);

      const [serialized] = overlay.serializeComments();
      expect(serialized.replies).toHaveLength(1);
      expect(serialized.replies[0].text).toBe("with screenshot");
      expect(serialized.replies[0].screenshots).toBeUndefined();
    });
  });

  describe("loadComments", () => {
    it("round-trips: restored comments re-render circles at the same position", () => {
      overlay = makeOverlay();
      const target = document.getElementById("target");
      const original = createCommentOn(overlay, target, "round trip");
      const data = overlay.serializeComments();
      overlay.cleanup();

      overlay = makeOverlay();
      const result = overlay.loadComments(data);

      expect(result).toEqual({ anchored: 1, orphaned: 0 });
      const restored = overlay.comments[0];
      expect(restored.anchorState).toBe("anchored");
      expect(restored.container).toBe(target);
      expect(restored.text).toBe("round trip");
      expect(restored.relativeX).toBeCloseTo(original.relativeX, 5);
      const circle = overlay.shadowRoot.querySelector(
        `[data-comment-id="${restored.id}"]`
      );
      expect(circle).toBeTruthy();
    });

    it("re-anchors via fingerprint rescue when the selector broke", () => {
      overlay = makeOverlay();
      const target = document.getElementById("target");
      const comment = createCommentOn(overlay, target, "rescued");
      const data = overlay.serializeComments();
      // The id selector will break, but content stays identifiable
      expect(comment.anchor.selector).toBe("#target");
      overlay.cleanup();

      document.body.innerHTML = `<section class="renamed">Compare our plans and pick one today</section>`;
      overlay = makeOverlay();
      const result = overlay.loadComments(data);

      expect(result).toEqual({ anchored: 1, orphaned: 0 });
      expect(overlay.comments[0].container).toBe(
        document.querySelector(".renamed")
      );
    });

    it("orphans comments whose element is gone and fires onAnchorLost", () => {
      overlay = makeOverlay();
      createCommentOn(overlay, document.getElementById("target"), "orphan me");
      const data = overlay.serializeComments();
      overlay.cleanup();

      document.body.innerHTML = `<div>totally different page</div>`;
      const onAnchorLost = vi.fn();
      overlay = makeOverlay({ onAnchorLost });
      const result = overlay.loadComments(data);

      expect(result).toEqual({ anchored: 0, orphaned: 1 });
      const orphan = overlay.comments[0];
      expect(orphan.anchorState).toBe("orphaned");
      expect(orphan.container).toBeNull();
      expect(
        overlay.shadowRoot.querySelector(`[data-comment-id="${orphan.id}"]`)
      ).toBeNull();
      expect(onAnchorLost).toHaveBeenCalledTimes(1);
      expect(onAnchorLost.mock.calls[0][0].text).toBe("orphan me");
    });

    it("is idempotent by id: reloading replaces instead of duplicating", () => {
      overlay = makeOverlay();
      createCommentOn(overlay, document.getElementById("target"), "once");
      const data = overlay.serializeComments();
      overlay.cleanup();

      overlay = makeOverlay();
      overlay.loadComments(data);
      overlay.loadComments(data);

      expect(overlay.comments).toHaveLength(1);
      expect(
        overlay.shadowRoot.querySelectorAll(`.${CLASSES.CIRCLE}`)
      ).toHaveLength(1);
    });

    it("treats anchor-less entries with id+text as orphans and skips garbage", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      overlay = makeOverlay();

      const result = overlay.loadComments([
        { id: 1, text: "no anchor" },
        { bogus: true },
        null,
      ]);

      expect(result).toEqual({ anchored: 0, orphaned: 1 });
      expect(overlay.comments).toHaveLength(1);
      expect(overlay.comments[0].anchorState).toBe("orphaned");
      expect(warn).toHaveBeenCalled();
    });

    it("returns zeros and does not throw on non-array input", () => {
      overlay = makeOverlay();
      expect(overlay.loadComments(undefined)).toEqual({
        anchored: 0,
        orphaned: 0,
      });
    });
  });

  describe("inbox panel", () => {
    const openInbox = (ov) => {
      ov.toolbar
        .querySelector(`.${CLASSES.TOOLBAR_MENU_BTN}`)
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return ov.shadowRoot.querySelector(`.${CLASSES.INBOX_PANEL}`);
    };

    it("opens a panel listing every comment", () => {
      overlay = makeOverlay();
      const target = document.getElementById("target");
      createCommentOn(overlay, target, "first comment");
      createCommentOn(overlay, target, "second comment");

      const panel = openInbox(overlay);
      expect(panel).toBeTruthy();
      const items = panel.querySelectorAll(`.${CLASSES.INBOX_ITEM}`);
      expect(items).toHaveLength(2);
      expect(items[0].textContent).toContain("first comment");
      expect(items[1].textContent).toContain("second comment");
    });

    it("shows the empty state when there are no comments", () => {
      overlay = makeOverlay({ locale: "en" });
      const panel = openInbox(overlay);
      expect(
        panel.querySelector(`.${CLASSES.INBOX_EMPTY}`).textContent
      ).toBe("No comments yet");
    });

    it("flags orphaned comments with a localized badge", () => {
      overlay = makeOverlay();
      createCommentOn(overlay, document.getElementById("target"), "will orphan");
      const data = overlay.serializeComments();
      overlay.cleanup();

      document.body.innerHTML = `<div>different page</div>`;
      overlay = makeOverlay({ locale: "es" });
      overlay.loadComments(data);

      const panel = openInbox(overlay);
      const badge = panel.querySelector(`.${CLASSES.INBOX_ORPHAN_BADGE}`);
      expect(badge).toBeTruthy();
      expect(badge.textContent).toBe("Desanclado");
    });

    it("does not flag anchored comments", () => {
      overlay = makeOverlay();
      createCommentOn(overlay, document.getElementById("target"), "anchored");
      const panel = openInbox(overlay);
      expect(
        panel.querySelector(`.${CLASSES.INBOX_ORPHAN_BADGE}`)
      ).toBeNull();
    });

    it("clicking an orphaned item opens its thread popover without a circle", () => {
      overlay = makeOverlay();
      createCommentOn(overlay, document.getElementById("target"), "orphan thread");
      const data = overlay.serializeComments();
      overlay.cleanup();

      document.body.innerHTML = `<div>different page</div>`;
      overlay = makeOverlay();
      overlay.loadComments(data);

      const panel = openInbox(overlay);
      panel
        .querySelector(`.${CLASSES.INBOX_ITEM}`)
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));

      const popover = overlay.shadowRoot.querySelector(
        `.${CLASSES.THREAD_POPOVER}`
      );
      expect(popover).toBeTruthy();
      expect(popover.textContent).toContain("orphan thread");
    });

    it("toggling the inbox button closes the panel, and Escape closes it too", () => {
      overlay = makeOverlay();
      const panel = openInbox(overlay);
      expect(panel).toBeTruthy();

      openInbox(overlay);
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
    });
  });
});
