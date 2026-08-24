export interface CommentAnchorFingerprint {
  tagName: string;
  /** First ~64 chars of the element's normalized textContent. */
  textSnippet: string;
  /** Stable attributes only (id, name, role, aria-label, non-framework data-*). */
  attributes: Record<string, string>;
  /** 0-based position among same-tag siblings at creation time. */
  siblingIndex: number;
  siblingCount: number;
}

export interface CommentAnchor {
  version: 1;
  /** Best-effort unique CSS selector, or null when none could be generated. */
  selector: string | null;
  /** Selector for the exact clicked element when deeper than the container. */
  targetSelector?: string | null;
  fingerprint: CommentAnchorFingerprint;
  /** Fraction (0–1) of the anchor element's box, captured at creation. */
  relativeX: number;
  relativeY: number;
}

export type AnchorState = "anchored" | "orphaned" | "inactive";

/** RF09 — comment lifecycle state. */
export type CommentStatus = "open" | "in_progress" | "in_review" | "resolved";

/** RF3 — comment category. `null` means deliberately unclassified. */
export type CommentType = "bug" | "suggestion" | "question" | "improvement";

/** RF4 — comment priority. `null` means deliberately unprioritised. */
export type CommentPriority = "high" | "medium" | "low";

/**
 * Aggregate figures over a corpus of comments. Every bucket is present even
 * when empty, so a consumer can index it without guarding — an absent key and
 * a zero would otherwise be indistinguishable.
 */
export interface CommentMetrics {
  total: number;
  byStatus: Record<CommentStatus, number>;
  /** `unset` holds the comments left deliberately unclassified. */
  byType: Record<CommentType | "unset", number>;
  /** `unset` holds the comments left deliberately unprioritised. */
  byPriority: Record<CommentPriority | "unset", number>;
  /**
   * Comments created per day, oldest first, in `YYYY-MM-DD`. Only days that
   * saw activity get an entry: filling the gaps would put a year of empty
   * buckets between two comments twelve months apart.
   */
  overTime: Array<{ date: string; count: number }>;
  resolution: {
    resolvedCount: number;
    /** Comments that were resolved, reopened and resolved again. */
    reopenedCount: number;
    /** Mean and median of the resolution currently in force, or null when nothing is resolved. */
    averageMs: number | null;
    medianMs: number | null;
  };
}

/** Who performed an audited action, as the host declared them at the time. */
export interface AuditActor {
  /** From `user.id`, when the host supplies one. Never rendered. */
  id?: string;
  /** The display name at the time of the action. */
  name: string;
}

/**
 * The four actions worth auditing. Replies carry their own author and
 * timestamp already, and reactions are high-frequency signal with no audit
 * value — neither produces an entry.
 */
export type AuditEventType = "created" | "edited" | "status" | "classified";

/** One entry of a comment's append-only audit trail. */
export interface AuditEvent {
  type: AuditEventType;
  /**
   * ISO timestamp, from the acting client's clock. Merge corpora written on
   * machines whose clocks disagree and an entry can predate the comment it
   * belongs to; durations derived from these are clamped at zero rather than
   * rendered negative.
   */
  at: string;
  actor: AuditActor;
  /** "classified" only: which field moved. */
  field?: "type" | "priority" | "tags";
  /**
   * Both ends of the transition, for "status" and for "classified" on type or
   * priority. `null` is a value, not an absence — it is how type and priority
   * read when deliberately unset. Absent for "created", "edited", and for a
   * tag change, which is a list with no two-value transition.
   */
  from?: string | null;
  to?: string | null;
}

/** RF2 — environment snapshot taken when the comment was created. */
export interface CommentContext {
  version: 1;
  /** Full location.href at creation time. */
  url: string;
  viewport: { width: number; height: number };
  /** Screen resolution (screen.width/height). */
  screen: { width: number; height: number };
  devicePixelRatio: number;
  /** Raw UA — always stored, even when browser/os parsing fails. */
  userAgent: string;
  browser: { name: string; version: string };
  os: { name: string; version: string };
  language: string;
}

