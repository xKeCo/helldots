// The append-only trail behind "who created, changed or resolved this
// comment, and when".
//
// One record per action worth auditing: creation, a text edit, a status move
// and a classification change. Replies already carry their own author and
// timestamp, and reactions are high-frequency signal with no audit value —
// neither enters the log. That bound is what keeps it at three to five
// entries per comment instead of twenty, and it is why the quota-shedding
// path in storage.js needs no change: a hundred comments' worth of history
// costs about what two automatic screenshots cost.
//
// Nothing here is stored twice. The resolution figures RF5 renders are
// derived from the log on read rather than kept beside it, so they cannot
// go stale when a comment is reopened.

import { normalizeActorId } from "./id.js";

/** The four auditable actions. */
export const AUDIT_EVENTS = ["created", "edited", "status", "classified"];

/** The classification fields a "classified" event can name. */
export const AUDIT_FIELDS = ["type", "priority", "tags"];

// A display name comes from the host and is repeated on every entry, so a
// pathological one is capped. The actor's id is deliberately NOT capped —
// see normalizeActorId: it is the only thing a host can reconcile on, and a
// truncated key joins wrongly instead of failing loudly.
const FIELD_MAX = 64;

const clean = (value) =>
  typeof value === "string" ? value.trim().slice(0, FIELD_MAX) : "";

// `null` is a value here, not an absence: it is how type and priority read
// when they are deliberately unset, so a transition to it has to survive.
const transition = (value) => {
  if (value === null) return { present: true, value: null };
  if (typeof value === "string") return { present: true, value: clean(value) };
  return { present: false, value: undefined };
};

/**
 * The actor of an action: the stable id the host supplied, plus the name it
 * displays.
 *
 * Resolved in one place for the same reason `actorKeyOf` is — the log and the
 * author line must never disagree about who acted. The two are siblings, not
 * duplicates: that one produces a key for de-duplication, this one a record
 * for display.
 *
 * @param {{ name?: string, id?: string } | undefined} user
 * @param {{ anonymous: string }} strings
 * @returns {{ id?: string, name: string }}
 */
export function actorOf(user, strings) {
  const name = clean(user?.name) || strings.anonymous;
  const id = normalizeActorId(user?.id);
  return id ? { id, name } : { name };
}

/**
 * Appends one entry, creating the array on first use so an untouched corpus
 * carries no extra bytes.
 *
 * Callers record AFTER their own no-op guard: `setCommentStatus` returns
 * early when the status is unchanged, and an entry appended above that line
 * would log a change that never happened.
 *
 * @param {object} comment
 * @param {string} type one of AUDIT_EVENTS
 * @param {{ id?: string, name: string }} actor
 * @param {{ field?: string, from?: string | null, to?: string | null }} [detail]
 * @returns {object | null} the entry, or null for an unknown event type
 */
export function recordEvent(comment, type, actor, detail) {
  if (!AUDIT_EVENTS.includes(type)) return null;

  const entry = { type, at: new Date().toISOString(), actor };
  if (detail?.field && AUDIT_FIELDS.includes(detail.field)) {
    entry.field = detail.field;
  }
  const from = transition(detail?.from);
  if (from.present) entry.from = from.value;
  const to = transition(detail?.to);
  if (to.present) entry.to = to.value;

  if (!Array.isArray(comment.history)) comment.history = [];
  comment.history.push(entry);
  return entry;
}

/**
 * Defensive read of a loaded log, at the same level as the existing
 * malformed-reply filter and `normalizeReactions`. A hostile backend or a
 * corrupt localStorage must not be able to inject an event type the timeline
 * has no label for, or a timestamp that poisons every average built on it.
 *
 * @param {unknown} raw
 * @returns {object[] | null} null rather than [], so the serializer can omit
 *   the field entirely
 */
export function normalizeHistory(raw) {
  if (!Array.isArray(raw)) return null;

  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    if (!AUDIT_EVENTS.includes(item.type)) continue;

    const at = clean(item.at);
    if (!Number.isFinite(Date.parse(at))) continue;

    const name = clean(item.actor?.name);
    const id = normalizeActorId(item.actor?.id);
    const entry = { type: item.type, at, actor: id ? { id, name } : { name } };

    if (AUDIT_FIELDS.includes(item.field)) entry.field = item.field;
    const from = transition(item.from);
    if (from.present) entry.from = from.value;
    const to = transition(item.to);
    if (to.present) entry.to = to.value;

    out.push(entry);
  }

  if (out.length === 0) return null;
  // Chronological regardless of the order they arrived in: a host merging two
  // devices' corpora can hand us an interleaving, and every reader below
  // walks this array assuming it is ordered.
  out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return out;
}

/**
 * Copies the log out, actor included, so a host mutating what
 * `serializeComments()` returned cannot reach back into overlay state — the
 * same rule `tags` and `reactions` already follow.
 * @param {object[] | null | undefined} history
 * @returns {object[] | null}
 */
export function serializeHistory(history) {
  if (!Array.isArray(history) || history.length === 0) return null;
  return history.map((entry) => ({ ...entry, actor: { ...entry.actor } }));
}

/**
 * Every resolution the comment has had, oldest first, derived from the log
 * rather than stored beside it. A status event landing on `resolved` opens
 * one; the next status event closes it.
 *
 * Each duration is measured from creation, not from the reopen — "time to
 * resolve" answers how long the reporter waited, and restarting the clock on
 * a reopen would make a comment that bounced twice look faster than one that
 * was fixed on the first attempt.
 *
 * @param {object} comment
 * @returns {Array<{ resolvedAt: string, reopenedAt: string | null, ms: number }>}
 */
export function resolutionsOf(comment) {
  if (!Array.isArray(comment?.history)) return [];

  const out = [];
  let openedAt = null;
  for (const entry of comment.history) {
    if (entry.type !== "status") continue;
    if (entry.to === "resolved") {
      openedAt = entry.at;
    } else if (openedAt) {
      out.push({ resolvedAt: openedAt, reopenedAt: entry.at, ms: 0 });
      openedAt = null;
    }
  }
  if (openedAt) out.push({ resolvedAt: openedAt, reopenedAt: null, ms: 0 });

  // Clocks belong to the client. Merge two devices whose clocks disagree and
  // a resolution can land before the creation it resolves — clamp rather than
  // render a negative duration.
  const createdAt = Date.parse(comment.createdAt);
  for (const item of out) {
    const resolved = Date.parse(item.resolvedAt);
    item.ms =
      Number.isFinite(createdAt) && Number.isFinite(resolved)
        ? Math.max(0, resolved - createdAt)
        : 0;
  }
  return out;
}

/**
 * Elapsed time of the resolution currently in force, or null when the comment
 * is not resolved. A function rather than a stored figure, so it can never
 * disagree with the log it comes from.
 *
 * @param {object} comment
 * @returns {number | null}
 */
export function currentResolutionMs(comment) {
  if (comment?.status !== "resolved") return null;

  const resolutions = resolutionsOf(comment);
  const last = resolutions[resolutions.length - 1];
  if (last && !last.reopenedAt) return last.ms;

  // Resolved before the log existed: fall back to the stored stamp so an
  // older corpus still renders a duration instead of an em dash.
  const resolved = Date.parse(comment.resolvedAt);
  const created = Date.parse(comment.createdAt);
  if (!Number.isFinite(resolved) || !Number.isFinite(created)) return null;
  return Math.max(0, resolved - created);
}
