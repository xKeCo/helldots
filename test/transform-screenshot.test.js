// One seam for every image the widget acquires. A ~33KB base64 string per
// comment is what blows through the localStorage quota (storage.js already
// sheds them) and what lands in a host's JSON column — and until now there
// was no point at which a host could swap it for a URL of its own.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import CommentOverlay from "../src/overlay.js";
import { TAG_NAME } from "../src/root-element.js";

vi.mock("../src/capture.js", () => ({
  renderPage: vi.fn().mockResolvedValue({ width: 0, height: 0 }),
  cropRegion: vi.fn().mockReturnValue("data:image/png;base64,cropped"),
  cropViewport: vi.fn().mockReturnValue("data:image/jpeg;base64,auto"),
  AUTO_SCALE: 0.5,
}));

const cleanupDom = () => {
  document.querySelectorAll(TAG_NAME).forEach((el) => el.remove());
  document.body.className = "";
  document.body.innerHTML = "";
};

describe("transformScreenshot on the comment path", () => {
  let overlay;

  const write = async (text = "a comment") => {
    await overlay._placeCommentAtPoint(10, 10);
    overlay.commentInput.value = text;
    await overlay.saveComment();
    return overlay.comments[0];
  };

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

  it("stores what the host returns for the automatic capture", async () => {
    const transformScreenshot = vi
      .fn()
      .mockResolvedValue("https://cdn.test/auto.jpg");
    overlay = new CommentOverlay({ transformScreenshot });

    const comment = await write();

    expect(comment.contextScreenshot).toBe("https://cdn.test/auto.jpg");
    expect(transformScreenshot).toHaveBeenCalledWith(
      "data:image/jpeg;base64,auto",
      { kind: "context", commentId: comment.id }
    );
  });

  it("stores what the host returns for each attachment", async () => {
    const transformScreenshot = vi.fn((dataUrl, { kind }) =>
      Promise.resolve(`https://cdn.test/${kind}-${dataUrl.length}`)
    );
    overlay = new CommentOverlay({ transformScreenshot });
    overlay._pendingScreenshots = ["data:image/png;base64,one", "data:png,two"];

    const comment = await write();

    expect(comment.screenshots).toEqual([
      "https://cdn.test/attachment-25",
      "https://cdn.test/attachment-12",
    ]);
    // Attachments are "attachment", never "context".
    const kinds = transformScreenshot.mock.calls.map(([, info]) => info.kind);
    expect(kinds.filter((k) => k === "attachment")).toHaveLength(2);
  });

  it("carries the id of the comment the image will belong to", async () => {
    // The id is generated before the transform precisely so a host can name
    // its blobs after the comment.
    const seen = [];
    overlay = new CommentOverlay({
      transformScreenshot: (dataUrl, info) => {
        seen.push(info.commentId);
        return Promise.resolve("https://cdn.test/x");
      },
    });
    overlay._pendingScreenshots = ["data:image/png;base64,one"];

    const comment = await write();

    expect(seen).toHaveLength(2);
    expect(new Set(seen)).toEqual(new Set([comment.id]));
  });

  it("keeps the original data URL when the host rejects", async () => {
    // Fail-open: a bucket that is down must not cost the user their comment.
    const onError = vi.fn();
    overlay = new CommentOverlay({
      onError,
      transformScreenshot: () => Promise.reject(new Error("S3 is down")),
    });

    const comment = await write();

    expect(comment.contextScreenshot).toBe("data:image/jpeg;base64,auto");
    expect(onError).toHaveBeenCalledWith(expect.any(Error), "transform");
  });

  it("treats an unusable resolved value as a failure", async () => {
    const onError = vi.fn();
    overlay = new CommentOverlay({
      onError,
      transformScreenshot: () => Promise.resolve(""),
    });

    const comment = await write();

    expect(comment.contextScreenshot).toBe("data:image/jpeg;base64,auto");
    expect(onError).toHaveBeenCalledWith(expect.any(Error), "transform");
  });

  it("treats a handler that throws synchronously the same way", async () => {
    const onError = vi.fn();
    overlay = new CommentOverlay({
      onError,
      transformScreenshot: () => {
        throw new Error("bad handler");
      },
    });

    const comment = await write();

    expect(comment.contextScreenshot).toBe("data:image/jpeg;base64,auto");
    expect(onError).toHaveBeenCalledWith(expect.any(Error), "transform");
  });

  it("changes nothing when no handler is configured", async () => {
    overlay = new CommentOverlay();
    overlay._pendingScreenshots = ["data:image/png;base64,one"];

    const comment = await write();

    expect(comment.contextScreenshot).toBe("data:image/jpeg;base64,auto");
    expect(comment.screenshots).toEqual(["data:image/png;base64,one"]);
  });

  it("uploads a comment's images in parallel, not one after another", async () => {
    let inFlight = 0;
    let peak = 0;
    overlay = new CommentOverlay({
      transformScreenshot: async () => {
        peak = Math.max(peak, ++inFlight);
        await Promise.resolve();
        inFlight--;
        return "https://cdn.test/x";
      },
    });
    overlay._pendingScreenshots = ["a", "b", "c", "d", "e"];

    await write();

    // Five attachments plus the automatic capture.
    expect(peak).toBe(6);
  });
});

describe("the submit button during a save", () => {
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

  it("is disabled while the host's upload is in flight, and re-enabled after", async () => {
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    overlay = new CommentOverlay({
      transformScreenshot: () => held.then(() => "https://cdn.test/x"),
    });
    await overlay._placeCommentAtPoint(10, 10);
    overlay.commentInput.value = "slow upload";

    const saving = overlay.saveComment();
    expect(overlay.submitButton.disabled).toBe(true);

    release();
    await saving;

    expect(overlay.submitButton.disabled).toBe(false);
  });

  it("re-enables the button even when the transform failed", async () => {
    overlay = new CommentOverlay({
      transformScreenshot: () => Promise.reject(new Error("S3 is down")),
    });
    await overlay._placeCommentAtPoint(10, 10);
    overlay.commentInput.value = "failed upload";

    await overlay.saveComment();

    expect(overlay.submitButton.disabled).toBe(false);
  });
});
