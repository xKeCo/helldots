# `transformScreenshot` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a host replace every image the widget acquires with a string of its own — typically a blob-storage URL — before it becomes part of a comment or reply record.

**Architecture:** One private helper on `CommentOverlay` owns the whole contract (call the host, validate the result, fail open, report). Three call sites use it: the comment save path transforms the automatic capture and every pending attachment in parallel, and the two reply composers transform at attach time so `addReply()` stays synchronous.

**Tech Stack:** Vanilla ES modules, JSDoc types checked by `tsc --noEmit`, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-08-24-transform-screenshot-design.md`

## Global Constraints

- Everything written into the repo is in **English** — code, comments, docs, commit messages, changesets.
- `npm run verify` (lint → typecheck → format → test → build → size) must pass before any task is called done.
- Every new public option or method must be declared in `src/index.d.ts`, or `typecheck/consistency-check.ts` stops compiling.
- `dist/helldots.esm.js` is gated at **50 KB gzip**. Current: 42.24 KB.
- This feature adds **no user-visible strings**, so `src/locales/en.js` and `src/locales/es.js` are untouched. A regression test scans `src/components.js` for hardcoded English — do not introduce any.
- Commits use `<emoji> <type>(<scope>): <subject>`, emoji read from the table in `CONTRIBUTING.md` (**never from memory** — `style` is `:art:` here, not gitmoji's `:lipstick:`). A `commit-msg` hook enforces it.
- Any change affecting the published package needs a changeset. Any choice with more than one defensible option needs a `DECISIONS.md` entry.

## File Structure

| File | Responsibility | Change |
| --- | --- | --- |
| `src/overlay.js` | Owns `_transformScreenshot` (the entire contract), calls it from the save path, hands bound wrappers to the two reply surfaces | Modify |
| `src/components.js` | `wireScreenshotInput` gains an optional transform and awaits it | Modify |
| `src/popover-controller.js` | Passes the transform for the thread reply composer | Modify |
| `src/inbox.js` | Passes the transform for the inbox-detail reply composer | Modify |
| `src/index.d.ts` | Declares the `transformScreenshot` option and the `"transform"` error context | Modify |
| `test/transform-screenshot.test.js` | Every behaviour in the spec's testing section | Create |
| `README.md`, `DECISIONS.md`, `.changeset/*.md` | Documentation | Modify / create |

---

### Task 1: The transform helper, the comment save path, and the submit button

Covers three of the five image paths — the automatic capture, the drag-crop region, and the comment box's file picker — because all three converge on `_pendingScreenshots` and `contextScreenshot` by the time `_saveCommentNow` runs.

It also disables the submit button while a save is in flight. That is folded
in here rather than standing alone: the button only becomes slow *because*
this task makes the save wait on the host's network, so the two are one
change. (It is `feat`, not `style` — `disabled` blocks the click, which
`CONTRIBUTING.md` does not count as presentation-only.)

**Files:**
- Modify: `src/overlay.js` (`_saveCommentNow`, `saveComment`, new `_transformScreenshot`)
- Modify: `src/index.d.ts` (`CommentOverlayOptions`, `ErrorContext`)
- Test: `test/transform-screenshot.test.js`

**Interfaces:**
- Consumes: `this._reportError(error, context)` — already exists on `CommentOverlay`.
- Produces: `_transformScreenshot(dataUrl: string | null, kind: "context" | "attachment", commentId: CommentId): Promise<string | null>` — **never rejects**. Tasks 2 wraps this; do not duplicate its fail-open logic there.

- [ ] **Step 1: Write the failing tests**

Create `test/transform-screenshot.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run test/transform-screenshot.test.js`
Expected: FAIL. The handler is never called, so assertions on `contextScreenshot` see `data:image/jpeg;base64,auto` where a URL was expected.

- [ ] **Step 3: Add the helper to `src/overlay.js`**

Insert immediately after the existing `_reportError` method:

```js
  /**
   * Hands one image to the host's `transformScreenshot`, so what ends up
   * stored can be a URL into its own storage instead of ~33KB of base64 in
   * every record.
   *
   * Never rejects, and never returns something a renderer cannot use: a
   * bucket that is down must not cost the user their comment, so a failed
   * transform degrades to the data URL the widget already holds and reports
   * itself through onError instead. The host receives a fat record rather
   * than none — the better of two bad outcomes.
   *
   * @param {string | null} dataUrl null passes straight through: no capture
   *   was taken, and there is nothing to transform.
   * @param {"context" | "attachment"} kind
   * @param {import('./index.d.ts').CommentId} commentId
   * @returns {Promise<string | null>}
   */
  async _transformScreenshot(dataUrl, kind, commentId) {
    const transform = this.options.transformScreenshot;
    if (typeof transform !== "function" || !dataUrl) return dataUrl;
    try {
      const result = await transform(dataUrl, { kind, commentId });
      // A handler resolving to nothing usable is a failed handler; storing
      // it would put a broken <img> where the screenshot was.
      if (typeof result !== "string" || !result) {
        throw new Error(
          "HellDots: transformScreenshot resolved to no usable string"
        );
      }
      return result;
    } catch (err) {
      this._reportError(err, "transform");
      return dataUrl;
    }
  }
