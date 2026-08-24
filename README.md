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

`loadComments()` is safe to call at any point: made before the widget has
mounted, the data is held and applied at mount — though the counts come back
as zeroes, because nothing has been resolved against the DOM yet. Use
`onReady` when you want them:

```js
createCommentOverlay({
  onReady: async (overlay) => {
    const { orphaned } = overlay.loadComments(await api.get("/comments"));
    if (orphaned) console.info(`${orphaned} comments lost their element`);
  },
});
```

### Loading only the comment in a link

A corpus too big to ship on every page load can be fetched per page — but
then a shared "Copy link" URL points at a comment that is not in the set.
`onCommentRequested` fires for exactly that case, once per id:

```js
const overlay = createCommentOverlay({
  onCommentRequested: async (id) => {
    overlay.loadComments([await api.get(`/comments/${id}`)]);
  },
});

overlay.loadComments(await api.get(`/comments?page=${location.pathname}`));
```

Return a promise and the link is retried once it settles — the inbox opens on
the comment as soon as it lands. Until then it says the comment was not
found, rather than doing nothing.

To read the id yourself before any of this exists — to fetch that one comment
and nothing else — the package exports the reader the widget uses, so the
parameter name never has to be written twice:

```js
import { readCommentLinkParam, DEFAULT_LINK_PARAM } from "helldots";

const id = readCommentLinkParam(); // defaults to DEFAULT_LINK_PARAM
const only = id ? [await api.get(`/comments/${id}`)] : [];
```

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

## Identity

HellDots authenticates nobody. It takes whoever your app says is signed in
and records that:

```js
createCommentOverlay({
  user: { name: currentUser.fullName, id: currentUser.id },
});
```

`name` is the display name — it is what appears on every comment and reply.
`id` is optional, never rendered, and persisted as `authorId` on everything
that user creates. Pass it whenever two people on your team can share a
display name: without it they are indistinguishable in the record, and they
share one reaction.

```js
overlay.serializeComments()[0];
// { author: "Ana Pérez", authorId: "u_42", ... }
```

Both fields ride along in `serializeComments()` output, on comments and on
replies alike. **The display name travels with the record**, so a store that
holds nothing but comments — a database of its own, with no users table —
renders every author and every audit entry without a single lookup back into
your app. The id is opaque to HellDots: point it at your user table, at a
comments-only store, or at nothing. `authorId` is `null` when you pass no
`id`, and on records written before it existed — the field is additive, so no
stored corpus needs migrating.

What the denormalised name costs: a rename does not travel backwards. Old
comments keep the name that was current when they were written, which is what
an audit trail should do, and the id is what lets you reconcile if you want
the current one.

With no `id` at all, two people sharing a display name are one author. If your
app has no accounts, mint the id yourself — you control the key, the lifetime
and the consent story, which HellDots cannot:

```js
const KEY = "my-app-anon-id";
let id = localStorage.getItem(KEY);
if (!id) localStorage.setItem(KEY, (id = crypto.randomUUID()));
createCommentOverlay({ user: { name: typedName, id } });
```

Bear in mind what that identifies: a browser profile, not a person.

Whatever you declare here is taken at face value and stored as-is. The record
says what your application asserted about who acted; verifying that claim is
your backend’s job, and `onChange` carries every mutation to it.

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

The emoji button in a comment's action strip (or on a reply's meta line) is
where a reaction starts. Once there is one, a row of pills sits under the
comment — below its screenshot when it has one — and carries its own button for
adding another. Nothing is shown there until somebody reacts.

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

### Audit trail

Every comment carries an append-only log of what happened to it — who created
it, edited its text, moved its status or changed its classification, and when.
It shows up as a folded `History (n)` disclosure in the inbox detail, next to
the context block.

```js
overlay.serializeComments()[0].history;
// [
//   { type: "created",  at: "…", actor: { id: "u_42", name: "Ana Pérez" } },
//   { type: "status",   at: "…", actor: {…}, from: "open", to: "resolved" },
//   { type: "classified", at: "…", actor: {…}, field: "type", from: null, to: "bug" },
// ]
```

Replies and reactions are deliberately **not** in it. A reply already carries
its own author and timestamp and is visible in the thread; reactions are
high-frequency signal with no audit value. That bound is what keeps the log at
three to five entries per comment — a hundred comments’ worth of history costs
about what two automatic screenshots cost.

Resolution time is derived from this log rather than stored beside it, so a
comment that was resolved, reopened and resolved again reports the duration of
the resolution currently in force, and the superseded ones are listed under
**Previous resolutions** in the same disclosure.

Two things worth knowing before you rely on it:

- **It is attributive, not evidential.** HellDots authenticates nobody. The log
  records the `user` your app declared at the moment of the action, so it says
  what your application asserted about who acted — not a verified fact. Verify
  on your own backend if you need the stronger claim; `onChange` carries every
  mutation to it.
