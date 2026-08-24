// This file lives outside src/ (so it never ships in the published package)
// and only exists so `npm run typecheck` actually cross-checks the
// hand-maintained `src/index.d.ts` declarations against the real
// `src/index.js`/`src/overlay.js` implementations.
//
// TypeScript silently stops checking a `.js` file's own body once a
// same-named `.d.ts` sits next to it (it treats the `.d.ts` as the source of
// truth and skips re-deriving types from the `.js`), so a plain `checkJs`
// pass over `index.js` alone never actually compares it against
// `index.d.ts`. Importing both sides here and asserting assignability
// forces a real comparison: if either side drifts, this file fails to
// compile.
import {
  createCommentOverlay as createCommentOverlayImpl,
  DEFAULT_LINK_PARAM as defaultLinkParamImpl,
  readCommentLinkParam as readCommentLinkParamImpl,
} from "../src/index.js";
import CommentOverlayImpl from "../src/overlay.js";
import type {
  createCommentOverlay as createCommentOverlayDeclared,
  CommentOverlay as CommentOverlayDeclared,
  DEFAULT_LINK_PARAM as defaultLinkParamDeclared,
  readCommentLinkParam as readCommentLinkParamDeclared,
} from "../src/index.d.ts";

const _createCommentOverlayMatchesDeclaration: typeof createCommentOverlayDeclared =
  createCommentOverlayImpl;

const _commentOverlayInstanceMatchesDeclaration: CommentOverlayDeclared =
  new CommentOverlayImpl();

// The deep-link helpers are public API too: a host reading the id out of the
// URL itself imports these, so they get the same drift check as the class.
const _defaultLinkParamMatchesDeclaration: typeof defaultLinkParamDeclared =
  defaultLinkParamImpl;

const _readCommentLinkParamMatchesDeclaration: typeof readCommentLinkParamDeclared =
  readCommentLinkParamImpl;

void _createCommentOverlayMatchesDeclaration;
void _commentOverlayInstanceMatchesDeclaration;
void _defaultLinkParamMatchesDeclaration;
void _readCommentLinkParamMatchesDeclaration;
