import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import CommentOverlay from "../src/overlay.js";
import { TAG_NAME } from "../src/root-element.js";

vi.mock("../src/capture.js", () => ({
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

// Drives the real pipeline — point placement, then save — rather than
// pushing a literal onto overlay.comments, so the creation path itself is
// what gets asserted on.
const createComment = async (overlay, text = "A test comment") => {
  const container = document.getElementById("target");
  document.elementFromPoint = () => container;
  overlay.commentMode = true;
  await overlay._placeCommentAtPoint(10, 10);
  overlay.commentInput.value = text;
  await overlay.saveComment();
  return overlay.comments[overlay.comments.length - 1];
};

describe("host-supplied identity", () => {
  let overlay;

  beforeEach(() => {
    document.elementFromPoint = () => null;
    document.body.innerHTML = `<section id="target">Compare our plans</section>`;
  });

  afterEach(() => {
    overlay?.cleanup?.();
    cleanupDom();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("on new comments", () => {
    it("stamps the id the host supplied alongside the display name", async () => {
      overlay = makeOverlay({ user: { name: "Ana Pérez", id: "u_42" } });
      await createComment(overlay);

      const [comment] = overlay.serializeComments();
      expect(comment.author).toBe("Ana Pérez");
      expect(comment.authorId).toBe("u_42");
    });

    it("leaves the id null when the host supplies only a name", async () => {
      overlay = makeOverlay({ user: { name: "Ana Pérez" } });
      await createComment(overlay);

      const [comment] = overlay.serializeComments();
      expect(comment.author).toBe("Ana Pérez");
      expect(comment.authorId).toBeNull();
    });

    it("leaves the id null when the host supplies no user at all", async () => {
      overlay = makeOverlay();
      await createComment(overlay);

      expect(overlay.serializeComments()[0].authorId).toBeNull();
    });
  });

  describe("on new replies", () => {
    it("stamps the id the host supplied alongside the display name", async () => {
      overlay = makeOverlay({ user: { name: "Ana Pérez", id: "u_42" } });
      const comment = await createComment(overlay);
      overlay.addReply(comment, "Confirmed on staging");

      const [reply] = overlay.serializeComments()[0].replies;
      expect(reply.author).toBe("Ana Pérez");
      expect(reply.authorId).toBe("u_42");
    });

    it("leaves the id null when the host supplies only a name", async () => {
      overlay = makeOverlay({ user: { name: "Ana Pérez" } });
      const comment = await createComment(overlay);
      overlay.addReply(comment, "Confirmed on staging");

      expect(overlay.serializeComments()[0].replies[0].authorId).toBeNull();
    });

    it("returns the stamped id on the reply object it hands back", async () => {
      overlay = makeOverlay({ user: { name: "Ana Pérez", id: "u_42" } });
      const comment = await createComment(overlay);

      const reply = overlay.addReply(comment, "Confirmed on staging");
      expect(reply.authorId).toBe("u_42");
    });
  });

  describe("across a round trip", () => {
    it("keeps the ids of a comment and its reply", async () => {
      overlay = makeOverlay({ user: { name: "Ana Pérez", id: "u_42" } });
      const comment = await createComment(overlay);
      overlay.addReply(comment, "Confirmed on staging");
      const saved = overlay.serializeComments();

      overlay.cleanup();
      overlay = makeOverlay();
      overlay.loadComments(saved);

      const [loaded] = overlay.serializeComments();
      expect(loaded.authorId).toBe("u_42");
      expect(loaded.replies[0].authorId).toBe("u_42");
    });

    it("loads a corpus written before ids were persisted", () => {
      overlay = makeOverlay();
      overlay.loadComments([
        {
          id: "c1",
          text: "Written by an older version",
          page: location.pathname,
          author: "Ana Pérez",
          createdAt: new Date().toISOString(),
          replies: [
            {
              id: "r1",
              text: "So was this",
              author: "Bruno",
              timestamp: new Date().toISOString(),
            },
          ],
        },
      ]);

      const [loaded] = overlay.serializeComments();
      expect(loaded.author).toBe("Ana Pérez");
      expect(loaded.authorId).toBeNull();
      expect(loaded.replies[0].author).toBe("Bruno");
      expect(loaded.replies[0].authorId).toBeNull();
    });

    it("drops an id that is not a string", () => {
      overlay = makeOverlay();
      overlay.loadComments([
        {
          id: "c1",
          text: "From a hostile backend",
          page: location.pathname,
          author: "Ana Pérez",
          authorId: { toString: () => "u_42" },
          createdAt: new Date().toISOString(),
          replies: [
            {
              id: "r1",
              text: "And its reply",
              author: "Bruno",
              authorId: 42,
              timestamp: new Date().toISOString(),
            },
          ],
        },
      ]);

      const [loaded] = overlay.serializeComments();
      expect(loaded.authorId).toBeNull();
      expect(loaded.replies[0].authorId).toBeNull();
    });
  });

  it("never renders the id", async () => {
    overlay = makeOverlay({ user: { name: "Ana Pérez", id: "u_secret_42" } });
    const comment = await createComment(overlay);
    overlay.addReply(comment, "Confirmed on staging");
    overlay.toggleInbox();

    const rendered = overlay.shadowRoot.textContent;
    expect(rendered).toContain("Ana Pérez");
    expect(rendered).not.toContain("u_secret_42");
  });
});

describe("one identity, one spelling", () => {
  let overlay;

  beforeEach(() => {
    document.elementFromPoint = () => null;
    document.body.innerHTML = `<section id="target">Compare our plans</section>`;
  });

  afterEach(() => {
    overlay?.cleanup?.();
    cleanupDom();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  // Every place the actor's id lands. A host joining its own table against
  // any two of these has to get the same key back.
  const spellings = (overlay) => {
    const [serialized] = overlay.serializeComments();
    return {
      comment: serialized.authorId,
      reply: serialized.replies[0].authorId,
      audit: serialized.history.at(-1).actor.id,
      reaction: Object.values(serialized.reactions)[0][0],
    };
  };

  const drive = async (id) => {
    overlay = makeOverlay({ user: { name: "Ana Pérez", id } });
    const comment = await createComment(overlay);
    overlay.addReply(comment, "Confirmed");
    overlay.toggleCommentReaction(comment.id, "👍");
    overlay.setCommentStatus(comment.id, "resolved");
    return spellings(overlay);
  };

  it("agrees across the comment, the reply, the log and the reaction", async () => {
    const seen = await drive("u_42");
    expect(seen).toEqual({
      comment: "u_42",
      reply: "u_42",
      audit: "u_42",
      reaction: "u_42",
    });
  });

  it("agrees when the host's id arrives padded", async () => {
    const seen = await drive("  u_42  ");
    expect(new Set(Object.values(seen))).toEqual(new Set(["u_42"]));
  });

  it("agrees when the id is longer than a display name would ever be", async () => {
    // A JWT `sub` or a composite tenant key runs well past any sane cap, and
    // truncating one of the four would break the join silently.
    const long = "tenant_acme|" + "a".repeat(120);
    const seen = await drive(long);
    expect(new Set(Object.values(seen))).toEqual(new Set([long]));
  });

  it("still caps a pathological display name, which is not a join key", async () => {
    overlay = makeOverlay({ user: { name: "x".repeat(500), id: "u_42" } });
    const comment = await createComment(overlay);
    overlay.setCommentStatus(comment.id, "resolved");

    const entry = overlay.serializeComments()[0].history.at(-1);
    expect(entry.actor.name).toHaveLength(64);
  });
});
