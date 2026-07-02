import { describe, it, expect, afterEach } from "vitest";
import { createAnchor, resolveAnchor } from "../src/anchor.js";

const setBody = (html) => {
  document.body.innerHTML = html;
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("createAnchor", () => {
  describe("selector cascade", () => {
    it("uses the element id when it is unique", () => {
      setBody(`<section id="hero"><h1>Welcome</h1></section>`);
      const el = document.getElementById("hero");
      const anchor = createAnchor(el, 0.5, 0.5);
      expect(anchor.selector).toBe("#hero");
    });

    it("escapes ids that need it", () => {
      setBody(`<div id="my:id"><p>x</p></div>`);
      const el = document.querySelector("div");
      const anchor = createAnchor(el, 0.1, 0.1);
      expect(document.querySelectorAll(anchor.selector)).toHaveLength(1);
      expect(document.querySelector(anchor.selector)).toBe(el);
    });

    it("skips a non-unique id and still resolves the right element", () => {
      setBody(
        `<div id="dup">first</div><div id="dup"><span>second</span></div>`
      );
      const el = document.querySelectorAll("div")[1];
      const anchor = createAnchor(el, 0.1, 0.1);
      expect(anchor.selector === null || anchor.selector !== "#dup").toBe(true);
      if (anchor.selector) {
        expect(document.querySelectorAll(anchor.selector)).toHaveLength(1);
        expect(document.querySelector(anchor.selector)).toBe(el);
      }
    });

    it("falls back to a stable attribute when there is no id", () => {
      setBody(
        `<button data-testid="cta">Buy</button><button>Other</button>`
      );
      const el = document.querySelector("button");
      const anchor = createAnchor(el, 0.5, 0.5);
      expect(anchor.selector).toBe('button[data-testid="cta"]');
    });

    it("uses aria-label as a stable attribute", () => {
      setBody(`<nav aria-label="Main menu"><a href="#">x</a></nav>`);
      const el = document.querySelector("nav");
      const anchor = createAnchor(el, 0.5, 0.5);
      expect(anchor.selector).toBe('nav[aria-label="Main menu"]');
    });

    it("builds a short path from stable classes", () => {
      setBody(
        `<div class="plans"><section class="card">A</section></div>` +
          `<div class="other"><section class="card">B</section></div>`
      );
      const el = document.querySelector(".plans .card");
      const anchor = createAnchor(el, 0.5, 0.5);
      expect(document.querySelectorAll(anchor.selector)).toHaveLength(1);
      expect(document.querySelector(anchor.selector)).toBe(el);
      expect(anchor.selector).toContain(".plans");
    });

    it("filters out generated CSS-in-JS classes", () => {
      setBody(
        `<div class="css-1x2y3z sc-bdVaJa jsx-3812093"><p>a</p></div>` +
          `<div class="css-9z8y7x"><p>b</p></div>`
      );
      const el = document.querySelectorAll("div")[0];
      const anchor = createAnchor(el, 0.5, 0.5);
      if (anchor.selector) {
        expect(anchor.selector).not.toMatch(/css-|sc-|jsx-/);
      }
    });

    it("falls back to an nth-of-type structural path", () => {
      setBody(
        `<div><p>first</p></div><div><p>second</p><p>third</p></div>`
      );
      const el = document.querySelectorAll("div")[1].querySelectorAll("p")[1];
      const anchor = createAnchor(el, 0.5, 0.5);
      expect(anchor.selector).toBeTruthy();
      expect(document.querySelectorAll(anchor.selector)).toHaveLength(1);
      expect(document.querySelector(anchor.selector)).toBe(el);
    });

    it("roots the structural path at the nearest ancestor with an id", () => {
      setBody(
        `<main id="app"><div><span>x</span><span>y</span></div></main>`
      );
      const el = document.querySelectorAll("span")[1];
      const anchor = createAnchor(el, 0.5, 0.5);
      expect(anchor.selector).toContain("#app");
      expect(document.querySelector(anchor.selector)).toBe(el);
    });

    it("returns 'body' for document.body", () => {
      const anchor = createAnchor(document.body, 0.5, 0.5);
      expect(anchor.selector).toBe("body");
    });
  });

  describe("fingerprint", () => {
    it("captures tagName, text snippet, attributes and sibling position", () => {
      setBody(
        `<section></section>` +
          `<section id="pricing" role="region" data-plan="pro">` +
          `  Compare   our    plans and pick one` +
          `</section>` +
          `<section></section>`
      );
      const el = document.getElementById("pricing");
      const anchor = createAnchor(el, 0.25, 0.75);

      expect(anchor.version).toBe(1);
      expect(anchor.fingerprint.tagName).toBe("SECTION");
      expect(anchor.fingerprint.textSnippet).toBe(
        "Compare our plans and pick one"
      );
      expect(anchor.fingerprint.attributes).toMatchObject({
        id: "pricing",
        role: "region",
        "data-plan": "pro",
      });
      expect(anchor.fingerprint.siblingIndex).toBe(1);
      expect(anchor.fingerprint.siblingCount).toBe(3);
      expect(anchor.relativeX).toBe(0.25);
      expect(anchor.relativeY).toBe(0.75);
    });

    it("truncates the text snippet to 64 chars", () => {
      setBody(`<p>${"word ".repeat(50)}</p>`);
      const el = document.querySelector("p");
      const anchor = createAnchor(el, 0, 0);
      expect(anchor.fingerprint.textSnippet.length).toBeLessThanOrEqual(64);
    });

    it("excludes framework-internal data attributes", () => {
      setBody(
        `<div data-reactid=".0.1" data-v-f3f3eg9 data-user="kev">x</div>`
      );
      const el = document.querySelector("div");
      const anchor = createAnchor(el, 0, 0);
      expect(anchor.fingerprint.attributes["data-reactid"]).toBeUndefined();
      expect(anchor.fingerprint.attributes["data-v-f3f3eg9"]).toBeUndefined();
      expect(anchor.fingerprint.attributes["data-user"]).toBe("kev");
    });

    it("survives a JSON round-trip without loss", () => {
      setBody(`<section id="hero">Hello</section>`);
      const el = document.getElementById("hero");
      const anchor = createAnchor(el, 0.5, 0.5);
      expect(JSON.parse(JSON.stringify(anchor))).toEqual(anchor);
    });
  });
});

describe("resolveAnchor", () => {
  it("resolves via selector when the fingerprint matches", () => {
    setBody(`<section id="hero">Welcome to the site</section>`);
    const el = document.getElementById("hero");
    const anchor = createAnchor(el, 0.5, 0.5);

    const result = resolveAnchor(anchor);
    expect(result).not.toBeNull();
    expect(result.element).toBe(el);
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("resolves after a reload-like DOM rebuild (identical markup)", () => {
    const markup = `<div class="plans"><section class="card">Pro plan</section></div>`;
    setBody(markup);
    const anchor = createAnchor(document.querySelector(".card"), 0.5, 0.5);

    setBody(markup); // fresh, identical DOM — old element reference is gone
    const result = resolveAnchor(anchor);
    expect(result).not.toBeNull();
    expect(result.element).toBe(document.querySelector(".card"));
  });

  it("rejects a selector match whose content is clearly different", () => {
    setBody(`<section id="hero">Welcome to our amazing product page</section>`);
    const anchor = createAnchor(document.getElementById("hero"), 0.5, 0.5);

    setBody(`<section id="hero">Totally unrelated legal disclaimer text</section>`);
    const result = resolveAnchor(anchor);
    expect(result).toBeNull();
  });

  it("rescues by fingerprint when the selector is broken but content is intact", () => {
    setBody(
      `<div class="pricing"><section class="card">Compare our plans and pick one today</section></div>`
    );
    const anchor = createAnchor(document.querySelector(".card"), 0.5, 0.5);

    // Classes renamed (selector broken), same content and position
    setBody(
      `<div class="pricing-v2"><section class="card-v2">Compare our plans and pick one today</section></div>`
    );
    const result = resolveAnchor(anchor);
    expect(result).not.toBeNull();
    expect(result.element).toBe(document.querySelector(".card-v2"));
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("returns null when the element was removed", () => {
    setBody(`<section id="gone">Ephemeral content here</section>`);
    const anchor = createAnchor(document.getElementById("gone"), 0.5, 0.5);

    setBody(`<div>Everything changed</div>`);
    expect(resolveAnchor(anchor)).toBeNull();
  });

  it("degenerate fingerprint (no text, no attributes) resolves only via selector", () => {
    setBody(`<main id="app"><div></div><div></div></main>`);
    const el = document.querySelectorAll("main > div")[1];
    const anchor = createAnchor(el, 0.5, 0.5);
    expect(anchor.fingerprint.textSnippet).toBe("");
    expect(Object.keys(anchor.fingerprint.attributes)).toHaveLength(0);

    // Same DOM: selector still works
    const result = resolveAnchor(anchor);
    expect(result).not.toBeNull();
    expect(result.element).toBe(el);

    // Selector broken: rescue must NOT guess between anonymous divs
    setBody(`<main><div></div><div></div></main>`);
    expect(resolveAnchor(anchor)).toBeNull();
  });

  it("does not throw on a malformed selector and falls through to rescue", () => {
    setBody(`<section>Compare our plans and pick one today</section>`);
    const el = document.querySelector("section");
    const anchor = createAnchor(el, 0.5, 0.5);
    anchor.selector = ":::not-a-selector[";

    const result = resolveAnchor(anchor);
    expect(result).not.toBeNull();
    expect(result.element).toBe(el);
  });

  it("returns null for null or fingerprint-less anchors", () => {
    expect(resolveAnchor(null)).toBeNull();
    expect(resolveAnchor({ version: 1, selector: "body" })).toBeNull();
  });

  it("reaches full confidence without attributes when text and position match", () => {
    setBody(`<p>Some very specific paragraph text</p>`);
    const el = document.querySelector("p");
    const anchor = createAnchor(el, 0.5, 0.5);
    anchor.selector = null; // force rescue path
    expect(Object.keys(anchor.fingerprint.attributes)).toHaveLength(0);

    const result = resolveAnchor(anchor);
    expect(result).not.toBeNull();
    expect(result.confidence).toBeCloseTo(1, 5);
  });
});
