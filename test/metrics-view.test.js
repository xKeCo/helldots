import { describe, it, expect, vi } from "vitest";
import { createMetricsView } from "../src/metrics-view.js";
import { computeMetrics } from "../src/metrics.js";
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