/**
 * Identifier of a comment or a reply.
 *
 * New ids are 21-character nanoid strings. The `number` arm is not legacy
 * cruft to be removed later: comments created before that change are still
 * sitting in hosts' localStorage and in their own back ends, and they keep
 * resolving. Compare ids with `String(a) === String(b)` rather than `===`
 * when either side may have crossed a JSON or URL boundary.
 */
export type CommentId = string | number;

export interface SerializedComment {
  /**
   * Version of this serialized shape. Stamped as 1 by serializeComments;
   * optional because payloads persisted before it existed have none.
   */
  schemaVersion?: number;
  id: CommentId;
  text: string;
  /** ISO timestamp of the last edit; null when never edited. */
  editedAt?: string | null;
  anchor: CommentAnchor | null;
  /** location.pathname where the comment was created. */
  page: string;
  /**
   * Append-only audit trail: who created, edited, moved or reclassified this
   * comment, and when. Optional and absent by default — records written
   * before it existed simply have none, so no migration is involved, and
   * `null` rather than `[]` keeps an untouched corpus free of extra bytes.
   *
   * Every resolution the comment has had is derivable from the `status`
   * entries, which is why no separate resolution history is stored.
   */
  history?: AuditEvent[] | null;
  replies: CommentReply[];
  author: string;
  /**
   * Stable identifier of the author, from the `user.id` the host supplied at
   * creation. Optional and absent by default: records written before it
   * existed simply have none, so no migration is involved.
   *
   * Never rendered — `author` is the display name and stays what any UI
   * shows — it travels with the record, so a store that holds nothing but
   * comments renders every author without a lookup. The id is opaque to
   * HellDots: whether it points into the host's user table, into a
   * comments-only database, or nowhere at all is the host's business. What it
   * buys is telling two teammates who share a display name apart.
   */
  authorId?: string | null;
  createdAt: string;
  screenshots: string[];
  status: CommentStatus;
  /** RF3 — `null` when deliberately unclassified. */
  type: CommentType | null;
  /** RF4 — `null` when deliberately unprioritised. */
  priority: CommentPriority | null;
  /**
   * RF3 — free-form labels. `setCommentTags` normalises them (trimmed,
   * lowercased, de-duplicated); values loaded via `loadComments` are
   * trusted as-is and are not renormalised on read.
   */
  tags: string[];
  /** RF5 — set on entering "resolved", cleared on leaving it. */
  resolvedAt: string | null;
  /** RF2 — environment snapshot taken at creation. */
  context: CommentContext | null;
  /** RF1 — automatic viewport capture (JPEG data-URL). */
  contextScreenshot: string | null;
  /**
   * RF6 — emoji → the actor keys that reacted (see the `user` option). Always
   * one of the six emoji in the fixed set; anything else is dropped on load.
   * Null when nobody has reacted, so an untouched corpus carries no extra
   * payload.
   */
  reactions: Record<string, string[]> | null;
}

/**
 * Who caused a change.
 *
 * `"user"` is somebody acting inside the widget — a marker, the thread
 * popover, the inbox. `"host"` is the app's own code calling a method.
 *
 * The distinction exists for multi-user apps. Applying a change that arrived
 * over a socket means calling the same method the UI calls, so without this
 * every host has to wrap its own writes in a flag to avoid echoing them
 * straight back to the server. `if (meta.origin === "host") return;` is that
 * flag, and it is now the library's job to provide it.
 */
export type ChangeOrigin = "user" | "host";

/** Which part of the widget a reported failure came from. */
export type ErrorContext =
  /** A screenshot render failed; the comment saves without one. */
  | "capture"
  /** localStorage could not be written; this browser's copy now diverges. */
  | "storage"
  /** A record handed to loadComments was malformed and was skipped. */
  | "load"
  /** An `onCommentRequested` handler threw or rejected. */
  | "link";

