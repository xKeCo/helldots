// RF2 — environment snapshot attached to every comment at creation time.
// Kept as a pure function over an injectable `window` so the UA parsing
// paths are testable without touching jsdom's real navigator.

// Order is load-bearing: Edge's UA contains "Chrome", and Chrome's UA
// contains "Safari". First match wins, so the more specific entries lead.
const BROWSERS = [
  { name: "Edge", re: /Edg\/([\d.]+)/ },
  { name: "Chrome", re: /Chrome\/([\d.]+)/ },
  { name: "Firefox", re: /Firefox\/([\d.]+)/ },
  { name: "Safari", re: /Version\/([\d.]+).*Safari/ },
];

// iOS before macOS: an iPhone UA also carries "Mac OS X".
const OPERATING_SYSTEMS = [
  { name: "iOS", re: /(?:iPhone|iPad).*OS ([\d_]+) like Mac OS X/ },
  { name: "Android", re: /Android ([\d.]+)/ },
  { name: "Windows", re: /Windows NT ([\d.]+)/ },
  { name: "macOS", re: /Mac OS X ([\d_.]+)/ },
  { name: "Linux", re: /Linux/ },
];

const UNKNOWN = { name: "unknown", version: "" };

// Chromium pads its brand list with a randomised "GREASE" entry to stop
// consumers hardcoding brand positions. It is never the real browser.
const isGreaseBrand = (brand) => /not[\W_]*a[\W_]*brand/i.test(brand);

const matchFirst = (table, ua) => {
  for (const { name, re } of table) {
    const match = ua.match(re);
    if (match) {
      return { name, version: (match[1] || "").replace(/_/g, ".") };
    }
  }
  return { ...UNKNOWN };
};

/**
 * Snapshots the browsing environment of the current page.
 * @param {any} [win] Injectable window — defaults to the real one.
 * @returns {import('./index.d.ts').CommentContext}
 */
export function captureContext(win = window) {
  const nav = win.navigator || {};
  const ua = nav.userAgent || "";
  const uaData = nav.userAgentData;

  let browser = matchFirst(BROWSERS, ua);
  const brand = uaData?.brands?.find((b) => !isGreaseBrand(b.brand));
  if (brand) {
    browser = { name: brand.brand, version: brand.version || "" };
  }

  const os = matchFirst(OPERATING_SYSTEMS, ua);
  if (uaData?.platform) os.name = uaData.platform;

  return {
    version: 1,
    url: win.location?.href || "",
    viewport: { width: win.innerWidth, height: win.innerHeight },
    screen: {
      width: win.screen?.width ?? 0,
      height: win.screen?.height ?? 0,
    },
    devicePixelRatio: win.devicePixelRatio ?? 1,
    userAgent: ua,
    browser,
    os,
    language: nav.language || "",
  };
}
