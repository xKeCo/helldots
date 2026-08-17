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

### Single-page apps

A client-side router swaps the DOM without a page load, so tell the widget
when a navigation happened and let its own cross-page jumps use your router:

```js
const overlay = createCommentOverlay({
  user,
  persistence: "localStorage",
  navigate: (page) => router.push(page), // "view on its page" without a reload
});

// After every route render (React Router, Vue Router, …)
router.afterEach(() => overlay.notifyNavigation());
```

`notifyNavigation()` reclassifies every comment against the new URL,
re-resolves anchors against the new DOM and rebuilds the markers. Calling it
after a same-path re-render is also the way to re-anchor when your app
replaced the route's DOM. `autoDetectNavigation: true` additionally covers
back/forward (popstate) automatically.

## What gets captured

When someone leaves a comment, HellDots records more than the text:

**A screenshot of the page as they saw it.** Taken automatically, JPEG at half
scale (~30–100 KB). The widget's own UI is excluded from the capture, so the
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

### Web fonts in screenshots

A screenshot is not a screen grab: the browser exposes no way to rasterize
the painted page from JavaScript, so the capture is a re-render of the DOM.
Anything the re-render cannot reach is missing from it — web fonts included.

A font loaded through a cross-origin `<link>` (Google Fonts and friends) is
one of those. Reading `cssRules` on such a stylesheet throws `SecurityError`,
so its `@font-face` never reaches the capture and the text comes out in a
fallback face. That is not only cosmetic: the fallback's metrics differ, so
glyphs sit at different positions than on screen, and a drag selection tight
around a few letters can come back holding the wrong ones.

Three ways out, cheapest first:

- **Self-host the font**, or add `crossorigin` to the `<link>`. The
  stylesheet becomes readable and the capture matches the page, with no
  extra requests at capture time.
- **`embedCrossOriginFonts: true`.** HellDots re-fetches those stylesheets
  (the same URLs the page already loaded, cached per session) and hands them
  to the renderer. Off by default: a comment widget making third-party
  requests on your users' behalf should be your call, not ours.
- **Leave it.** Captures of such a page stay misaligned where text is
  concerned; everything else about them is correct.

## Triage

Comments carry an optional type, priority and free-form tags. All three start
neutral: the person reporting can classify, or not.

| Field      | Values                                                    |
| ---------- | --------------------------------------------------------- |
| `type`     | `bug`, `suggestion`, `question`, `improvement`, or `null` |
| `priority` | `high`, `medium`, `low`, or `null`                        |
| `tags`     | any strings — trimmed, lowercased and de-duplicated       |
| `status`   | `open`, `in_progress`, `in_review`, `resolved`            |

The status is the one field that is never neutral: every comment starts `open`
and moves through the lifecycle in any order. `open` is the only state painted
in an unsaturated off-white, so the three states somebody actually moved a
comment into are the ones that stand out.

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

### Reactions

Comments and replies take one of six reactions — 👍 👎 ❤️ 🎉 👀 🚀 — so a team
can agree, flag "watching this" or mark something shipped without adding a
reply. The set is fixed: a searchable picker would need an emoji dataset
larger than the whole widget.

```js
overlay.toggleCommentReaction(id, "👍");
overlay.toggleReplyReaction(commentId, replyId, "🎉");
```

Both toggle: reacting again with the same emoji removes it. A reaction is
stored against `user.id` when you pass one, and against `user.name`
otherwise — so give HellDots an `id` if two people on your team can share a
display name:

```js
createCommentOverlay({ user: { name: currentUser.name, id: currentUser.id } });
```

Reactions ride along in `serializeComments()` output as `reactions`, an
`{ emoji: actorKey[] }` map that is `null` when nobody has reacted. The pills
show counts, never who reacted: the stored keys are your ids, and they stay
out of the UI.

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

| Option                  | Type                             | Default             |                                                                   |
| ----------------------- | -------------------------------- | ------------------- | ----------------------------------------------------------------- |
| `user`                  | `{ name: string, id?: string }`  | `"Anonymous"`       | Author of new comments and replies; `id` keys reactions           |
| `persistence`           | `"localStorage"` \| `"none"`     | `"none"`            | Auto save/restore, or handle it yourself via callbacks            |
| `autoScreenshot`        | `boolean`                        | `true`              | Capture a screenshot and environment snapshot per comment         |
| `embedCrossOriginFonts` | `boolean`                        | `false`             | Fetch unreadable stylesheets so their web fonts reach the capture |
| `locale`                | `string`                         | browser language    | `"en"` and `"es"` ship; anything else falls back per key          |
| `linkParam`             | `string`                         | `"helldotsComment"` | Query param used by "Copy link" URLs                              |
| `navigate`              | `(page: string) => void`         | full page load      | SPA router hook for the widget's cross-page jumps                 |
| `autoDetectNavigation`  | `boolean`                        | `false`             | Run `notifyNavigation()` on popstate (back/forward)               |
| `shortcutKey`           | `string`                         | `"c"`               | Key that toggles comment mode                                     |
| `shortcutModifier`      | `"alt"` \| `"ctrl"` \| `"shift"` | `"alt"`             | Modifier for that key                                             |
| `autoInit`              | `boolean`                        | `true`              | When `false`, returns an initializer to call yourself             |

