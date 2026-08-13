// F5.3 — SPA support. A client-side router swaps the DOM and rewrites the
// URL without a page load, so nothing re-runs loadComments: markers keep
// floating over elements that no longer exist and the inbox keeps filtering
// by the page the widget was born on. notifyNavigation() is the host's way
// of saying "the page changed" — and the `navigate` option is how the
// widget's own cross-page jumps ride the host's router instead of a reload.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import CommentOverlay from "../src/overlay.js";
import { CLASSES } from "../src/constants.js";
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

const makeOverlay = (options = {}) => new CommentOverlay(options);

const giveSize = (el) => {
  el.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: 300,
    bottom: 200,
    width: 300,
    height: 200,
  });
};

// A serialized comment whose anchor resolves against `<section id="...">`.
const anchoredTo = (id, sectionId, page, text = "comment") => ({
  id,
  text,
  page,
  anchor: {
    version: 1,
    selector: `#${sectionId}`,
    fingerprint: {
      tagName: "SECTION",
      textSnippet: "Stable anchor text for the test",
      attributes: { id: sectionId },
      siblingIndex: 0,
      siblingCount: 1,
    },
    relativeX: 0.5,
    relativeY: 0.5,
  },
  replies: [],
  author: "Ana",
  createdAt: "2026-01-01T00:00:00.000Z",
  screenshots: [],
  status: "open",
});

const addSection = (id) => {
  document.body.insertAdjacentHTML(
    "beforeend",
    `<section id="${id}">Stable anchor text for the test</section>`
  );
  const el = document.getElementById(id);
  giveSize(el);
  return el;
};

describe("notifyNavigation", () => {
  let overlay;

  beforeEach(() => {
    document.elementFromPoint = () => null;
    history.replaceState({}, "", "/");
  });

  afterEach(() => {
    overlay?.cleanup?.();
    cleanupDom();
    history.replaceState({}, "", "/");
    vi.restoreAllMocks();
  });

  it("reclassifies comments for the new pathname and rebuilds markers", () => {
    addSection("home-anchor");
    overlay = makeOverlay();
    overlay.loadComments([
      anchoredTo("h1", "home-anchor", "/", "on the home page"),
      anchoredTo("o1", "other-anchor", "/otra", "on the other page"),
    ]);
    expect(overlay.comments.find((c) => c.id === "h1").anchorState).toBe(
      "anchored"
    );
    expect(overlay.comments.find((c) => c.id === "o1").anchorState).toBe(
      "inactive"
    );

    // The router navigates: home DOM out, other-page DOM in.
    document.getElementById("home-anchor").remove();
    addSection("other-anchor");
    history.pushState({}, "", "/otra");

    const result = overlay.notifyNavigation();

    const h1 = overlay.comments.find((c) => c.id === "h1");
    const o1 = overlay.comments.find((c) => c.id === "o1");
    expect(h1.anchorState).toBe("inactive");
    expect(o1.anchorState).toBe("anchored");
    expect(o1.container).toBe(document.getElementById("other-anchor"));
    expect(result).toEqual({ anchored: 1, orphaned: 0, inactive: 1 });
    // Markers follow: the home comment's circle is gone, the other page's
    // circle exists.
    expect(overlay._circles.has("h1")).toBe(false);
    expect(overlay._circles.has("o1")).toBe(true);
  });

  it("re-anchors to a swapped DOM node on the same path", () => {
    addSection("stable");
    overlay = makeOverlay();
    overlay.loadComments([anchoredTo("s1", "stable", "/")]);
    const before = overlay.comments[0].container;

    // The SPA re-renders the route: same markup, brand-new nodes.
    document.getElementById("stable").remove();
    const fresh = addSection("stable");

    overlay.notifyNavigation();

    expect(overlay.comments[0].anchorState).toBe("anchored");
    expect(overlay.comments[0].container).toBe(fresh);
    expect(overlay.comments[0].container).not.toBe(before);
  });

  it("orphans a comment whose element did not survive and tells the host", () => {
    addSection("doomed");
    const onAnchorLost = vi.fn();
    overlay = makeOverlay({ onAnchorLost });
    overlay.loadComments([anchoredTo("d1", "doomed", "/")]);
    onAnchorLost.mockClear();

    document.getElementById("doomed").remove();
    overlay.notifyNavigation();

    expect(overlay.comments[0].anchorState).toBe("orphaned");
    expect(onAnchorLost).toHaveBeenCalledTimes(1);
    expect(onAnchorLost.mock.calls[0][0].id).toBe("d1");
  });

  it("moves the inbox onto the new page and closes the open popover", () => {
    addSection("home-anchor");
    overlay = makeOverlay();
    overlay.loadComments([
      anchoredTo("h1", "home-anchor", "/", "home comment"),
      anchoredTo("o1", "other-anchor", "/otra", "other-page comment"),
    ]);
    const circle = overlay._circles.get("h1");
    overlay.showThreadPopover(circle, overlay.comments[0]);
    expect(overlay.activeThreadPopover).toBeTruthy();
    overlay.showInbox();

    document.getElementById("home-anchor").remove();
    addSection("other-anchor");
    history.pushState({}, "", "/otra");
    overlay.notifyNavigation();

    expect(overlay.activeThreadPopover).toBeNull();
    const cards = overlay.inboxView.el.querySelectorAll(
      `.${CLASSES.INBOX_CARD}`
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain("other-page comment");
  });

  it("honours a deep link carried by the new URL", () => {
    addSection("other-anchor");
    overlay = makeOverlay();
    overlay.loadComments([anchoredTo("o1", "other-anchor", "/otra")]);

    history.pushState({}, "", "/otra?helldotsComment=o1");
    overlay.notifyNavigation();

    expect(overlay.inboxView?.isOpen()).toBe(true);
    expect(overlay.inboxView.detailId).toBe("o1");
  });
});

describe("navigate option and popstate auto-detection", () => {
  let overlay;

  beforeEach(() => {
    document.elementFromPoint = () => null;
    history.replaceState({}, "", "/");
  });

  afterEach(() => {
    overlay?.cleanup?.();
    cleanupDom();
    history.replaceState({}, "", "/");
    vi.restoreAllMocks();
  });

  it("routes cross-page jumps through the host's navigate callback", () => {
    const navigate = vi.fn();
    overlay = makeOverlay({ navigate });

    overlay._navigateTo("/otra");

    expect(navigate).toHaveBeenCalledWith("/otra");
  });

  it("re-syncs on popstate only when autoDetectNavigation is on", () => {
    overlay = makeOverlay({ autoDetectNavigation: true });
    const spy = vi.spyOn(overlay, "notifyNavigation");

    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(spy).toHaveBeenCalledTimes(1);

    overlay.cleanup();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("ignores popstate by default — MPA hosts opted into nothing", () => {
    overlay = makeOverlay();
    const spy = vi.spyOn(overlay, "notifyNavigation");

    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(spy).not.toHaveBeenCalled();
  });
});
