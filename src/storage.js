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

function tryWriteStoredComments(comments) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(comments));
    return true;
  } catch {
    return false;
  }
}

/**
 * Writes the full cross-page corpus. Each comment can carry a base64 JPEG
 * `contextScreenshot` (~33KB) captured automatically (RF1/RF2); a growing
 * corpus of those eventually blows through the ~5MB localStorage quota. On
 * a failed write, the automatic screenshots are the only thing sacrificed —
 * dropped one at a time starting with the oldest comment — so the comments
 * themselves (and any deliberate, user-attached `screenshots[]`) survive.
 * Never throws: a hostile or disabled localStorage just means no
 * persistence, not a broken widget.
 * @param {import('./index.d.ts').SerializedComment[]} comments
 * @returns {boolean} true once the write succeeded, possibly after shedding
 *   automatic screenshots; false if it still failed with nothing left to shed
 */
export function writeStoredComments(comments) {
  if (tryWriteStoredComments(comments)) return true;

  // Oldest first (by createdAt; ties/missing dates fall back to array
  // order), and only entries that actually have something to shed.
  const shedOrder = comments
    .map((comment, index) => ({ comment, index }))
    .filter(({ comment }) => comment?.contextScreenshot)
    .sort((a, b) => {
      const timeA = Date.parse(a.comment.createdAt);
      const timeB = Date.parse(b.comment.createdAt);
      if (Number.isFinite(timeA) && Number.isFinite(timeB) && timeA !== timeB) {
        return timeA - timeB;
      }
      return a.index - b.index;
    });

  if (shedOrder.length === 0) {
    console.warn(
      "HellDots: could not persist comments (storage quota exceeded, nothing left to shed)"
    );
    return false;
  }

  const working = [...comments];
  let shed = 0;
  for (const { index } of shedOrder) {
    working[index] = { ...working[index], contextScreenshot: null };
    shed++;
    if (tryWriteStoredComments(working)) {
      console.warn(
        `HellDots: localStorage quota exceeded — dropped the automatic ` +
          `context screenshot from the ${shed} oldest comment(s) to keep ` +
          `all comments persisted. Comment text, replies and user-attached ` +
          `screenshots were not touched.`
      );
      return true;
    }
  }

  console.warn(
    `HellDots: could not persist comments even after dropping all ${shed} ` +
      `automatic context screenshot(s); storage quota exceeded`
  );
  return false;
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
