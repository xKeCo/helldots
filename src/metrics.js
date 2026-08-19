// Aggregate figures over a corpus of comments: counts by status, type and
// priority, a temporal distribution, and the resolution times derived from
// the audit log.
//
// Pure and synchronous. The corpus is already in memory and measured in tens
// or hundreds, so nothing here is cached or incremental — recomputing on
// every open is cheaper than keeping a second copy of the truth in sync.

import { STATUSES, COMMENT_TYPES, PRIORITIES } from "./constants.js";
import { currentResolutionMs, resolutionsOf } from "./audit.js";

/** Comments carry `null` for a deliberately unset type or priority. */
export const UNSET = "unset";

const HOUR_MS = 3_600_000;

const countInto = (keys, extraKey) => {
  const out = {};
  for (const key of keys) out[key] = 0;
  if (extraKey) out[extraKey] = 0;
  return out;
};

const median = (sorted) => {
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * @param {import('./index.d.ts').SerializedComment[]} comments
 * @returns {import('./index.d.ts').CommentMetrics}
 */
export function computeMetrics(comments) {
  const list = Array.isArray(comments) ? comments : [];

  const byStatus = countInto(STATUSES);
  const byType = countInto(COMMENT_TYPES, UNSET);
  const byPriority = countInto(PRIORITIES, UNSET);
  const perDay = new Map();
  const durations = [];
  let reopenedCount = 0;

  for (const comment of list) {
    const status = STATUSES.includes(comment.status) ? comment.status : "open";
    byStatus[status]++;

    byType[COMMENT_TYPES.includes(comment.type) ? comment.type : UNSET]++;
    byPriority[
      PRIORITIES.includes(comment.priority) ? comment.priority : UNSET
    ]++;

    // Only the days that saw activity get a bucket. Filling the gaps would
    // put 365 empty bars between two comments a year apart, which is a chart
    // nobody can read — the axis labels say which days these are.
    const day = String(comment.createdAt || "").slice(0, 10);
    if (day) perDay.set(day, (perDay.get(day) || 0) + 1);

    const elapsed = currentResolutionMs(comment);
    if (elapsed !== null) durations.push(elapsed);
    if (resolutionsOf(comment).length > 1) reopenedCount++;
  }

  durations.sort((a, b) => a - b);
  const total = durations.reduce((sum, ms) => sum + ms, 0);

  return {
    total: list.length,
    // Built by walking STATUSES / COMMENT_TYPES / PRIORITIES, so every key the
    // public type promises is present — which the checker cannot see through
    // a loop over a string[].
    byStatus:
      /** @type {Record<import('./index.d.ts').CommentStatus, number>} */ (
        byStatus
      ),
    byType:
      /** @type {Record<import('./index.d.ts').CommentType | "unset", number>} */ (
        byType
      ),
    byPriority:
      /** @type {Record<import('./index.d.ts').CommentPriority | "unset", number>} */ (
        byPriority
      ),
    overTime: [...perDay.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, count]) => ({ date, count })),
    resolution: {
      resolvedCount: durations.length,
      // Both, because they answer different questions: one comment left open
      // for a month drags the mean somewhere no real comment lives, and the
      // median says what the team's typical turnaround actually is.
      averageMs: durations.length ? total / durations.length : null,
      medianMs: median(durations),
      reopenedCount,
    },
  };
}

/** Exported for the report, which prints hours rather than raw milliseconds. */
export const toHours = (ms) =>
  ms === null || ms === undefined ? null : Math.round((ms / HOUR_MS) * 10) / 10;
