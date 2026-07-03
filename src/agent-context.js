// Builds the plain-text context block the inbox "copy" action puts on the
// clipboard — enough for a coding agent to locate the element and understand
// the reported issue (page, viewport, selector, DOM path, thread).

const openingTagOf = (element) => {
  const attrs = [...element.attributes]
    .map(({ name, value }) => `${name}="${value}"`)
    .join(" ");
  return `<${element.tagName.toLowerCase()}${attrs ? ` ${attrs}` : ""}>`;
};

const openingTagFromFingerprint = (fingerprint) => {
  if (!fingerprint?.tagName) return "(unknown)";
  const attrs = Object.entries(fingerprint.attributes || {})
    .map(([name, value]) => `${name}="${value}"`)
    .join(" ");
  return `<${fingerprint.tagName.toLowerCase()}${attrs ? ` ${attrs}` : ""}>`;
};

// body > main.flex.layout > section#pricing.plans — tag + id + up to two
// classes per level, from body down to the element.
const domPathOf = (element) => {
  const segments = [];
  let current = element;
  while (current && current !== document.documentElement) {
    const tag = current.tagName.toLowerCase();
    const id = current.id ? `#${current.id}` : "";
    const classes = [...current.classList]
      .slice(0, 2)
      .map((cls) => `.${cls}`)
      .join("");
    segments.unshift(`${tag}${id}${classes}`);
    if (current === document.body) break;
    current = current.parentElement;
  }
  return segments.join(" > ");
};

/**
 * @param {import('./index.d.ts').Comment} comment
 * @param {{ viewportWidth: number, viewportHeight: number }} env
 * @returns {string}
 */
export function buildAgentContext(comment, { viewportWidth, viewportHeight }) {
  const anchor = comment.anchor;
  const fingerprint = anchor?.fingerprint;
  const live = comment.container?.isConnected ? comment.container : null;

  const state = comment.hidden ? "hidden" : comment.anchorState;
  const element = live
    ? openingTagOf(live)
    : openingTagFromFingerprint(fingerprint);
  const path = live ? domPathOf(live) : "(unavailable)";

  const lines = [
    `Page: ${comment.page}`,
    `Viewport: ${viewportWidth}x${viewportHeight}`,
    `Anchor state: ${state}`,
    `Status: ${comment.status || "open"}`,
    `Selector: ${anchor?.selector || "(none)"}`,
    `Element: ${element}`,
    `DOM path: ${path}`,
    `Nearby text: "${fingerprint?.textSnippet ?? ""}"`,
    `Comment by ${comment.author} (${comment.createdAt}):`,
    `"${comment.text}"`,
  ];

  const replies = comment.replies || [];
  if (replies.length > 0) {
    lines.push(`Replies (${replies.length}):`);
    for (const reply of replies) {
      lines.push(`- ${reply.author}: "${reply.text}"`);
    }
  }

  return lines.join("\n");
}
