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
export type CommentStatus = "open" | "in_progress" | "resolved";

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

export interface SerializedComment {
  id: number;
  text: string;
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
   * RF6 — emoji → authors who reacted. Reserved, not implemented yet.
   * Optional and absent by default, so shipping it later needs no migration.
   */
  reactions?: Record<string, string[]>;
}

export interface CommentOverlayOptions {
  shortcutKey?: string;
  shortcutModifier?: "alt" | "ctrl" | "shift";
  autoInit?: boolean;
  /** UI language. Defaults to the browser's language when supported, else "en". */
  locale?: "en" | "es";
  /** Auto save/restore comments. Default: "none" (host app persists via callbacks). */
  persistence?: "localStorage" | "none";
  /** Identity used as the author of new comments and replies. */
  user?: { name: string };
  /** Fired after a new comment is saved. */
  onCommentCreated?: (comment: SerializedComment) => void;
  /** Fired after a reply is added to any comment. */
  onReplyAdded?: (comment: SerializedComment, reply: CommentReply) => void;
  /** Fired for each comment that could not be re-anchored by loadComments. */
  onAnchorLost?: (comment: SerializedComment) => void;
  /** Fired after deleteComment removes a comment. */
  onCommentDeleted?: (id: number) => void;
  /** Fired after setCommentStatus changes a comment's lifecycle state. */
  onCommentStatusChanged?: (comment: SerializedComment) => void;
  /** Fired after type, priority or tags change on any comment. */
  onCommentUpdated?: (comment: SerializedComment) => void;
}

export interface CommentReply {
  id: number;
  text: string;
  author: string;
  timestamp: string;
  screenshots?: string[];
}

export interface Comment {
  id: number;
  text: string;
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
   * RF6 — emoji → authors who reacted. Reserved, not implemented yet.
   * Optional and absent by default, so shipping it later needs no migration.
   */
  reactions?: Record<string, string[]>;
}

export declare class CommentOverlay {
  comments: Comment[];
  commentMode: boolean;

  constructor(options?: Omit<CommentOverlayOptions, "autoInit">);

  toggleCommentMode(): void;
  addReply(comment: Comment, text: string): CommentReply;
  serializeComments(): SerializedComment[];
  loadComments(data: SerializedComment[]): {
    anchored: number;
    orphaned: number;
    inactive: number;
  };
  deleteComment(id: number): boolean;
  setCommentStatus(id: number, status: CommentStatus): boolean;
  setCommentType(id: number, type: CommentType | null): boolean;
  setCommentPriority(id: number, priority: CommentPriority | null): boolean;
  setCommentTags(id: number, tags: string[]): boolean;
  cleanup(): void;
}

export declare function createCommentOverlay(
  options?: CommentOverlayOptions
): CommentOverlay | (() => CommentOverlay);

export default createCommentOverlay;
