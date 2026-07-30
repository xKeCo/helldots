# HellDots

Drop-in comment overlay for web apps. Your team clicks anywhere on a page,
leaves a comment anchored to that element, and HellDots captures the context
needed to act on it — a screenshot, the browser, the viewport, the DOM path.

Comments survive reloads and re-anchor themselves after the page changes.
Nothing is sent anywhere: you own the data through callbacks, or let the
widget persist to `localStorage`.

```bash
npm install helldots
```

## Quick start

```js
import { createCommentOverlay } from "helldots";

createCommentOverlay({
  user: { name: "Ana" },
  persistence: "localStorage",
});
```

That's it. A toolbar appears at the bottom of the page. `Alt`+`C` (or
`Option`+`C` on macOS) toggles comment mode; click anywhere to leave a
comment, or drag to select a region and attach a screenshot of it.

### Wiring it to your own backend

Skip `persistence` and use the callbacks instead:

```js
import { createCommentOverlay } from "helldots";

const overlay = createCommentOverlay({
  user: { name: currentUser.name },
  onCommentCreated: (comment) => api.post("/comments", comment),
  onReplyAdded: (comment, reply) =>
    api.post(`/comments/${comment.id}/replies`, reply),
  onCommentStatusChanged: (comment) =>
    api.patch(`/comments/${comment.id}`, comment),
  onCommentUpdated: (comment) => api.patch(`/comments/${comment.id}`, comment),
  onCommentDeleted: (id) => api.delete(`/comments/${id}`),
});

// Restore on load
const stored = await api.get("/comments");
overlay.loadComments(stored);
```

Every comment is plain JSON — pass `serializeComments()` output straight to
your API and hand it back to `loadComments()` later.

### Server-rendered apps

Importing the package on the server is safe — nothing touches the DOM at
import time. Just call `createCommentOverlay` from the client only:

```jsx
// Next.js, Remix, Astro…
import { useEffect } from "react";
import { createCommentOverlay } from "helldots";

export function Comments({ user }) {
  useEffect(() => {
    const overlay = createCommentOverlay({ user, persistence: "localStorage" });
    return () => overlay.cleanup();
  }, [user]);

  return null;
}
```

## What gets captured

When someone leaves a comment, HellDots records more than the text:

**A screenshot of the page as they saw it.** Taken automatically, JPEG at half
scale (~30–100 KB). The widget's own UI is hidden during the capture, so the
toolbar never ends up inside the image. Dragging a region additionally attaches
a full-resolution PNG crop of exactly what was selected.

**The environment it was reported from** — URL, viewport size, screen
resolution, device pixel ratio, browser, OS and language. A bug reported at
390×844 on iOS Safari says so, without anyone having to ask.

**Where on the page it was.** A CSS selector, a DOM path, and a structural
fingerprint of the element. If the page later changes and the element moves,
the comment re-anchors to it. If it disappears entirely, the comment is marked
orphaned rather than silently dropped.

Set `autoScreenshot: false` to skip the capture — the render costs a moment
on every comment, and some apps would rather not pay it.

## Triage

Comments carry an optional type, priority and free-form tags. All three start
neutral: the person reporting can classify, or not.

| Field      | Values                                                    |
| ---------- | --------------------------------------------------------- |
| `type`     | `bug`, `suggestion`, `question`, `improvement`, or `null` |
| `priority` | `high`, `medium`, `low`, or `null`                        |
| `tags`     | any strings — trimmed, lowercased and de-duplicated       |

The inbox filters on all of them, combined with page and status. Resolved
comments show how long they took, measured from creation to resolution.

```js
overlay.setCommentType(id, "bug");
overlay.setCommentPriority(id, "high");
overlay.setCommentTags(id, ["checkout", "ios"]);
overlay.setCommentStatus(id, "resolved"); // stamps the resolution time
```

Passing `null` to `setCommentType` or `setCommentPriority` returns the field to
its neutral state. Reopening a resolved comment clears its resolution time.

## Handing a comment to a coding agent

