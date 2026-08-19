import { describe, it, expect, vi } from "vitest";
import { createMetricsView } from "../src/metrics-view.js";
import { computeMetrics } from "../src/metrics.js";
import {
  STATUS_COLORS,
  TYPE_COLORS,
  PRIORITY_COLORS,
} from "../src/constants.js";
import en from "../src/locales/en.js";
import es from "../src/locales/es.js";

const at = (day) => `2026-08-${String(day).padStart(2, "0")}T10:00:00.000Z`;

const corpus = [
  {
    id: "a",
    status: "resolved",
    type: "bug",
    priority: "high",
    createdAt: at(18),
    history: [
      { type: "created", at: at(18), actor: { name: "Ana" } },
      {
        type: "status",
        at: "2026-08-18T12:00:00.000Z",
        actor: { name: "Ana" },
        from: "open",
        to: "resolved",
      },
    ],
  },
  { id: "b", status: "open", type: "bug", priority: null, createdAt: at(18) },
  { id: "c", status: "open", type: null, priority: null, createdAt: at(19) },
];

const build = (comments = corpus, overrides = {}) =>
  createMetricsView(computeMetrics(comments), {
    strings: en,
    locale: "en",
    onExportComments: () => {},
    onExportMetrics: () => {},
    onPrint: () => {},
    ...overrides,
  });

const barRows = (el, group) => [
  ...el.querySelectorAll(`[data-metrics-group="${group}"] [data-metrics-row]`),
];

describe("createMetricsView", () => {
  it("leads with the totals", () => {
    const el = build();
    expect(el.textContent).toContain(en.metricsTotal);
    expect(el.textContent).toContain("3");
  });

  it("reports the average and the median side by side", () => {
    const el = build();
    expect(el.textContent).toContain(en.metricsAverageResolution);
    expect(el.textContent).toContain(en.metricsMedianResolution);
  });

  it("draws a row per status, including the ones nobody used", () => {
    expect(barRows(build(), "status")).toHaveLength(4);
  });

  it("carries every count as text, never as bar length alone", () => {
    // WCAG 1.4.1: a bar whose only signal is its width is unreadable to
    // anyone who cannot see it, and to anyone printing in greyscale.
    for (const row of barRows(build(), "status")) {
      expect(row.textContent.replace(/\s+/g, "")).toMatch(/\d/);
    }
  });

  it("scales the bars against the busiest bucket, not against the total", () => {
    const el = build();
    const widths = barRows(el, "status").map(
      (row) => row.querySelector("[data-metrics-bar]").style.width
    );
    expect(widths).toContain("100%");
  });

  describe("bar colours", () => {
    // jsdom normalises any colour it is handed into rgb(), so the expectation
    // is derived from the constant rather than written out — a hex typed by
    // hand here would pass while disagreeing with the picker.
    const rgb = (hex) => {
      const n = parseInt(hex.slice(1), 16);
      return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
    };
    const colours = (el, group) =>
      barRows(el, group).map(
        (row) => row.querySelector("[data-metrics-bar]").style.backgroundColor
      );

    it("paints a status bar the colour its own picker uses", () => {
      expect(colours(build(), "status")).toEqual([
        rgb(STATUS_COLORS.open),
        rgb(STATUS_COLORS.in_progress),
        rgb(STATUS_COLORS.in_review),
        rgb(STATUS_COLORS.resolved),
      ]);
    });

    it("paints a type bar the colour its own picker uses", () => {
      expect(colours(build(), "type").slice(0, 4)).toEqual([
        rgb(TYPE_COLORS.bug),
        rgb(TYPE_COLORS.suggestion),
        rgb(TYPE_COLORS.question),
        rgb(TYPE_COLORS.improvement),
      ]);
    });

    it("paints a priority bar the colour its own picker uses", () => {
      expect(colours(build(), "priority").slice(0, 3)).toEqual([
        rgb(PRIORITY_COLORS.high),
        rgb(PRIORITY_COLORS.medium),
        rgb(PRIORITY_COLORS.low),
      ]);
    });

    it("leaves the unset bucket visible instead of transparent", () => {
      // The pickers paint an unset dot `transparent` — there is nothing to
      // show. A bar is different: it still has a count to draw, so it takes a
      // neutral rather than vanishing.
      for (const group of ["type", "priority"]) {
        const last = colours(build(), group).at(-1);
        expect(last).not.toBe("transparent");
        expect(last).not.toBe("");
      }
    });
  });

  it("gives unclassified comments their own row", () => {
    const el = build();
    const labels = barRows(el, "type").map((row) => row.textContent);
    expect(labels.some((label) => label.includes(en.unset))).toBe(true);
  });

  it("charts the daily distribution as a labelled image, not a bare drawing", () => {
    const el = build();
    const svg = el.querySelector("svg");

    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toContain(en.metricsOverTime);
    expect(svg.querySelectorAll("title")).toHaveLength(2);
    expect(svg.querySelector("title").textContent).toContain("2026-08-18");
  });

  it("says so plainly when there is nothing to measure", () => {
    const el = build([]);

    expect(el.textContent).toContain(en.metricsEmpty);
    expect(el.querySelector("svg")).toBeNull();
  });

  it("wires the three exports to their handlers", () => {
    const onExportComments = vi.fn();
    const onExportMetrics = vi.fn();
    const onPrint = vi.fn();
    const el = build(corpus, { onExportComments, onExportMetrics, onPrint });

    el.querySelector("[data-export='comments']").click();
    el.querySelector("[data-export='metrics']").click();
    el.querySelector("[data-export='print']").click();

    expect(onExportComments).toHaveBeenCalledOnce();
    expect(onExportMetrics).toHaveBeenCalledOnce();
    expect(onPrint).toHaveBeenCalledOnce();
  });

  it("offers no exports at all when the corpus is empty", () => {
    const el = build([]);
    expect(el.querySelector("[data-export]")).toBeNull();
  });

  it("translates", () => {
    const el = build(corpus, { strings: es, locale: "es" });
    expect(el.textContent).toContain(es.metricsByStatus);
    expect(el.textContent).not.toContain(en.metricsByStatus);
  });
});
