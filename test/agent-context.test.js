import { describe, it, expect, afterEach } from "vitest";
import { buildAgentContext } from "../src/agent-context.js";
import { getStrings } from "../src/i18n.js";

afterEach(() => {
  document.body.innerHTML = "";
});

const baseComment = (overrides = {}) => ({
  id: 1,
  text: "El botón no respeta el padding",
  page: "/pricing",
  author: "Kevin Collazos",
  createdAt: "2026-07-03T10:00:00.000Z",
  replies: [],
  container: null,
  hidden: false,
  anchorState: "anchored",
  anchor: {
    version: 1,
    selector: "#pricing-section",
    fingerprint: {
      tagName: "SECTION",
      textSnippet: "Compare our plans and pick one today",
      attributes: { id: "pricing-section", "data-plan": "pro" },
      siblingIndex: 0,
      siblingCount: 1,
    },
    relativeX: 0.5,
    relativeY: 0.5,
  },
  ...overrides,
});

describe("buildAgentContext", () => {
  it("renders every section for a live anchored comment", () => {
    document.body.innerHTML = `<main class="flex layout"><section id="pricing-section" class="plans">Compare our plans and pick one today</section></main>`;
    const container = document.getElementById("pricing-section");
    const comment = baseComment({
      container,
      replies: [
        {
          id: 2,
          text: "confirmado en mobile",
          author: "QA",
          timestamp: "2026-07-03T11:00:00.000Z",
        },
      ],
    });

    const out = buildAgentContext(comment, {
      viewportWidth: 1557,
      viewportHeight: 1077,
    });

    expect(out).toContain("Page: /pricing");
    expect(out).toContain("Viewport: 1557x1077");
    expect(out).toContain("Anchor state: anchored");
    expect(out).toContain("Selector: #pricing-section");
    expect(out).toContain(
      'Element: <section id="pricing-section" class="plans">'
    );
    expect(out).toContain(
      "DOM path: body > main.flex.layout > section#pricing-section.plans"
    );
    expect(out).toContain(
      'Nearby text: "Compare our plans and pick one today"'
    );
    expect(out).toContain(
      "Comment by Kevin Collazos (2026-07-03T10:00:00.000Z):"
    );
    expect(out).toContain('"El botón no respeta el padding"');
    expect(out).toContain("Replies (1):");
    expect(out).toContain('- QA: "confirmado en mobile"');
  });

  it("reconstructs the element from the fingerprint when the container is gone", () => {
    const comment = baseComment({ anchorState: "orphaned" });
    const out = buildAgentContext(comment, {
      viewportWidth: 800,
      viewportHeight: 600,
    });

    expect(out).toContain("Anchor state: orphaned");
    expect(out).toContain(
      'Element: <section id="pricing-section" data-plan="pro">'
    );
    expect(out).toContain("DOM path: (unavailable)");
  });

  it("reports hidden state and (none) selector", () => {
    const comment = baseComment({ hidden: true });
    comment.anchor.selector = null;
    const out = buildAgentContext(comment, {
      viewportWidth: 800,
      viewportHeight: 600,
    });

    expect(out).toContain("Anchor state: hidden");
    expect(out).toContain("Selector: (none)");
  });

  it("omits the Replies section when there are none", () => {
    const out = buildAgentContext(baseComment(), {
      viewportWidth: 800,
      viewportHeight: 600,
    });
    expect(out).not.toContain("Replies");
  });

  it("survives a comment without anchor", () => {
    const out = buildAgentContext(baseComment({ anchor: null }), {
      viewportWidth: 800,
      viewportHeight: 600,
    });
    expect(out).toContain("Selector: (none)");
    expect(out).toContain("Element: (unknown)");
  });
});

describe("classification and context in the agent block", () => {
  const base = {
    id: 1,
    text: "broken",
    author: "Ana",
    createdAt: "2026-01-01T00:00:00.000Z",
    page: "/pricing",
    anchor: null,
    anchorState: "orphaned",
    container: null,
    replies: [],
    status: "open",
    type: null,
    priority: null,
    tags: [],
    resolvedAt: null,
    context: null,
  };
  const env = {
    viewportWidth: 1440,
    viewportHeight: 900,
    strings: getStrings("en"),
  };

  it("includes type, priority and tags when set", () => {
    const block = buildAgentContext(
      { ...base, type: "bug", priority: "high", tags: ["checkout", "ios"] },
      env
    );
    expect(block).toContain("Type: bug");
    expect(block).toContain("Priority: high");
    expect(block).toContain("Tags: checkout, ios");
  });

  it("omits neutral fields instead of printing (none)", () => {
    // The agent shouldn't have to read noise for data nobody filled in.
    const block = buildAgentContext({ ...base }, env);
    expect(block).not.toContain("Type:");
    expect(block).not.toContain("Priority:");
    expect(block).not.toContain("Tags:");
  });

  it("includes browser, OS and screen when context was captured", () => {
    const block = buildAgentContext(
      {
        ...base,
        context: {
          version: 1,
          url: "https://example.test/pricing",
          viewport: { width: 1440, height: 900 },
          screen: { width: 2560, height: 1440 },
          devicePixelRatio: 2,
          userAgent: "ua",
          browser: { name: "Chrome", version: "120" },
          os: { name: "macOS", version: "14.2" },
          language: "es-CO",
        },
      },
      env
    );
    expect(block).toContain("URL: https://example.test/pricing");
    expect(block).toContain("Browser: Chrome 120");
    expect(block).toContain("OS: macOS 14.2");
    expect(block).toContain("Screen: 2560x1440");
  });

  it("includes the resolution time on resolved comments", () => {
    const block = buildAgentContext(
      {
        ...base,
        status: "resolved",
        resolvedAt: "2026-01-03T04:00:00.000Z",
      },
      env
    );
    expect(block).toContain("Resolution time: 2d 4h");
  });

  it("omits the resolution time when the comment is unresolved", () => {
    expect(buildAgentContext({ ...base }, env)).not.toContain(
      "Resolution time:"
    );
  });

  it("still works without a strings dictionary", () => {
    // Back-compat: existing callers pass only viewport dimensions.
    const block = buildAgentContext(
      { ...base, type: "bug" },
      { viewportWidth: 1440, viewportHeight: 900 }
    );
    expect(block).toContain("Type: bug");
    expect(block).not.toContain("Resolution time:");
  });
});
