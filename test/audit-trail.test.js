import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import CommentOverlay from "../src/overlay.js";
import { TAG_NAME } from "../src/root-element.js";
import { CLASSES } from "../src/constants.js";

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

const createComment = async (overlay, text = "A test comment") => {
  const container = document.getElementById("target");
  document.elementFromPoint = () => container;
  overlay.commentMode = true;
  await overlay._placeCommentAtPoint(10, 10);
  overlay.commentInput.value = text;
  await overlay.saveComment();
  return overlay.comments[overlay.comments.length - 1];
};

const historyOf = (overlay, id) =>
  overlay.serializeComments().find((c) => String(c.id) === String(id)).history;

describe("audit trail", () => {
  let overlay;

  beforeEach(() => {
    document.elementFromPoint = () => null;
    document.body.innerHTML = `<section id="target">Compare our plans</section>`;
    overlay = makeOverlay({ user: { name: "Ana Pérez", id: "u_42" } });
  });

  afterEach(() => {
    overlay?.cleanup?.();
    cleanupDom();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("what gets recorded", () => {
    it("opens the log with the creation, attributed to the host's user", async () => {
      const comment = await createComment(overlay);

      const history = historyOf(overlay, comment.id);
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        type: "created",
        actor: { id: "u_42", name: "Ana Pérez" },
      });
    });

    it("records a status move with both ends of the transition", async () => {
      const comment = await createComment(overlay);
      overlay.setCommentStatus(comment.id, "resolved");

      const [, entry] = historyOf(overlay, comment.id);
      expect(entry).toMatchObject({
        type: "status",
        from: "open",
        to: "resolved",
      });
    });

    it("records a text edit", async () => {
      const comment = await createComment(overlay);
      overlay.editComment(comment.id, "Rewritten");

      expect(historyOf(overlay, comment.id).at(-1).type).toBe("edited");
    });

    it("records a type change and names the field", async () => {
      const comment = await createComment(overlay);
      overlay.setCommentType(comment.id, "bug");

      expect(historyOf(overlay, comment.id).at(-1)).toMatchObject({
        type: "classified",
        field: "type",
        from: null,
        to: "bug",
      });
    });

    it("records a priority change and names the field", async () => {
      const comment = await createComment(overlay);
      overlay.setCommentPriority(comment.id, "high");

      expect(historyOf(overlay, comment.id).at(-1)).toMatchObject({
        type: "classified",
        field: "priority",
        to: "high",
      });
    });

    it("records a tag change without a transition, since tags are a list", async () => {
      const comment = await createComment(overlay);
      overlay.setCommentTags(comment.id, ["mobile"]);

      const entry = historyOf(overlay, comment.id).at(-1);
      expect(entry).toMatchObject({ type: "classified", field: "tags" });
      expect(entry.from).toBeUndefined();
      expect(entry.to).toBeUndefined();
    });
  });

  describe("what does not get recorded", () => {
    it("stays silent when a status is set to the one already in force", async () => {
      const comment = await createComment(overlay);
      overlay.setCommentStatus(comment.id, "resolved");
      overlay.setCommentStatus(comment.id, "resolved");

      expect(historyOf(overlay, comment.id)).toHaveLength(2);
    });

    it("stays silent when a type is set to the one already in force", async () => {
      const comment = await createComment(overlay);
      overlay.setCommentType(comment.id, "bug");
      overlay.setCommentType(comment.id, "bug");

      expect(historyOf(overlay, comment.id)).toHaveLength(2);
    });

    it("stays silent when tags are replaced by the same tags", async () => {
      const comment = await createComment(overlay);
      overlay.setCommentTags(comment.id, ["mobile"]);
      overlay.setCommentTags(comment.id, ["  MOBILE  "]);

      expect(historyOf(overlay, comment.id)).toHaveLength(2);
    });

    it("does not record a reaction", async () => {
      const comment = await createComment(overlay);
      overlay.toggleCommentReaction(comment.id, "👍");

      expect(historyOf(overlay, comment.id)).toHaveLength(1);
    });

    it("does not record a reply", async () => {
      const comment = await createComment(overlay);
      overlay.addReply(comment, "Confirmed");

      expect(historyOf(overlay, comment.id)).toHaveLength(1);
    });
  });

  describe("across a round trip", () => {
    it("keeps the log", async () => {
      const comment = await createComment(overlay);
      overlay.setCommentStatus(comment.id, "resolved");
      const saved = overlay.serializeComments();

      overlay.cleanup();
      overlay = makeOverlay();
      overlay.loadComments(saved);

      const history = overlay.serializeComments()[0].history;
      expect(history).toHaveLength(2);
      expect(history[1]).toMatchObject({ type: "status", to: "resolved" });
    });

    it("omits the field entirely for a corpus that has no log", () => {
      overlay.loadComments([
        {
          id: "c1",
          text: "Written by an older version",
          page: location.pathname,
          author: "Ana Pérez",
          createdAt: new Date().toISOString(),
          replies: [],
        },
      ]);

      expect(overlay.serializeComments()[0].history).toBeNull();
    });

    it("scrubs a log arriving from a hostile backend", () => {
      overlay.loadComments([
        {
          id: "c1",
          text: "From a hostile backend",
          page: location.pathname,
          author: "Ana Pérez",
          createdAt: new Date().toISOString(),
          replies: [],
          history: [
            {
              type: "exfiltrated",
              at: "2026-08-18T10:00:00.000Z",
              actor: { name: "x" },
            },
            { type: "created", at: "not a date", actor: { name: "x" } },
            {
              type: "edited",
              at: "2026-08-18T10:00:00.000Z",
              actor: { name: "Ana" },
            },
          ],
        },
      ]);

      const history = overlay.serializeComments()[0].history;
      expect(history).toHaveLength(1);
      expect(history[0].type).toBe("edited");
    });
  });

  describe("resolution history", () => {
    it("keeps every resolution when a comment is reopened and resolved again", async () => {
      const comment = await createComment(overlay);
      overlay.setCommentStatus(comment.id, "resolved");
      overlay.setCommentStatus(comment.id, "open");
      overlay.setCommentStatus(comment.id, "resolved");

      const statusEntries = historyOf(overlay, comment.id).filter(
        (entry) => entry.type === "status"
      );
      expect(statusEntries.map((entry) => entry.to)).toEqual([
        "resolved",
        "open",
        "resolved",
      ]);
    });

    it("still stamps resolvedAt, which older readers depend on", async () => {
      const comment = await createComment(overlay);
      overlay.setCommentStatus(comment.id, "resolved");

      expect(overlay.serializeComments()[0].resolvedAt).not.toBeNull();
    });
  });
});

