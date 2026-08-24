// The callback contract, past the "did it fire" level.
//
// Every event already reached the host; what it could not say was *who*
// caused it, *what* moved, and — for a link pointing at a comment the widget
// does not hold — that anything was being asked for at all. Those three gaps
// are what a real integration trips over: a multi-user app echoes its own
// remote writes back to the server, an activity feed has to diff against its
// own previous copy, and lazy loading cannot be implemented at all.

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

const withUrl = (search) =>
  window.history.replaceState({}, "", `${location.pathname}${search}`);

describe("change origin", () => {
  let overlay;

  beforeEach(() => {
    document.elementFromPoint = () => null;
    document.body.innerHTML = `<section id="target">Anchor text</section>`;
    localStorage.clear();
  });

  afterEach(() => {
    overlay?.cleanup?.();
    cleanupDom();
    withUrl("");
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('stamps a host call "host" on both shapes of subscription', () => {
    const onCommentStatusChanged = vi.fn();
    const onChange = vi.fn();
    overlay = new CommentOverlay({ onCommentStatusChanged, onChange });
    overlay.loadComments([seeded()]);

    overlay.setCommentStatus("c1", "resolved");

    expect(onCommentStatusChanged.mock.calls[0][1].origin).toBe("host");
    expect(onChange.mock.calls.at(-1)[0].origin).toBe("host");
  });

  it('stamps an action taken in the thread popover "user"', () => {
    // The popover drives the very same public method a host does, which is
    // exactly why the origin cannot be inferred from the method itself.
    const onCommentStatusChanged = vi.fn();
    overlay = new CommentOverlay({ onCommentStatusChanged });
    overlay.loadComments([seeded()]);

    overlay._popover.deps.actions.setStatus("c1", "in_progress");

    expect(onCommentStatusChanged.mock.calls[0][1].origin).toBe("user");
  });

  it('stamps an action taken in the inbox "user"', () => {
    const onCommentUpdated = vi.fn();
    overlay = new CommentOverlay({ onCommentUpdated });
    overlay.loadComments([seeded()]);
    overlay.showInbox();

    overlay.inboxView.callbacks.onSetPriority("c1", "high");

    expect(onCommentUpdated.mock.calls[0][1].origin).toBe("user");
  });

  it('stamps a comment written in the comment box "user"', async () => {
    const onCommentCreated = vi.fn();
    overlay = new CommentOverlay({ onCommentCreated });
    await overlay._placeCommentAtPoint(10, 10);
    overlay.commentInput.value = "written by a person";

    await overlay.saveComment();

    expect(onCommentCreated.mock.calls[0][1].origin).toBe("user");
  });

  it('stamps anchor loss "host", including the repeat on every navigation', () => {
    // The repeats are the reason origin matters here: a host filtering its
    // own writes out of the stream wants these gone with them.
    const onAnchorLost = vi.fn();
    overlay = new CommentOverlay({ onAnchorLost });

    overlay.loadComments([
      seeded("c1", {
        anchor: { version: 1, selector: "#gone", fingerprint: {} },
      }),
    ]);
    overlay.notifyNavigation();

    expect(onAnchorLost).toHaveBeenCalledTimes(2);
    expect(
      onAnchorLost.mock.calls.every(([, meta]) => meta.origin === "host")
    ).toBe(true);
  });

  it("restores the outer origin instead of resetting it to host", () => {
    // A UI action that reaches a second public method through the first must
    // not have the inner call downgrade what the outer one is reporting.
    const seen = [];
    overlay = new CommentOverlay({
      onChange: (event) => seen.push(event.origin),
    });
    // The load itself emits anchor-lost for the unanchored seed; the origins
    // under test are the ones after it.
    overlay.loadComments([seeded()]);
    seen.length = 0;

    overlay._asUser(() => {
      overlay.setCommentType("c1", "bug");
      overlay._asUser(() => overlay.setCommentPriority("c1", "high"));
      overlay.setCommentTags("c1", ["checkout"]);
    });

    expect(seen).toEqual(["user", "user", "user"]);
    overlay.setCommentStatus("c1", "resolved");
    expect(seen.at(-1)).toBe("host");
  });
});

describe("what moved, not just that something did", () => {
  let overlay;

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

  it("carries both ends of a status move, so a reopen is not a resolve", () => {
    const onCommentStatusChanged = vi.fn();
    overlay = new CommentOverlay({ onCommentStatusChanged });
    overlay.loadComments([seeded()]);

    overlay.setCommentStatus("c1", "resolved");
    overlay.setCommentStatus("c1", "open");

    expect(onCommentStatusChanged.mock.calls[0][1]).toMatchObject({
      from: "open",
      to: "resolved",
    });
    expect(onCommentStatusChanged.mock.calls[1][1]).toMatchObject({
      from: "resolved",
      to: "open",
    });
  });

  it("says which of the three fields a comment:updated was about", () => {
    const onCommentUpdated = vi.fn();
    overlay = new CommentOverlay({ onCommentUpdated });
    overlay.loadComments([seeded("c1", { type: "bug" })]);

    overlay.setCommentType("c1", "question");
    overlay.setCommentPriority("c1", "high");
    overlay.setCommentTags("c1", ["Checkout", "checkout", " billing "]);

    const [type, priority, tags] = onCommentUpdated.mock.calls.map((c) => c[1]);
    expect(type).toMatchObject({ field: "type", from: "bug", to: "question" });
    expect(priority).toMatchObject({
      field: "priority",
      from: null,
      to: "high",
    });
    // Normalised on the way in, and both sides are there to diff.
    expect(tags).toMatchObject({ field: "tags", from: [] });
    expect(tags.to).toEqual(["checkout", "billing"]);
  });

  it("flattens the same metadata onto the onChange event", () => {
    const onChange = vi.fn();
    overlay = new CommentOverlay({ onChange });
    overlay.loadComments([seeded()]);

    overlay.setCommentPriority("c1", "low");

    expect(onChange.mock.calls.at(-1)[0]).toMatchObject({
      type: "comment:updated",
      field: "priority",
      from: null,
      to: "low",
      origin: "host",
    });
  });

  it("stays silent when a classification setter changes nothing", () => {
    // setCommentStatus has always had this guard. Without it on the other
    // three, a host mirroring a remote change hears its own echo — and pays
    // a storage write and an inbox refresh for it.
    const onCommentUpdated = vi.fn();
    overlay = new CommentOverlay({ onCommentUpdated });
    overlay.loadComments([
      seeded("c1", { type: "bug", priority: "high", tags: ["checkout"] }),
    ]);

    expect(overlay.setCommentType("c1", "bug")).toBe(true);
    expect(overlay.setCommentPriority("c1", "high")).toBe(true);
    expect(overlay.setCommentTags("c1", ["checkout"])).toBe(true);
    // Normalisation is applied before the comparison, so this is a no-op too.
    expect(overlay.setCommentTags("c1", ["  CHECKOUT "])).toBe(true);

    expect(onCommentUpdated).not.toHaveBeenCalled();
  });
});

describe("onCommentRequested", () => {
  let overlay;

  beforeEach(() => {
    document.elementFromPoint = () => null;
    document.body.innerHTML = `<section id="target">Anchor text</section>`;
    localStorage.clear();
  });

  afterEach(() => {
    overlay?.cleanup?.();
    cleanupDom();
    withUrl("");
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("asks the host for a linked comment it does not hold", () => {
    withUrl("?helldotsComment=abc123");
    const onCommentRequested = vi.fn();
    overlay = new CommentOverlay({ onCommentRequested });

    expect(onCommentRequested).toHaveBeenCalledWith("abc123");
  });

  it("does not ask for a comment it already has", () => {
    withUrl("?helldotsComment=c1");
    const onCommentRequested = vi.fn();
    overlay = new CommentOverlay({ onCommentRequested });
    onCommentRequested.mockClear();

    overlay.loadComments([seeded("c1")]);

    expect(onCommentRequested).not.toHaveBeenCalled();
    expect(overlay.inboxView.detailId).toBe("c1");
  });

  it("asks once per id, not once per attempt", () => {
    // _openPendingDetail runs again after every load and every navigation.
    // An id the host cannot produce must not become a request loop.
    withUrl("?helldotsComment=missing");
    const onCommentRequested = vi.fn();
    overlay = new CommentOverlay({ onCommentRequested });

    overlay.loadComments([seeded("other")]);
    overlay.loadComments([seeded("another")]);
    overlay.notifyNavigation();

    expect(onCommentRequested).toHaveBeenCalledTimes(1);
  });

  it("retries the link once a promise-returning handler settles", async () => {
    // The whole point: load only the comment the URL asked for.
    withUrl("?helldotsComment=lazy");
    let resolveFetch;
    const fetched = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    overlay = new CommentOverlay({
      onCommentRequested: (id) =>
        fetched.then(() => overlay.loadComments([seeded(id)])),
    });

    // Until it lands the widget says so rather than doing nothing.
    expect(
      overlay.shadowRoot.querySelector(`.${CLASSES.INBOX_NOTICE}`)
    ).toBeTruthy();

    resolveFetch();
    await fetched;
    await Promise.resolve();

    expect(overlay.inboxView.detailId).toBe("lazy");
    expect(overlay.comments).toHaveLength(1);
  });

  it("reports a rejected handler and leaves the link retryable", async () => {
    withUrl("?helldotsComment=broken");
    const onError = vi.fn();
    const failure = Promise.reject(new Error("network down"));
    overlay = new CommentOverlay({
      onError,
      onCommentRequested: () => failure,
    });

    await failure.catch(() => {});
    await Promise.resolve();

    expect(onError).toHaveBeenCalledWith(expect.any(Error), "link");
    // Still pending: the comment may yet arrive through the host's own load.
    overlay.loadComments([seeded("broken")]);
    expect(overlay.inboxView.detailId).toBe("broken");
  });
});

describe("onReady and loading before the widget is up", () => {
  let overlay;
  let readyState;
  let originalReadyState;

  beforeEach(() => {
    document.elementFromPoint = () => null;
    document.body.innerHTML = `<section id="target">Anchor text</section>`;
    localStorage.clear();
    readyState = "complete";
    // jsdom always reports "complete", so the branch a real page takes while
    // it is still parsing has to be staged.
    originalReadyState = Object.getOwnPropertyDescriptor(
      Document.prototype,
      "readyState"
    );
    Object.defineProperty(document, "readyState", {
      configurable: true,
      get: () => readyState,
    });
  });

  afterEach(() => {
    overlay?.cleanup?.();
    cleanupDom();
    localStorage.clear();
    delete document.readyState;
    if (originalReadyState) {
      Object.defineProperty(
        Document.prototype,
        "readyState",
        originalReadyState
      );
    }
    vi.restoreAllMocks();
  });

  it("fires once the widget is mounted, with the instance", () => {
    // Handed over because with the document already parsed the mount happens
    // inside the constructor — before createCommentOverlay() has returned.
    const onReady = vi.fn();
    overlay = new CommentOverlay({ onReady });

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady.mock.calls[0][0]).toBe(overlay);
    expect(overlay.markers).not.toBeNull();
  });

  it("holds a load made before the mount and applies it after", () => {
    // Used to be a TypeError out of a null marker engine: a host whose fetch
    // resolved while the document was still parsing had no way to know it
    // was too early.
    readyState = "loading";
    overlay = new CommentOverlay();
    expect(overlay.markers).toBeNull();

    const counts = overlay.loadComments([seeded("early")]);

    // Nothing has been resolved against the DOM yet, so nothing is claimed.
    expect(counts).toEqual({ anchored: 0, orphaned: 0, inactive: 0 });
    expect(overlay.comments).toHaveLength(0);

    readyState = "complete";
    document.dispatchEvent(new Event("DOMContentLoaded"));

    expect(overlay.comments.map((c) => c.id)).toEqual(["early"]);
  });

  it("is safe to navigate and clear before the mount too", () => {
    readyState = "loading";
    overlay = new CommentOverlay();

    expect(() => overlay.notifyNavigation()).not.toThrow();
    expect(() => overlay.clearComments()).not.toThrow();
    expect(overlay.deleteComment("nope")).toBe(false);
  });

  it("drops a deferred load when the instance is torn down first", () => {
    readyState = "loading";
    overlay = new CommentOverlay();
    overlay.loadComments([seeded("never")]);
    overlay.cleanup();

    readyState = "complete";
    document.dispatchEvent(new Event("DOMContentLoaded"));

    expect(overlay.comments).toHaveLength(0);
    overlay = null;
  });
});

describe("onError", () => {
  let overlay;

  beforeEach(() => {
    document.elementFromPoint = () => null;
    document.body.innerHTML = `<section id="target">Anchor text</section>`;
    localStorage.clear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    overlay?.cleanup?.();
    cleanupDom();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('reports a skipped malformed record as "load"', () => {
    const onError = vi.fn();
    overlay = new CommentOverlay({ onError });

    overlay.loadComments([seeded("good"), { id: "bad" }, null]);

    expect(overlay.comments).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError.mock.calls[0][1]).toBe("load");
  });

  it('reports a localStorage write that could not be made as "storage"', () => {
    const onError = vi.fn();
    overlay = new CommentOverlay({ onError, persistence: "localStorage" });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    overlay.loadComments([seeded("c1")]);
    overlay.setCommentStatus("c1", "resolved");

    expect(onError).toHaveBeenCalledWith(expect.any(Error), "storage");
  });

  it('reports a failed screenshot render as "capture"', async () => {
    const onError = vi.fn();
    const capture = await import("../src/capture.js");
    capture.renderPage.mockRejectedValueOnce(new Error("tainted canvas"));
    overlay = new CommentOverlay({ onError });

    overlay._captureFlow.armClickCapture();
    await overlay._captureFlow.consumePending();

    expect(onError).toHaveBeenCalledWith(expect.any(Error), "capture");
  });

  it("keeps the console warning for a host that wired no handler", () => {
    overlay = new CommentOverlay();

    overlay.loadComments([{ id: "bad" }]);

    expect(console.warn).toHaveBeenCalled();
  });

  it("isolates a handler that throws, like every other subscriber", () => {
    overlay = new CommentOverlay({
      onError: () => {
        throw new Error("bad subscriber");
      },
    });

    expect(() => overlay.loadComments([{ id: "bad" }])).not.toThrow();
  });
});
