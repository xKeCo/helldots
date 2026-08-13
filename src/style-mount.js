// How the widget's CSS reaches the page.
//
// Injecting a <style> element is what a strict `style-src` Content Security
// Policy blocks — and a blocked stylesheet is not a cosmetic problem here:
// markers are positioned by CSS, so the widget becomes unusable rather than
// merely ugly. Constructed stylesheets (`new CSSStyleSheet` + `replaceSync`
// + `adoptedStyleSheets`) are not subject to style-src, because nothing is
// parsed from document markup.
//
// The <style> path stays as the fallback for platforms without constructed
// sheets (and for jsdom, where the whole test suite runs).

/**
 * Adopts or injects `css` into `target`.
 *
 * @param {ShadowRoot | Document} target where the styles apply — a shadow
 *   root for the widget's own UI, the document for the few rules that
 *   target the host page (the comment-mode cursor on <body>).
 * @param {string} css
 * @param {string} fallbackId id given to the injected <style>, so the
 *   fallback path stays inspectable and idempotent.
 * @returns {() => void} detaches exactly what this call mounted
 */
export function mountStyles(target, css, fallbackId) {
  const sheet = constructSheet(css, target);
  if (sheet) {
    // Appended, never assigned over: a host app (Lit, or anything else
    // using constructed sheets) adopts onto the document too, and
    // replacing the array would delete its styles.
    target.adoptedStyleSheets = [...(target.adoptedStyleSheets ?? []), sheet];
    return () => {
      target.adoptedStyleSheets = (target.adoptedStyleSheets ?? []).filter(
        (candidate) => candidate !== sheet
      );
    };
  }

  // A Document mounts into <head>; a shadow root takes the element itself.
  const parent = /** @type {any} */ (target).head ?? target;
  /** @type {any} */ (parent).querySelector?.(`#${fallbackId}`)?.remove();

  const style = document.createElement("style");
  style.id = fallbackId;
  style.textContent = css;
  parent.appendChild(style);
  return () => style.remove();
}

/**
 * A constructed stylesheet, or null where the platform cannot provide one.
 *
 * Both halves are checked: Safari shipped `CSSStyleSheet` for years without
 * making it constructible, and jsdom constructs sheets happily while not
 * implementing `adoptedStyleSheets` at all — so a sheet nobody can adopt
 * would silently style nothing.
 */
function constructSheet(css, target) {
  if (typeof CSSStyleSheet !== "function") return null;
  if (!("adoptedStyleSheets" in target)) return null;
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    return sheet;
  } catch {
    return null;
  }
}