describe("the trail in the inbox", () => {
  let overlay;

  beforeEach(() => {
    document.elementFromPoint = () => null;
    document.body.innerHTML = `<section id="target">Compare our plans</section>`;
    overlay = makeOverlay({ user: { name: "Ana Pérez", id: "u_42" } });
  });

  afterEach(() => {
    overlay?.cleanup?.();
    cleanupDom();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  const openDetail = (comment) => {
    overlay.toggleInbox();
    overlay.inboxView.openDetail(comment.id);
    return overlay.shadowRoot.querySelector(".audit-block");
  };

  it("shows the trail on the detail view", async () => {
    const comment = await createComment(overlay);
    overlay.setCommentStatus(comment.id, "resolved");

    const trail = openDetail(comment);
    expect(trail).not.toBeNull();
    expect(trail.textContent).toContain("Ana Pérez");
    expect(trail.textContent).toContain("Status: Open → Resolved");
  });

  it("keeps the trail off the list cards, which are at their density limit", async () => {
    await createComment(overlay);
    overlay.toggleInbox();

    expect(overlay.shadowRoot.querySelector(".audit-block")).toBeNull();
  });

  it("remembers the disclosure across the rebuild a refresh does", async () => {
    const comment = await createComment(overlay);
    const trail = openDetail(comment);
    const toggle = trail.querySelector("button");
    const wasOpen = toggle.getAttribute("aria-expanded");

    toggle.click();
    overlay.inboxView.refresh();

    const after = overlay.shadowRoot
      .querySelector(".audit-block button")
      .getAttribute("aria-expanded");
    expect(after).not.toBe(wasOpen);
  });

  it("repaints a card whose log grew, instead of reusing the cached node", async () => {
    const comment = await createComment(overlay);
    overlay.toggleInbox();
    const before = overlay.inboxView._cardFingerprint(comment);

    // Only the log moves — a status change would shift the fingerprint
    // through its own entry and prove nothing about this one.
    comment.history.push({
      type: "edited",
      at: "2026-08-18T12:00:00.000Z",
      actor: { name: "Ana" },
    });

    expect(overlay.inboxView._cardFingerprint(comment)).not.toBe(before);
  });
});

describe("the resolution badge", () => {
  let overlay;

  beforeEach(() => {
    document.elementFromPoint = () => null;
    document.body.innerHTML = `<section id="target">Compare our plans</section>`;
    overlay = makeOverlay({ user: { name: "Ana Pérez", id: "u_42" } });
  });

  afterEach(() => {
    overlay?.cleanup?.();
    cleanupDom();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("is derived from the log, so a reopen cannot leave it stale", async () => {
    const comment = await createComment(overlay);
    // A first resolution, half an hour after creation, written straight into
    // the log — the real clock cannot be moved inside a test.
    comment.createdAt = "2026-08-18T10:00:00.000Z";
    comment.history = [
      {
        type: "created",
        at: "2026-08-18T10:00:00.000Z",
        actor: { name: "Ana" },
      },
      {
        type: "status",
        at: "2026-08-18T10:30:00.000Z",
        actor: { name: "Ana" },
        from: "open",
        to: "resolved",
      },
    ];
    comment.status = "resolved";
    // Deliberately absent: a corpus whose stamp went missing must still
    // render the duration the log knows about.
    comment.resolvedAt = null;

    overlay.toggleInbox();
    const badge = [
      ...overlay.shadowRoot.querySelectorAll(`.${CLASSES.BADGE_DURATION}`),
    ];

    expect(badge).toHaveLength(1);
    expect(badge[0].textContent).toContain("30m");
  });
});
