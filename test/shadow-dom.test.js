import { describe, it, expect, afterEach } from "vitest";
import { CommentOverlay } from "../src/index.js";
import { IDS } from "../src/constants.js";

const cleanupDom = () => {
  document.querySelectorAll("helldots-root").forEach((el) => el.remove());
  document.querySelectorAll("style[data-test]").forEach((el) => el.remove());
  document.body.className = "";
};

describe("Shadow DOM encapsulation", () => {
  let overlay;

  afterEach(() => {
    overlay?.cleanup?.();
    cleanupDom();
  });

  it("mounts a single <helldots-root> host with an open shadow root", () => {
    overlay = new CommentOverlay();

    const hosts = document.querySelectorAll("helldots-root");
    expect(hosts.length).toBe(1);
    expect(hosts[0].shadowRoot).toBeTruthy();
    expect(hosts[0].shadowRoot.mode).toBe("open");
  });

  it("injects widget styles inside the shadow root, never into document.head", () => {
    overlay = new CommentOverlay();

    expect(document.getElementById(IDS.STYLES)).toBeNull();
    expect(overlay.shadowRoot.getElementById(IDS.STYLES)).toBeTruthy();
    expect(
      Array.from(document.head.querySelectorAll("style")).some(
        (style) => style.id === IDS.STYLES
      )
    ).toBe(false);
  });

  it("renders the toolbar and comment box inside the shadow root, invisible to host document queries", () => {
    overlay = new CommentOverlay();

    expect(document.getElementById(IDS.TOOLBAR)).toBeNull();
    expect(document.getElementById(IDS.COMMENT_BOX)).toBeNull();
    expect(overlay.shadowRoot.getElementById(IDS.TOOLBAR)).toBeTruthy();
    expect(overlay.shadowRoot.getElementById(IDS.COMMENT_BOX)).toBeTruthy();
  });

  it("is not affected by an aggressive host-wide reset stylesheet", () => {
    const aggressiveReset = document.createElement("style");
    aggressiveReset.dataset.test = "true";
    aggressiveReset.textContent = "* { all: unset !important; }";
    document.head.appendChild(aggressiveReset);

    overlay = new CommentOverlay();

    // The host page rule only targets elements in the document's own light
    // tree (CSS selectors do not pierce shadow boundaries), so the widget's
    // own :host reset / styles remain the only rules in effect inside it.
    const toolbarStyle = overlay.shadowRoot
      .getElementById(IDS.STYLES)
      .textContent.includes(`#${IDS.TOOLBAR}`);
    expect(toolbarStyle).toBe(true);
    expect(document.styleSheets.length).toBeGreaterThan(0);
    expect(
      Array.from(document.styleSheets).every((sheet) =>
        sheet.ownerNode?.dataset?.test !== undefined
          ? sheet.ownerNode.textContent.includes("all: unset")
          : true
      )
    ).toBe(true);
    // The shadow root's own stylesheet is a completely separate node tree —
    // the host's <style> never ends up inside it.
    expect(
      Array.from(overlay.shadowRoot.querySelectorAll("style")).every(
        (style) => !style.textContent.includes("all: unset")
      )
    ).toBe(true);
  });

  it("is not affected by generic host classes reusing common names (toolbar/popover/comment)", () => {
    const collisionStyle = document.createElement("style");
    collisionStyle.dataset.test = "true";
    collisionStyle.textContent =
      ".toolbar, .popover, .comment { display: none !important; color: red !important; }";
    document.head.appendChild(collisionStyle);

    const hostToolbar = document.createElement("div");
    hostToolbar.className = "toolbar";
    document.body.appendChild(hostToolbar);

    overlay = new CommentOverlay();

    // Host rule should hide the host's own .toolbar element...
    expect(getComputedStyle(hostToolbar).display).toBe("none");
    // ...but never reach the widget's internal nodes, which live in a
    // separate shadow tree the selector cannot match into.
    expect(overlay.toolbar.className).not.toContain("toolbar");
    expect(document.querySelector(`#${IDS.TOOLBAR}`)).toBeNull();

    hostToolbar.remove();
  });

  it("keeps the configurable keyboard shortcut working after the shadow DOM migration", () => {
    overlay = new CommentOverlay({
      shortcutKey: "k",
      shortcutModifier: "shift",
    });

    expect(overlay.commentMode).toBe(false);
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", shiftKey: true })
    );
    expect(overlay.commentMode).toBe(true);
  });

  it("still anchors comments to host DOM elements outside the shadow root after scroll/resize", () => {
    overlay = new CommentOverlay();

    const container = document.createElement("div");
    document.body.appendChild(container);
    container.getBoundingClientRect = () => ({
      left: 100,
      top: 50,
      width: 400,
      height: 300,
      right: 500,
      bottom: 350,
    });

    const comment = {
      id: 1,
      text: "hello",
      container,
      relativeX: 0.5,
      relativeY: 0.5,
      replies: [],
    };
    overlay.comments.push(comment);
    overlay.renderCommentCircle(comment);

    const circle = overlay.shadowRoot.querySelector('[data-comment-id="1"]');
    expect(circle).toBeTruthy();
    expect(circle.style.left).toBe("314px"); // 100 + 0.5*400 + 14
    expect(circle.style.top).toBe("214px"); // 50 + 0.5*300 + 14

    // Simulate the container resizing (e.g. responsive layout change).
    container.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
    });
    overlay.updateCommentPosition(comment, circle);
    expect(circle.style.left).toBe("414px"); // 0 + 0.5*800 + 14
    expect(circle.style.top).toBe("314px"); // 0 + 0.5*600 + 14

    container.remove();
  });
});
