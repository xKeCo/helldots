// Serializable comment anchors. An anchor pairs a best-effort CSS selector
// (fast path) with a content fingerprint (verification + rescue path) so a
// comment can be re-attached to its element after a page reload. Design:
// docs/superpowers/specs/2026-07-02-comment-anchoring-design.md

import { HOST_PAGE_CLASSES } from "./constants.js";

const TEXT_SNIPPET_MAX = 64;
const MAX_CLASS_PATH_DEPTH = 3;
const MAX_STRUCTURAL_DEPTH = 5;

// A selector match is verified against the fingerprint before being trusted;
// the rescue path (fingerprint-only, no structural signal) demands more.
const SELECTOR_THRESHOLD = 0.6;
const RESCUE_THRESHOLD = 0.7;

const GENERATED_CLASS_PREFIX_RE = /^(css|sc|jsx|emotion)-/i;
const FRAMEWORK_DATA_ATTR_RE = /^data-(reactid|react-|v-|svelte-)/;
const STABLE_ATTR_NAMES = ["id", "name", "role", "aria-label"];
const SELECTOR_ATTR_NAMES = ["data-testid", "name", "aria-label"];

const escapeCss = (value) => {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
};

const escapeAttrValue = (value) => String(value).replace(/["\\]/g, "\\$&");

const isUnique = (selector, doc) => {
  try {
    return doc.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
};

const normalizeText = (text) =>
  (text || "").replace(/\s+/g, " ").trim().slice(0, TEXT_SNIPPET_MAX);

// Heuristic: tooling-generated class names (CSS-in-JS, scoped-CSS hashes)
// either carry a known prefix or contain a long token with digits in it.
// HellDots' own host-page classes are excluded outright — they are our
// transient state, not the page's structure, and anchoring to them produces
// a selector that stops matching as soon as the state clears.
const isStableClass = (cls) => {
  if (HOST_PAGE_CLASSES.includes(cls)) return false;
  if (GENERATED_CLASS_PREFIX_RE.test(cls)) return false;
  return !cls.split(/[-_]/).some((part) => part.length >= 5 && /\d/.test(part));
};

const stableClassesOf = (element) =>
  [...element.classList].filter(isStableClass);

const stableAttributes = (element) => {
  /** @type {Record<string, string>} */
  const attrs = {};
  for (const { name, value } of element.attributes) {
    const isStable =
      STABLE_ATTR_NAMES.includes(name) ||
      (name.startsWith("data-") && !FRAMEWORK_DATA_ATTR_RE.test(name));
    if (isStable && value) attrs[name] = value.slice(0, TEXT_SNIPPET_MAX);
  }
  return attrs;
};

const siblingPosition = (element) => {
  const parent = element.parentElement;
  if (!parent) return { index: 0, count: 1 };
  const sameTag = [...parent.children].filter(
    (child) => child.tagName === element.tagName
  );
  return { index: sameTag.indexOf(element), count: sameTag.length };
};

const idSelector = (element, doc) => {
  if (!element.id) return null;
  const selector = `#${escapeCss(element.id)}`;
  return isUnique(selector, doc) ? selector : null;
};

const attributeSelector = (element, doc) => {
  const tag = element.tagName.toLowerCase();
  for (const name of SELECTOR_ATTR_NAMES) {
    const value = element.getAttribute(name);
    if (!value) continue;
    const selector = `${tag}[${name}="${escapeAttrValue(value)}"]`;
    if (isUnique(selector, doc)) return selector;
  }
  return null;
};

const classPathSelector = (element, doc) => {
  const segments = [];
  let current = element;
  for (let depth = 0; depth < MAX_CLASS_PATH_DEPTH && current; depth++) {
    const classes = stableClassesOf(current);
    const tag = current.tagName.toLowerCase();
    segments.unshift(
      classes.length ? `${tag}.${classes.map(escapeCss).join(".")}` : tag
    );
    // The element's own segment must carry at least one stable class for
    // this strategy to say anything a structural path wouldn't.
    if (depth === 0 && !classes.length) return null;
    const selector = segments.join(" > ");
    if (isUnique(selector, doc)) return selector;
    current = current.parentElement;
  }
  return null;
};

const structuralSelector = (element, doc) => {
  if (element === doc.body) return "body";
  const segments = [];
  let current = element;
  for (let depth = 0; depth < MAX_STRUCTURAL_DEPTH && current; depth++) {
    if (current === doc.body) {
      segments.unshift("body");
      break;
    }
    if (current.id) {
      const rooted = [`#${escapeCss(current.id)}`, ...segments].join(" > ");
      if (isUnique(rooted, doc)) return rooted;
    }
    const { index } = siblingPosition(current);
    segments.unshift(
      `${current.tagName.toLowerCase()}:nth-of-type(${index + 1})`
    );
    current = current.parentElement;
  }
  const selector = segments.join(" > ");
  return isUnique(selector, doc) ? selector : null;
};

const generateSelector = (element, doc) =>
  idSelector(element, doc) ||
  attributeSelector(element, doc) ||
  classPathSelector(element, doc) ||
  structuralSelector(element, doc);

/**
 * Best-effort unique CSS selector for any element (or null). Exposed for
 * the overlay's target-visibility tracking; same cascade used by anchors.
 * @param {HTMLElement} element
 * @returns {string | null}
 */
export function generateElementSelector(element) {
  return generateSelector(element, element.ownerDocument);
}

/**
 * Captures a serializable anchor for `element` at creation time.
 * @param {HTMLElement} element
 * @param {number} relativeX
 * @param {number} relativeY
 * @returns {import('./index.d.ts').CommentAnchor}
 */
export function createAnchor(element, relativeX, relativeY) {
  const doc = element.ownerDocument;
  const { index, count } = siblingPosition(element);
  return {
    version: 1,
    selector: generateSelector(element, doc),
    fingerprint: {
      tagName: element.tagName,
      textSnippet: normalizeText(element.textContent),
      attributes: stableAttributes(element),
      siblingIndex: index,
      siblingCount: count,
    },
    relativeX,
    relativeY,
  };
}

const textSimilarity = (a, b) => {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.startsWith(b) || b.startsWith(a)) return 0.8;
  const tokensA = new Set(a.split(" "));
  const tokensB = new Set(b.split(" "));
  let common = 0;
  for (const token of tokensA) if (tokensB.has(token)) common++;
  return (2 * common) / (tokensA.size + tokensB.size);
};

const attributeSimilarity = (element, attrs) => {
  const names = Object.keys(attrs);
  if (!names.length) return 1;
  let matched = 0;
  for (const name of names) {
    if (
      (element.getAttribute(name) || "").slice(0, TEXT_SNIPPET_MAX) ===
      attrs[name]
    ) {
      matched++;
    }
  }
  return matched / names.length;
};

const positionSimilarity = (element, fingerprint) => {
  const { index, count } = siblingPosition(element);
  const delta = Math.abs(index - fingerprint.siblingIndex);
  const span = Math.max(fingerprint.siblingCount, count, 1);
  return Math.max(0, 1 - delta / span);
};

const scoreElement = (element, fingerprint) => {
  if (element.tagName !== fingerprint.tagName) return 0;

  const hasText = Boolean(fingerprint.textSnippet);
  const hasAttrs = Object.keys(fingerprint.attributes || {}).length > 0;

  // Base weights (text 0.5 / attrs 0.3 / position 0.2); a missing signal's
  // weight shifts to the other content signal so the scale stays 0–1.
  let textWeight = 0.5;
  let attrWeight = 0.3;
  const posWeight = 0.2;
  if (!hasAttrs) {
    textWeight += attrWeight;
    attrWeight = 0;
  } else if (!hasText) {
    attrWeight += textWeight;
    textWeight = 0;
  }

  // Degenerate fingerprint: only structural signal remains.
  if (!hasText && !hasAttrs) {
    return positionSimilarity(element, fingerprint);
  }

  return (
    textWeight *
      textSimilarity(
        normalizeText(element.textContent),
        fingerprint.textSnippet
      ) +
    attrWeight * attributeSimilarity(element, fingerprint.attributes || {}) +
    posWeight * positionSimilarity(element, fingerprint)
  );
};

const bestMatch = (candidates, fingerprint) => {
  let best = null;
  for (const element of candidates) {
    const confidence = scoreElement(element, fingerprint);
    if (
      !best ||
      confidence > best.confidence ||
      // On an exact tie prefer the deepest candidate. Document order yields
      // ancestors first, and with the text snippet truncated to 64 chars a
      // parent and its child tie systematically — the most specific element
      // that scores the same is the better anchor (the selector cascade's
      // intuition). Ties between unrelated elements keep document order.
      (confidence === best.confidence && best.element.contains(element))
    ) {
      best = { element, confidence };
    }
  }
  return best;
};

/**
 * Re-locates the element an anchor points at, or null if no candidate is
 * trustworthy (orphaned comment). Never throws.
 * @param {import('./index.d.ts').CommentAnchor} anchor
 * @param {Document} [doc]
 * @returns {{ element: HTMLElement, confidence: number } | null}
 */
export function resolveAnchor(anchor, doc = document) {
  // An anchor written by a newer schema than this code understands is
  // treated as orphaned rather than half-interpreted: the comment stays
  // listed but is never positioned over a guessed element.
  if (anchor?.version != null && anchor.version > 1) return null;

  const fingerprint = anchor?.fingerprint;
  if (!fingerprint || !fingerprint.tagName) return null;

  if (anchor.selector) {
    let candidates = [];
    try {
      candidates = [...doc.querySelectorAll(anchor.selector)];
    } catch {
      // Corrupt selector — the rescue search below still applies.
    }
    const best = bestMatch(candidates, fingerprint);
    if (best && best.confidence >= SELECTOR_THRESHOLD) return best;
  }

  // Rescue search: only meaningful when the fingerprint carries content
  // signal — anonymous elements would make any tag-wide match a guess.
  const hasSignal =
    Boolean(fingerprint.textSnippet) ||
    Object.keys(fingerprint.attributes || {}).length > 0;
  if (!hasSignal) return null;

  let candidates;
  try {
    candidates = [...doc.querySelectorAll(fingerprint.tagName)];
  } catch {
    return null;
  }
  const best = bestMatch(candidates, fingerprint);
  return best && best.confidence >= RESCUE_THRESHOLD ? best : null;
}
