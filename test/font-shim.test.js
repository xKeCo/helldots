import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { extractFontFaceRules, renderPage } from "../src/capture.js";
import { domToCanvas } from "modern-screenshot";

vi.mock("modern-screenshot", () => ({ domToCanvas: vi.fn() }));

// A cross-origin sheet is one whose cssRules access throws SecurityError.
const sheet = (href, { readable }) => ({
  href,
  get cssRules() {
    if (!readable) throw new DOMException("blocked", "SecurityError");
    return { length: 1 };
  },
});

const withSheets = (sheets) =>
  vi
    .spyOn(document, "styleSheets", "get")
    .mockReturnValue(/** @type {any} */ (sheets));

const POPPINS = `@font-face {
  font-family: 'Poppins';
  font-style: normal;
  src: url(https://fonts.gstatic.com/s/poppins/a.woff2) format('woff2');
}`;

// jsdom hands back no sheet for a detached <style>, so the CSP probe reads
// "cannot embed" there and the shim would never run. Browsers without a
// strict style-src answer the other way; these tests are about the shim, so
// they say so explicitly.
const probeReports = (embeddable) =>
  vi.spyOn(document.implementation, "createHTMLDocument").mockReturnValue(
    /** @type {any} */ ({
      head: { appendChild: () => {} },
      createElement: () => ({ sheet: embeddable ? {} : null }),
    })
  );

beforeEach(() => {
  vi.mocked(domToCanvas).mockResolvedValue(/** @type {any} */ ({ width: 1 }));
  probeReports(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(domToCanvas).mockReset();
  vi.unstubAllGlobals();
  document.head.querySelectorAll("style").forEach((s) => s.remove());
});

describe("extractFontFaceRules", () => {
  it("keeps only the @font-face blocks, never the rest of the sheet", () => {
    // Injecting a whole third-party sheet into the host document would put
    // its layout rules last in the cascade and restyle the page mid-capture.
    // Only the font declarations are wanted.
    const css = `body { color: red !important }
${POPPINS}
.grid { display: none }`;

    const out = extractFontFaceRules(css);

    expect(out).toContain("Poppins");
    expect(out).toContain("@font-face");
    expect(out).not.toContain("color: red");
    expect(out).not.toContain(".grid");
  });

  it("keeps every block when a sheet declares several", () => {
    const out = extractFontFaceRules(`${POPPINS}\n${POPPINS}`);
    expect(out.match(/@font-face/g)).toHaveLength(2);
  });

  it("returns an empty string for a sheet with no fonts in it", () => {
    expect(extractFontFaceRules("h1 { font-size: 2em }")).toBe("");
  });

  it("survives an unbalanced block instead of looping forever", () => {
    expect(() => extractFontFaceRules("@font-face { src: url(a")).not.toThrow();
  });
});

describe("renderPage font shim", () => {
  // The bug this exists for: a page whose web font comes from a cross-origin
  // <link> renders its text in a fallback face, because cssRules throws on
  // that sheet and the @font-face never reaches the clone. Fallback metrics
  // differ, so text sits at different x positions than on screen, and a
  // tight drag crop comes back holding the wrong glyphs.
  it("parks unreadable sheets' font rules in a same-origin style, then removes it", async () => {
    withSheets([
      sheet("https://fonts.example/css?family=Poppins", { readable: false }),
    ]);
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, text: async () => POPPINS });
    vi.stubGlobal("fetch", fetchMock);

    let seenDuringRender = null;
    vi.mocked(domToCanvas).mockImplementation(async () => {
      seenDuringRender = [...document.head.querySelectorAll("style")].map(
        (s) => s.textContent
      );
      return /** @type {any} */ ({ width: 1 });
    });

    await renderPage({ embedCrossOriginFonts: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://fonts.example/css?family=Poppins",
      expect.anything()
    );
    expect(seenDuringRender.join("")).toContain("Poppins");
    // The host document must be left exactly as it was found.
    expect(document.head.querySelectorAll("style")).toHaveLength(0);
  });

  it("leaves readable sheets alone — the renderer already sees those", async () => {
    withSheets([sheet("https://same.origin/app.css", { readable: true })]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await renderPage({ embedCrossOriginFonts: true });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still renders when the fetch is refused", async () => {
    withSheets([
      sheet("https://fonts.example/refused.css", { readable: false }),
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
    );

    await expect(
      renderPage({ embedCrossOriginFonts: true })
    ).resolves.toBeTruthy();
    expect(document.head.querySelectorAll("style")).toHaveLength(0);
  });

  it("removes the style even when the render throws", async () => {
    withSheets([
      sheet("https://fonts.example/throws.css", { readable: false }),
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, text: async () => POPPINS })
    );
    vi.mocked(domToCanvas).mockRejectedValue(new Error("render blew up"));

    await expect(renderPage({ embedCrossOriginFonts: true })).rejects.toThrow(
      "render blew up"
    );
    expect(document.head.querySelectorAll("style")).toHaveLength(0);
  });

  it("does not fetch at all when fonts cannot be embedded anyway", async () => {
    // Under a strict style-src the shim could not be parsed and the render
    // runs with font: false — fetching would be pure waste.
    probeReports(false);
    withSheets([sheet("https://fonts.example/nocsp.css", { readable: false })]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await renderPage({ embedCrossOriginFonts: true });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.mocked(domToCanvas).mock.calls[0][1]).toMatchObject({
      font: false,
    });
  });
});

describe("embedCrossOriginFonts is opt-in", () => {
  // Fetching a third party's stylesheet mid-capture is network the host did
  // not ask a comment widget to make, so it stays off until asked for. The
  // cost of leaving it off is the bug it exists to fix: on a page whose font
  // is served cross-origin, captured text reflows into a fallback and drag
  // crops come back holding the wrong glyphs.
  const crossOrigin = () =>
    withSheets([
      sheet("https://fonts.example/opt-in.css", { readable: false }),
    ]);

  it("makes no request unless it is switched on", async () => {
    crossOrigin();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await renderPage();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.head.querySelectorAll("style")).toHaveLength(0);
  });

  it("makes no request when it is switched off explicitly", async () => {
    crossOrigin();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await renderPage({ embedCrossOriginFonts: false });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shims the fonts once switched on", async () => {
    crossOrigin();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, text: async () => POPPINS });
    vi.stubGlobal("fetch", fetchMock);

    let seenDuringRender = null;
    vi.mocked(domToCanvas).mockImplementation(async () => {
      seenDuringRender = document.head.querySelectorAll("style").length;
      return /** @type {any} */ ({ width: 1 });
    });

    await renderPage({ embedCrossOriginFonts: true });

    expect(fetchMock).toHaveBeenCalled();
    expect(seenDuringRender).toBe(1);
    expect(document.head.querySelectorAll("style")).toHaveLength(0);
  });
});
