export interface CommentOverlayOptions {
  shortcutKey?: string;
  shortcutModifier?: 'alt' | 'ctrl' | 'shift';
  autoInit?: boolean;
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
  container: HTMLElement;
  relativeX: number;
  relativeY: number;
  replies: CommentReply[];
  author: string;
  createdAt: string;
  screenshot: string | null;
}

export declare class CommentOverlay {
  comments: Comment[];
  commentMode: boolean;

  constructor(options?: Omit<CommentOverlayOptions, 'autoInit'>);

  toggleCommentMode(): void;
  addReply(comment: Comment, text: string): CommentReply;
  cleanup(): void;
}

export declare function createCommentOverlay(
  options?: CommentOverlayOptions,
): CommentOverlay | (() => CommentOverlay);

export default createCommentOverlay;
