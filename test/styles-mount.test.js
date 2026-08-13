// F5.5 — how the stylesheets reach the page.
//
// Injecting <style> elements is what a strict `style-src` CSP blocks, and a
// blocked stylesheet means an unusable widget (unpositioned markers, an
// invisible toolbar). Constructed stylesheets are not subject to style-src,
// so they are the path taken wherever the platform offers them.
//
// jsdom implements `new CSSStyleSheet()` + `replaceSync` but NOT
// `adoptedStyleSheets`, so it naturally exercises the <style> fallback —
// which is why the adopting path is driven here by declaring the property
// the way a real browser does.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import CommentOverlay from "../src/overlay.js";
import { IDS } from "../src/constants.js";
import { TAG_NAME } from "../src/root-element.js";

vi.mock("../src/capture.js", () => ({
  renderPage: vi.fn().mockResolvedValue({ width: 0, height: 0 }),
  cropRegion: vi.fn().mockReturnValue("data:image/png;base64,mocked"),
  cropViewport: vi.fn().mockReturnValue("data:image/jpeg;base64,mocked"),
  AUTO_SCALE: 0.5,
}));

const cleanupDom = () => {
  document.querySelectorAll(TAG_NAME).forEach((el) => el.remove());
  document.getElementById(IDS.GLOBAL_STYLES)?.remove();
  document.body.className = "";
  document.body.innerHTML = "";
};

// Declares `adoptedStyleSheets` on both prototypes, which is the signal the
// implementation feature-detects on. Returns the undo.
//
// The undo also deletes the OWN property that assigning to it creates on
// `document`: jsdom reuses one document across the whole file, so a
// leftover own property would keep the feature looking supported and send
// the fallback tests down the adopting path.
const declareAdoptedSupport = () => {
  const protos = [ShadowRoot.prototype, Document.prototype];
  for (const proto of protos) {
    Object.defineProperty(proto, "adoptedStyleSheets", {
      value: [],
      writable: true,
      configurable: true,
    });
  }
  return () => {
    delete document.adoptedStyleSheets;
    for (const proto of protos) delete proto.adoptedStyleSheets;
  };
};

const rulesTextOf = (sheet) =>
  [...(sheet.cssRules ?? [])].map((rule) => rule.cssText).join("");

describe("stylesheet mounting", () => {
  let overlay;
  let undoSupport = null;

  beforeEach(() => {
    document.elementFromPoint = () => null;
  });

  afterEach(() => {
    overlay?.cleanup?.();
    overlay = null;
    undoSupport?.();
    undoSupport = null;
    cleanupDom();
    vi.restoreAllMocks();
  });

  describe("where the platform supports constructed stylesheets", () => {
    beforeEach(() => {
      undoSupport = declareAdoptedSupport();
    });

    it("adopts the widget stylesheet instead of injecting a <style>", () => {
      overlay = new CommentOverlay();

      // No <style> anywhere: this is the whole point under a strict CSP.
      expect(overlay.shadowRoot.getElementById(IDS.STYLES)).toBeNull();
      const adopted = overlay.shadowRoot.adoptedStyleSheets;
      expect(adopted).toHaveLength(1);
      expect(rulesTextOf(adopted[0])).toContain("comment-circle");
    });

    it("adopts the host-page rules on the document, not into <head>", () => {
      overlay = new CommentOverlay();

      expect(document.getElementById(IDS.GLOBAL_STYLES)).toBeNull();
      const adopted = document.adoptedStyleSheets;
      expect(adopted).toHaveLength(1);
      // The global sheet exists for rules that target the host page itself.
      expect(rulesTextOf(adopted[0])).toContain("comment-cursor");
    });

    it("keeps stylesheets the host app had already adopted", () => {
      // Frameworks (Lit, and anything using constructed sheets) adopt onto
      // the document too. Overwriting the array would delete their styles.
      const hostSheet = new CSSStyleSheet();
      hostSheet.replaceSync(".host-app-rule{color:red}");
      document.adoptedStyleSheets = [hostSheet];

      overlay = new CommentOverlay();

      expect(document.adoptedStyleSheets).toHaveLength(2);
      expect(document.adoptedStyleSheets[0]).toBe(hostSheet);
    });

    it("cleanup detaches only its own sheet from the document", () => {
      const hostSheet = new CSSStyleSheet();
      hostSheet.replaceSync(".host-app-rule{color:red}");
      document.adoptedStyleSheets = [hostSheet];

      overlay = new CommentOverlay();
      overlay.cleanup();
      overlay = null;

      // Leaving ours behind would keep styling the host page — including
      // the comment-mode cursor — after the widget is gone.
      expect(document.adoptedStyleSheets).toEqual([hostSheet]);
    });

    it("re-injecting does not adopt the same sheet twice", () => {
      overlay = new CommentOverlay();
      overlay.injectStyles();

      expect(overlay.shadowRoot.adoptedStyleSheets).toHaveLength(1);
      expect(document.adoptedStyleSheets).toHaveLength(1);
    });

    it("falls back to <style> when constructing a sheet throws", () => {
      // Older WebKit exposed CSSStyleSheet without making it constructible.
      const RealSheet = globalThis.CSSStyleSheet;
      class HostileSheet {
        constructor() {
          throw new TypeError("Illegal constructor");
        }
      }
      globalThis.CSSStyleSheet = /** @type {any} */ (HostileSheet);
      try {
        overlay = new CommentOverlay();
        expect(overlay.shadowRoot.getElementById(IDS.STYLES)).toBeTruthy();
        expect(document.getElementById(IDS.GLOBAL_STYLES)).toBeTruthy();
      } finally {
        globalThis.CSSStyleSheet = RealSheet;
      }
    });
  });

  describe("where it does not (the <style> fallback)", () => {
    it("injects both stylesheets as elements", () => {
      // jsdom has no adoptedStyleSheets, so this is the default path here.
      overlay = new CommentOverlay();

      expect(overlay.shadowRoot.getElementById(IDS.STYLES)).toBeTruthy();
      expect(document.getElementById(IDS.GLOBAL_STYLES)).toBeTruthy();
    });

    it("cleanup removes the injected global <style>", () => {
      overlay = new CommentOverlay();
      overlay.cleanup();
      overlay = null;

      expect(document.getElementById(IDS.GLOBAL_STYLES)).toBeNull();
    });
  });
});