```

- [ ] **Step 4: Wire it into `_saveCommentNow`**

In `src/overlay.js`, replace the opening of `_saveCommentNow` — from `const contextScreenshot = await this._captureFlow.consumePending();` down to and including `const comment = {` — with:

```js
    // The capture kicked off when the box opened; by save time it has
    // usually resolved and this await costs nothing.
    const captured = await this._captureFlow.consumePending();
    // The box may have been dismissed (Escape) while awaiting — a save that
    // lands after that would contradict what the user sees on screen.
    if (!this.currentPosition) return;

    // Generated ahead of the transform rather than inside the object below,
    // so a host can name its blobs after the comment they belong to.
    const id = createId();
    const attachments = this._pendingScreenshots
      ? [...this._pendingScreenshots]
      : [];

    // In parallel: up to six images, one wait rather than six.
    const [contextScreenshot, screenshots] = await Promise.all([
      this._transformScreenshot(captured, "context", id),
      Promise.all(
        attachments.map((dataUrl) =>
          this._transformScreenshot(dataUrl, "attachment", id)
        )
      ),
    ]);

    // Checked again: unlike the capture above, the transform is the host's
    // network, so the box has had a real chance to be dismissed under it.
    if (!this.currentPosition) return;

    const comment = {
```

Then, inside that object literal, replace `id: createId(),` with `id,` and replace the three-line `screenshots:` entry with `screenshots,`. Leave `contextScreenshot,` as it is — it now refers to the transformed constant.

- [ ] **Step 5: Declare the new API in `src/index.d.ts`**

Extend `ErrorContext` with a fourth arm:

```ts
  /** An `onCommentRequested` handler threw or rejected. */
  | "link"
  /** A `transformScreenshot` handler failed; the data URL was kept. */
  | "transform";
```

Add the option to `CommentOverlayOptions`, immediately after `onCommentRequested`:

```ts
  /**
   * Called for every image the widget acquires — the automatic viewport
   * capture, a drag-crop region, and anything attached through the file
   * picker — before it becomes part of a record. Return the string to store
   * in its place, typically a URL into your own object storage.
   *
   * Without it, a ~33KB base64 data URL travels inside every comment: into
   * localStorage, where it is the first thing shed under quota pressure, and
   * into whatever your backend persists.
   *
   * `kind` separates the automatic capture ("context" — disposable and
   * regenerable) from something a person chose to include ("attachment"), so
   * the two can go to different buckets with different retention.
   * `commentId` is the comment the image will belong to — for an attachment
   * on a reply, the parent comment.
   *
   * Fail-open: a rejection, a throw, or a resolved value that is not a
   * non-empty string leaves the original data URL in place and reports
   * `onError(error, "transform")`. Losing the user's comment would be worse
   * than sending you a large one.
   *
   * Not called for records passed to `loadComments()`, nor for screenshots
   * you hand to `addReply()` yourself — in both cases the strings are
   * already yours.
   */
  transformScreenshot?: (
    dataUrl: string,
    info: { kind: "context" | "attachment"; commentId: CommentId }
  ) => Promise<string>;
```

- [ ] **Step 6: Disable the submit button while a save is in flight**

Saving now waits on the host's network. The button currently stays enabled
and `_saving` silently swallows the second click, which with a three-second
upload behind it is a dead click.

In `src/overlay.js`, replace the body of `saveComment`:

```js
  async saveComment() {
    // Two Enters while the capture resolves must not save twice.
    if (this._saving) return;
    if (!this.commentInput.value.trim() || !this.currentPosition) return;
    this._saving = true;
    // The guard above already made the second click a no-op; disabling says
    // so. With a host's upload behind the save this is no longer instant,
    // and a button that looks live but does nothing reads as broken.
    if (this.submitButton) this.submitButton.disabled = true;
    try {
      await this._saveCommentNow();
    } finally {
      this._saving = false;
      if (this.submitButton) this.submitButton.disabled = false;
    }
  }
```

The two tests covering this are already in the file from Step 1, under
`describe("the submit button during a save")`.

- [ ] **Step 7: Run the tests and the typecheck**

Run: `npx vitest run test/transform-screenshot.test.js && npm run typecheck`
Expected: 10 passed, and `tsc --noEmit` silent.

- [ ] **Step 8: Run the full gate**

Run: `npm run verify`
Expected: every gate green, size under 50 KB.

- [ ] **Step 9: Commit**

```bash
git add src/overlay.js src/index.d.ts test/transform-screenshot.test.js
git commit -m ":sparkles: feat(screenshots): Let the host swap an image before it is stored"
```

---

### Task 2: Reply attachments transform when they are attached

`addReply()` is synchronous and returns `CommentReply | null`. Making it await an upload would change that to a promise and break every existing consumer, so reply attachments transform at the moment they are picked instead. See the spec's "Why the timing is not uniform".

**Files:**
- Modify: `src/components.js` (`wireScreenshotInput`)
- Modify: `src/popover-controller.js:~478`
- Modify: `src/inbox.js:~1177`
- Modify: `src/overlay.js` (pass a bound transform to both surfaces)
- Test: `test/transform-screenshot.test.js`

**Interfaces:**
- Consumes: `_transformScreenshot(dataUrl, kind, commentId)` from Task 1.
- Produces: `wireScreenshotInput(input, getScreenshots, rerender, transform?)` where `transform` is `(dataUrl: string) => Promise<string>` with the `commentId` already bound by the caller.

- [ ] **Step 1: Write the failing tests**

Append to `test/transform-screenshot.test.js`:

```js
describe("transformScreenshot on the reply path", () => {
  let overlay;

  const seeded = () => ({
    id: "c1",
    text: "seeded comment",
    anchor: null,
    page: location.pathname,
    replies: [],
    author: "Ana",
    createdAt: "2026-01-01T00:00:00.000Z",
    screenshots: [],
    status: "open",
  });

  // The file picker reads through FileReader; this is the smallest stand-in
  // that resolves the same way jsdom's does.
  const pickFile = async (input) => {
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["x"], "shot.png", { type: "image/png" })],
    });
    input.dispatchEvent(new Event("change"));
    // One tick for the read, one for the transform.
    await new Promise((resolve) => setTimeout(resolve, 0));
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

  it("transforms an attachment picked in the thread popover", async () => {
    const transformScreenshot = vi
      .fn()
      .mockResolvedValue("https://cdn.test/reply.png");
    overlay = new CommentOverlay({ transformScreenshot });
    overlay.loadComments([seeded()]);
    overlay.showThreadPopover(null, overlay.comments[0]);

    const input = overlay.shadowRoot.querySelector('input[type="file"]');
    await pickFile(input);

    expect(transformScreenshot).toHaveBeenCalledWith(
      expect.stringContaining("data:"),
      { kind: "attachment", commentId: "c1" }
    );
  });

  it("transforms an attachment picked in the inbox detail", async () => {
    const transformScreenshot = vi
      .fn()
      .mockResolvedValue("https://cdn.test/reply.png");
    overlay = new CommentOverlay({ transformScreenshot });
    overlay.loadComments([seeded()]);
    overlay.showInbox();
    overlay.inboxView.openDetail("c1");

    const input = overlay.inboxView.el.querySelector('input[type="file"]');
    await pickFile(input);

    expect(transformScreenshot).toHaveBeenCalledWith(
      expect.stringContaining("data:"),
      { kind: "attachment", commentId: "c1" }
    );
  });

  it("keeps the data URL on the reply path too when the host rejects", async () => {
    const onError = vi.fn();
    overlay = new CommentOverlay({
      onError,
      transformScreenshot: () => Promise.reject(new Error("S3 is down")),
    });
    overlay.loadComments([seeded()]);
    overlay.showThreadPopover(null, overlay.comments[0]);

    const input = overlay.shadowRoot.querySelector('input[type="file"]');
    await pickFile(input);

    expect(onError).toHaveBeenCalledWith(expect.any(Error), "transform");
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run test/transform-screenshot.test.js -t "reply path"`
Expected: FAIL — `transformScreenshot` is never called from either surface.

- [ ] **Step 3: Make `wireScreenshotInput` transform-aware**

In `src/components.js`, add this helper directly above `wireScreenshotInput`:

```js
/**
 * FileReader as a promise, so the attachment path can await a host's
 * transform after the read without nesting two callbacks. Resolves to null
 * on a read error rather than rejecting — a file the browser could not read
 * is not an exception, it is just nothing to attach.
 * @param {File} file
 * @returns {Promise<string | null>}
 */
const readAsDataUrl = (file) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(/** @type {string} */ (ev.target.result));
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
```

Then replace the whole body of `wireScreenshotInput` with:

```js
export const wireScreenshotInput = (
  input,
  getScreenshots,
  rerender,
  transform
) => {
  input.addEventListener("change", async (e) => {
    const file = /** @type {HTMLInputElement} */ (e.target).files[0];
    if (!file) return;
    // A non-image read into a data URL renders a broken <img> and bloats
    // the stored payload for nothing.
    if (file.type && !file.type.startsWith("image/")) return;
    if (getScreenshots().length >= MAX_SCREENSHOTS) return;

    const pending = readAsDataUrl(file);
    // Cleared while the read is in flight, exactly as before: otherwise
    // picking the same file twice in a row fires no second change event.
    input.value = "";
    const dataUrl = await pending;
    if (!dataUrl) return;

    const value = transform ? await transform(dataUrl) : dataUrl;

    // Re-checked after the awaits. The read has always sat here, and a
    // host's upload now sits here too — long enough for two quick picks to
    // both pass the check above and push past the cap together.
    const screenshots = getScreenshots();
    if (screenshots.length >= MAX_SCREENSHOTS) return;
    screenshots.push(value);
    rerender();
  });
};
```

Update its JSDoc block to document the fourth parameter:

```js
 * @param {(dataUrl: string) => Promise<string>} [transform] the host's
 *   screenshot transform, with the comment id already bound by the caller.
 *   Omitted by the comment box, whose array is transformed at save instead.
```

- [ ] **Step 4: Pass the transform from the thread popover**

In `src/overlay.js`, add a dependency to the `new PopoverController({ ... })` literal, directly after `actorKey: () => this._actorKey(),`:

```js
      transformScreenshot: (dataUrl, commentId) =>
        this._transformScreenshot(dataUrl, "attachment", commentId),
```

In `src/popover-controller.js`, replace the `wireScreenshotInput(threadFileInput, ...)` call with:

```js
    wireScreenshotInput(
      threadFileInput,
      () => pendingReplyScreenshots,
      updateReplyScreenshotsPreview,
      (dataUrl) => this.deps.transformScreenshot(dataUrl, comment.id)
    );
```

Add `transformScreenshot: Function,` to the `deps` JSDoc block at the top of the class.

- [ ] **Step 5: Pass the transform from the inbox detail**

In `src/overlay.js`, add to the inbox `callbacks` literal, directly after `onOpenDetail`:

```js
          onTransformScreenshot: (dataUrl, commentId) =>
            this._transformScreenshot(dataUrl, "attachment", commentId),
```

In `src/inbox.js`, inside `_buildReplyInput(comment)`, replace the `wireScreenshotInput` call with:

```js
    wireScreenshotInput(
      fileInput,
      () => pendingScreenshots,
      updatePreview,
      (dataUrl) => this.callbacks.onTransformScreenshot(dataUrl, comment.id)
    );
```

Add `onTransformScreenshot?: Function,` to the `deps.callbacks` JSDoc block.

- [ ] **Step 6: Run the tests and the typecheck**

Run: `npx vitest run test/transform-screenshot.test.js && npm run typecheck`
Expected: 11 passed, `tsc --noEmit` silent.

- [ ] **Step 7: Run the full gate**

Run: `npm run verify`
Expected: all green. Watch `test/components.test.js` and `test/inbox.test.js` in particular — `wireScreenshotInput` went from synchronous push to awaited push, so any existing test that asserts immediately after dispatching `change` needs an `await` tick. Fix those tests rather than reverting the async, and say so in the commit body.

- [ ] **Step 8: Commit**

```bash
git add src/components.js src/popover-controller.js src/inbox.js src/overlay.js test/
git commit -m ":sparkles: feat(screenshots): Transform a reply's attachment as it is picked"
```

---

### Task 3: Documentation, decision log and changeset

**Files:**
- Modify: `README.md`
- Modify: `DECISIONS.md`
- Create: `.changeset/<generated-name>.md`

**Interfaces:**
- Consumes: the final API from Tasks 1–2. Nothing produces.

- [ ] **Step 1: Document the option in the README**

Add a row to the Options table, after `onCommentRequested`:

```markdown
| `transformScreenshot`   | `(dataUrl, info) => Promise<string>` | —          | Swap every image the widget acquires for a string of your own       |
```

Add a subsection under "What gets captured", after "Web fonts in screenshots":

````markdown
### Keeping screenshots out of your database

Every image is stored as a base64 data URL inside the record — around 33 KB
for the automatic capture alone. That is the first thing shed when
localStorage hits its quota, and in your own backend it means a 33 KB string
per comment in whatever column holds the JSON.

`transformScreenshot` is where you swap it for a URL:

```js
createCommentOverlay({
  transformScreenshot: async (dataUrl, { kind, commentId }) => {
    const blob = await (await fetch(dataUrl)).blob();
    const { url } = await api.upload(blob, { kind, commentId });
    return url; // stored in place of the data URL
  },
});
```

It runs for every image the widget acquires: the automatic capture
(`kind: "context"`), a drag-crop region, and anything attached through the
file picker on a comment or a reply (`kind: "attachment"`). The two kinds
exist so the disposable one and the deliberate one can go to different
buckets.

It is **fail-open**. If your upload rejects — or resolves to anything that is
not a non-empty string — the original data URL is kept and you get
`onError(error, "transform")`. You receive a large record rather than losing
somebody's comment.

Not called for records you pass to `loadComments()`, nor for screenshots you
hand to `addReply()` yourself: in both cases the strings are already yours.
````

- [ ] **Step 2: Add the `DECISIONS.md` entry**

Append:

```markdown
## The screenshot seam sits at two different moments, on purpose

`transformScreenshot` lets a host swap a ~33KB base64 data URL for a URL of
its own. The right rule is "transform at the last moment before the image
becomes part of a record", and for a comment that is `_saveCommentNow` —
already `async` because it awaits the pending capture, so the hook costs no
new asynchrony and a comment abandoned with Escape uploads nothing.

For a reply that would be `addReply()`, which is synchronous and returns
`CommentReply | null`. Awaiting an upload there changes the return type to a
promise and breaks every existing consumer, internal ones included. That is
the same call recorded when `onChange` arrived and the nine callbacks were
kept: a convenience is not a reason to break the documented API.

So reply attachments transform when they are picked. The rule that survives
is still one sentence: **every image the widget itself acquires passes
through the hook.** An `addReply()` the host calls with its own array does
not — and does not need to, because the host is already holding those
strings and can upload them before calling.

**What this costs:** an attachment on a reply draft the user abandons leaves
an orphan blob in the host's storage. Collectable by sweeping unreferenced
blobs, and impossible for comments, which transform at save.

**Fail-open, not fail-closed.** A rejected transform keeps the data URL and
reports `onError(error, "transform")` — a new context rather than a reuse of
`"capture"`, because the capture succeeded and the upload did not, and a host
routing on context has to tell a broken renderer from a broken bucket. The
alternative, aborting the save, turns the host's object storage into a
dependency of writing a comment. Sending a host a record larger than it
wanted is recoverable; losing what somebody wrote is not.

**No timeout, and no spinner.** The host owns the promise and can impose its
own deadline with `AbortSignal.timeout()`; a deadline chosen by the widget
would discard an upload that was about to succeed, on no basis. A spinner
would mean new UI, new strings in both locales, new styles and an
accessibility pass — disproportionate. The submit button is disabled for the
duration, which is the whole of the feedback.
```

- [ ] **Step 3: Write the changeset**

Create `.changeset/<any-two-word-name>.md`:

```markdown
---
"helldots": minor
---

**`transformScreenshot`** — swap every image the widget acquires for a string
of your own before it becomes part of a record, so a ~33 KB base64 data URL
per comment does not end up in your database.

Called with `(dataUrl, { kind, commentId })` for the automatic viewport
capture (`kind: "context"`), drag-crop regions, and file attachments on
comments and replies (`kind: "attachment"`). Return the string to store —
typically a URL into your own object storage.

Fail-open: a rejection, a throw, or a resolved value that is not a non-empty
string keeps the original data URL and reports the new
`onError(error, "transform")`. Not called for records passed to
`loadComments()`, nor for screenshots handed to `addReply()` directly.

The comment box's submit button is now disabled while a save is in flight,
since that save may be waiting on an upload.
```

- [ ] **Step 4: Format and run the full gate**

Run: `npm run format && npm run verify`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add README.md DECISIONS.md .changeset/
git commit -m ":memo: docs(screenshots): Document the transform seam and its two timings"
```

---

## Self-review

**Spec coverage.** API → Task 1 Step 5. All five paths → Tasks 1 and 2 (three converge at save, two at attach). Failure semantics → Task 1 Steps 1, 3. Data flow (no shape change) → asserted by the "changes nothing when no handler" test. The submit button → Task 1 Step 6. Accepted limitations → documented in Task 3 Step 2. Every item in the spec's Testing section maps to a named test in Task 1 or 2.

**Placeholders.** None. Every code step carries the code.

**Type consistency.** `_transformScreenshot(dataUrl, kind, commentId)` is defined in Task 1 Step 3 and called with that exact argument order in Task 1 Step 4 and Task 2 Steps 4 and 5. `wireScreenshotInput`'s fourth parameter is `(dataUrl) => Promise<string>` in Task 2 Step 3 and both call sites bind the id to match. `"transform"` is added to `ErrorContext` in Task 1 Step 5 and used in Tasks 1–2 and the docs.

**Known ripple, flagged rather than discovered.** Task 2 Step 7 calls out that `wireScreenshotInput` becomes async, so existing tests asserting synchronously after a `change` event will need a tick.