/**
 * What every change carries, whatever its type. Delivered as one trailing
 * argument to the specific callbacks, and flattened onto the `onChange`
 * event next to `comment`/`reply`/`id`.
 */
export interface ChangeMeta {
  origin: ChangeOrigin;
}

/** `comment:status-changed` — both ends of the move along the lifecycle. */
export interface StatusChangeMeta extends ChangeMeta {
  from: CommentStatus;
  to: CommentStatus;
}

/**
 * `comment:updated` — which of the three fields moved, and both ends of the
 * move. Discriminated on `field`, so narrowing gives you correctly typed
 * `from`/`to` for each.
 */
export type UpdateMeta = ChangeMeta &
  (
    | { field: "type"; from: CommentType | null; to: CommentType | null }
    | {
        field: "priority";
        from: CommentPriority | null;
        to: CommentPriority | null;
      }
    | { field: "tags"; from: string[]; to: string[] }
  );

/**
 * Everything that can change, as one discriminated union. Switch on `type`
 * and TypeScript narrows the rest of the fields for you.
 *
 * The ten specific callbacks below carry exactly the same events at
 * exactly the same moments, with the same metadata; subscribe either way,
 * or both.
 */
export type ChangeEvent =
  | ({ type: "comment:created"; comment: SerializedComment } & ChangeMeta)
  | ({ type: "comment:edited"; comment: SerializedComment } & ChangeMeta)
  | ({ type: "comment:deleted"; id: CommentId } & ChangeMeta)
  | ({
      type: "comment:status-changed";
      comment: SerializedComment;
    } & StatusChangeMeta)
  /** Type, priority or tags changed; `field` says which. */
  | ({ type: "comment:updated"; comment: SerializedComment } & UpdateMeta)
  | ({ type: "comment:anchor-lost"; comment: SerializedComment } & ChangeMeta)
  | ({
      type: "reply:added";
      comment: SerializedComment;
      reply: CommentReply;
    } & ChangeMeta)
  | ({
      type: "reply:deleted";
      comment: SerializedComment;
      reply: CommentReply;
    } & ChangeMeta)
  | ({
      type: "reply:edited";
      comment: SerializedComment;
      reply: CommentReply;
    } & ChangeMeta)
  /** `reply` is null when the reaction is on the root comment. */
  | ({
      type: "reaction:toggled";
      comment: SerializedComment;
      reply: CommentReply | null;
    } & ChangeMeta);

