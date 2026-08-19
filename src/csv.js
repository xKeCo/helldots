// CSV export: the comment corpus flattened one row per comment, and the
// aggregate figures in long format.
//
// Hand-written rather than pulled from a library. The whole of RFC 4180 that
// matters here is "quote a field containing a delimiter, a quote or a
// newline, and double the quotes inside it" — thirty lines against the 7 KB
// gzip a parser library costs, which is half the budget headroom for
// something this file does in full.

import { toHours } from "./metrics.js";
import { currentResolutionMs, resolutionsOf } from "./audit.js";

const DELIMITER = ",";
const NEWLINE = "\r\n";

// Excel evaluates a cell opening with any of these, so a comment reading
// "=1+1" becomes a formula the moment somebody double-clicks the file. The
// leading apostrophe is the standard defusing and survives a round trip
// through pandas and R.
const FORMULA_LEAD = /^[=+\-@\t\r]/;

const escape = (value) => {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  const safe = FORMULA_LEAD.test(raw) ? `'${raw}` : raw;
  return /["\n\r,]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {Array<{ key: string, label: string }>} columns
 * @returns {string}
 */
export function toCsv(rows, columns) {
  const header = columns.map((column) => escape(column.label)).join(DELIMITER);
  const body = rows.map((row) =>
    columns.map((column) => escape(row[column.key])).join(DELIMITER)
  );
  return [header, ...body].join(NEWLINE);
}

/** Columns of the comment export, in the order they are written. */
export const COMMENT_COLUMNS = [
  "id",
  "page",
  "author",
  "authorId",
  "text",
  "status",
  "type",
  "priority",
  "tags",
  "createdAt",
  "resolvedAt",
  "resolutionHours",
  "reopened",
  "replies",
];

/**
 * Pairs bare keys with themselves as headers. The header row deliberately
 * carries the internal names rather than translated labels: the file is an
 * interchange format, and a column whose spelling follows the widget's locale
 * cannot be joined against the export somebody else produced.
 * @param {string[]} keys
 */
export const columnsOf = (keys) => keys.map((key) => ({ key, label: key }));

/** Columns of the aggregate export. */
export const METRIC_COLUMNS = ["section", "key", "value"];

/**
 * One row per comment. Screenshots and the automatic context capture are
 * deliberately absent: a 33 KB base64 string in a spreadsheet cell is not
 * data, it is a file that has lost its name.
 *
 * @param {import('./index.d.ts').SerializedComment[]} comments
 */
export function commentRows(comments) {
  return (comments || []).map((comment) => {
    return {
      id: String(comment.id),
      page: comment.page || "",
      author: comment.author || "",
      authorId: comment.authorId || "",
      text: comment.text || "",
      status: comment.status || "open",
      type: comment.type || "",
      priority: comment.priority || "",
      // Space-joined rather than comma-joined: a comma inside a field is
      // legal but forces quoting on a column that is otherwise clean.
      tags: (comment.tags || []).join(" "),
      createdAt: comment.createdAt || "",
      resolvedAt: comment.resolvedAt || "",
      resolutionHours: toHours(currentResolutionMs(comment)),
      reopened: resolutionsOf(comment).length > 1 ? "yes" : "no",
      replies: (comment.replies || []).length,
    };
  });
}

/**
 * The aggregate figures in long format — `section, key, value` — rather than
 * one wide row. Buckets differ in number between corpora (one row per active
 * day), so a wide shape would change its column count from export to export
 * and stop being joinable against the previous one.
 *
 * Keys are the stable internal names, not translated labels: a column whose
 * spelling follows the widget's locale cannot be joined against anything.
 *
 * @param {import('./index.d.ts').CommentMetrics} metrics
 */
export function metricRows(metrics) {
  const rows = [{ section: "total", key: "", value: metrics.total }];
  const push = (section, table) => {
    for (const [key, value] of Object.entries(table)) {
      rows.push({ section, key, value });
    }
  };
  push("status", metrics.byStatus);
  push("type", metrics.byType);
  push("priority", metrics.byPriority);
  for (const { date, count } of metrics.overTime) {
    rows.push({ section: "perDay", key: date, value: count });
  }
  rows.push(
    {
      section: "resolution",
      key: "resolvedCount",
      value: metrics.resolution.resolvedCount,
    },
    {
      section: "resolution",
      key: "reopenedCount",
      value: metrics.resolution.reopenedCount,
    },
    {
      section: "resolution",
      key: "averageHours",
      value: toHours(metrics.resolution.averageMs),
    },
    {
      section: "resolution",
      key: "medianHours",
      value: toHours(metrics.resolution.medianMs),
    }
  );
  return rows;
}

/**
 * Hands the browser a file. The BOM is not decoration: without it Excel reads
 * the bytes as its local codepage and every accented name comes back as
 * mojibake.
 *
 * @param {string} filename
 * @param {string} text
 */
export function downloadCsv(filename, text) {
  const blob = new Blob(["\uFEFF", text], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
