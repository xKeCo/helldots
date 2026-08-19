// The metrics dashboard, rendered inside the inbox panel.
//
// Every chart here is hand-drawn: horizontal bars are two divs and a width,
// and the daily distribution is a handful of <rect>s. The lightest charting
// library measured 22.66 KB gzip against ~13 KB of headroom, and none of them
// would have satisfied this repo's own rule anyway — a <canvas> carries no
// text, and no figure here is allowed to communicate through length or colour
// alone (WCAG 1.4.1). Each bar states its count beside it.

import {
  CLASSES,
  STATUSES,
  COMMENT_TYPES,
  PRIORITIES,
  STATUS_COLORS,
  TYPE_COLORS,
  PRIORITY_COLORS,
} from "./constants.js";
import { formatDuration } from "./i18n.js";
import {
  statusLabelOf,
  typeLabelOf,
  priorityLabelOf,
} from "./comment-actions.js";
import { UNSET } from "./metrics.js";

// The bucket for comments left deliberately unclassified. The pickers paint
// its dot `transparent` — there is nothing to show — but a bar still has a
// count to draw, so it takes the neutral the bars used before they were
// coloured at all rather than vanishing.
const UNSET_COLOR = "rgba(255,255,255,0.42)";

const CHART_WIDTH = 300;
const CHART_HEIGHT = 96;
const SVG_NS = "http://www.w3.org/2000/svg";

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
};

const svgEl = (tag, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    node.setAttribute(name, String(value));
  }
  return node;
};

const tile = (label, value) => {
  const box = el("div", CLASSES.METRICS_TILE);
  box.appendChild(el("span", CLASSES.METRICS_TILE_VALUE, value));
  box.appendChild(el("span", CLASSES.METRICS_TILE_LABEL, label));
  return box;
};

/**
 * One dimension as labelled horizontal bars. Bars are scaled against the
 * busiest bucket rather than the total: against the total, a corpus spread
 * evenly across four statuses would draw four slivers.
 *
 * Each bar takes the colour its own picker already uses for that value, so a
 * chip and its bar are recognisably the same thing. The colour is
 * reinforcement, never the signal: the row states its label and its count as
 * text either side of the bar, so nothing here is lost to a reader who cannot
 * tell the hues apart (WCAG 1.4.1).
 *
 * @param {Array<{ label: string, count: number, color: string }>} entries
 */
const barGroup = (name, heading, entries) => {
  const group = el("div", CLASSES.METRICS_GROUP);
  group.dataset.metricsGroup = name;
  group.appendChild(el("h4", CLASSES.METRICS_HEADING, heading));

  const max = Math.max(1, ...entries.map((entry) => entry.count));
  for (const { label, count, color } of entries) {
    const row = el("div", CLASSES.METRICS_ROW);
    row.dataset.metricsRow = "";

    row.appendChild(el("span", CLASSES.METRICS_ROW_LABEL, label));

    const track = el("div", CLASSES.METRICS_TRACK);
    const bar = el("div", CLASSES.METRICS_BAR);
    bar.dataset.metricsBar = "";
    bar.style.width = `${Math.round((count / max) * 100)}%`;
    bar.style.background = color;
    track.appendChild(bar);
    row.appendChild(track);

    row.appendChild(el("span", CLASSES.METRICS_ROW_COUNT, count));
    group.appendChild(row);
  }
  return group;
};

/**
 * The daily distribution. An <svg role="img"> with an aria-label carrying the
 * summary, and a <title> per column so a pointer — and an accessibility tree —
 * can read each day without the chart having to become a table.
 */