- **Timestamps come from the acting client’s clock.** Merge corpora written on
  machines whose clocks disagree and an entry can predate the comment it
  belongs to. Durations are clamped at zero rather than rendered negative.

A corpus written before the log existed loads unchanged with `history: null`,
and its comments render no disclosure — additive, so nothing needs migrating.

## Metrics and reports

The inbox header carries a **Metrics** button. It swaps the list for a
dashboard: totals, how many were resolved and how many came back, average and
median resolution time, bars per status, type and priority, and a daily
distribution. Each bar carries the colour its own picker uses, so a chip and
its bar read as the same thing.

The dashboard measures **what the panel is currently filtered to** — the
filter summary sits right above the figures, so they answer "what am I looking
at". For the unfiltered aggregate, ask the overlay:

```js
overlay.getMetrics();
// {
//   total: 42,
//   byStatus:   { open: 12, in_progress: 4, in_review: 2, resolved: 24 },
//   byType:     { bug: 18, suggestion: 9, question: 3, improvement: 4, unset: 8 },
//   byPriority: { high: 7, medium: 15, low: 6, unset: 14 },
//   overTime:   [{ date: "2026-08-18", count: 5 }, …],
//   resolution: { resolvedCount: 24, reopenedCount: 3,
//                 averageMs: 9000000, medianMs: 5400000 },
// }
```

Every bucket is present even when empty, so you can index it without guarding.
`overTime` lists only the days that saw activity — filling the gaps would put
a year of empty buckets between two comments twelve months apart.

### Exporting

Three buttons at the foot of the dashboard, and the same three as methods:

```js
overlay.exportCommentsCsv(); // helldots-comments.csv — one row per comment
overlay.exportMetricsCsv(); // helldots-metrics.csv  — section, key, value
overlay.printMetricsReport(); // the browser's print dialog → Save as PDF
```

Both CSV methods **return the same text they download**, so a host that wanted
to send those rows somewhere instead of handing the user a file does not have
to build them a second time:

```js
await api.post("/reports/comments", { csv: overlay.exportCommentsCsv() });
```

The CSVs are RFC 4180 with a UTF-8 BOM, so Excel opens them without turning
every accent into mojibake, and a value that would otherwise be evaluated as a
formula is neutralised on the way out. Headers are the internal field names
rather than translated labels: the file is an interchange format, and a column
whose spelling follows the widget's locale cannot be joined against anything.
Screenshots stay out — a 33 KB base64 string in a spreadsheet cell is not data.

The PDF is the browser's. HellDots builds the report in its own document and
asks that document to print, so "Save as PDF" in the dialog gives you a real
one at no cost in bundle size — the lightest PDF library measured 133 KB gzip
against a 50 KB budget. What prints is the report, not the page behind it.

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

| Option                  | Type                                 | Default             |                                                                   |
| ----------------------- | ------------------------------------ | ------------------- | ----------------------------------------------------------------- |
| `user`                  | `{ name: string, id?: string }`      | `"Anonymous"`       | Author of new comments and replies; `id` persists as `authorId`   |
| `persistence`           | `"localStorage"` \| `"none"`         | `"none"`            | Auto save/restore, or handle it yourself via callbacks            |
| `autoScreenshot`        | `boolean`                            | `true`              | Capture a screenshot and environment snapshot per comment         |
| `embedCrossOriginFonts` | `boolean`                            | `false`             | Fetch unreadable stylesheets so their web fonts reach the capture |
| `locale`                | `string`                             | browser language    | `"en"` and `"es"` ship; anything else falls back per key          |
| `linkParam`             | `string`                             | `"helldotsComment"` | Query param used by "Copy link" URLs                              |
| `navigate`              | `(page: string) => void`             | full page load      | SPA router hook for the widget's cross-page jumps                 |
| `onReady`               | `(overlay) => void`                  | —                   | Widget mounted; the safe place to `loadComments()`                |
| `onError`               | `(error, context) => void`           | —                   | A survivable failure — capture, storage, load or link             |
| `onCommentRequested`    | `(id) => void \| Promise`            | —                   | A link points at a comment the widget does not hold               |
| `transformScreenshot`   | `(dataUrl, info) => Promise<string>` | —                   | Swap every image the widget acquires for a string of your own     |
| `onCommentModeChanged`  | `(active: boolean) => void`          | —                   | Comment mode turned on or off, however it was flipped             |
| `onCommentOpened`       | `(comment) => void`                  | —                   | Somebody opened a comment's thread — build unread counts on this  |
| `autoDetectNavigation`  | `boolean`                            | `false`             | Run `notifyNavigation()` on popstate (back/forward)               |
| `shortcutKey`           | `string`                             | `"c"`               | Key that toggles comment mode                                     |
| `shortcutModifier`      | `"alt"` \| `"ctrl"` \| `"shift"`     | `"alt"`             | Modifier for that key                                             |
| `autoInit`              | `boolean`                            | `true`              | When `false`, returns an initializer to call yourself             |

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