export interface CommentOverlayOptions {
  shortcutKey?: string;
  shortcutModifier?: "alt" | "ctrl" | "shift";
  autoInit?: boolean;
  /**
   * UI language. "en" and "es" ship today; any other value falls back to
   * English (and a locale missing individual keys falls back per key).
   * Typed as string so a host can pass a runtime-detected code without a
   * cast — an unknown code degrades, it never breaks.
   */
  locale?: string;
  /** Auto save/restore comments. Default: "none" (host app persists via callbacks). */
  persistence?: "localStorage" | "none";
  /** Capture a viewport screenshot and environment snapshot on every new comment. Default: true. */
  autoScreenshot?: boolean;
  /**
   * Fetch stylesheets the renderer cannot read, so their web fonts survive
   * into screenshots. Default: false.
   *
   * A cross-origin `<link>` (Google Fonts and friends) throws `SecurityError`
   * on `cssRules`, so its `@font-face` never reaches the capture and the text
   * is rendered in a fallback face. The fallback's metrics differ, which
   * shifts glyphs sideways — a drag selection tight around a few letters then
   * comes back holding the wrong ones. Enabling this re-fetches those sheets
   * (the same URLs the page already loaded, cached per session) so the
   * capture matches the page.
   *
   * Off by default because a comment widget making third-party requests
   * should be the host's decision. Leave it off and captures of such a page
   * stay misaligned; a host can also fix it at the source by self-hosting the
   * font or adding `crossorigin` to the `<link>`.
   */
  embedCrossOriginFonts?: boolean;
  /**
   * Identity used as the author of new comments and replies.
   *
   * `name` is what gets displayed. `id` is optional and never rendered: it
   * is persisted as `authorId` on the comments and replies this user creates,
   * and it is what a reaction is keyed on — so two teammates who share a
   * display name are still told apart. Without it the name is used, and
   * without any `user` at all every actor collapses into one.
   *
   * HellDots authenticates nobody: whatever the host declares here is taken
   * at face value and recorded as-is.
   */
  user?: { name: string; id?: string };
  /**
   * Query parameter carrying a comment id in "Copy link" URLs, and read back
   * on startup to open that comment. Default: "helldotsComment". Override it
   * when the host already routes on that name.
   */
  linkParam?: string;
  /**
   * Called instead of a full-page load when the widget navigates to another
   * page (the inbox's "view on its page" jump). Hand it your SPA router's
   * push so the app's state survives; call `notifyNavigation()` after the
   * route renders.
   */
  navigate?: (page: string) => void;
  /**
   * Run `notifyNavigation()` automatically on popstate (back/forward).
   * Opt-in and popstate-only: pushState routing still needs an explicit
   * `notifyNavigation()` call from the router's hook. Default: false.
   */
  autoDetectNavigation?: boolean;
  /**
   * Called once the widget has mounted and every method on it is safe to
   * drive. Receives the instance, because when the document is already
   * parsed the mount happens inside the constructor — before
   * `createCommentOverlay()` has returned anything to assign.
   *
   * This is the right place to `loadComments()`: a call made earlier is held
   * and replayed here, but it can only return zeroes until then.
   */
  onReady?: (overlay: CommentOverlay) => void;
  /**
   * Called when something the widget survived nonetheless went wrong: a
   * screenshot that failed to render, a localStorage write that could not be
   * made, a malformed record skipped on load, a rejected
   * `onCommentRequested`. Each of these already warns on the console and the
   * widget carries on regardless — this is how they reach the host's own
   * logging instead of only a devtools panel nobody has open.
   */
  onError?: (error: unknown, context: ErrorContext) => void;
  /**
   * Called when a "Copy link" URL points at a comment the widget does not
   * hold — once per id, not once per attempt.
   *
   * This is what makes lazy loading work: fetch that one comment and hand it
   * to `loadComments()`, and the inbox opens on it. Return a promise and the
   * link is retried once it settles. Without a handler the inbox still opens
   * and says the comment was not found.
   */
  onCommentRequested?: (id: CommentId) => void | Promise<unknown>;
  /**
   * Called whenever comment mode turns on or off, however it was flipped —
   * the toolbar button, the keyboard shortcut, the inbox empty state, or the
   * automatic switch-off after a comment is saved.
   *
   * The shortcut is the reason this exists: the host never sees that
   * keystroke, so an app that needs to stand down while the user is picking
   * an element — pause a carousel, disable its own drag-and-drop, dim a
   * layer — has no other way to know.
   */
  onCommentModeChanged?: (active: boolean) => void;
  /**
   * Called when somebody opens a comment's full thread, from its marker or
   * from the inbox detail — the only two places the replies are readable.
   *
   * This is what an unread count is built on. HellDots keeps no read state
   * of its own: whose "read" it is depends on an identity only the host can
   * persist.
   */
  onCommentOpened?: (comment: SerializedComment) => void;
  /**
   * Single subscription point: fires for every change, alongside whichever
   * specific callback below carries the same event. Handy when a host syncs
   * everything to one endpoint instead of wiring nine functions. A handler
   * that throws is caught and warned about — it never rolls back the
   * mutation that emitted it.
   *
   * The event carries `origin` (and, where there is one, the transition that
   * caused it) flattened onto it — see `ChangeMeta`.
   */
  onChange?: (event: ChangeEvent) => void;
  /** Fired after a new comment is saved. */
  onCommentCreated?: (comment: SerializedComment, meta: ChangeMeta) => void;
  /** Fired after a reply is added to any comment. */
  onReplyAdded?: (
    comment: SerializedComment,
    reply: CommentReply,
    meta: ChangeMeta
  ) => void;
  /** Fired after deleteReply removes a reply. */
  onReplyDeleted?: (
    comment: SerializedComment,
    reply: CommentReply,
    meta: ChangeMeta
  ) => void;
  /** Fired after editComment rewrites a comment's text. */
  onCommentEdited?: (comment: SerializedComment, meta: ChangeMeta) => void;
  /** Fired after editReply rewrites a reply's text. */
  onReplyEdited?: (
    comment: SerializedComment,
    reply: CommentReply,
    meta: ChangeMeta
  ) => void;
  /**
   * Fired for each comment that could not be re-anchored — by loadComments,
   * and again by every notifyNavigation that lands somewhere its element
   * does not exist. Those repeats always carry `origin: "host"`.
   */
  onAnchorLost?: (comment: SerializedComment, meta: ChangeMeta) => void;
  /** Fired after deleteComment removes a comment. */
  onCommentDeleted?: (id: CommentId, meta: ChangeMeta) => void;
  /**
   * Fired after setCommentStatus changes a comment's lifecycle state.
   * `meta.from`/`meta.to` are both ends of the move, so "reopened" and
   * "resolved" are told apart without diffing against a previous copy.
   */
  onCommentStatusChanged?: (
    comment: SerializedComment,
    meta: StatusChangeMeta
  ) => void;
  /**
   * Fired after type, priority or tags change on any comment. `meta.field`
   * says which one moved, and narrows `meta.from`/`meta.to` with it.
   */
  onCommentUpdated?: (comment: SerializedComment, meta: UpdateMeta) => void;
  /**
   * Fired after a reaction is added to or removed from a comment or a reply.
   * `reply` is null when the reaction is on the root comment.
   */
  onReactionToggled?: (
    comment: SerializedComment,
    reply: CommentReply | null,
    meta: ChangeMeta
  ) => void;
}

