// Who may edit or delete what.
//
// Until this module existed the widget had identity but never consulted it:
// every comment and reply carried `authorId`, and the ⋯ menu offered "Delete"
// on all of them to everybody. One person's comment was one stranger's click
// away from being gone.
//
// The scope is deliberately narrow — editing and deleting a comment or a
// reply. Status, type, priority and reactions stay open to everyone: those
// are triage, they are reversible, and a team that cannot re-classify each
// other's reports has lost the point of a shared inbox. Deleting is neither
// reversible nor shared.
//
// What this is NOT: enforcement. HellDots runs in the page, so a determined
// visitor reaches `deleteComment()` from the console no matter what this file
// says. The guard removes the accidental path — the button that should never
// have been there — and hands the host a vocabulary to mirror. Authorization
// proper belongs in the host's backend, checking `authorId` against its own
// session when the `comment:deleted` event arrives.

import { normalizeActorId } from "./id.js";
import { actorKeyOf } from "./reactions.js";

/**
 * The actions a host can veto, and the only strings `can` is ever called
 * with. Exported so a host can assert against the list instead of typing the
 * four literals from memory.
 * @type {import('./index.d.ts').PermissionAction[]}
 */
export const PERMISSION_ACTIONS = [
  "edit:comment",
  "delete:comment",
  "edit:reply",
  "delete:reply",
];

/**
 * The identity a stored record was written under, resolved exactly the way
 * `actorKeyOf` resolves the live one.
 *
 * Mirror images on purpose, and that is why this imports from reactions.js
 * rather than growing a second resolver: ownership and "this reaction is
 * mine" are the same question asked twice, and the day they disagree is the
 * day someone loses the delete button on their own comment.
 *
 * @param {{ author?: string, authorId?: string | null }} record
 * @param {{ anonymous: string }} strings
 * @returns {string}
 */
export const recordKeyOf = (record, strings) =>
  normalizeActorId(record?.authorId) ||
  (typeof record?.author === "string" ? record.author.trim() : "") ||
  strings.anonymous;

/**
 * The rule that applies when the host declares no `can`: you own what carries
 * your identity.
 *
 * A host that never sets `user` gets today's behaviour back unchanged — every
 * record is written by "Anonymous" and so is every reader, the keys match, and
 * nothing is hidden. That is the point: the playground, the localStorage demo
 * and every single-user setup must not have to opt out of a rule that has
 * nobody to protect them from.
 *
 * Known limit, inherited from `actorKeyOf` and shared with reactions: with no
 * `user.id` anywhere the comparison falls back to the display name, so the
 * anonymous fallback is the *localised* one. A corpus written under `en` and
 * read under `es` reads as somebody else's. It fails closed (the button is
 * hidden, nothing is destroyed) and any host that passes `user.id` never
 * reaches that branch.
 *
 * @param {import('./index.d.ts').PermissionTarget} target
 * @param {{ name?: string, id?: string } | undefined} user
 * @param {{ anonymous: string }} strings
 * @returns {boolean}
 */
export const isOwnRecord = (target, user, strings) =>
  recordKeyOf(target, strings) === actorKeyOf(user, strings);

/**
 * The one place the answer is decided, so the menu that hides an item and the
 * mutator that refuses it can never disagree.
 *
 * A host `can` must return literal `true` to allow. Anything else denies —
 * including the `undefined` of a branch that forgot to return. A permission
 * predicate is the wrong place to be generous with coercion: guessing wrong
 * in the permissive direction reintroduces exactly the hole this module
 * closes, and guessing wrong the other way costs a hidden button and a bug
 * found in a minute.
 *
 * A `can` that throws denies for the same reason, and says so loudly: falling
 * back to the default rule would silently run a policy the host thinks it has
 * replaced.
 *
 * @param {{
 *   can: unknown,
 *   action: import('./index.d.ts').PermissionAction,
 *   target: import('./index.d.ts').PermissionTarget,
 *   user: { name?: string, id?: string } | undefined,
 *   strings: { anonymous: string },
 * }} config
 * @returns {boolean}
 */
export const resolvePermission = ({ can, action, target, user, strings }) => {
  if (typeof can !== "function") return isOwnRecord(target, user, strings);
  try {
    return can(action, target) === true;
  } catch (err) {
    console.warn("HellDots: can() threw, denying", action, err);
    return false;
  }
};

/**
 * The shape `can` receives for a comment. Built rather than passed whole: the
 * host gets what an authorization decision needs and no live reference into
 * overlay state, and a comment's screenshots — data-URLs, one per attachment —
 * stay out of a predicate that runs on every card the inbox renders.
 *
 * @param {any} comment
 * @returns {import('./index.d.ts').PermissionTarget}
 */
export const commentTargetOf = (comment) => ({
  id: comment.id,
  author: comment.author,
  authorId: comment.authorId || null,
});

/**
 * Same, one level down. `commentId` rides along because a reply's id is only
 * unique inside its thread, so it is not enough to look the record up with.
 *
 * @param {any} reply
 * @param {import('./index.d.ts').CommentId} commentId
 * @returns {import('./index.d.ts').PermissionTarget}
 */
export const replyTargetOf = (reply, commentId) => ({
  id: reply.id,
  author: reply.author,
  authorId: reply.authorId || null,
  commentId,
});
