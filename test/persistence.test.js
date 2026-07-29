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

// Creates a comment anchored to `container` by driving the real pipeline:
// point placement (anchor capture) followed by saveComment().
const createCommentOn = async (overlay, container, text = "A test comment") => {
  document.elementFromPoint = () => container;
  overlay.commentMode = true;
  await overlay._placeCommentAtPoint(10, 10);
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
    it("attaches a serializable anchor and anchorState to new comments", async () => {
      overlay = makeOverlay();
      const target = document.getElementById("target");
      const comment = await createCommentOn(overlay, target);

      expect(comment.anchorState).toBe("anchored");
      expect(comment.anchor.version).toBe(1);
      expect(comment.anchor.selector).toBe("#target");
      expect(comment.anchor.fingerprint.tagName).toBe("SECTION");
      expect(comment.anchor.relativeX).toBe(comment.relativeX);
      expect(comment.anchor.relativeY).toBe(comment.relativeY);
    });

    it("fires onCommentCreated with a JSON-safe serialized comment", async () => {
      const onCommentCreated = vi.fn();
      overlay = makeOverlay({ onCommentCreated });
      const target = document.getElementById("target");
      await createCommentOn(overlay, target, "Callback test");

      expect(onCommentCreated).toHaveBeenCalledTimes(1);
      const serialized = onCommentCreated.mock.calls[0][0];
      expect(serialized.text).toBe("Callback test");
      expect(serialized.anchor.selector).toBe("#target");
      expect(serialized.container).toBeUndefined();
      expect(JSON.parse(JSON.stringify(serialized))).toEqual(serialized);
    });

    it("captures the page (pathname) and screenshots in serialized form", async () => {
      overlay = makeOverlay();
      const target = document.getElementById("target");
      const comment = await createCommentOn(overlay, target, "with page");
      comment.screenshots = ["data:image/png;base64,shot"];

      const [serialized] = overlay.serializeComments();
      expect(serialized.page).toBe(location.pathname);
      expect(serialized.screenshots).toEqual(["data:image/png;base64,shot"]);
    });

    it("uses options.user.name as the author of comments and replies", async () => {
      overlay = makeOverlay({ user: { name: "Kevin Collazos" } });
      const comment = await createCommentOn(
        overlay,
        document.getElementById("target"),
        "authored"
      );
      const reply = overlay.addReply(comment, "reply");

      expect(comment.author).toBe("Kevin Collazos");
      expect(reply.author).toBe("Kevin Collazos");
    });
  });

  describe("replies", () => {
    it("fires onReplyAdded with the serialized comment and the reply", async () => {
      const onReplyAdded = vi.fn();
      overlay = makeOverlay({ onReplyAdded });
      const comment = await createCommentOn(
        overlay,
        document.getElementById("target")
      );

      const reply = overlay.addReply(comment, "A reply");

      expect(onReplyAdded).toHaveBeenCalledTimes(1);
      const [serialized, sentReply] = onReplyAdded.mock.calls[0];
      expect(serialized.id).toBe(comment.id);
      expect(sentReply.text).toBe("A reply");
      expect(sentReply.id).toBe(reply.id);
    });
  });

  describe("serializeComments", () => {
    it("returns every comment in serializable form", async () => {
      overlay = makeOverlay();
      const target = document.getElementById("target");
      await createCommentOn(overlay, target, "first");
      // saveComment toggles comment mode off; re-arm before the second one
      await createCommentOn(overlay, target, "second");

      const data = overlay.serializeComments();
      expect(data).toHaveLength(2);
      expect(data.map((c) => c.text)).toEqual(["first", "second"]);
      for (const item of data) {
        expect(item.anchor).toBeTruthy();
        expect(item.container).toBeUndefined();
        expect(JSON.parse(JSON.stringify(item))).toEqual(item);
      }
    });

    it("serializes reply screenshots", async () => {
      overlay = makeOverlay();
      const comment = await createCommentOn(
        overlay,
        document.getElementById("target")
      );
      overlay.addReply(comment, "with screenshot", ["data:image/png;base64,x"]);

      const [serialized] = overlay.serializeComments();
      expect(serialized.replies).toHaveLength(1);
      expect(serialized.replies[0].text).toBe("with screenshot");
      expect(serialized.replies[0].screenshots).toEqual([
        "data:image/png;base64,x",
      ]);
    });
  });

  describe("loadComments", () => {
    it("round-trips: restored comments re-render circles at the same position", async () => {
      overlay = makeOverlay();
      const target = document.getElementById("target");
      const original = await createCommentOn(overlay, target, "round trip");
      const data = overlay.serializeComments();
      overlay.cleanup();

      overlay = makeOverlay();
      const result = overlay.loadComments(data);

      expect(result).toMatchObject({ anchored: 1, orphaned: 0 });
      const restored = overlay.comments[0];
      expect(restored.anchorState).toBe("anchored");
      expect(restored.container).toBe(target);
      expect(restored.text).toBe("round trip");
      expect(restored.page).toBe(location.pathname);
      expect(restored.relativeX).toBeCloseTo(original.relativeX, 5);
      const circle = overlay.shadowRoot.querySelector(
        `[data-comment-id="${restored.id}"]`
      );
      expect(circle).toBeTruthy();
    });

    it("re-anchors via fingerprint rescue when the selector broke", async () => {
      overlay = makeOverlay();
      const target = document.getElementById("target");
      const comment = await createCommentOn(overlay, target, "rescued");
      const data = overlay.serializeComments();
      // The id selector will break, but content stays identifiable
      expect(comment.anchor.selector).toBe("#target");
      overlay.cleanup();

      document.body.innerHTML = `<section class="renamed">Compare our plans and pick one today</section>`;
      overlay = makeOverlay();
      const result = overlay.loadComments(data);

      expect(result).toEqual({ anchored: 1, orphaned: 0, inactive: 0 });
      expect(overlay.comments[0].container).toBe(
        document.querySelector(".renamed")
      );
    });

    it("marks other-page comments inactive: no circle, no onAnchorLost", () => {
      const onAnchorLost = vi.fn();
      overlay = makeOverlay({ onAnchorLost });

      const result = overlay.loadComments([
        {
          id: 42,
          text: "from another page",
          page: "/otra-pagina",
          anchor: {
            version: 1,
            selector: "#nope",
            fingerprint: {
              tagName: "DIV",
              textSnippet: "something",
              attributes: {},
              siblingIndex: 0,
              siblingCount: 1,
            },
            relativeX: 0.5,
            relativeY: 0.5,
          },
          replies: [],
          author: "Test",
          createdAt: "2026-07-03T00:00:00.000Z",
          screenshots: [],
        },
      ]);

      expect(result).toEqual({ anchored: 0, orphaned: 0, inactive: 1 });
      const inactive = overlay.comments[0];
      expect(inactive.anchorState).toBe("inactive");
      expect(inactive.page).toBe("/otra-pagina");
      expect(
        overlay.shadowRoot.querySelector(`[data-comment-id="42"]`)
      ).toBeNull();
      expect(onAnchorLost).not.toHaveBeenCalled();
    });

    it("legacy entries without page still resolve on the current page", async () => {
      overlay = makeOverlay();
      await createCommentOn(
        overlay,
        document.getElementById("target"),
        "legacy"
      );
      const [serialized] = overlay.serializeComments();
      delete serialized.page;
      overlay.cleanup();

      overlay = makeOverlay();
      const result = overlay.loadComments([serialized]);
      expect(result).toEqual({ anchored: 1, orphaned: 0, inactive: 0 });
    });

    it("orphans comments whose element is gone and fires onAnchorLost", async () => {
      overlay = makeOverlay();
      await createCommentOn(
        overlay,
        document.getElementById("target"),
        "orphan me"
      );
      const data = overlay.serializeComments();
      overlay.cleanup();

      document.body.innerHTML = `<div>totally different page</div>`;
      const onAnchorLost = vi.fn();
      overlay = makeOverlay({ onAnchorLost });
      const result = overlay.loadComments(data);

      expect(result).toEqual({ anchored: 0, orphaned: 1, inactive: 0 });
      const orphan = overlay.comments[0];
      expect(orphan.anchorState).toBe("orphaned");
      expect(orphan.container).toBeNull();
      expect(
        overlay.shadowRoot.querySelector(`[data-comment-id="${orphan.id}"]`)
      ).toBeNull();
      expect(onAnchorLost).toHaveBeenCalledTimes(1);
      expect(onAnchorLost.mock.calls[0][0].text).toBe("orphan me");
    });

    it("is idempotent by id: reloading replaces instead of duplicating", async () => {
      overlay = makeOverlay();
      await createCommentOn(overlay, document.getElementById("target"), "once");
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

      expect(result).toEqual({ anchored: 0, orphaned: 1, inactive: 0 });
      expect(overlay.comments).toHaveLength(1);
      expect(overlay.comments[0].anchorState).toBe("orphaned");
      expect(warn).toHaveBeenCalled();
    });

    it("returns zeros and does not throw on non-array input", () => {
      overlay = makeOverlay();
      expect(overlay.loadComments(undefined)).toEqual({
        anchored: 0,
        orphaned: 0,
        inactive: 0,
      });
    });
  });

  describe("hidden runtime state", () => {
    const rect = (w, h) => () => ({
      left: 0,
      top: 0,
      right: w,
      bottom: h,
      width: w,
      height: h,
    });

    it("hides the circle while the anchor element has zero size and restores it after", async () => {
      overlay = makeOverlay();
      const target = document.getElementById("target");
      target.getBoundingClientRect = rect(200, 100);
      const comment = await createCommentOn(overlay, target, "hideable");
      const circle = overlay.shadowRoot.querySelector(
        `[data-comment-id="${comment.id}"]`
      );
      expect(comment.hidden).toBe(false);
      expect(circle.style.display).not.toBe("none");

      target.getBoundingClientRect = rect(0, 0);
      overlay.updateCommentPosition(comment, circle);
      expect(comment.hidden).toBe(true);
      expect(circle.style.display).toBe("none");

      target.getBoundingClientRect = rect(200, 100);
      overlay.updateCommentPosition(comment, circle);
      expect(comment.hidden).toBe(false);
      expect(circle.style.display).not.toBe("none");
    });

    it("does not serialize the hidden flag", async () => {
      overlay = makeOverlay();
      const comment = await createCommentOn(
        overlay,
        document.getElementById("target"),
        "x"
      );
      comment.hidden = true;
      const [serialized] = overlay.serializeComments();
      expect(serialized.hidden).toBeUndefined();
    });

    it("hides the circle when the clicked element vanishes even if the container stays visible", async () => {
      // Real case: an <img class="slogan-img"> inside a large .container —
      // responsive media queries hide the image but never the container.
      document.body.innerHTML = `<div class="container slogan">Some surrounding content that stays<img id="pic" src="x.png" alt=""></div>`;
      const container = document.querySelector(".container");
      const img = document.getElementById("pic");
      container.getBoundingClientRect = rect(800, 600);
      img.getBoundingClientRect = rect(120, 80);

      overlay = makeOverlay();
      const comment = await createCommentOn(overlay, img, "on the image");
      expect(comment.container).toBe(container);
      expect(comment.anchor.targetSelector).toBe("#pic");
      const circle = overlay.shadowRoot.querySelector(
        `[data-comment-id="${comment.id}"]`
      );
      expect(comment.hidden).toBe(false);

      img.getBoundingClientRect = rect(0, 0); // media query hid the image
      overlay.updateCommentPosition(comment, circle);
      expect(comment.hidden).toBe(true);
      expect(circle.style.display).toBe("none");

      img.getBoundingClientRect = rect(120, 80);
      overlay.updateCommentPosition(comment, circle);
      expect(comment.hidden).toBe(false);
    });

    it("re-derives the target from targetSelector after a restore", async () => {
      document.body.innerHTML = `<div class="container slogan">Persistent content around<img id="pic" src="x.png" alt=""></div>`;
      const container = document.querySelector(".container");
      const img = document.getElementById("pic");
      container.getBoundingClientRect = rect(800, 600);
      img.getBoundingClientRect = rect(120, 80);

      overlay = makeOverlay();
      await createCommentOn(overlay, img, "restored target");
      const data = overlay.serializeComments();
      overlay.cleanup();

      overlay = makeOverlay();
      overlay.loadComments(data);
      const restored = overlay.comments[0];
      const circle = overlay.shadowRoot.querySelector(
        `[data-comment-id="${restored.id}"]`
      );

      img.getBoundingClientRect = rect(0, 0);
      overlay.updateCommentPosition(restored, circle);
      expect(restored.hidden).toBe(true);
    });
  });

  describe("localStorage persistence option", () => {
    afterEach(() => {
      localStorage.clear();
    });

    it("auto-saves and auto-restores comments across overlay instances", async () => {
      overlay = makeOverlay({ persistence: "localStorage" });
      await createCommentOn(
        overlay,
        document.getElementById("target"),
        "persisted"
      );
      overlay.cleanup();

      overlay = makeOverlay({ persistence: "localStorage" });
      expect(overlay.comments).toHaveLength(1);
      expect(overlay.comments[0].text).toBe("persisted");
      expect(overlay.comments[0].anchorState).toBe("anchored");
    });

    it("persists replies", async () => {
      overlay = makeOverlay({ persistence: "localStorage" });
      const comment = await createCommentOn(
        overlay,
        document.getElementById("target"),
        "with reply"
      );
      overlay.addReply(comment, "the reply");
      overlay.cleanup();

      overlay = makeOverlay({ persistence: "localStorage" });
      expect(overlay.comments[0].replies).toHaveLength(1);
      expect(overlay.comments[0].replies[0].text).toBe("the reply");
    });

    it("does not touch localStorage without the option", async () => {
      overlay = makeOverlay();
      await createCommentOn(
        overlay,
        document.getElementById("target"),
        "volatile"
      );
      expect(localStorage.getItem("helldots-comments")).toBeNull();
    });

    it("preserves other pages' stored comments when syncing", async () => {
      localStorage.setItem(
        "helldots-comments",
        JSON.stringify([
          {
            id: 99,
            text: "other page",
            page: "/otra",
            anchor: null,
            replies: [],
            author: "X",
            createdAt: "2026-07-03T00:00:00.000Z",
            screenshots: [],
          },
        ])
      );
      overlay = makeOverlay({ persistence: "localStorage" });
      await createCommentOn(overlay, document.getElementById("target"), "mine");

      const stored = JSON.parse(localStorage.getItem("helldots-comments"));
      expect(stored.map((c) => c.text).sort()).toEqual(["mine", "other page"]);
    });

    it("deleteComment removes circle, memory, storage and notifies", async () => {
      const onCommentDeleted = vi.fn();
      overlay = makeOverlay({
        persistence: "localStorage",
        onCommentDeleted,
      });
      const comment = await createCommentOn(
        overlay,
        document.getElementById("target"),
        "doomed"
      );

      expect(overlay.deleteComment(comment.id)).toBe(true);
      expect(overlay.comments).toHaveLength(0);
      expect(
        overlay.shadowRoot.querySelector(`[data-comment-id="${comment.id}"]`)
      ).toBeNull();
      expect(JSON.parse(localStorage.getItem("helldots-comments"))).toEqual([]);
      expect(onCommentDeleted).toHaveBeenCalledWith(comment.id);
    });

    it("deleteComment returns false for unknown ids", () => {
      overlay = makeOverlay();
      expect(overlay.deleteComment(123456)).toBe(false);
    });

    it("deleting an inactive other-page comment also removes it from storage", () => {
      localStorage.setItem(
        "helldots-comments",
        JSON.stringify([
          {
            id: 777,
            text: "foreign",
            page: "/otra",
            anchor: null,
            replies: [],
            author: "X",
            createdAt: "2026-07-03T00:00:00.000Z",
            screenshots: [],
          },
        ])
      );
      overlay = makeOverlay({ persistence: "localStorage" });
      expect(overlay.comments).toHaveLength(1);

      expect(overlay.deleteComment(777)).toBe(true);

      expect(JSON.parse(localStorage.getItem("helldots-comments"))).toEqual([]);
    });
  });

  describe("comment status lifecycle (RF09)", () => {
    afterEach(() => {
      localStorage.clear();
    });

    it("new comments start as open and serialize their status", async () => {
      overlay = makeOverlay();
      const comment = await createCommentOn(
        overlay,
        document.getElementById("target"),
        "fresh"
      );
      expect(comment.status).toBe("open");
      expect(overlay.serializeComments()[0].status).toBe("open");
    });

    it("setCommentStatus updates, persists and notifies", async () => {
      const onCommentStatusChanged = vi.fn();
      overlay = makeOverlay({
        persistence: "localStorage",
        onCommentStatusChanged,
      });
      const comment = await createCommentOn(
        overlay,
        document.getElementById("target"),
        "lifecycle"
      );

      expect(overlay.setCommentStatus(comment.id, "in_progress")).toBe(true);
      expect(comment.status).toBe("in_progress");
      expect(onCommentStatusChanged).toHaveBeenCalledTimes(1);
      expect(onCommentStatusChanged.mock.calls[0][0].status).toBe(
        "in_progress"
      );

      const stored = JSON.parse(localStorage.getItem("helldots-comments"));
      expect(stored[0].status).toBe("in_progress");
    });

    it("status survives a reload round-trip", async () => {
      overlay = makeOverlay({ persistence: "localStorage" });
      const comment = await createCommentOn(
        overlay,
        document.getElementById("target"),
        "kept"
      );
      overlay.setCommentStatus(comment.id, "resolved");
      overlay.cleanup();

      overlay = makeOverlay({ persistence: "localStorage" });
      expect(overlay.comments[0].status).toBe("resolved");
    });

    it("restores legacy entries without status as open", async () => {
      overlay = makeOverlay();
      await createCommentOn(
        overlay,
        document.getElementById("target"),
        "legacy"
      );
      const data = overlay.serializeComments();
      delete data[0].status;
      overlay.cleanup();

      overlay = makeOverlay();
      overlay.loadComments(data);
      expect(overlay.comments[0].status).toBe("open");
    });

    it("rejects unknown ids and invalid statuses, including the removed closed", async () => {
      overlay = makeOverlay();
      const comment = await createCommentOn(
        overlay,
        document.getElementById("target"),
        "guarded"
      );
      expect(overlay.setCommentStatus(999999, "resolved")).toBe(false);
      expect(overlay.setCommentStatus(comment.id, "banana")).toBe(false);
      expect(overlay.setCommentStatus(comment.id, "closed")).toBe(false);
      expect(comment.status).toBe("open");
    });

    it("migrates legacy closed entries to resolved on load", async () => {
      overlay = makeOverlay();
      await createCommentOn(
        overlay,
        document.getElementById("target"),
        "legacy"
      );
      const data = overlay.serializeComments();
      data[0].status = "closed";
      overlay.cleanup();

      overlay = makeOverlay();
      overlay.loadComments(data);
      expect(overlay.comments[0].status).toBe("resolved");
    });

    it("resolving a comment removes its marker; reopening restores it", async () => {
      const rect = (w, h) => () => ({
        left: 0,
        top: 0,
        right: w,
        bottom: h,
        width: w,
        height: h,
      });
      overlay = makeOverlay();
      const target = document.getElementById("target");
      target.getBoundingClientRect = rect(300, 200);
      const comment = await createCommentOn(overlay, target, "resolve me");
      const circle = overlay.shadowRoot.querySelector(
        `[data-comment-id="${comment.id}"]`
      );
      expect(circle.style.display).not.toBe("none");

      overlay.setCommentStatus(comment.id, "resolved");
      expect(circle.style.display).toBe("none");
      // resolved is not "hidden" — the inbox must not show the Hidden tag
      expect(comment.hidden).toBe(false);

      overlay.setCommentStatus(comment.id, "open");
      expect(circle.style.display).not.toBe("none");
    });
  });
});