const dailyChart = (overTime, strings) => {
  const group = el("div", CLASSES.METRICS_GROUP);
  group.dataset.metricsGroup = "overTime";
  group.appendChild(el("h4", CLASSES.METRICS_HEADING, strings.metricsOverTime));

  const max = Math.max(1, ...overTime.map(({ count }) => count));
  const svg = svgEl("svg", {
    class: CLASSES.METRICS_CHART,
    viewBox: `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`,
    preserveAspectRatio: "none",
    role: "img",
    "aria-label": `${strings.metricsOverTime}: ${overTime
      .map(({ date, count }) => `${date} ${count}`)
      .join(", ")}`,
  });

  const slot = CHART_WIDTH / overTime.length;
  const barWidth = Math.max(2, Math.min(slot - 3, 28));
  overTime.forEach(({ date, count }, index) => {
    const height = Math.max(2, (count / max) * (CHART_HEIGHT - 6));
    const rect = svgEl("rect", {
      x: index * slot + (slot - barWidth) / 2,
      y: CHART_HEIGHT - height,
      width: barWidth,
      height,
      rx: 2,
    });
    rect.appendChild(
      Object.assign(svgEl("title"), { textContent: `${date}: ${count}` })
    );
    svg.appendChild(rect);
  });
  group.appendChild(svg);

  // Only the ends are labelled: a tick per day turns into overlapping text
  // the moment a corpus spans more than a fortnight.
  const axis = el("div", CLASSES.METRICS_AXIS);
  axis.appendChild(el("span", null, overTime[0].date));
  if (overTime.length > 1) {
    axis.appendChild(el("span", null, overTime[overTime.length - 1].date));
  }
  group.appendChild(axis);

  return group;
};

const exportBar = (strings, handlers) => {
  const bar = el("div", CLASSES.METRICS_EXPORTS);
  bar.setAttribute("aria-label", strings.metricsExportLabel);

  const button = (key, label, onClick) => {
    const btn = el("button", CLASSES.METRICS_EXPORT_BTN, label);
    btn.type = "button";
    btn.dataset.export = key;
    btn.addEventListener("click", onClick);
    return btn;
  };

  bar.appendChild(
    button("comments", strings.metricsExportComments, handlers.onExportComments)
  );
  bar.appendChild(
    button("metrics", strings.metricsExportMetrics, handlers.onExportMetrics)
  );
  bar.appendChild(button("print", strings.metricsPrint, handlers.onPrint));
  return bar;
};

/**
 * @param {import('./index.d.ts').CommentMetrics} metrics
 * @param {{
 *   strings: ReturnType<typeof import('./i18n.js').getStrings>,
 *   locale: string,
 *   onExportComments: () => void,
 *   onExportMetrics: () => void,
 *   onPrint: () => void,
 * }} deps
 * @returns {HTMLElement}
 */
export function createMetricsView(metrics, deps) {
  const { strings } = deps;
  const view = el("div", CLASSES.METRICS_VIEW);

  if (metrics.total === 0) {
    // Nothing to export either: three buttons that would hand back an empty
    // file are worse than no buttons.
    view.appendChild(el("p", CLASSES.METRICS_EMPTY, strings.metricsEmpty));
    return view;
  }

  const duration = (ms) => (ms === null ? "—" : formatDuration(ms, strings));

  const tiles = el("div", CLASSES.METRICS_TILES);
  tiles.appendChild(tile(strings.metricsTotal, metrics.total));
  tiles.appendChild(
    tile(strings.statusResolved, metrics.resolution.resolvedCount)
  );
  tiles.appendChild(
    tile(strings.metricsReopened, metrics.resolution.reopenedCount)
  );
  tiles.appendChild(
    tile(
      strings.metricsAverageResolution,
      duration(metrics.resolution.averageMs)
    )
  );
  tiles.appendChild(
    tile(strings.metricsMedianResolution, duration(metrics.resolution.medianMs))
  );
  view.appendChild(tiles);

  view.appendChild(
    barGroup(
      "status",
      strings.metricsByStatus,
      STATUSES.map((key) => ({
        label: statusLabelOf(key, strings),
        count: metrics.byStatus[key],
        color: STATUS_COLORS[key],
      }))
    )
  );
  view.appendChild(
    barGroup("type", strings.metricsByType, [
      ...COMMENT_TYPES.map((key) => ({
        label: typeLabelOf(key, strings),
        count: metrics.byType[key],
        color: TYPE_COLORS[key],
      })),
      {
        label: strings.unset,
        count: metrics.byType[UNSET],
        color: UNSET_COLOR,
      },
    ])
  );
  view.appendChild(
    barGroup("priority", strings.metricsByPriority, [
      ...PRIORITIES.map((key) => ({
        label: priorityLabelOf(key, strings),
        count: metrics.byPriority[key],
        color: PRIORITY_COLORS[key],
      })),
      {
        label: strings.unset,
        count: metrics.byPriority[UNSET],
        color: UNSET_COLOR,
      },
    ])
  );

  if (metrics.overTime.length) {
    view.appendChild(dailyChart(metrics.overTime, strings));
  }

  view.appendChild(exportBar(strings, deps));
  return view;
}
