// F5.4 — one subscription point. Nine specific callbacks are the right
// shape for a host that cares about one or two things; a host that syncs
// everything to one endpoint had to wire all nine and re-derive "what
// happened" from which function fired. onChange is that stream — and the
// nine callbacks keep firing exactly as before, because dropping them
// would break every existing consumer for a convenience.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import CommentOverlay from "../src/overlay.js";
import { TAG_NAME } from "../src/root-element.js";

vi.mock("../src/capture.js", () => ({
  renderPage: vi.fn().mockResolvedValue({ width: 0, height: 0 }),
  cropRegion: vi.fn().mockReturnValue("data:image/png;base64,mocked"),
  cropViewport: vi.fn().mockReturnValue("data:image/jpeg;base64,mocked"),
  AUTO_SCALE: 0.5,
}));

const cleanupDom = () => {
  document.querySelectorAll(TAG_NAME).forEach((el) => el.remove());
  document.body.className = "";
  document.body.innerHTML = "";
};

const seeded = (id = "c1") => ({
  id,
  text: "seeded comment",
  anchor: null,
  page: location.pathname,
  replies: [],
  author: "Ana",
  createdAt: "2026-01-01T00:00:00.000Z",
  screenshots: [],
  status: "open",
});

describe("onChange", () => {
  let overlay;
  let onChange;

  const makeWithChange = (extra = {}) => {
    onChange = vi.fn();
    overlay = new CommentOverlay({ onChange, ...extra });
    return overlay;
  };

  const types = () => onChange.mock.calls.map(([event]) => event.type);
  const lastOfType = (type) =>
    [...onChange.mock.calls]
      .reverse()
      .map(([event]) => event)
      .find((event) => event.type === type);

  beforeEach(() => {
    document.elementFromPoint = () => null;
    document.body.innerHTML = `<section id="target">Anchor text</section>`;
    localStorage.clear();
  });

  afterEach(() => {
    overlay?.cleanup?.();
    cleanupDom();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("emits comment:created alongside onCommentCreated", async () => {
    const onCommentCreated = vi.fn();
    makeWithChange({ onCommentCreated });
    await overlay._placeCommentAtPoint(10, 10);
    overlay.commentInput.value = "a new comment";
    await overlay.saveComment();

    // The specific callback is untouched — this is additive, not a swap.
    expect(onCommentCreated).toHaveBeenCalledTimes(1);
    const event = lastOfType("comment:created");
    expect(event.comment.text).toBe("a new comment");
    // Same serialized shape the callback receives, not the live object.
    expect(event.comment.schemaVersion).toBe(1);
    expect(event.comment.container).toBeUndefined();
  });

  it("emits reply:added and reply:deleted with both the comment and the reply", () => {
    makeWithChange();
    overlay.loadComments([seeded()]);
    const reply = overlay.addReply("c1", "a reply");
    overlay.deleteReply("c1", reply.id);

    const added = lastOfType("reply:added");
    expect(added.comment.id).toBe("c1");
    expect(added.reply.text).toBe("a reply");
    expect(lastOfType("reply:deleted").reply.id).toBe(reply.id);
  });

  it("emits comment:edited and reply:edited", () => {
    makeWithChange();
    overlay.loadComments([seeded()]);
    const reply = overlay.addReply("c1", "original");

    overlay.editComment("c1", "rewritten");
    overlay.editReply("c1", reply.id, "reply rewritten");

    expect(lastOfType("comment:edited").comment.text).toBe("rewritten");
    expect(lastOfType("reply:edited").reply.text).toBe("reply rewritten");
  });

  it("emits comment:status-changed and comment:updated", () => {
    makeWithChange();
    overlay.loadComments([seeded()]);

    overlay.setCommentStatus("c1", "resolved");
    overlay.setCommentType("c1", "bug");
    overlay.setCommentPriority("c1", "high");
    overlay.setCommentTags("c1", ["checkout"]);

    expect(lastOfType("comment:status-changed").comment.status).toBe(
      "resolved"
    );
    // One event type covers type/priority/tags, exactly like the callback.
    expect(types().filter((t) => t === "comment:updated")).toHaveLength(3);
    expect(lastOfType("comment:updated").comment.tags).toEqual(["checkout"]);
  });

  it("emits comment:deleted carrying the id", () => {
    makeWithChange();
    overlay.loadComments([seeded()]);
    overlay.deleteComment("c1");

    expect(lastOfType("comment:deleted").id).toBe("c1");
  });

  it("emits comment:anchor-lost when a comment cannot be re-anchored", () => {
    makeWithChange();
    overlay.loadComments([
      {
        ...seeded("gone"),
        anchor: {
          version: 1,
          selector: "#does-not-exist",
          fingerprint: {
            tagName: "SECTION",
            textSnippet: "nothing here",
            attributes: {},
            siblingIndex: 0,
            siblingCount: 1,
          },
          relativeX: 0.5,
          relativeY: 0.5,
        },
      },
    ]);

    expect(lastOfType("comment:anchor-lost").comment.id).toBe("gone");
  });

  it("never fires for a rejected mutation", () => {
    makeWithChange();
    overlay.loadComments([seeded()]);
    onChange.mockClear();

    overlay.editComment("c1", "   "); // blank body is refused
    overlay.setCommentStatus("c1", "bogus"); // unknown status
    overlay.setCommentType("nope", "bug"); // unknown id
    overlay.deleteComment("nope");

    expect(onChange).not.toHaveBeenCalled();
  });

  it("stays silent for clearComments, like the per-comment callbacks do", () => {
    const onCommentDeleted = vi.fn();
    makeWithChange({ onCommentDeleted });
    overlay.loadComments([seeded("a"), seeded("b")]);
    onChange.mockClear();

    overlay.clearComments();

    // A host-initiated bulk reset must not echo back as N deletions.
    expect(onCommentDeleted).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("a throwing subscriber cannot break the mutation that emitted it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    onChange = vi.fn(() => {
      throw new Error("host handler blew up");
    });
    overlay = new CommentOverlay({ onChange });
    overlay.loadComments([seeded()]);

    expect(overlay.editComment("c1", "still saved")).toBe(true);
    expect(overlay.comments[0].text).toBe("still saved");
    expect(warn).toHaveBeenCalled();
  });
});
