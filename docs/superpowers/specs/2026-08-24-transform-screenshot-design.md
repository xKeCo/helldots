# `transformScreenshot` — a seam for the images the widget produces — design

Date: 2026-08-24
Status: approved, ready for implementation

Give the host a chance to replace every image the widget acquires with
something of its own — typically a blob-storage URL — before that image
becomes part of a record.

This is the smaller half of the "P3" pair identified in the callback audit.
The other half — asynchronous creation with a pending/failed marker state —
is deliberately **not** in this spec. It touches the marker engine, i18n,
styles, accessibility and persistence, and has design forks of its own. It
gets its own spec.

## Problem

Every image HellDots produces is stored as a base64 data URL inside the
comment record:

- `comment.contextScreenshot` — the automatic viewport JPEG, roughly 33 KB
- `comment.screenshots[]` — drag-crop PNGs and file attachments
- `reply.screenshots[]` — file attachments on a reply

That is already known to be a problem inside the widget: `storage.js` sheds
`contextScreenshot` one comment at a time when a localStorage write hits the
quota, oldest first, precisely because these strings are what blows through
it.

Outside the widget it is worse, and there is no mitigation at all. A host
following the README's `api.post("/comments", comment)` sends a ~33 KB base64
string per comment into its own database — into a JSON column, in the common
case. A real app wants that JPEG in object storage with a URL in the record.

Today it cannot get one. `onCommentCreated` fires with the data URL already
embedded, and there is no `updateComment` to swap the field afterwards. The
only route is to POST the fat record and then patch it — two writes, and the
fat one already happened.

## Non-goals

- **Not a storage backend.** HellDots uploads nothing and knows nothing about
  where the image goes. It hands over a string and takes one back.
- **Not applied to `loadComments()`.** Those records come from the host
  already.
- **Not applied to a programmatic `addReply(comment, text, screenshots)`.**
  The host passing that array already holds the data URLs and can upload them
  before calling. See "Where it runs" for why this matters.
- **No timeout, no spinner, no retry.** Covered under "Accepted limitations".

## API

```ts
transformScreenshot?: (
  dataUrl: string,
  info: {
    kind: "context" | "attachment";
    commentId: CommentId;
  }
) => Promise<string>;
```

Returns the string to store in place of the data URL.

`kind` separates the two things a host treats differently: `"context"` is the
automatic viewport capture, which is disposable and regenerable, while
`"attachment"` is something a person chose to include. Different buckets and
different retention are the reason this field exists; without it the host
would have to guess from the MIME prefix.

`commentId` is the comment the image will belong to — for a reply attachment,
the parent comment. It is always present, which requires one change to the
save path: `_saveCommentNow` currently generates the id while building the
comment object, *after* awaiting the capture. The id generation moves ahead of
the transform so the host can name the blob after the comment it belongs to.

Only two kinds, deliberately. A third for reply attachments was considered and
dropped: a reply attachment is a user attachment, and any retention policy
that applies to one applies to the other.

## Where it runs

Five paths put an image into the model. Mapping them showed that three
converge on `_pendingScreenshots`, so they are covered by one call:

| Path                                  | Transforms | Call site              |
| ------------------------------------- | ---------- | ---------------------- |
| Automatic viewport capture            | on save    | `_saveCommentNow`      |
| Drag-crop region                      | on save    | `_saveCommentNow`      |
| File picker, comment box              | on save    | `_saveCommentNow`      |
| File picker, reply in thread popover  | on attach  | `wireScreenshotInput`  |
| File picker, reply in inbox detail    | on attach  | `wireScreenshotInput`  |

Three call sites. `wireScreenshotInput` gains an optional fourth parameter
used by exactly the two reply surfaces; the comment box omits it, because its
array is transformed at save time anyway.

### Why the timing is not uniform

The right rule is "transform at the last moment before the image becomes part
of a record". For a comment that is `_saveCommentNow`, which is already
`async` because it awaits the pending capture — so the transform costs no new
asynchrony and, crucially, a comment the user abandons with Escape uploads
nothing.

For a reply that would be `addReply()`, which is **synchronous** and returns
`CommentReply | null`. Making it await an upload changes its return type to a
promise and breaks every existing consumer, including the three internal ones.
This repo does not break consumers for a convenience — that is the same call
`DECISIONS.md` recorded when `onChange` was added and the nine callbacks were
kept.

So reply attachments transform when they are attached. The rule that comes out
of it is still enunciable: **every image the widget itself acquires passes
through the hook.** An `addReply()` the host calls with its own array does
not, and does not need to.

Uploads for one comment run in parallel (`Promise.all`) — up to six images,
one wait.

## Failure

Fail-open. A rejected promise, a thrown handler, or a resolved value that is
not a non-empty string leaves the original data URL in place and reports:

```js
onError(error, "transform");
```

`"transform"` is a new `ErrorContext`, not a reuse of `"capture"`: the capture
succeeded and the upload did not, and a host routing on context has to be able
to tell a broken renderer from a broken bucket.

The trade-off this accepts, stated plainly: a host whose storage is down will
receive fat records rather than none. Losing the user's comment, or silently
losing their screenshot, are both worse.

## Data flow

Nothing about the shape of a record changes. `contextScreenshot` and
`screenshots[]` are strings before and after; what changes is that the string
may now be a URL instead of `data:image/jpeg;base64,…`. Every consumer —
`<img src>`, the lightbox, the CSV export that already excludes them — keeps
working untouched.

With no handler configured, behaviour is identical to today's.

## One small addition

Saving now waits on the network. The submit button currently stays enabled
during a save and `_saving` silently ignores the second click; with a
three-second upload behind it that is a dead click. The button is disabled for
the duration.

No new strings and no new styles — `disabled` only, which the existing
stylesheet already covers.

## Accepted limitations

- **A reply attachment in an abandoned draft leaves an orphan blob.** The user
  attaches an image, then closes the popover without submitting. Collectable
  from the host's side by sweeping unreferenced blobs. It cannot happen for
  comments, which transform at save.
- **No timeout.** The host owns the promise and can impose its own with
  `AbortSignal.timeout()`. A deadline imposed by the widget would discard an
  upload that was about to succeed, and the widget has no basis for choosing
  the number.
- **No progress indication.** A spinner means new UI, new strings in both
  locales, new styles and an accessibility pass — disproportionate to the
  feature. The disabled submit button is the whole of the feedback.

## Testing

- The transform is applied to `contextScreenshot`, to a drag-crop attachment,
  and to a comment-box file attachment — all at save.
- The transform is applied to a reply attachment at attach time, on both reply
  surfaces.
- `kind` is `"context"` for the automatic capture and `"attachment"` for
  everything else; `commentId` is the comment the image belongs to, and the
  parent for a reply attachment.
- A rejected handler keeps the original data URL and fires
  `onError(err, "transform")`.
- A handler resolving to a non-string, an empty string, or throwing
  synchronously is treated the same way as a rejection.
- With no handler, records are byte-identical to today's.
- Six images on one comment are transformed in parallel, not in series.
- The submit button is disabled while a save is in flight and re-enabled
  after, including when the transform failed.
