import { describe, it, expect } from "vitest";
import { computeMetrics } from "../src/metrics.js";

const T = (day, hour = 10) =>
  `2026-08-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00.000Z`;

const comment = (overrides = {}) => ({
  id: "c",
  status: "open",
  type: null,
  priority: null,
  createdAt: T(18),
  history: null,
  ...overrides,
});

// A comment resolved `hours` after creation, with the log that says so.
const resolvedAfter = (hours, overrides = {}) =>
  comment({
    status: "resolved",
    history: [
      { type: "created", at: T(18, 0), actor: { name: "A" } },
      {
        type: "status",
        at: T(18, hours),
        actor: { name: "A" },
        from: "open",
        to: "resolved",
      },
    ],
    createdAt: T(18, 0),
    ...overrides,
  });

describe("computeMetrics", () => {
  it("reports zeroes rather than blowing up on an empty corpus", () => {
    const metrics = computeMetrics([]);

    expect(metrics.total).toBe(0);
    expect(metrics.byStatus.open).toBe(0);
    expect(metrics.resolution.averageMs).toBeNull();
    expect(metrics.overTime).toEqual([]);
  });

  it("counts every status, including the ones nobody used", () => {
    const metrics = computeMetrics([
      comment({ status: "open" }),
      comment({ status: "open" }),
      comment({ status: "resolved" }),
    ]);

    expect(metrics.total).toBe(3);
    expect(metrics.byStatus).toEqual({
      open: 2,
      in_progress: 0,
      in_review: 0,
      resolved: 1,
    });
  });

  it("gives unclassified comments a bucket of their own", () => {
    const metrics = computeMetrics([
      comment({ type: "bug" }),
      comment({ type: null }),
      comment({ priority: "high" }),
    ]);

    expect(metrics.byType.bug).toBe(1);
    expect(metrics.byType.unset).toBe(2);
    expect(metrics.byPriority.high).toBe(1);
    expect(metrics.byPriority.unset).toBe(2);
  });

  it("buckets creation by day, oldest first", () => {
    const metrics = computeMetrics([
      comment({ createdAt: T(20) }),
      comment({ createdAt: T(18) }),
      comment({ createdAt: T(18, 22) }),
    ]);

    expect(metrics.overTime).toEqual([
      { date: "2026-08-18", count: 2 },
      { date: "2026-08-20", count: 1 },
    ]);
  });

  it("lists only the days that saw activity, never a run of empty ones", () => {
    // Two comments a year apart would otherwise produce 365 empty buckets,
    // and a bar per empty day is a chart nobody can read.
    const metrics = computeMetrics([
      comment({ createdAt: "2026-01-01T10:00:00.000Z" }),
      comment({ createdAt: "2026-12-31T10:00:00.000Z" }),
    ]);

    expect(metrics.overTime).toHaveLength(2);
  });

  it("averages the resolution times it can compute", () => {
    const metrics = computeMetrics([
      resolvedAfter(2),
      resolvedAfter(4),
      comment({ status: "open" }),
    ]);

    expect(metrics.resolution.resolvedCount).toBe(2);
    expect(metrics.resolution.averageMs).toBe(3 * 3_600_000);
  });

  it("reports a median too, which one stale comment cannot drag", () => {
    const metrics = computeMetrics([
      resolvedAfter(1),
      resolvedAfter(2),
      resolvedAfter(21),
    ]);

    expect(metrics.resolution.averageMs).toBe(8 * 3_600_000);
    expect(metrics.resolution.medianMs).toBe(2 * 3_600_000);
  });

  it("takes the mean of the two middle values on an even count", () => {
    const metrics = computeMetrics([
      resolvedAfter(1),
      resolvedAfter(2),
      resolvedAfter(4),
      resolvedAfter(5),
    ]);

    expect(metrics.resolution.medianMs).toBe(3 * 3_600_000);
  });

  it("leaves the average null when nothing has been resolved", () => {
    const metrics = computeMetrics([comment(), comment({ status: "open" })]);

    expect(metrics.resolution.resolvedCount).toBe(0);
    expect(metrics.resolution.averageMs).toBeNull();
    expect(metrics.resolution.medianMs).toBeNull();
  });

  it("counts how many comments came back after being resolved", () => {
    const reopened = comment({
      status: "resolved",
      createdAt: T(18, 0),
      history: [
        {
          type: "status",
          at: T(18, 1),
          actor: { name: "A" },
          from: "open",
          to: "resolved",
        },
        {
          type: "status",
          at: T(18, 2),
          actor: { name: "A" },
          from: "resolved",
          to: "open",
        },
        {
          type: "status",
          at: T(18, 3),
          actor: { name: "A" },
          from: "open",
          to: "resolved",
        },
      ],
    });

    const metrics = computeMetrics([reopened, resolvedAfter(1)]);
    expect(metrics.resolution.reopenedCount).toBe(1);
  });

  it("still averages comments that predate the log, from their stamp", () => {
    const metrics = computeMetrics([
      comment({
        status: "resolved",
        createdAt: T(18, 0),
        resolvedAt: T(18, 6),
        history: null,
      }),
    ]);

    expect(metrics.resolution.averageMs).toBe(6 * 3_600_000);
  });
});
