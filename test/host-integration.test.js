// The four things a host needs that are not changes to a comment.
//
// Comment mode and thread opens are state the widget owns and never
// reported, so an app could not stand down while someone was picking an
// element, and an unread count was not buildable. Identity was fixed at
// construction, which is the wrong shape for a session that resolves after
// the widget mounts. And an export that only downloads is a dead end for a
// host that wanted to send the same rows somewhere.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import CommentOverlay from "../src/overlay.js";
import { TAG_NAME } from "../src/root-element.js";
import { CLASSES } from "../src/constants.js";

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

const seeded = (id = "c1", extra = {}) => ({
  id,
  text: "seeded comment",
  anchor: null,
  page: location.pathname,
  replies: [],
  author: "Ana",
  createdAt: "2026-01-01T00:00:00.000Z",
  screenshots: [],
  status: "open",
  ...extra,
});

const baseSetup = () => {
  document.elementFromPoint = () => null;
  document.body.innerHTML = `<section id="target">Anchor text</section>`;
  localStorage.clear();
};

describe("onCommentModeChanged", () => {
  let overlay;

  beforeEach(baseSetup);

  afterEach(() => {
    overlay?.cleanup?.();
    cleanupDom();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("reports both edges of the toggle", () => {
    const onCommentModeChanged = vi.fn();
    overlay = new CommentOverlay({ onCommentModeChanged });

    overlay.toggleCommentMode();
    overlay.toggleCommentMode();

    expect(onCommentModeChanged.mock.calls).toEqual([[true], [false]]);
  });

  it("reports the keyboard shortcut, which the host never sees", () => {
    // The whole reason this callback exists: an app that has to stand down
    // while the user is picking an element cannot observe that keystroke.
    const onCommentModeChanged = vi.fn();
    overlay = new CommentOverlay({ onCommentModeChanged });

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "c", altKey: true, bubbles: true })
    );

    expect(onCommentModeChanged).toHaveBeenCalledWith(true);
    expect(overlay.commentMode).toBe(true);
  });

  it("reports the automatic switch-off after a comment is saved", async () => {
    const onCommentModeChanged = vi.fn();
    overlay = new CommentOverlay({ onCommentModeChanged });
    overlay.toggleCommentMode();
    onCommentModeChanged.mockClear();

    await overlay._placeCommentAtPoint(10, 10);
    overlay.commentInput.value = "done picking";
    await overlay.saveComment();

    expect(onCommentModeChanged).toHaveBeenCalledWith(false);
    expect(overlay.commentMode).toBe(false);
  });

  it("survives a handler that throws", () => {
    overlay = new CommentOverlay({
      onCommentModeChanged: () => {
        throw new Error("bad subscriber");
      },
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(() => overlay.toggleCommentMode()).not.toThrow();
    expect(overlay.commentMode).toBe(true);
  });
});

describe("onCommentOpened", () => {
  let overlay;

  beforeEach(baseSetup);

  afterEach(() => {
    overlay?.cleanup?.();
    cleanupDom();
    window.history.replaceState({}, "", location.pathname);
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("reports the thread opening from its marker", () => {
    const onCommentOpened = vi.fn();
    overlay = new CommentOverlay({ onCommentOpened });
    overlay.loadComments([seeded()]);
    const comment = overlay.comments[0];

    overlay.showThreadPopover(null, comment);

    expect(onCommentOpened).toHaveBeenCalledTimes(1);
    // Serialized like every other payload crossing this boundary — never the
    // live object with its DOM references.
    const [payload] = onCommentOpened.mock.calls[0];
    expect(payload.id).toBe("c1");
    expect(payload.container).toBeUndefined();
    expect(payload.schemaVersion).toBe(1);
  });

  it("reports the inbox detail opening", () => {
    const onCommentOpened = vi.fn();
    overlay = new CommentOverlay({ onCommentOpened });
    overlay.loadComments([seeded()]);
    overlay.showInbox();

    overlay.inboxView.openDetail("c1");

    expect(onCommentOpened).toHaveBeenCalledTimes(1);
    expect(onCommentOpened.mock.calls[0][0].id).toBe("c1");
  });

  it("reports a comment opened through a shared link", () => {
    window.history.replaceState(
      {},
      "",
      `${location.pathname}?helldotsComment=c1`
    );
    const onCommentOpened = vi.fn();
    overlay = new CommentOverlay({ onCommentOpened });

    overlay.loadComments([seeded()]);

    expect(onCommentOpened).toHaveBeenCalledTimes(1);
  });

  it("stays quiet while the inbox merely re-renders", () => {
    // An unread count built on this must not tick over every time a filter
    // changes or a status updates the list.
    const onCommentOpened = vi.fn();
    overlay = new CommentOverlay({ onCommentOpened });
    overlay.loadComments([seeded()]);
    overlay.showInbox();
    overlay.inboxView.openDetail("c1");
    onCommentOpened.mockClear();

    overlay.inboxView.refresh();
    overlay.inboxView.render();
    overlay.setCommentStatus("c1", "resolved");

    expect(onCommentOpened).not.toHaveBeenCalled();
  });
});

describe("setUser", () => {
  let overlay;

  beforeEach(baseSetup);

  afterEach(() => {
    overlay?.cleanup?.();
    cleanupDom();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("attributes new comments to the identity that arrived late", async () => {
    // The common shape: the overlay mounts, the session resolves after it.
    overlay = new CommentOverlay();

    expect(overlay.setUser({ name: "Ana Pérez", id: "u_42" })).toBe(true);
    await overlay._placeCommentAtPoint(10, 10);
    overlay.commentInput.value = "after sign-in";
    await overlay.saveComment();

    expect(overlay.comments[0].author).toBe("Ana Pérez");
    expect(overlay.comments[0].authorId).toBe("u_42");
  });

  it("leaves everything already written alone", () => {
    overlay = new CommentOverlay({ user: { name: "Ana" } });
    overlay.loadComments([seeded("c1", { author: "Bruno" })]);

    overlay.setUser({ name: "Carla" });

    expect(overlay.comments[0].author).toBe("Bruno");
    // Acting now, though, is Carla.
    const reply = overlay.addReply("c1", "mine");
    expect(reply.author).toBe("Carla");
  });

  it("re-keys which reactions count as the current user's own", () => {
    overlay = new CommentOverlay({ user: { name: "Ana", id: "u_1" } });
    overlay.loadComments([seeded()]);
    overlay.toggleCommentReaction("c1", "👍");
    expect(overlay.comments[0].reactions).toEqual({ "👍": ["u_1"] });

    overlay.setUser({ name: "Bruno", id: "u_2" });
    overlay.toggleCommentReaction("c1", "👍");

    // Bruno adds his own rather than removing Ana's.
    expect(overlay.comments[0].reactions["👍"]).toEqual(["u_1", "u_2"]);
  });

  it("returns to the anonymous author on null", () => {
    overlay = new CommentOverlay({ user: { name: "Ana", id: "u_1" } });
    overlay.loadComments([seeded()]);

    expect(overlay.setUser(null)).toBe(true);
    const reply = overlay.addReply("c1", "who am I");

    expect(reply.author).toBe(overlay.strings.anonymous);
    expect(reply.authorId).toBeNull();
  });

  it("refuses anything that is not an identity, changing nothing", () => {
    overlay = new CommentOverlay({ user: { name: "Ana" } });

    expect(overlay.setUser("Ana")).toBe(false);
    expect(overlay.setUser({})).toBe(false);
    expect(overlay.setUser({ name: "   " })).toBe(false);
    expect(overlay.setUser({ id: "u_9" })).toBe(false);

    expect(overlay.options.user).toEqual({ name: "Ana" });
  });

  it("closes the thread popover, which was rendered for the old identity", () => {
    overlay = new CommentOverlay({ user: { name: "Ana", id: "u_1" } });
    overlay.loadComments([seeded()]);
    overlay.showThreadPopover(null, overlay.comments[0]);
    expect(
      overlay.shadowRoot.querySelector(`.${CLASSES.THREAD_POPOVER}`)
    ).toBeTruthy();

    overlay.setUser({ name: "Bruno", id: "u_2" });

    expect(
      overlay.shadowRoot.querySelector(`.${CLASSES.THREAD_POPOVER}`)
    ).toBeNull();
  });
});

describe("the CSV exports hand back what they downloaded", () => {
  let overlay;
  let downloads;

  beforeEach(() => {
    baseSetup();
    overlay = new CommentOverlay({ user: { name: "Ana Pérez", id: "u_42" } });
    downloads = [];
    URL.createObjectURL = vi.fn(() => "blob:stub");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      function () {
        downloads.push(this.download);
      }
    );
    overlay.loadComments([seeded("c1", { type: "bug", priority: "high" })]);
  });

  afterEach(() => {
    overlay?.cleanup?.();
    cleanupDom();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("returns the comment rows as well as downloading them", () => {
    const csv = overlay.exportCommentsCsv();

    expect(downloads).toEqual(["helldots-comments.csv"]);
    expect(csv).toContain("seeded comment");
    expect(csv.split("\n")).toHaveLength(2); // header + one comment
  });

  it("returns the aggregate figures too", () => {
    const csv = overlay.exportMetricsCsv();

    expect(downloads).toEqual(["helldots-metrics.csv"]);
    expect(csv).toContain("section,key,value");
  });

  it("honours an explicit subset, same as the download", () => {
    const csv = overlay.exportCommentsCsv([]);

    expect(csv.split("\n")).toHaveLength(1); // header only
  });
});
