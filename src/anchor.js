// Serializable comment anchors. An anchor pairs a best-effort CSS selector
// (fast path) with a content fingerprint (verification + rescue path) so a
// comment can be re-attached to its element after a page reload. Design:
// docs/superpowers/specs/2026-07-02-comment-anchoring-design.md

const TEXT_SNIPPET_MAX = 64;
const MAX_CLASS_PATH_DEPTH = 3;
const MAX_STRUCTURAL_DEPTH = 5;

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
const isStableClass = (cls) => {
  if (GENERATED_CLASS_PREFIX_RE.test(cls)) return false;
  return !cls
    .split(/[-_]/)
    .some((part) => part.length >= 5 && /\d/.test(part));
};

const stableClassesOf = (element) =>
  [...element.classList].filter(isStableClass);

const stableAttributes = (element) => {
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
      classes.length
        ? `${tag}.${classes.map(escapeCss).join(".")}`
        : tag
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
