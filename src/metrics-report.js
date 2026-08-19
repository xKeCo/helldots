// The printable metrics report — the "PDF" half of the export requirement.
//
// No PDF library. The lightest one measured 133 KB gzip against a 50 KB
// budget with ~13 KB of headroom left, so the browser's own print-to-PDF does
// the job for zero bytes: build the report in its own document and ask that
// document to print. What the user saves is a real PDF, produced by the
// engine that already knows how to lay out the page.
//
// Its own document, not the host page: printing the page would print whatever
// the host has on screen. And the styles go in through mountStyles rather
// than an inline <style>, because an iframe inherits the embedder's Content
// Security Policy — under a strict `style-src` an inline sheet is dropped and
// the report prints unstyled, which is the exact failure the widget's own
// stylesheet already had to solve.

import { mountStyles } from "./style-mount.js";
import { formatTemplate } from "./i18n.js";
import {
  statusLabelOf,
  typeLabelOf,
  priorityLabelOf,
} from "./comment-actions.js";
import { STATUSES, COMMENT_TYPES, PRIORITIES } from "./constants.js";
import { toHours } from "./metrics.js";

const REPORT_STYLE_ID = "helldots-report-styles";

const el = (doc, tag, className, text) => {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
};

const buildTable = (doc, caption, rows, headers) => {
  const table = el(doc, "table", "report-table");
  table.appendChild(el(doc, "caption", null, caption));

  const thead = doc.createElement("thead");
  const headRow = doc.createElement("tr");
  for (const header of headers)
    headRow.appendChild(el(doc, "th", null, header));
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = doc.createElement("tbody");
  for (const [label, value] of rows) {
    const tr = doc.createElement("tr");
    tr.appendChild(el(doc, "th", null, label));
    tr.appendChild(el(doc, "td", null, value));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
};

// Hours rather than the widget's "3h 12m" shorthand: a printed report is
// read next to other reports, and a single unit is what you can compare.
const duration = (ms) =>
  ms === null ? "—" : formatTemplate("{n} h", toHours(ms));

const buildReport = (doc, metrics, { strings, locale, scope }) => {
  const body = doc.body;
  body.className = "report";

  body.appendChild(el(doc, "h1", "report-title", strings.metricsTitle));

  const meta = el(doc, "p", "report-meta");
  meta.textContent = formatTemplate(
    strings.metricsGeneratedTemplate,
    new Intl.DateTimeFormat(locale, {
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date())
  );
  body.appendChild(meta);

  if (scope) {
    const scopeEl = el(doc, "p", "report-meta");
    scopeEl.textContent = `${strings.metricsScope}: ${scope}`;
    body.appendChild(scopeEl);
  }

  body.appendChild(
    buildTable(
      doc,
      strings.metricsTitle,
      [
        [strings.metricsTotal, metrics.total],
        [strings.statusResolved, metrics.resolution.resolvedCount],
        [strings.metricsReopened, metrics.resolution.reopenedCount],
        [
          strings.metricsAverageResolution,
          duration(metrics.resolution.averageMs),
        ],
        [
          strings.metricsMedianResolution,
          duration(metrics.resolution.medianMs),
        ],
      ],
      [strings.metricsCategory, strings.metricsCount]
    )
  );

  const dimension = (caption, keys, table, labelOf) =>
    buildTable(
      doc,
      caption,
      keys.map((key) => [labelOf(key), table[key] ?? 0]),
      [strings.metricsCategory, strings.metricsCount]
    );

  body.appendChild(
    dimension(strings.metricsByStatus, STATUSES, metrics.byStatus, (key) =>
      statusLabelOf(key, strings)
    )
  );
  body.appendChild(
    dimension(
      strings.metricsByType,
      [...COMMENT_TYPES, "unset"],
      metrics.byType,
      (key) => (key === "unset" ? strings.unset : typeLabelOf(key, strings))
    )
  );
  body.appendChild(
    dimension(
      strings.metricsByPriority,
      [...PRIORITIES, "unset"],
      metrics.byPriority,
      (key) => (key === "unset" ? strings.unset : priorityLabelOf(key, strings))
    )
  );

  if (metrics.overTime.length) {
    body.appendChild(
      buildTable(
        doc,
        strings.metricsOverTime,
        metrics.overTime.map(({ date, count }) => [date, count]),
        [strings.metricsDate, strings.metricsCount]
      )
    );
  }
};

/**
 * Builds the report in a hidden same-origin frame and asks it to print.
 *
 * @param {import('./index.d.ts').CommentMetrics} metrics
 * @param {{
 *   strings: ReturnType<typeof import('./i18n.js').getStrings>,
 *   locale: string,
 *   css: string,
 *   scope?: string,
 * }} deps
 * @returns {HTMLIFrameElement} the frame, which takes itself down after printing
 */
export function printMetricsReport(metrics, { strings, locale, css, scope }) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("title", strings.metricsTitle);
  // Off-screen rather than display:none — a frame that is not rendered has no
  // layout, and printing one prints nothing.
  frame.style.position = "absolute";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.left = "-9999px";
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  const view = frame.contentWindow;
  doc.title = strings.metricsTitle;
  mountStyles(doc, css, REPORT_STYLE_ID);
  buildReport(doc, metrics, { strings, locale, scope });

  const teardown = () => frame.remove();
  view.addEventListener("afterprint", teardown, { once: true });

  // Deferred by a tick: printing before the frame has laid out its content is
  // how a blank page comes out. Scheduled from this realm so the frame can be
  // taken down even if its own timers never run.
  setTimeout(() => view.print?.(), 0);

  return frame;
}
