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
  replies: CommentReply[];
  author: string;
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
 * Everything that can change, as one discriminated union. Switch on `type`
 * and TypeScript narrows the rest of the fields for you.
 *
 * The ten specific callbacks below carry exactly the same events at
 * exactly the same moments; subscribe either way, or both.
 */
export type ChangeEvent =
  | { type: "comment:created"; comment: SerializedComment }
  | { type: "comment:edited"; comment: SerializedComment }
  | { type: "comment:deleted"; id: CommentId }
  | { type: "comment:status-changed"; comment: SerializedComment }
  /** Type, priority or tags changed. */
  | { type: "comment:updated"; comment: SerializedComment }
  | { type: "comment:anchor-lost"; comment: SerializedComment }
  | {
      type: "reply:added";
      comment: SerializedComment;
      reply: CommentReply;
    }
  | {
      type: "reply:deleted";
      comment: SerializedComment;
      reply: CommentReply;
    }
  | {
      type: "reply:edited";
      comment: SerializedComment;
      reply: CommentReply;
    }
  /** `reply` is null when the reaction is on the root comment. */
  | {
      type: "reaction:toggled";
      comment: SerializedComment;
      reply: CommentReply | null;
    };

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
   * `name` is what gets displayed. `id` is optional and never rendered: it is
   * what a reaction is keyed on, so two teammates who share a display name do
   * not share one reaction. Without it the name is used, and without any
   * `user` at all every actor collapses into one.
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
   * Single subscription point: fires for every change, alongside whichever
   * specific callback below carries the same event. Handy when a host syncs
   * everything to one endpoint instead of wiring nine functions. A handler
   * that throws is caught and warned about — it never rolls back the
   * mutation that emitted it.
   */
  onChange?: (event: ChangeEvent) => void;
  /** Fired after a new comment is saved. */
  onCommentCreated?: (comment: SerializedComment) => void;
  /** Fired after a reply is added to any comment. */
  onReplyAdded?: (comment: SerializedComment, reply: CommentReply) => void;
  /** Fired after deleteReply removes a reply. */
  onReplyDeleted?: (comment: SerializedComment, reply: CommentReply) => void;
  /** Fired after editComment rewrites a comment's text. */
  onCommentEdited?: (comment: SerializedComment) => void;
  /** Fired after editReply rewrites a reply's text. */
  onReplyEdited?: (comment: SerializedComment, reply: CommentReply) => void;
  /** Fired for each comment that could not be re-anchored by loadComments. */
  onAnchorLost?: (comment: SerializedComment) => void;
  /** Fired after deleteComment removes a comment. */
  onCommentDeleted?: (id: CommentId) => void;
  /** Fired after setCommentStatus changes a comment's lifecycle state. */
  onCommentStatusChanged?: (comment: SerializedComment) => void;
  /** Fired after type, priority or tags change on any comment. */
  onCommentUpdated?: (comment: SerializedComment) => void;
  /**
   * Fired after a reaction is added to or removed from a comment or a reply.
   * `reply` is null when the reaction is on the root comment.
   */
  onReactionToggled?: (
    comment: SerializedComment,
    reply: CommentReply | null
  ) => void;
}

export interface CommentReply {
  id: CommentId;
  text: string;
  author: string;
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
  replies: CommentReply[];
  author: string;
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

export default createCommentOverlay;
