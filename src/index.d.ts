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
  fingerprint: CommentAnchorFingerprint;
  /** Fraction (0–1) of the anchor element's box, captured at creation. */
  relativeX: number;
  relativeY: number;
}

export type AnchorState = "anchored" | "orphaned";

export interface SerializedComment {
  id: number;
  text: string;
  anchor: CommentAnchor | null;
  replies: CommentReply[];
  author: string;
  createdAt: string;
}

export interface CommentOverlayOptions {
  shortcutKey?: string;
  shortcutModifier?: "alt" | "ctrl" | "shift";
  autoInit?: boolean;
  /** UI language. Defaults to the browser's language when supported, else "en". */
  locale?: "en" | "es";
  /** Fired after a new comment is saved. */
  onCommentCreated?: (comment: SerializedComment) => void;
  /** Fired after a reply is added to any comment. */
  onReplyAdded?: (comment: SerializedComment, reply: CommentReply) => void;
  /** Fired for each comment that could not be re-anchored by loadComments. */
  onAnchorLost?: (comment: SerializedComment) => void;
}

export interface CommentReply {
  id: number;
  text: string;
  author: string;
  timestamp: string;
}

export interface Comment {
  id: number;
  text: string;
  /** Live anchor element; null while the comment is orphaned. */
  container: HTMLElement | null;
  relativeX: number;
  relativeY: number;
  anchor: CommentAnchor | null;
  anchorState: AnchorState;
  replies: CommentReply[];
  author: string;
  createdAt: string;
  screenshot: string | null;
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
  };
  cleanup(): void;
}

export declare function createCommentOverlay(
  options?: CommentOverlayOptions
): CommentOverlay | (() => CommentOverlay);

export default createCommentOverlay;
