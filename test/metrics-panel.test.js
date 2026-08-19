import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import CommentOverlay from "../src/overlay.js";
import { TAG_NAME } from "../src/root-element.js";
import { CLASSES } from "../src/constants.js";

vi.mock("../src/capture.js", () => ({
  renderPage: vi.fn().mockResolvedValue({ width: 0, height: 0 }),
  cropRegion: vi.fn().mockReturnValue("data:image/png;base64,mocked"),
  cropViewport: vi.fn().mockReturnValue("data:image/jpeg;base64,mocked"),
  withHiddenOverlay: vi.fn((fn) => fn()),
  AUTO_SCALE: 0.5,
}));

const cleanupDom = () => {
  document.querySelectorAll(TAG_NAME).forEach((el) => el.remove());
  document.querySelectorAll("iframe").forEach((el) => el.remove());
  document.body.className = "";
  document.body.innerHTML = "";
};

const stored = (page, overrides = {}) => ({
  id: `c-${Math.random().toString(36).slice(2, 8)}`,
  text: "A comment",
  page,
  author: "Ana Pérez",
  authorId: "u_42",
  createdAt: "2026-08-18T10:00:00.000Z",
  replies: [],
  status: "open",
  type: "bug",
  priority: "high",
  tags: [],
  ...overrides,
});

describe("metrics panel and exports", () => {
  let overlay;
  let downloads;

  beforeEach(() => {
    document.elementFromPoint = () => null;
    document.body.innerHTML = `<section id="target">Compare our plans</section>`;
    overlay = new CommentOverlay({ user: { name: "Ana Pérez", id: "u_42" } });

    downloads = [];
    URL.createObjectURL = vi.fn(() => "blob:stub");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      function () {
        downloads.push(this.download);
      }
    );
  });

  afterEach(() => {
    overlay?.cleanup?.();
    cleanupDom();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("getMetrics", () => {
    it("aggregates every comment the widget holds, not just this page's", () => {
      overlay.loadComments([
        stored(location.pathname),
        stored("/pricing"),
        stored("/pricing", { status: "resolved" }),
      ]);

      const metrics = overlay.getMetrics();
      expect(metrics.total).toBe(3);
      expect(metrics.byStatus.open).toBe(2);
      expect(metrics.byStatus.resolved).toBe(1);
      expect(metrics.byType.bug).toBe(3);
    });

    it("answers with zeroes rather than throwing on an empty corpus", () => {
      expect(overlay.getMetrics().total).toBe(0);
    });
  });

  describe("the dashboard inside the inbox", () => {
    const openMetrics = () => {
      overlay.toggleInbox();
      overlay.shadowRoot.querySelector(`.${CLASSES.INBOX_METRICS_BTN}`).click();
      return overlay.shadowRoot.querySelector(`.${CLASSES.METRICS_VIEW}`);
    };

    it("shares one cluster with the close button, not the whole header width", () => {
      // Three children under `space-between` scattered the trio: the filter
      // against one edge, close against the other, and Metrics adrift in the
      // middle. Same failure the detail header already recorded, same fix.
      overlay.loadComments([stored(location.pathname)]);
      overlay.toggleInbox();

      const group = overlay.shadowRoot.querySelector(
        `.${CLASSES.INBOX_HEADER_ACTIONS}`
      );
      expect(group).not.toBeNull();
      expect(
        group.querySelector(`.${CLASSES.INBOX_METRICS_BTN}`)
      ).not.toBeNull();
      expect(group.querySelector(`.${CLASSES.INBOX_CLOSE}`)).not.toBeNull();
    });

    it("is reachable from the list header", () => {
      overlay.loadComments([stored(location.pathname)]);
      expect(openMetrics()).not.toBeNull();
    });

    it("takes the list's place rather than stacking on top of it", () => {
      overlay.loadComments([stored(location.pathname)]);
      openMetrics();

      expect(
        overlay.shadowRoot.querySelector(`.${CLASSES.INBOX_LIST}`)
      ).toBeNull();
    });

    it("comes back to the list", () => {
      overlay.loadComments([stored(location.pathname)]);
      openMetrics();

      overlay.shadowRoot.querySelector(`.${CLASSES.INBOX_BACK}`).click();

      expect(
        overlay.shadowRoot.querySelector(`.${CLASSES.METRICS_VIEW}`)
      ).toBeNull();
      expect(
        overlay.shadowRoot.querySelector(`.${CLASSES.INBOX_LIST}`)
      ).not.toBeNull();
    });

    it("measures what the panel is filtered to, not the whole corpus", () => {
      // The panel opens filtered to the current page, and the filter summary
      // sits right above the figures — so the dashboard answers "what am I
      // looking at" while getMetrics() answers "what is there".
      overlay.loadComments([
        stored(location.pathname),
        stored("/pricing"),
        stored("/pricing"),
      ]);

      const view = openMetrics();
      const total = view.querySelector(
        `.${CLASSES.METRICS_TILE_VALUE}`
      ).textContent;

      expect(total).toBe("1");
      expect(overlay.getMetrics().total).toBe(3);
    });
  });

  describe("exports", () => {
    beforeEach(() => {
      overlay.loadComments([stored(location.pathname), stored("/pricing")]);
    });

    it("hands over the comment corpus as a CSV", () => {
      overlay.exportCommentsCsv();
      expect(downloads).toEqual(["helldots-comments.csv"]);
    });

    it("hands over the aggregate figures as a CSV", () => {
      overlay.exportMetricsCsv();
      expect(downloads).toEqual(["helldots-metrics.csv"]);
    });

    it("builds the printable report in its own frame", () => {
      overlay.printMetricsReport();

      const frame = document.querySelector("iframe");
      expect(frame).not.toBeNull();
      expect(
        frame.contentDocument.querySelectorAll("table").length
      ).toBeGreaterThan(0);
    });

    it("prints in the widget's locale, not the page's", () => {
      overlay.cleanup();
      overlay = new CommentOverlay({ locale: "es" });
      overlay.loadComments([stored(location.pathname)]);
      overlay.printMetricsReport();

      expect(
        document.querySelector("iframe").contentDocument.body.textContent
      ).toContain("Métricas");
    });
  });
});
