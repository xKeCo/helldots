import { describe, it, expect } from "vitest";
import { captureContext } from "../src/metadata.js";

const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const SAFARI_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.2 Safari/605.1.15";
const FIREFOX_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0";

const fakeWindow = (navigatorOverrides = {}) => ({
  location: { href: "https://example.test/pricing?plan=pro" },
  innerWidth: 1440,
  innerHeight: 900,
  screen: { width: 2560, height: 1440 },
  devicePixelRatio: 2,
  navigator: {
    userAgent: CHROME_UA,
    language: "es-CO",
    ...navigatorOverrides,
  },
});

describe("captureContext", () => {
  it("captures url, viewport, screen and dpr", () => {
    const context = captureContext(fakeWindow());

    expect(context.version).toBe(1);
    expect(context.url).toBe("https://example.test/pricing?plan=pro");
    expect(context.viewport).toEqual({ width: 1440, height: 900 });
    expect(context.screen).toEqual({ width: 2560, height: 1440 });
    expect(context.devicePixelRatio).toBe(2);
    expect(context.language).toBe("es-CO");
  });

  it("always stores the raw user agent", () => {
    expect(captureContext(fakeWindow()).userAgent).toBe(CHROME_UA);
  });

  it("prefers userAgentData when the browser exposes it", () => {
    const context = captureContext(
      fakeWindow({
        userAgentData: {
          brands: [
            { brand: "Not)A;Brand", version: "99" },
            { brand: "Google Chrome", version: "120" },
          ],
          platform: "macOS",
        },
      })
    );

    // The GREASE filler brand must be skipped, never reported as the browser.
    expect(context.browser).toEqual({ name: "Google Chrome", version: "120" });
    expect(context.os.name).toBe("macOS");
  });

  it("parses Safari from the UA string when userAgentData is absent", () => {
    const context = captureContext(fakeWindow({ userAgent: SAFARI_UA }));
    expect(context.browser.name).toBe("Safari");
    expect(context.browser.version).toBe("17.2");
    expect(context.os).toEqual({ name: "macOS", version: "10.15.7" });
  });

  it("parses Firefox on Windows from the UA string", () => {
    const context = captureContext(fakeWindow({ userAgent: FIREFOX_UA }));
    expect(context.browser).toEqual({ name: "Firefox", version: "121.0" });
    expect(context.os.name).toBe("Windows");
  });

  it("does not report Chrome as Safari", () => {
    // Chrome's UA contains the literal "Safari/537.36" — order in the
    // lookup table is what keeps this correct.
    expect(captureContext(fakeWindow()).browser.name).toBe("Chrome");
  });

  it("degrades to unknown instead of throwing on an unparseable UA", () => {
    const context = captureContext(fakeWindow({ userAgent: "totally-opaque" }));
    expect(context.browser).toEqual({ name: "unknown", version: "" });
    expect(context.os).toEqual({ name: "unknown", version: "" });
    expect(context.userAgent).toBe("totally-opaque");
  });

  it("survives a navigator with nothing on it", () => {
    const context = captureContext(fakeWindow({ userAgent: "", language: "" }));
    expect(context.userAgent).toBe("");
    expect(context.browser.name).toBe("unknown");
  });
});