describe("schema migration", () => {
  it("fills neutral defaults for comments stored before RF1-RF5", () => {
    // A record exactly as it was persisted by the previous version.
    const legacy = {
      id: 1,
      text: "old comment",
      anchor: null,
      page: location.pathname,
      replies: [],
      author: "Ana",
      createdAt: "2026-01-01T00:00:00.000Z",
      screenshots: [],
      status: "open",
    };

    const overlay = makeOverlay();
    overlay.loadComments([legacy]);
    const [comment] = overlay.comments;

    expect(comment.type).toBeNull();
    expect(comment.priority).toBeNull();
    expect(comment.tags).toEqual([]);
    expect(comment.context).toBeNull();
    expect(comment.contextScreenshot).toBeNull();
    expect(comment.resolvedAt).toBeNull();
  });

  it("round-trips the new fields through serialize/load", () => {
    const overlay = makeOverlay();
    overlay.loadComments([
      {
        id: 2,
        text: "classified",
        anchor: null,
        page: location.pathname,
        replies: [],
        author: "Ana",
        createdAt: "2026-01-01T00:00:00.000Z",
        screenshots: [],
        status: "resolved",
        type: "bug",
        priority: "high",
        tags: ["checkout", "ios"],
        resolvedAt: "2026-01-02T00:00:00.000Z",
        contextScreenshot: "data:image/jpeg;base64,x",
        context: { version: 1, url: "https://a.test/" },
      },
    ]);

    const [serialized] = overlay.serializeComments();
    expect(serialized.type).toBe("bug");
    expect(serialized.priority).toBe("high");
    expect(serialized.tags).toEqual(["checkout", "ios"]);
    expect(serialized.resolvedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(serialized.contextScreenshot).toBe("data:image/jpeg;base64,x");
    expect(serialized.context.url).toBe("https://a.test/");
  });

  it("rejects a type or priority that is not in the enum", () => {
    const overlay = makeOverlay();
    overlay.loadComments([
      {
        id: 3,
        text: "bogus",
        anchor: null,
        page: location.pathname,
        replies: [],
        author: "Ana",
        createdAt: "2026-01-01T00:00:00.000Z",
        screenshots: [],
        status: "open",
        type: "not-a-type",
        priority: "urgent",
        tags: "not-an-array",
      },
    ]);

    const [comment] = overlay.comments;
    expect(comment.type).toBeNull();
    expect(comment.priority).toBeNull();
    expect(comment.tags).toEqual([]);
  });
});

describe("resolvedAt lifecycle", () => {
  let overlay;

  const seed = (overlay) =>
    overlay.loadComments([
      {
        id: 10,
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

  beforeEach(() => {
    document.elementFromPoint = () => null;
    document.body.innerHTML = `<section id="target">Compare our plans and pick one today</section>`;
  });

  afterEach(() => {
    overlay?.cleanup?.();
    cleanupDom();
    vi.restoreAllMocks();
  });

  it("stamps resolvedAt when entering resolved", () => {
    overlay = makeOverlay();
    seed(overlay);
    overlay.setCommentStatus(10, "resolved");
    expect(overlay.comments[0].resolvedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/
    );
  });

  it("clears resolvedAt when the comment is reopened", () => {
    overlay = makeOverlay();
    seed(overlay);
    overlay.setCommentStatus(10, "resolved");
    overlay.setCommentStatus(10, "open");
    expect(overlay.comments[0].resolvedAt).toBeNull();
  });

  it("leaves resolvedAt null for non-resolved transitions", () => {
    overlay = makeOverlay();
    seed(overlay);
    overlay.setCommentStatus(10, "in_progress");
    expect(overlay.comments[0].resolvedAt).toBeNull();
  });

  it("overwrites resolvedAt when resolved a second time", async () => {
    overlay = makeOverlay();
    seed(overlay);
    overlay.setCommentStatus(10, "resolved");
    const first = overlay.comments[0].resolvedAt;

    await new Promise((r) => setTimeout(r, 2));
    overlay.setCommentStatus(10, "open");
    overlay.setCommentStatus(10, "resolved");

    // The displayed duration must describe the CURRENT resolution.
    expect(overlay.comments[0].resolvedAt).not.toBe(first);
  });
});
