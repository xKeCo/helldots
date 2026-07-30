const TAG_NAME = "helldots-root";

// Defined lazily rather than at module scope: `extends HTMLElement` is
// evaluated when the class expression runs, so a top-level declaration makes
// a bare `import "helldots"` throw on any server renderer (Next.js, Remix,
// Astro) long before the app calls anything. Deferring it keeps the module
// import-safe everywhere and only touches the DOM when we actually mount.
const ensureDefined = () => {
  if (customElements.get(TAG_NAME)) return;

  customElements.define(
    TAG_NAME,
    class HelldotsRoot extends HTMLElement {
      constructor() {
        super();
        this.attachShadow({ mode: "open" });
      }
    }
  );
};

/**
 * Returns the shared shadow root used to render all HellDots UI, creating
 * the host element and mounting it on document.body on first call.
 * @returns {ShadowRoot}
 */
export function getShadowRoot() {
  ensureDefined();

  let host = document.querySelector(TAG_NAME);
  if (!host) {
    host = document.createElement(TAG_NAME);
    document.body.appendChild(host);
  }

  return host.shadowRoot;
}

export { TAG_NAME };