Every comment has a **copy** button that puts a plain-text context block on the
clipboard, built for pasting into an AI coding assistant:

```
Page: /pricing
Viewport: 1440x900
Anchor state: anchored
Status: open
Selector: #plans > div.card:nth-child(2) > button
Element: <button class="cta" data-plan="pro">
DOM path: body > main.layout > section#plans > div.card > button.cta
Nearby text: "Upgrade to Pro"
Comment by Ana (2026-07-29T10:14:00.000Z):
"This button does nothing on mobile"
Type: bug
Priority: high
Tags: checkout, ios
URL: https://example.com/pricing
Screen: 390x844
Browser: Safari 17.2
OS: iOS 17.2
```

## Options

| Option             | Type                             | Default          |                                                           |
| ------------------ | -------------------------------- | ---------------- | --------------------------------------------------------- |
| `user`             | `{ name: string }`               | `"Anonymous"`    | Author of new comments and replies                        |
| `persistence`      | `"localStorage"` \| `"none"`     | `"none"`         | Auto save/restore, or handle it yourself via callbacks    |
| `autoScreenshot`   | `boolean`                        | `true`           | Capture a screenshot and environment snapshot per comment |
| `locale`           | `"en"` \| `"es"`                 | browser language | UI language, falling back to English                      |
| `shortcutKey`      | `string`                         | `"c"`            | Key that toggles comment mode                             |
| `shortcutModifier` | `"alt"` \| `"ctrl"` \| `"shift"` | `"alt"`          | Modifier for that key                                     |
| `autoInit`         | `boolean`                        | `true`           | When `false`, returns an initializer to call yourself     |

### Callbacks

| Callback                          | Fires when                                         |
| --------------------------------- | -------------------------------------------------- |
| `onCommentCreated(comment)`       | A new comment is saved                             |
| `onReplyAdded(comment, reply)`    | A reply is added to any comment                    |
| `onCommentStatusChanged(comment)` | Status moves between open / in progress / resolved |
| `onCommentUpdated(comment)`       | Type, priority or tags change                      |
| `onCommentDeleted(id)`            | A comment is removed                               |
| `onAnchorLost(comment)`           | A comment could not be re-anchored on load         |

## API

```ts
const overlay = createCommentOverlay(options);

overlay.comments; // Comment[]
overlay.commentMode; // boolean
overlay.toggleCommentMode();
overlay.addReply(comment, text); // → CommentReply
overlay.serializeComments(); // → SerializedComment[]
overlay.loadComments(data); // → { anchored, orphaned, inactive }
overlay.deleteComment(id); // → boolean
overlay.setCommentStatus(id, status); // → boolean
overlay.setCommentType(id, type); // → boolean
overlay.setCommentPriority(id, priority); // → boolean
overlay.setCommentTags(id, tags); // → boolean
overlay.cleanup(); // remove the widget entirely
```

The setters return `false` for an unknown id or an invalid value, and make no
change when they do.

TypeScript definitions ship with the package — no `@types` install needed.

## Storage notes

With `persistence: "localStorage"`, every comment (screenshot included) lives
under a single key shared across all pages of your app. Browsers cap that at
roughly 5 MB, which is on the order of a hundred comments with screenshots.

When the quota is reached, HellDots sheds the _automatic_ screenshots of the
oldest comments and retries, so the comments themselves survive. Screenshots a
user deliberately attached are never discarded. If you expect heavy use, wire
`onCommentCreated` to your own backend instead.

## Browser support

Modern evergreen browsers. The widget renders inside a Shadow DOM, so your
page's CSS cannot leak into it and its styles cannot leak out.

## ESM only

This package ships ES modules only. `import` works everywhere — bundlers, Vite,
Next.js, native `<script type="module">`. There is no CommonJS build, so
`require("helldots")` will not work.

For a plain `<script>` tag with no bundler, a self-contained UMD build is on
the CDN:

```html
<script src="https://unpkg.com/helldots"></script>
<script>
  HellDots.createCommentOverlay({ user: { name: "Ana" } });
</script>
```

## License

MIT