Every one of them ends with a `meta` argument (the same fields are flattened
onto the `onChange` event), so an existing handler that ignores it keeps
working unchanged.

| Callback                                  | Fires when                                                     |
| ----------------------------------------- | -------------------------------------------------------------- |
| `onCommentCreated(comment, meta)`         | A new comment is saved                                         |
| `onReplyAdded(comment, reply, meta)`      | A reply is added to any comment                                |
| `onReplyDeleted(comment, reply, meta)`    | A reply is removed                                             |
| `onCommentEdited(comment, meta)`          | A comment's text is rewritten                                  |
| `onReplyEdited(comment, reply, meta)`     | A reply's text is rewritten                                    |
| `onCommentStatusChanged(comment, meta)`   | Status moves along the lifecycle                               |
| `onCommentUpdated(comment, meta)`         | Type, priority or tags change                                  |
| `onCommentDeleted(id, meta)`              | A comment is removed                                           |
| `onAnchorLost(comment, meta)`             | A comment could not be re-anchored                             |
| `onReactionToggled(comment, reply, meta)` | A reaction is added or removed (`reply` is `null` at the root) |

Five more do not report a change to a comment:

| Callback                       | Fires when                                                      |
| ------------------------------ | --------------------------------------------------------------- |
| `onReady(overlay)`             | The widget has mounted and every method is safe to call         |
| `onError(error, context)`      | Something survivable went wrong — see below                     |
| `onCommentRequested(id)`       | A link points at a comment the widget does not hold — see below |
| `onCommentModeChanged(active)` | Comment mode turned on or off — see below                       |
| `onCommentOpened(comment)`     | Somebody opened a comment's thread — see below                  |

#### `meta.origin` — who caused the change

`"user"` is somebody acting inside the widget; `"host"` is your own code
calling a method. The inbox and the thread popover drive the very same public
methods you do, so this is the only thing that tells the two apart.

It matters as soon as more than one person is looking. Applying a change that
arrived over a socket means calling `setCommentStatus()` — which emits, which
sends it straight back to the server:

```js
createCommentOverlay({
  onChange: (event) => {
    if (event.origin === "host") return; // our own write, echoed back
    api.post("/helldots-events", event);
  },
});

socket.on("comment:resolved", ({ id }) =>
  overlay.setCommentStatus(id, "resolved")
);
```

Without the guard that loop runs forever. `comment:anchor-lost` is always
`"host"` too, so this also silences the repeat every `notifyNavigation()`
produces for a comment whose element is not on the new page.

#### `meta.from` / `meta.to` — what moved

`comment:status-changed` carries both ends of the move, and `comment:updated`
adds `field` to say which of the three it was about:

```js
onCommentStatusChanged: (comment, { from, to }) => {
  if (from === "resolved") notify(`${comment.author} reopened this`);
},
onCommentUpdated: (comment, meta) => {
  if (meta.field === "priority" && meta.to === "high") page(comment);
},
```

`field` narrows `from` and `to` for you in TypeScript. Re-applying a value a
comment already holds is a no-op: no event, no write.

#### `onCommentModeChanged` and `onCommentOpened`

Comment mode is the one the host cannot observe on its own: the keyboard
shortcut never reaches your code, so an app that has to stand down while
somebody is picking an element has no other signal.

```js
onCommentModeChanged: (active) => {
  carousel.paused = active; // your drag-and-drop would fight the picker
},
```

`onCommentOpened` fires when a thread is actually read — from its marker or
from the inbox detail, the only two places the replies are visible. It does
not fire when the inbox merely re-renders. HellDots stores no read state of
its own, because whose "read" it is depends on an identity only you can
persist:

```js
onCommentOpened: (comment) => api.post(`/comments/${comment.id}/read`),
```

#### `onError(error, context)`

Failures the widget survives but you would otherwise only find in the
console: `"capture"` (a screenshot did not render — the comment saves without
one), `"storage"` (localStorage could not be written, so this browser's copy
now diverges), `"load"` (a malformed record was skipped), `"link"` (an
`onCommentRequested` handler threw or rejected). The console warning stays
either way.

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
overlay.setUser(user); // → boolean (null returns to the anonymous author)
overlay.exportCommentsCsv(comments?); // → string (and downloads it)
overlay.exportMetricsCsv(comments?); // → string (and downloads it)
overlay.cleanup(); // remove the widget entirely
```

Two module-level helpers come with the package, for reading a deep link
before an overlay exists:

```ts
import { readCommentLinkParam, DEFAULT_LINK_PARAM } from "helldots";

DEFAULT_LINK_PARAM; // "helldotsComment"
readCommentLinkParam(param?, href?); // → string | null
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
