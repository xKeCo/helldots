import { describe, it, expect, afterEach, vi } from "vitest";
import { createPaintYielder } from "../src/yield-to-paint.js";

/** Drives `performance.now()` by hand — the budget is the whole contract. */
const useClock = () => {
  let t = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => t);
  return {
    at: (value) => {
      t = value;
    },
  };
};

afterEach(() => {
  vi.restoreAllMocks();
  delete (/** @type {any} */ (globalThis).scheduler);
});

describe("createPaintYielder", () => {
  it("returns nothing while the budget still has room", () => {
    const clock = useClock();
    const yielder = createPaintYielder({ budgetMs: 8 });

    clock.at(1007);

    // Not `resolves.toBeUndefined()` — the point is that no promise was
    // allocated at all. This runs once per cloned node, thousands of times.
    expect(yielder()).toBeUndefined();
  });

  it("yields once the budget is spent", async () => {
    const clock = useClock();
    const yielder = createPaintYielder({ budgetMs: 8 });

    clock.at(1008);
    const parked = yielder();

    expect(parked).toBeInstanceOf(Promise);
    await expect(parked).resolves.toBeUndefined();
  });

  it("charges the time spent parked to the browser, not the next slice", async () => {
    // The stamp goes down AFTER the yield resolves. Stamping it before
    // would count however long the task queue held us against the next
    // budget, so every slice after the first would be cut short.
    const clock = useClock();
    const yielder = createPaintYielder({ budgetMs: 8 });

    clock.at(1010);
    const parked = yielder();
    clock.at(1500); // the browser took 490ms to hand the thread back
    await parked;

    clock.at(1505);
    expect(yielder()).toBeUndefined();
  });

  it("prefers scheduler.yield() when the browser has it", async () => {
    const clock = useClock();
    const schedulerYield = vi.fn(() => Promise.resolve());
    /** @type {any} */ (globalThis).scheduler = { yield: schedulerYield };
    const yielder = createPaintYielder({ budgetMs: 8 });

    clock.at(1020);
    await yielder();

    expect(schedulerYield).toHaveBeenCalledTimes(1);
  });

  it("survives a scheduler.yield() that rejects", async () => {
    // This hook is awaited inside the clone traversal: a rejection here
    // would abort the render and cost the screenshot entirely, which is a
    // far worse outcome than a frame that failed to yield.
    const clock = useClock();
    /** @type {any} */ (globalThis).scheduler = {
      yield: () => Promise.reject(new Error("aborted")),
    };
    const yielder = createPaintYielder({ budgetMs: 8 });

    clock.at(1020);

    await expect(yielder()).resolves.toBeUndefined();
  });

  it("keeps yielding across a long traversal", async () => {
    const clock = useClock();
    const yielder = createPaintYielder({ budgetMs: 8 });
    let yields = 0;

    for (let i = 1; i <= 100; i++) {
      clock.at(1000 + i * 4); // a node every 4ms — half the budget
      const parked = yielder();
      if (parked) {
        yields++;
        await parked;
        clock.at(1000 + i * 4); // the yield itself costs no simulated time
      }
    }

    // 100 nodes x 4ms = 400ms of work on an 8ms budget.
    expect(yields).toBe(50);
  });
});
