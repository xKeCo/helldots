const TAG_NAME = "helldots-root";

class HelldotsRoot extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }
}

const ensureDefined = () => {
  if (!customElements.get(TAG_NAME)) {
    customElements.define(TAG_NAME, HelldotsRoot);
  }
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
