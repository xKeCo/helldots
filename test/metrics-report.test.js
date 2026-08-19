import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { printMetricsReport } from "../src/metrics-report.js";
import { computeMetrics } from "../src/metrics.js";
import en from "../src/locales/en.js";
import es from "../src/locales/es.js";

const corpus = [
  {
    id: "a",
    status: "resolved",
    type: "bug",
    priority: "high",
    createdAt: "2026-08-18T10:00:00.000Z",
    history: [
      {
        type: "created",
        at: "2026-08-18T10:00:00.000Z",
        actor: { name: "Ana" },
      },
      {
        type: "status",
        at: "2026-08-18T12:00:00.000Z",
        actor: { name: "Ana" },
        from: "open",
        to: "resolved",
      },
    ],
  },
  {
    id: "b",
    status: "open",
    type: null,
    priority: null,
    createdAt: "2026-08-19T10:00:00.000Z",
  },
];

const print = (overrides = {}) =>
  printMetricsReport(computeMetrics(corpus), {
    strings: en,
    locale: "en",
    css: ".report-table { color: black; }",
    ...overrides,
  });

const frames = () => [...document.querySelectorAll("iframe")];

describe("printMetricsReport", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    frames().forEach((frame) => frame.remove());
    vi.restoreAllMocks();
  });

  it("builds the report in its own document, not in the host page", () => {
    print();

    const [frame] = frames();
    expect(frame).toBeDefined();
    expect(frame.contentDocument.body.textContent).toContain(en.metricsTitle);
    expect(document.body.textContent).not.toContain(en.metricsTitle);
  });

  it("keeps the frame out of the page's own layout while it works", () => {
    print();

    const [frame] = frames();
    expect(frame.getAttribute("aria-hidden")).toBe("true");
    expect(frame.style.position).toBe("absolute");
  });

  it("carries the figures a reader came for", () => {
    print();

    const text = frames()[0].contentDocument.body.textContent;
    expect(text).toContain("2"); // total
    expect(text).toContain(en.metricsByStatus);
    expect(text).toContain(en.metricsByType);
    expect(text).toContain(en.metricsByPriority);
  });

  it("renders tables rather than charts, which is what paper reads", () => {
    print();

    const doc = frames()[0].contentDocument;
    expect(doc.querySelectorAll("table").length).toBeGreaterThanOrEqual(3);
    expect(doc.querySelector("svg")).toBeNull();
  });

  it("styles the report from inside its own realm, so a strict CSP cannot blank it", () => {
    print();

    const doc = frames()[0].contentDocument;
    const styled =
      (doc.adoptedStyleSheets?.length ?? 0) > 0 ||
      doc.head.querySelector("style") !== null;
    expect(styled).toBe(true);
    // The parent document must not have been touched on the way.
    expect(document.head.querySelector("style")).toBeNull();
  });

  it("asks that document to print once its layout has settled", () => {
    // Deferred rather than called inline: printing before the frame has laid
    // out its content is how you get a blank page out of Safari. The delay is
    // also the seam that makes the call observable.
    vi.useFakeTimers();
    const hostPrint = vi.fn();
    window.print = hostPrint;
    print();

    const view = frames()[0].contentWindow;
    const framePrint = vi.fn();
    view.print = framePrint;
    vi.runAllTimers();

    expect(framePrint).toHaveBeenCalledOnce();
    expect(hostPrint).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("takes the frame back down once the dialog closes", () => {
    print();
    const view = frames()[0].contentWindow;

    view.dispatchEvent(new view.Event("afterprint"));

    expect(frames()).toHaveLength(0);
  });

  it("translates", () => {
    print({ strings: es, locale: "es" });

    expect(frames()[0].contentDocument.body.textContent).toContain(
      es.metricsTitle
    );
  });
});
