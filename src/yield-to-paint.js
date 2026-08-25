// Handing the main thread back to the browser in the middle of a render.
//
// `modern-screenshot`'s API is asynchronous, but its clone traversal awaits
// promises that are already resolved. Those settle as MICROtasks, and the
// microtask queue drains completely before the browser gets to paint or to
// deliver a keystroke — so a 1.5 s render is 1.5 s of frozen page even
// though not one call inside it is synchronous. Only a MACROtask breaks
// that up. This module is that macrotask, on a time budget.

/** Half a 60 Hz frame: enough headroom left for the browser to paint. */
const YIELD_BUDGET_MS = 8;

const now = () =>
  typeof performance?.now === "function" ? performance.now() : Date.now();

/**
 * One macrotask turn.
 *
 * `setTimeout` would also be a task, but every browser clamps a nested
 * timeout to 4 ms, and on a heavy page this runs a couple of hundred times
 * — the clamp alone would add most of a second to the render it is meant
 * to make bearable. A `MessageChannel` message is a task with no clamp.
 * @returns {Promise<void>}
 */
const nextTask = () =>
  new Promise((resolve) => {
    if (typeof MessageChannel !== "function") {
      setTimeout(resolve);
      return;
    }
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });

/**
 * Yields to the browser, preferring the API built for exactly this.
 *
 * `scheduler.yield()` resumes at continuation priority, so the render keeps
 * its place ahead of unrelated work the page may have queued; the
 * `MessageChannel` fallback goes to the back of the task queue instead.
 * @returns {Promise<void>}
 */
const yieldToBrowser = () => {
  const scheduler = /** @type {any} */ (globalThis).scheduler;
  if (typeof scheduler?.yield === "function") return scheduler.yield();
  return nextTask();
};

/**
 * Builds a per-render callback that yields once the time budget is spent.
 *
 * Time, not a node count: the cost of a node is not a constant. A synthetic
 * `<div>` clones in ~0.14 ms and a styled application node in ~0.44 ms, so
 * any fixed "every N nodes" is either a stutter on one page or pointless
 * overhead on another. A budget adapts to whatever it is actually walking.
 *
 * The returned function is the hot path — it runs once per cloned node — so
 * the common case returns `undefined` synchronously rather than allocating
 * a promise the caller would await for nothing.
 *
 * A rejection is treated as a completed yield, not propagated: this hook is
 * awaited inside the clone traversal, so throwing here would take the whole
 * capture down. Failing to pause is worth strictly less than failing to
 * produce the screenshot the widget exists to collect.
 * @param {{ budgetMs?: number }} [options]
 * @returns {() => Promise<void> | undefined}
 */
export function createPaintYielder({ budgetMs = YIELD_BUDGET_MS } = {}) {
  let last = now();
  const resume = () => {
    // Stamped after the yield resolves, not before: the time spent parked
    // in the task queue is the browser's, and charging it to the next
    // budget would make every following slice shorter than asked for.
    last = now();
  };
  return () => {
    if (now() - last < budgetMs) return undefined;
    return yieldToBrowser().then(resume, resume);
  };
}