### Callbacks

Every change is also available as one stream, which is usually what you want
when the whole thing syncs to a single endpoint:

```js
createCommentOverlay({
  onChange: (event) => {
    // "comment:created" | "comment:edited" | "comment:deleted"
    // "comment:status-changed" | "comment:updated" | "comment:anchor-lost"
    // "reply:added" | "reply:deleted" | "reply:edited"
    // "reaction:toggled"
    api.post("/helldots-events", event);
  },
});
```

`ChangeEvent` is a discriminated union: switch on `event.type` and
TypeScript narrows the payload. The specific callbacks below carry the same
events at the same moments — subscribe either way, or both. A handler that
throws is caught and warned about, never rolling back the change.

| Callback                            | Fires when                                                     |
| ----------------------------------- | -------------------------------------------------------------- |
| `onCommentCreated(comment)`         | A new comment is saved                                         |
| `onReplyAdded(comment, reply)`      | A reply is added to any comment                                |
| `onReplyDeleted(comment, reply)`    | A reply is removed                                             |
| `onCommentEdited(comment)`          | A comment's text is rewritten                                  |
| `onReplyEdited(comment, reply)`     | A reply's text is rewritten                                    |
| `onCommentStatusChanged(comment)`   | Status moves along the lifecycle                               |
| `onCommentUpdated(comment)`         | Type, priority or tags change                                  |
| `onCommentDeleted(id)`              | A comment is removed                                           |
| `onAnchorLost(comment)`             | A comment could not be re-anchored on load                     |
| `onReactionToggled(comment, reply)` | A reaction is added or removed (`reply` is `null` at the root) |

## API

```ts
const overlay = createCommentOverlay(options);

overlay.comments; // Comment[]
overlay.commentMode; // boolean
overlay.toggleCommentMode();
overlay.addReply(commentOrId, text, screenshots?); // → CommentReply | null
overlay.deleteReply(commentId, replyId); // → boolean
overlay.editComment(id, text); // → boolean
overlay.editReply(commentId, replyId, text); // → boolean
overlay.commentLink(id); // → string | null (shareable URL)
overlay.serializeComments(); // → SerializedComment[]
overlay.loadComments(data); // → { anchored, orphaned, inactive }
overlay.notifyNavigation(); // re-sync after a client-side navigation
overlay.clearComments(); // bulk reset, fires no callbacks
overlay.deleteComment(id); // → boolean
overlay.setCommentStatus(id, status); // → boolean
overlay.setCommentType(id, type); // → boolean
overlay.setCommentPriority(id, priority); // → boolean
overlay.setCommentTags(id, tags); // → boolean
overlay.toggleCommentReaction(id, emoji); // → boolean
overlay.toggleReplyReaction(commentId, replyId, emoji); // → boolean
overlay.cleanup(); // remove the widget entirely
```

The setters return `false` for an unknown id or an invalid value, and make no
change when they do. To reconcile against a backend after remote deletions,
call `clearComments()` and then `loadComments(freshData)` — `loadComments`
alone replaces by id but never removes.

TypeScript definitions ship with the package — no `@types` install needed.

## Storage notes

With `persistence: "localStorage"`, every comment (screenshot included) lives
under a single key shared across all pages of your app. Browsers cap that at
roughly 5 MB, which is on the order of a hundred comments with screenshots.

The mode assumes one active tab per page: writes from another tab are
preserved on the next sync, but two tabs editing the same comment
concurrently resolve last-write-wins, and a comment deleted in one tab can
reappear if another tab still holding it in memory saves afterwards. Hosts
that need real multi-tab editing should persist through the callbacks
instead.

When the quota is reached, HellDots sheds the _automatic_ screenshots of the
oldest comments and retries, so the comments themselves survive. Screenshots a
user deliberately attached are never discarded. If you expect heavy use, wire
`onCommentCreated` to your own backend instead.

## Browser support

Modern evergreen browsers. The widget renders inside a Shadow DOM, so your
page's CSS cannot leak into it and its styles cannot leak out.

## ESM only

This package ships ES modules only. `import` works everywhere — bundlers, Vite,
Next.js, Node ≥ 18, native `<script type="module">`. There is no CommonJS
build, so `require("helldots")` will not work.

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