export interface CommentReply {
  id: CommentId;
  text: string;
  author: string;
  /**
   * Stable identifier of the author, from the `user.id` the host supplied at
   * creation. Optional and absent by default: records written before it
   * existed simply have none, so no migration is involved.
   *
   * Never rendered — `author` is the display name and stays what any UI
   * shows — it travels with the record, so a store that holds nothing but
   * comments renders every author without a lookup. The id is opaque to
   * HellDots: whether it points into the host's user table, into a
   * comments-only database, or nowhere at all is the host's business. What it
   * buys is telling two teammates who share a display name apart.
   */
  authorId?: string | null;
  timestamp: string;
  screenshots?: string[];
  /** ISO timestamp of the last edit; null when never edited. */
  editedAt?: string | null;
  /**
   * RF6 — emoji → the actor keys that reacted. Same shape and same rules as a
   * comment's; null when nobody has reacted.
   */
  reactions?: Record<string, string[]> | null;
}

export interface Comment {
  id: CommentId;
  text: string;
  /** ISO timestamp of the last edit; null when never edited. */
  editedAt?: string | null;
  /** Live anchor element; null while the comment is orphaned or inactive. */
  container: HTMLElement | null;
  relativeX: number;
  relativeY: number;
  anchor: CommentAnchor | null;
  anchorState: AnchorState;
  /** Runtime-only: anchor element currently has zero size (not serialized). */
  hidden: boolean;
  /** Runtime-only: exact element the user clicked on (not serialized). */
  target?: HTMLElement | null;
  /** location.pathname where the comment was created. */
  page: string;
  /**
   * Append-only audit trail: who created, edited, moved or reclassified this
   * comment, and when. Optional and absent by default — records written
   * before it existed simply have none, so no migration is involved, and
   * `null` rather than `[]` keeps an untouched corpus free of extra bytes.
   *
   * Every resolution the comment has had is derivable from the `status`
   * entries, which is why no separate resolution history is stored.
   */
  history?: AuditEvent[] | null;
  replies: CommentReply[];
  author: string;
  /**
   * Stable identifier of the author, from the `user.id` the host supplied at
   * creation. Optional and absent by default: records written before it
   * existed simply have none, so no migration is involved.
   *
   * Never rendered — `author` is the display name and stays what any UI
   * shows — it travels with the record, so a store that holds nothing but
   * comments renders every author without a lookup. The id is opaque to
   * HellDots: whether it points into the host's user table, into a
   * comments-only database, or nowhere at all is the host's business. What it
   * buys is telling two teammates who share a display name apart.
   */
  authorId?: string | null;
  createdAt: string;
  screenshots: string[];
  status: CommentStatus;
  /** RF3 — `null` when deliberately unclassified. */
  type: CommentType | null;
  /** RF4 — `null` when deliberately unprioritised. */
  priority: CommentPriority | null;
  /**
   * RF3 — free-form labels. `setCommentTags` normalises them (trimmed,
   * lowercased, de-duplicated); values loaded via `loadComments` are
   * trusted as-is and are not renormalised on read.
   */
  tags: string[];
  /** RF5 — set on entering "resolved", cleared on leaving it. */
  resolvedAt: string | null;
  /** RF2 — environment snapshot taken at creation. */
  context: CommentContext | null;
  /** RF1 — automatic viewport capture (JPEG data-URL). */
  contextScreenshot: string | null;
  /**
   * RF6 — emoji → the actor keys that reacted (see the `user` option). Always
   * one of the six emoji in the fixed set; anything else is dropped on load.
   * Null when nobody has reacted, so an untouched corpus carries no extra
   * payload.
   */
  reactions: Record<string, string[]> | null;
}

