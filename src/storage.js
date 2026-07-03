// localStorage adapter for the optional `persistence: "localStorage"` mode.
// One key holds the serialized comments of EVERY page (the inbox "all
// comments" filter needs them); merge logic keeps other pages' entries
// intact while treating in-memory state as the source of truth for ids it
// knows about. Storage failures (quota, disabled, corrupt JSON) never
// throw — the widget just runs without persistence.

export const STORAGE_KEY = "helldots-comments";

// sessionStorage handoff: set right before navigating to another page so
// the overlay there opens the inbox directly on that comment's detail.
export const PENDING_DETAIL_KEY = "helldots-pending-detail";

/**
 * @returns {import('./index.d.ts').SerializedComment[]}
 */
export function readStoredComments() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("HellDots: could not read stored comments", err);
    return [];
  }
}

/**
 * @param {import('./index.d.ts').SerializedComment[]} comments
 */
export function writeStoredComments(comments) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(comments));
  } catch (err) {
    console.warn("HellDots: could not persist comments", err);
  }
}

/**
 * Merges the in-memory snapshot into what's already stored: entries the
 * memory knows about (by id) and entries of the current page are replaced
 * by the snapshot; entries from other pages are preserved.
 * @param {import('./index.d.ts').SerializedComment[]} stored
 * @param {import('./index.d.ts').SerializedComment[]} current
 * @param {string} currentPage
 * @returns {import('./index.d.ts').SerializedComment[]}
 */
export function mergeForStorage(stored, current, currentPage) {
  const currentIds = new Set(current.map((c) => c.id));
  const kept = stored.filter(
    (c) => !currentIds.has(c.id) && c.page !== currentPage
  );
  return [...kept, ...current];
}