export declare class CommentOverlay {
  comments: Comment[];
  commentMode: boolean;

  constructor(options?: Omit<CommentOverlayOptions, "autoInit">);

  toggleCommentMode(): void;
  /**
   * `screenshots` are data-URLs attached to the reply. Takes the live
   * comment or its id; null when an id does not resolve.
   */
  addReply(
    comment: Comment | CommentId,
    text: string,
    screenshots?: string[]
  ): CommentReply | null;
  deleteReply(commentId: CommentId, replyId: CommentId): boolean;
  /** Rewrites a comment's text. False when the id is unknown, the text is blank, or nothing changed. */
  editComment(id: CommentId, text: string): boolean;
  /** Rewrites a reply's text. Same contract as editComment. */
  editReply(commentId: CommentId, replyId: CommentId, text: string): boolean;
  /** The shareable URL for a comment, or null when the id is unknown. */
  commentLink(id: CommentId): string | null;
  serializeComments(): SerializedComment[];
  /**
   * Called before the widget has mounted — possible when a fetch resolves
   * while the document is still parsing — the data is held and applied at
   * mount, and the counts come back as zeroes because nothing has been
   * resolved yet. Load from `onReady` when the counts matter.
   */
  loadComments(data: SerializedComment[]): {
    anchored: number;
    orphaned: number;
    inactive: number;
  };
  /**
   * Re-syncs the widget after a client-side navigation: reclassifies every
   * comment against the new pathname, re-resolves anchors against the new
   * DOM, rebuilds markers and moves the inbox onto the new page. Also the
   * "re-anchor now" primitive for same-path re-renders.
   */
  notifyNavigation(): {
    anchored: number;
    orphaned: number;
    inactive: number;
  };
  deleteComment(id: CommentId): boolean;
  /**
   * Removes every comment at once (markers, memory, and their persisted
   * entries in localStorage mode). A bulk reset for reconciling against a
   * backend before loadComments — fires no per-comment callbacks.
   */
  clearComments(): void;
  /**
   * Aggregate figures over every comment the widget holds. Unfiltered: the
   * dashboard inside the inbox measures whatever that panel is showing, but a
   * host has no notion of those filters.
   */
  getMetrics(): CommentMetrics;
  /**
   * Downloads the corpus as CSV, one row per comment, and returns the same
   * text. Screenshots and the automatic context capture stay out. Defaults
   * to every comment.
   *
   * The return value is for a host that wanted to POST those rows somewhere
   * or attach them to a message: a browser download is a dead end, and
   * building the CSV a second time is the only alternative.
   */
  exportCommentsCsv(comments?: SerializedComment[]): string;
  /**
   * Downloads the aggregate figures as CSV in long format — `section, key,
   * value` — so the column count does not change with the corpus. Returns
   * the same text, for the same reason as above.
   */
  exportMetricsCsv(comments?: SerializedComment[]): string;
  /**
   * Opens the browser's print dialog on a report of the figures, which is
   * where "save as PDF" lives. The report is built in its own document, so
   * what prints is the report rather than the host page.
   */
  printMetricsReport(comments?: SerializedComment[], scope?: string): void;
  /**
   * Replaces the identity new comments, replies and reactions are attributed
   * to. Everything already recorded keeps the author it was written with.
   *
   * For the common case where identity resolves after the widget mounts, or
   * where the user switches account or workspace — the alternative was
   * `cleanup()` and a rebuild, which throws away every loaded comment and
   * whatever panel was open. `null` returns to the anonymous author.
   *
   * Returns false, changing nothing, for anything that is neither null nor
   * an object with a non-blank `name`.
   */
  setUser(user: { name: string; id?: string } | null): boolean;
  setCommentStatus(id: CommentId, status: CommentStatus): boolean;
  setCommentType(id: CommentId, type: CommentType | null): boolean;
  setCommentPriority(id: CommentId, priority: CommentPriority | null): boolean;
  setCommentTags(id: CommentId, tags: string[]): boolean;
  /**
   * RF6 — flips the current actor's reaction on a comment: present, it is
   * removed; absent, it is added. The actor is `user.id ?? user.name`.
   * Returns false when the id or the emoji is unknown.
   */
  toggleCommentReaction(id: CommentId, emoji: string): boolean;
  /** Same contract as toggleCommentReaction, one level down. */
  toggleReplyReaction(
    commentId: CommentId,
    replyId: CommentId,
    emoji: string
  ): boolean;
  cleanup(): void;
}

/**
 * Creates a CommentOverlay and mounts it. Safe to call before the document
 * is ready — the instance defers its own DOM work to `DOMContentLoaded`.
 */
export declare function createCommentOverlay(
  options?: CommentOverlayOptions & { autoInit?: true }
): CommentOverlay;
/**
 * With `autoInit: false`, nothing is mounted yet: you get an initializer to
 * call when you are ready.
 */
export declare function createCommentOverlay(
  options: CommentOverlayOptions & { autoInit: false }
): () => CommentOverlay;

/**
 * Default name of the query parameter carrying a comment id in "Copy link"
 * URLs. Exported so a host reading the id itself — before the widget is up,
 * to fetch just that comment — does not have to hardcode a second copy of
 * it. Override it per instance with the `linkParam` option.
 */
export declare const DEFAULT_LINK_PARAM: string;

/**
 * The comment id the given URL asks for, or null. Pass the same `param` the
 * widget was configured with; both default to `DEFAULT_LINK_PARAM`. A
 * malformed URL yields null rather than throwing.
 */
export declare function readCommentLinkParam(
  param?: string,
  href?: string
): string | null;

export default createCommentOverlay;
