# Contexto automático, clasificación y tiempo de resolución — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada comentario de HellDots se cree con un screenshot y unos metadatos de contexto capturados solos, se pueda clasificar por tipo/prioridad/etiquetas, y muestre cuánto tardó en resolverse.

**Architecture:** El código nuevo vive en módulos enfocados (`src/metadata.js` nuevo; `src/capture.js` refactorizado a primitivos componibles) y `src/overlay.js` solo orquesta. El picker de estado que ya existe en `src/comment-actions.js` se generaliza a `createPicker` y pasa a servir a estado, tipo y prioridad, en vez de duplicarse tres veces.

**Tech Stack:** JavaScript ESM sin transpilador, Vitest + jsdom, esbuild, `modern-screenshot`, Shadow DOM, JSDoc + `index.d.ts` chequeado por `tsc`.

**Spec:** `docs/superpowers/specs/2026-07-29-comment-context-classification-design.md`

## Global Constraints

- **Idioma del código:** identificadores y comentarios en inglés. Los docs (`DECISIONS.md`, specs, planes) van en español, siguiendo lo que ya hay en el repo.
- **Presupuesto de tamaño:** `npm run size` debe seguir pasando. Punto de partida: 19.63 KB de 50 KB gzip.
- **i18n obligatorio:** todo string visible se añade a `src/locales/en.js` **y** `src/locales/es.js`. Nunca literales en la UI.
- **Accesibilidad:** ningún badge comunica significado solo con color — todos llevan texto. Gate de Lighthouse a11y en 0.9.
- **Sin romper la API pública:** `onCommentStatusChanged`, `captureRegion` y las firmas existentes de `index.d.ts` se mantienen.
- **`npm run typecheck` es un gate:** todo método público nuevo debe declararse en `src/index.d.ts` o `typecheck/consistency-check.ts` falla al compilar.
- **Los fallos de captura nunca abortan el guardado de un comentario.**
- **Comandos:** test `npx vitest run <archivo>`; suite completa `npm test`; lint `npm run lint`; tipos `npm run typecheck`; formato `npm run format`.
- **Estado neutro:** `type` y `priority` son `null` por defecto y deben poder volver a `null` desde la UI.
- **Helper de tests:** `test/overlay.test.js`, `test/inbox.test.js` y `test/persistence.test.js` construyen instancias con `makeOverlay(options)`, no `createOverlay`.

### Trampa conocida: los mocks de `capture.js` (afecta a la Task 8)

`test/overlay.test.js`, `test/inbox.test.js` y `test/persistence.test.js`
mockean `../src/capture.js` con una factory que expone **solo** `captureRegion`:

```js
vi.mock("../src/capture.js", () => ({
  captureRegion: vi.fn().mockResolvedValue("data:image/png;base64,mocked"),
}));
```

En cuanto la Task 8 haga que `overlay.js` importe `renderPage`, `cropRegion`,
`cropViewport`, `withHiddenOverlay` y `AUTO_SCALE`, esos tres mocks dejarán los
imports en `undefined` y las suites reventarán. La Task 8 debe **ampliar las tres
factories** para exponer también los exports nuevos.

Además, esos archivos llaman `overlay._placeCommentAtPoint(x, y)` de forma
síncrona en sus helpers. La Task 8 convierte ese método en `async`, así que
todas esas llamadas necesitan `await` y sus helpers pasan a ser `async`.

---

### Task 1: Constantes, tipos e i18n

Base que consumen todas las tareas siguientes. Sin esto, nada más compila.

**Files:**

- Modify: `src/constants.js`
- Modify: `src/locales/en.js`
- Modify: `src/locales/es.js`
- Modify: `src/index.d.ts`
- Test: `test/constants.test.js`, `test/i18n.test.js`

**Interfaces:**

- Consumes: nada.
- Produces:
  - `COMMENT_TYPES: string[]` = `["bug","suggestion","question","improvement"]`
  - `TYPE_COLORS: Record<string,string>`
  - `PRIORITIES: string[]` = `["high","medium","low"]`
  - `PRIORITY_COLORS: Record<string,string>`
  - Tipos `CommentType`, `CommentPriority`, `CommentContext` en `index.d.ts`

> **Ninguna clave de `CLASSES` se añade en esta tarea.** `test/constants.test.js`
> tiene un guard preexistente (`has no dead constants`) que exige que toda clave
> de `CLASSES`/`IDS` esté referenciada desde `src/`. Cada clase CSS nueva se
> declara en la tarea que primero la usa: `CLASSIFY_ROW`, `TAGS_INPUT`,
> `TAG_CHIP`, `TAG_CHIP_REMOVE` e `INBOX_BADGES` en la Task 11; `BADGE`,
> `BADGE_TYPE`, `BADGE_PRIORITY`, `BADGE_TAG`, `BADGE_DURATION` en la Task 12;
> `CONTEXT_BLOCK` y `CONTEXT_ROW` en la Task 14.

- [ ] **Step 1: Añadir constantes a `src/constants.js`**

Al final del archivo, después de `STATUS_COLORS`:

```js
// RF3 — comment category. Order matters: it's the order shown in the picker.
export const COMMENT_TYPES = ["bug", "suggestion", "question", "improvement"];

export const TYPE_COLORS = {
  bug: "#FF453A",
  suggestion: "#BF5AF2",
  question: "#64D2FF",
  improvement: "#5E5CE6",
};

// RF4 — priority, ordered high→low so the picker reads as a scale.
export const PRIORITIES = ["high", "medium", "low"];

// Deliberate red/orange/grey ramp: it reads as urgency at a glance. `high`
// sharing red with `bug` (and `medium` sharing orange with `in_progress`) is
// fine — they're different dimensions in different UI slots, and no badge
// ever conveys meaning by colour alone (WCAG 1.4.1).
export const PRIORITY_COLORS = {
  high: "#FF453A",
  medium: "#FF9F0A",
  low: "#8E8E93",
};
```

- [ ] **Step 2: Añadir los strings a `src/locales/en.js`**

Añadir antes del cierre del objeto:

```js
  durationLessThanMinute: "<1m",
  resolvedInTemplate: "Resolved in {n}",
  typeLabel: "Type",
  priorityLabel: "Priority",
  unset: "Unset",
  typeBug: "Bug",
  typeSuggestion: "Suggestion",
  typeQuestion: "Question",
  typeImprovement: "Improvement",
  priorityHigh: "High",
  priorityMedium: "Medium",
  priorityLow: "Low",
  tagsPlaceholder: "Add tags...",
  removeTag: "Remove tag",
  filterByType: "Filter by Type",
  filterByPriority: "Filter by Priority",
  contextSection: "Context",
  autoScreenshotLabel: "Automatic context",
  contextUrl: "URL",
  contextViewport: "Viewport",
  contextScreen: "Screen",
  contextBrowser: "Browser",
  contextOs: "OS",
```

- [ ] **Step 3: Añadir los mismos strings a `src/locales/es.js`**

```js
  durationLessThanMinute: "<1m",
  resolvedInTemplate: "Resuelto en {n}",
  typeLabel: "Tipo",
  priorityLabel: "Prioridad",
  unset: "Sin definir",
  typeBug: "Bug",
  typeSuggestion: "Sugerencia",
  typeQuestion: "Pregunta",
  typeImprovement: "Mejora",
  priorityHigh: "Alta",
  priorityMedium: "Media",
  priorityLow: "Baja",
  tagsPlaceholder: "Añadir etiquetas...",
  removeTag: "Quitar etiqueta",
  filterByType: "Filtrar por tipo",
  filterByPriority: "Filtrar por prioridad",
  contextSection: "Contexto",
  autoScreenshotLabel: "Contexto automático",
  contextUrl: "URL",
  contextViewport: "Viewport",
  contextScreen: "Pantalla",
  contextBrowser: "Navegador",
  contextOs: "SO",
```

- [ ] **Step 4: Declarar los tipos nuevos en `src/index.d.ts`**

Insertar después de `export type CommentStatus = ...`:

```ts
/** RF3 — comment category. `null` means deliberately unclassified. */
export type CommentType = "bug" | "suggestion" | "question" | "improvement";

/** RF4 — comment priority. `null` means deliberately unprioritised. */
export type CommentPriority = "high" | "medium" | "low";

/** RF2 — environment snapshot taken when the comment was created. */
export interface CommentContext {
  version: 1;
  /** Full location.href at creation time. */
  url: string;
  viewport: { width: number; height: number };
  /** Screen resolution (screen.width/height). */
  screen: { width: number; height: number };
  devicePixelRatio: number;
  /** Raw UA — always stored, even when browser/os parsing fails. */
  userAgent: string;
  browser: { name: string; version: string };
  os: { name: string; version: string };
  language: string;
}
```

- [ ] **Step 5: Escribir el test que falla**

Añadir a `test/constants.test.js`:

```js
import {
  COMMENT_TYPES,
  TYPE_COLORS,
  PRIORITIES,
  PRIORITY_COLORS,
} from "../src/constants.js";

describe("classification constants", () => {
  it("exposes the four RF3 types in picker order", () => {
    expect(COMMENT_TYPES).toEqual([
      "bug",
      "suggestion",
      "question",
      "improvement",
    ]);
  });

  it("exposes priorities ordered high to low", () => {
    expect(PRIORITIES).toEqual(["high", "medium", "low"]);
  });

  it("has a colour for every type and priority", () => {
    for (const type of COMMENT_TYPES) {
      expect(TYPE_COLORS[type]).toMatch(/^#[0-9A-F]{6}$/i);
    }
    for (const priority of PRIORITIES) {
      expect(PRIORITY_COLORS[priority]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});
```

Añadir a `test/i18n.test.js`:

```js
import en from "../src/locales/en.js";
import es from "../src/locales/es.js";

describe("locale parity", () => {
  it("ships the same keys in both locales", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  });
});
```

- [ ] **Step 6: Correr los tests y verificar que fallan**

Run: `npx vitest run test/constants.test.js test/i18n.test.js`
Expected: FAIL — `COMMENT_TYPES` no exportado (si aún no aplicaste los steps 1–3).

- [ ] **Step 7: Correr los tests y verificar que pasan**

Run: `npx vitest run test/constants.test.js test/i18n.test.js && npm run typecheck`
Expected: PASS en ambos.

- [ ] **Step 8: Commit**

```bash
git add src/constants.js src/locales/ src/index.d.ts test/constants.test.js test/i18n.test.js
git commit -m "feat(constants,i18n): add type, priority and context strings"
```

---

### Task 2: `src/metadata.js` — captura de contexto (RF2)

Módulo puro y aislado. No depende de nada del proyecto.

**Files:**

- Create: `src/metadata.js`
- Test: `test/metadata.test.js` (nuevo)

**Interfaces:**

- Consumes: el tipo `CommentContext` de Task 1.
- Produces: `captureContext(win = window): CommentContext`. `win` es inyectable únicamente para tests.

- [ ] **Step 1: Escribir el test que falla**

Crear `test/metadata.test.js`:

```js
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
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run test/metadata.test.js`
Expected: FAIL — no existe `src/metadata.js`.

- [ ] **Step 3: Implementar `src/metadata.js`**

```js
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
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run test/metadata.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/metadata.js test/metadata.test.js
git commit -m "feat(metadata): capture browser, OS and viewport context"
```

---

### Task 3: `formatDuration` (RF5)

**Files:**

- Modify: `src/i18n.js`
- Test: `test/i18n.test.js`

**Interfaces:**

- Consumes: `strings.durationLessThanMinute`, `minutesAgoTemplate`, `hoursAgoTemplate`, `daysAgoTemplate` (Task 1 + los que ya existían).
- Produces: `formatDuration(ms: number, strings: object): string`.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `test/i18n.test.js`:

```js
import { formatDuration, getStrings } from "../src/i18n.js";

describe("formatDuration", () => {
  const strings = getStrings("en");
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  it("collapses anything under a minute", () => {
    expect(formatDuration(0, strings)).toBe("<1m");
    expect(formatDuration(59_000, strings)).toBe("<1m");
  });

  it("shows bare minutes under an hour", () => {
    expect(formatDuration(45 * MIN, strings)).toBe("45m");
  });

  it("shows hours and minutes under a day", () => {
    expect(formatDuration(3 * HOUR + 12 * MIN, strings)).toBe("3h 12m");
  });

  it("drops the remainder when it is zero", () => {
    expect(formatDuration(3 * HOUR, strings)).toBe("3h");
    expect(formatDuration(2 * DAY, strings)).toBe("2d");
  });

  it("shows days and hours past 24h", () => {
    expect(formatDuration(2 * DAY + 4 * HOUR, strings)).toBe("2d 4h");
  });

  it("returns empty string for invalid input instead of NaN", () => {
    expect(formatDuration(NaN, strings)).toBe("");
    expect(formatDuration(-1000, strings)).toBe("");
    expect(formatDuration(Infinity, strings)).toBe("");
  });

  it("localises through the strings dictionary", () => {
    expect(formatDuration(90 * MIN, getStrings("es"))).toBe("1h 30m");
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run test/i18n.test.js`
Expected: FAIL — `formatDuration is not a function`.

- [ ] **Step 3: Implementar en `src/i18n.js`**

Añadir al final del archivo:

```js
const MINUTE_MS = 60_000;

/**
 * RF5 — human-readable elapsed time ("<1m", "45m", "3h 12m", "2d 4h").
 * Reuses the same {n}-templates the relative timestamps already use.
 * @param {number} ms
 * @param {ReturnType<typeof getStrings>} strings
 * @returns {string} empty string when `ms` isn't a usable duration
 */
export function formatDuration(ms, strings) {
  if (!Number.isFinite(ms) || ms < 0) return "";

  const totalMinutes = Math.floor(ms / MINUTE_MS);
  if (totalMinutes < 1) return strings.durationLessThanMinute;
  if (totalMinutes < 60) {
    return formatTemplate(strings.minutesAgoTemplate, totalMinutes);
  }

  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    const minutes = totalMinutes % 60;
    const hours = formatTemplate(strings.hoursAgoTemplate, totalHours);
    return minutes
      ? `${hours} ${formatTemplate(strings.minutesAgoTemplate, minutes)}`
      : hours;
  }

  const totalDays = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const days = formatTemplate(strings.daysAgoTemplate, totalDays);
  return hours
    ? `${days} ${formatTemplate(strings.hoursAgoTemplate, hours)}`
    : days;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run test/i18n.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/i18n.js test/i18n.test.js
git commit -m "feat(i18n): add formatDuration for resolution time"
```

---

### Task 4: Refactor de `src/capture.js` a primitivos componibles

Sin este refactor, cada comentario creado con drag pagaría el render completo dos veces.

**Files:**

- Modify: `src/capture.js`
- Test: `test/capture.test.js`

**Interfaces:**

- Consumes: `TAG_NAME` de `src/root-element.js`.
- Produces:
  - `renderPage({ scale }?): Promise<HTMLCanvasElement>`
  - `cropRegion(canvas, { left, top, width, height }): string | null` — PNG
  - `cropViewport(canvas, { sourceScale, outputScale, quality }?): string | null` — JPEG
  - `withHiddenOverlay(fn): Promise<any>`
  - `AUTO_SCALE = 0.5`, `AUTO_QUALITY = 0.7`
  - `captureRegion(region)` se mantiene con la firma de siempre.

- [ ] **Step 1: Escribir los tests que fallan**

Añadir a `test/capture.test.js` (los `describe` existentes de `captureRegion` se quedan intactos — son la red de seguridad del refactor):

```js
import {
  captureRegion,
  renderPage,
  cropViewport,
  withHiddenOverlay,
  AUTO_SCALE,
} from "../src/capture.js";
import { TAG_NAME } from "../src/root-element.js";

describe("renderPage", () => {
  it("renders at the requested scale", async () => {
    vi.mocked(domToCanvas).mockResolvedValue({ width: 10, height: 10 });
    await renderPage({ scale: 0.5 });
    expect(domToCanvas).toHaveBeenCalledWith(
      document.body,
      expect.objectContaining({ scale: 0.5 })
    );
  });

  it("defaults to scale 1", async () => {
    vi.mocked(domToCanvas).mockResolvedValue({ width: 10, height: 10 });
    await renderPage();
    expect(domToCanvas).toHaveBeenCalledWith(
      document.body,
      expect.objectContaining({ scale: 1 })
    );
  });
});

describe("cropViewport", () => {
  it("crops the viewport rect and encodes it as downscaled JPEG", () => {
    const { canvas, drawImage } = makeFakeCanvas();
    canvas.toDataURL = vi.fn(() => "data:image/jpeg;base64,auto");
    vi.spyOn(document, "createElement").mockReturnValue(
      /** @type {any} */ (canvas)
    );
    vi.spyOn(window, "scrollX", "get").mockReturnValue(0);
    vi.spyOn(window, "scrollY", "get").mockReturnValue(400);
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1000);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(800);

    const source = { width: 1000, height: 5000 };
    const dataUrl = cropViewport(source, { sourceScale: 1 });

    // Output is half-size; the source rect is the viewport at scroll offset.
    expect(canvas.width).toBe(500);
    expect(canvas.height).toBe(400);
    expect(drawImage).toHaveBeenCalledWith(
      source,
      0,
      400,
      1000,
      800,
      0,
      0,
      500,
      400
    );
    expect(canvas.toDataURL).toHaveBeenCalledWith("image/jpeg", 0.7);
    expect(dataUrl).toBe("data:image/jpeg;base64,auto");
  });

  it("maps the source rect through sourceScale when the canvas is half-size", () => {
    const { canvas, drawImage } = makeFakeCanvas();
    vi.spyOn(document, "createElement").mockReturnValue(
      /** @type {any} */ (canvas)
    );
    vi.spyOn(window, "scrollX", "get").mockReturnValue(0);
    vi.spyOn(window, "scrollY", "get").mockReturnValue(400);
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1000);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(800);

    const source = { width: 500, height: 2500 };
    cropViewport(source, { sourceScale: AUTO_SCALE });

    expect(drawImage).toHaveBeenCalledWith(
      source,
      0,
      200,
      500,
      400,
      0,
      0,
      500,
      400
    );
  });

  it("returns null when the 2d context is unavailable", () => {
    vi.spyOn(document, "createElement").mockReturnValue(
      /** @type {any} */ ({ getContext: () => null, toDataURL: vi.fn() })
    );
    expect(cropViewport({ width: 10, height: 10 }, {})).toBeNull();
  });
});

describe("withHiddenOverlay", () => {
  it("hides the whole host during the callback and restores it after", async () => {
    const host = document.createElement(TAG_NAME);
    host.style.display = "block";
    document.body.appendChild(host);

    let displayDuringCall = null;
    await withHiddenOverlay(() => {
      displayDuringCall = host.style.display;
      return Promise.resolve("ok");
    });

    expect(displayDuringCall).toBe("none");
    expect(host.style.display).toBe("block");
    host.remove();
  });

  it("restores the host even when the callback throws", async () => {
    // Regression guard: a render failure must never leave the widget hidden.
    const host = document.createElement(TAG_NAME);
    host.style.display = "block";
    document.body.appendChild(host);

    await expect(
      withHiddenOverlay(() => Promise.reject(new Error("render failed")))
    ).rejects.toThrow("render failed");

    expect(host.style.display).toBe("block");
    host.remove();
  });

  it("is a no-op when no host is mounted", async () => {
    await expect(withHiddenOverlay(() => Promise.resolve(1))).resolves.toBe(1);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run test/capture.test.js`
Expected: FAIL — `renderPage`/`cropViewport`/`withHiddenOverlay` no exportados. Los tests existentes de `captureRegion` deben seguir pasando.

- [ ] **Step 3: Reescribir `src/capture.js`**

Reemplazar el archivo entero (el bloque de comentario de cabecera y `effectiveBackgroundColor` se conservan tal cual):

```js
// Screenshot primitives. The page render is the expensive part, so it's
// split out from the cropping: a drag capture and the automatic context
// capture of the same comment share ONE render instead of paying for two.
//
// WE own the crop in page coordinates — html2canvas used to own it and
// silently shifted it by the window scroll (double-counting: the hero
// showed up in captures taken further down the page). Owning the crop
// makes that whole bug class impossible.

import { domToCanvas } from "modern-screenshot";
import { TAG_NAME } from "./root-element.js";

/** Automatic captures render and encode small — they live in localStorage. */
export const AUTO_SCALE = 0.5;
export const AUTO_QUALITY = 0.7;

const isUnpainted = (color) =>
  !color || color === "transparent" || color === "rgba(0, 0, 0, 0)";

// What the user visually perceives as the page background: the html/body
// CSS color when one is painted, else white — browsers paint their own
// white canvas under a transparent document, but that canvas is not part
// of the DOM, so a DOM-based render would come out as a transparent PNG
// (invisible against the dark inbox UI).
const effectiveBackgroundColor = () => {
  const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
  if (!isUnpainted(htmlBg)) return htmlBg;
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  if (!isUnpainted(bodyBg)) return bodyBg;
  return "#ffffff";
};

/**
 * Renders the whole page to a canvas. This is the expensive call — callers
 * that need more than one image should render once and crop repeatedly.
 * @param {{ scale?: number }} [options] scale 1 keeps the canvas in CSS
 *   pixels so crop rects map 1:1 to page coordinates.
 * @returns {Promise<any>}
 */
export async function renderPage({ scale = 1 } = {}) {
  return domToCanvas(document.body, {
    scale,
    backgroundColor: effectiveBackgroundColor(),
  });
}

/**
 * Runs `fn` with the HellDots UI hidden, so the widget never renders into
 * its own screenshot. Restores the host even if `fn` throws — a failed
 * render must not leave the widget invisible.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withHiddenOverlay(fn) {
  const host = /** @type {HTMLElement} */ (document.querySelector(TAG_NAME));
  const previousDisplay = host?.style.display;
  if (host) host.style.display = "none";
  try {
    return await fn();
  } finally {
    if (host) host.style.display = previousDisplay || "";
  }
}

/**
 * Crops a viewport-relative region out of a scale-1 page render.
 * @param {any} canvas full-page render from renderPage({ scale: 1 })
 * @param {{ left: number, top: number, width: number, height: number }} region
 *   Viewport (client) coordinates of the drag selection.
 * @returns {string | null} PNG data-URL, or null with no 2d context.
 */
export function cropRegion(canvas, { left, top, width, height }) {
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(
    canvas,
    left + window.scrollX,
    top + window.scrollY,
    width,
    height,
    0,
    0,
    width,
    height
  );
  return out.toDataURL("image/png");
}

/**
 * Crops the current viewport out of a page render and encodes it small.
 * @param {any} canvas full-page render
 * @param {{ sourceScale?: number, outputScale?: number, quality?: number }} [options]
 *   `sourceScale` is the scale `canvas` was rendered at — the source rect is
 *   mapped through it. `outputScale` is the final size in CSS pixels.
 * @returns {string | null} JPEG data-URL, or null with no 2d context.
 */
export function cropViewport(
  canvas,
  { sourceScale = 1, outputScale = AUTO_SCALE, quality = AUTO_QUALITY } = {}
) {
  const out = document.createElement("canvas");
  out.width = Math.round(window.innerWidth * outputScale);
  out.height = Math.round(window.innerHeight * outputScale);
  const ctx = out.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(
    canvas,
    window.scrollX * sourceScale,
    window.scrollY * sourceScale,
    window.innerWidth * sourceScale,
    window.innerHeight * sourceScale,
    0,
    0,
    out.width,
    out.height
  );
  return out.toDataURL("image/jpeg", quality);
}

/**
 * Captures a viewport-relative region of the current page.
 * Kept for API compatibility — renders and crops in one call.
 * @param {{ left: number, top: number, width: number, height: number }} region
 * @returns {Promise<string | null>} PNG data-URL. Render failures reject.
 */
export async function captureRegion(region) {
  return cropRegion(await renderPage({ scale: 1 }), region);
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run test/capture.test.js`
Expected: PASS — incluidos los 5 tests preexistentes de `captureRegion`.

- [ ] **Step 5: Commit**

```bash
git add src/capture.js test/capture.test.js
git commit -m "refactor(capture): split render from crop, add viewport crop"
```

---

### Task 5: Campos nuevos en serialización y migración

El punto de mayor riesgo: hay comentarios reales en localStorage con el esquema viejo.

**Files:**

- Modify: `src/overlay.js` (`_serializeComment` ~L923, `loadComments` ~L1029, `saveComment` ~L489)
- Modify: `src/index.d.ts`
- Test: `test/persistence.test.js`

**Interfaces:**

- Consumes: `CommentType`, `CommentPriority`, `CommentContext` (Task 1).
- Produces: `Comment` y `SerializedComment` con `contextScreenshot`, `context`, `type`, `tags`, `priority`, `resolvedAt`. Todo consumidor posterior puede asumir que estos campos **siempre existen** tras `loadComments`.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `test/persistence.test.js`:

```js
describe("schema migration", () => {
  it("fills neutral defaults for comments stored before RF1-RF5", () => {
    // A record exactly as it was persisted by the previous version.
    const legacy = {
      id: 1,
      text: "old comment",
      anchor: null,
      page: location.pathname,
      replies: [],
      author: "Ana",
      createdAt: "2026-01-01T00:00:00.000Z",
      screenshots: [],
      status: "open",
    };

    const overlay = makeOverlay();
    overlay.loadComments([legacy]);
    const [comment] = overlay.comments;

    expect(comment.type).toBeNull();
    expect(comment.priority).toBeNull();
    expect(comment.tags).toEqual([]);
    expect(comment.context).toBeNull();
    expect(comment.contextScreenshot).toBeNull();
    expect(comment.resolvedAt).toBeNull();
  });

  it("round-trips the new fields through serialize/load", () => {
    const overlay = makeOverlay();
    overlay.loadComments([
      {
        id: 2,
        text: "classified",
        anchor: null,
        page: location.pathname,
        replies: [],
        author: "Ana",
        createdAt: "2026-01-01T00:00:00.000Z",
        screenshots: [],
        status: "resolved",
        type: "bug",
        priority: "high",
        tags: ["checkout", "ios"],
        resolvedAt: "2026-01-02T00:00:00.000Z",
        contextScreenshot: "data:image/jpeg;base64,x",
        context: { version: 1, url: "https://a.test/" },
      },
    ]);

    const [serialized] = overlay.serializeComments();
    expect(serialized.type).toBe("bug");
    expect(serialized.priority).toBe("high");
    expect(serialized.tags).toEqual(["checkout", "ios"]);
    expect(serialized.resolvedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(serialized.contextScreenshot).toBe("data:image/jpeg;base64,x");
    expect(serialized.context.url).toBe("https://a.test/");
  });

  it("rejects a type or priority that is not in the enum", () => {
    const overlay = makeOverlay();
    overlay.loadComments([
      {
        id: 3,
        text: "bogus",
        anchor: null,
        page: location.pathname,
        replies: [],
        author: "Ana",
        createdAt: "2026-01-01T00:00:00.000Z",
        screenshots: [],
        status: "open",
        type: "not-a-type",
        priority: "urgent",
        tags: "not-an-array",
      },
    ]);

    const [comment] = overlay.comments;
    expect(comment.type).toBeNull();
    expect(comment.priority).toBeNull();
    expect(comment.tags).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run test/persistence.test.js`
Expected: FAIL — `comment.type` es `undefined`, no `null`.

- [ ] **Step 3: Actualizar `_serializeComment` en `src/overlay.js`**

Añadir dentro del objeto devuelto, después de `status`:

```js
      type: comment.type || null,
      priority: comment.priority || null,
      tags: comment.tags || [],
      resolvedAt: comment.resolvedAt || null,
      context: comment.context || null,
      contextScreenshot: comment.contextScreenshot || null,
```

- [ ] **Step 4: Actualizar `loadComments` en `src/overlay.js`**

Importar las constantes nuevas en la línea 2:

```js
import {
  CLASSES,
  IDS,
  SELECTORS,
  STATUSES,
  COMMENT_TYPES,
  PRIORITIES,
} from "./constants.js";
```

Y añadir al objeto `comment` que construye `loadComments`, después de la propiedad `status`:

```js
        // Records persisted before RF1-RF5 have none of these — every
        // reader downstream may assume they exist after this point.
        type: COMMENT_TYPES.includes(item.type) ? item.type : null,
        priority: PRIORITIES.includes(item.priority) ? item.priority : null,
        tags: Array.isArray(item.tags) ? [...item.tags] : [],
        resolvedAt: item.resolvedAt || null,
        context: item.context || null,
        contextScreenshot: item.contextScreenshot || null,
```

- [ ] **Step 5: Actualizar `saveComment` en `src/overlay.js`**

Añadir al literal del comentario nuevo, después de `screenshots`:

```js
      type: null,
      priority: null,
      tags: [],
      resolvedAt: null,
      context: null,
      contextScreenshot: null,
```

(Las Tasks 8 y 11 reemplazan estos `null` por los valores reales.)

- [ ] **Step 6: Declarar los campos en `src/index.d.ts`**

Añadir a **ambas** interfaces `SerializedComment` y `Comment`, después de `status`:

```ts
  /** RF3 — `null` when deliberately unclassified. */
  type: CommentType | null;
  /** RF4 — `null` when deliberately unprioritised. */
  priority: CommentPriority | null;
  /** RF3 — free-form labels, normalised lowercase. */
  tags: string[];
  /** RF5 — set on entering "resolved", cleared on leaving it. */
  resolvedAt: string | null;
  /** RF2 — environment snapshot taken at creation. */
  context: CommentContext | null;
  /** RF1 — automatic viewport capture (JPEG data-URL). */
  contextScreenshot: string | null;
  /**
   * RF6 — emoji → authors who reacted. Reserved, not implemented yet.
   * Optional and absent by default, so shipping it later needs no migration.
   */
  reactions?: Record<string, string[]>;
```

- [ ] **Step 7: Correr los tests y verificar que pasan**

Run: `npx vitest run test/persistence.test.js && npm run typecheck`
Expected: PASS en ambos.

- [ ] **Step 8: Commit**

```bash
git add src/overlay.js src/index.d.ts test/persistence.test.js
git commit -m "feat(overlay): persist type, priority, tags, context and resolvedAt"
```

---

### Task 6: `resolvedAt` en las transiciones de estado (RF5)

**Files:**

- Modify: `src/overlay.js` (`setCommentStatus` ~L946)
- Test: `test/persistence.test.js`

**Interfaces:**

- Consumes: el campo `resolvedAt` de Task 5.
- Produces: la invariante de que `resolvedAt` es no-null **si y solo si** `status === "resolved"` en cualquier comentario que haya pasado por `setCommentStatus`.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `test/persistence.test.js`:

```js
describe("resolvedAt lifecycle", () => {
  const seed = (overlay) =>
    overlay.loadComments([
      {
        id: 10,
        text: "t",
        anchor: null,
        page: location.pathname,
        replies: [],
        author: "Ana",
        createdAt: "2026-01-01T00:00:00.000Z",
        screenshots: [],
        status: "open",
      },
    ]);

  it("stamps resolvedAt when entering resolved", () => {
    const overlay = makeOverlay();
    seed(overlay);
    overlay.setCommentStatus(10, "resolved");
    expect(overlay.comments[0].resolvedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/
    );
  });

  it("clears resolvedAt when the comment is reopened", () => {
    const overlay = makeOverlay();
    seed(overlay);
    overlay.setCommentStatus(10, "resolved");
    overlay.setCommentStatus(10, "open");
    expect(overlay.comments[0].resolvedAt).toBeNull();
  });

  it("leaves resolvedAt null for non-resolved transitions", () => {
    const overlay = makeOverlay();
    seed(overlay);
    overlay.setCommentStatus(10, "in_progress");
    expect(overlay.comments[0].resolvedAt).toBeNull();
  });

  it("overwrites resolvedAt when resolved a second time", async () => {
    const overlay = makeOverlay();
    seed(overlay);
    overlay.setCommentStatus(10, "resolved");
    const first = overlay.comments[0].resolvedAt;

    await new Promise((r) => setTimeout(r, 2));
    overlay.setCommentStatus(10, "open");
    overlay.setCommentStatus(10, "resolved");

    // The displayed duration must describe the CURRENT resolution.
    expect(overlay.comments[0].resolvedAt).not.toBe(first);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run test/persistence.test.js -t resolvedAt`
Expected: FAIL — `resolvedAt` sigue en `null` tras resolver.

- [ ] **Step 3: Implementar en `setCommentStatus`**

Justo después de la línea `comment.status = status;`:

```js
// RF5 — the timestamp always describes the CURRENT resolution: a
// reopened comment loses it, and resolving again re-stamps it.
comment.resolvedAt = status === "resolved" ? new Date().toISOString() : null;
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run test/persistence.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/overlay.js test/persistence.test.js
git commit -m "feat(overlay): stamp and clear resolvedAt on status transitions"
```

---

### Task 7: Setters de clasificación y `onCommentUpdated`

**Files:**

- Modify: `src/overlay.js` (después de `setCommentStatus`)
- Modify: `src/index.d.ts`
- Test: `test/overlay.test.js`

**Interfaces:**

- Consumes: `COMMENT_TYPES`, `PRIORITIES` (Task 1); campos de Task 5.
- Produces:
  - `setCommentType(id: number, type: CommentType | null): boolean`
  - `setCommentPriority(id: number, priority: CommentPriority | null): boolean`
  - `setCommentTags(id: number, tags: string[]): boolean`
  - Opción `onCommentUpdated?: (comment: SerializedComment) => void`
  - `normalizeTags(tags: string[]): string[]` (helper de módulo, no exportado)

- [ ] **Step 1: Escribir el test que falla**

Añadir a `test/overlay.test.js`:

```js
describe("classification setters", () => {
  const seed = (overlay) =>
    overlay.loadComments([
      {
        id: 20,
        text: "t",
        anchor: null,
        page: location.pathname,
        replies: [],
        author: "Ana",
        createdAt: "2026-01-01T00:00:00.000Z",
        screenshots: [],
        status: "open",
      },
    ]);

  it("sets and clears the type", () => {
    const overlay = makeOverlay();
    seed(overlay);
    expect(overlay.setCommentType(20, "bug")).toBe(true);
    expect(overlay.comments[0].type).toBe("bug");
    expect(overlay.setCommentType(20, null)).toBe(true);
    expect(overlay.comments[0].type).toBeNull();
  });

  it("sets and clears the priority", () => {
    const overlay = makeOverlay();
    seed(overlay);
    expect(overlay.setCommentPriority(20, "high")).toBe(true);
    expect(overlay.comments[0].priority).toBe("high");
    expect(overlay.setCommentPriority(20, null)).toBe(true);
    expect(overlay.comments[0].priority).toBeNull();
  });

  it("rejects unknown values and unknown ids without side effects", () => {
    const overlay = makeOverlay();
    seed(overlay);
    overlay.setCommentType(20, "bug");

    expect(overlay.setCommentType(20, "nope")).toBe(false);
    expect(overlay.setCommentPriority(20, "urgent")).toBe(false);
    expect(overlay.setCommentType(999, "bug")).toBe(false);
    expect(overlay.setCommentTags(999, ["x"])).toBe(false);

    expect(overlay.comments[0].type).toBe("bug");
  });

  it("normalises tags: trims, lowercases, drops blanks and duplicates", () => {
    const overlay = makeOverlay();
    seed(overlay);
    overlay.setCommentTags(20, ["  Checkout ", "iOS", "checkout", "", "   "]);
    expect(overlay.comments[0].tags).toEqual(["checkout", "ios"]);
  });

  it("rejects a non-array tags value", () => {
    const overlay = makeOverlay();
    seed(overlay);
    expect(overlay.setCommentTags(20, "checkout")).toBe(false);
  });

  it("fires onCommentUpdated for all three setters", () => {
    const onCommentUpdated = vi.fn();
    const overlay = makeOverlay({ onCommentUpdated });
    seed(overlay);

    overlay.setCommentType(20, "bug");
    overlay.setCommentPriority(20, "low");
    overlay.setCommentTags(20, ["a"]);

    expect(onCommentUpdated).toHaveBeenCalledTimes(3);
    expect(onCommentUpdated.mock.calls[2][0]).toMatchObject({
      id: 20,
      type: "bug",
      priority: "low",
      tags: ["a"],
    });
  });

  it("does not fire onCommentStatusChanged", () => {
    // The existing callback keeps its exact meaning.
    const onCommentStatusChanged = vi.fn();
    const overlay = makeOverlay({ onCommentStatusChanged });
    seed(overlay);
    overlay.setCommentType(20, "bug");
    expect(onCommentStatusChanged).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run test/overlay.test.js -t "classification setters"`
Expected: FAIL — `overlay.setCommentType is not a function`.

- [ ] **Step 3: Implementar en `src/overlay.js`**

Añadir un helper a nivel de módulo, justo antes de `class CommentOverlay {`:

```js
// Tags are user-typed, so they arrive with stray case and whitespace.
// Normalising here (rather than at each entry point) is what makes
// "Checkout" and "checkout " the same tag for filtering.
const normalizeTags = (tags) => {
  const seen = new Set();
  for (const tag of tags) {
    const clean = String(tag).trim().toLowerCase();
    if (clean) seen.add(clean);
  }
  return [...seen];
};
```

Y estos tres métodos justo después de `setCommentStatus`:

```js
  /**
   * Shared tail of the classification setters: persist, re-render the
   * inbox if it's showing, and notify the host app.
   * @param {any} comment
   * @returns {true}
   */
  _commitUpdate(comment) {
    this._syncStorage();
    if (this.inboxView?.isOpen()) this.inboxView.refresh();
    this.options.onCommentUpdated?.(this._serializeComment(comment));
    return true;
  }

  /**
   * RF3 — categorises a comment. `null` returns it to the neutral state.
   * @param {number} id
   * @param {import('./index.d.ts').CommentType | null} type
   * @returns {boolean} false when the id or type is unknown
   */
  setCommentType(id, type) {
    if (type !== null && !COMMENT_TYPES.includes(type)) return false;
    const comment = this.comments.find((c) => c.id === id);
    if (!comment) return false;
    comment.type = type;
    return this._commitUpdate(comment);
  }

  /**
   * RF4 — prioritises a comment. `null` returns it to the neutral state.
   * @param {number} id
   * @param {import('./index.d.ts').CommentPriority | null} priority
   * @returns {boolean} false when the id or priority is unknown
   */
  setCommentPriority(id, priority) {
    if (priority !== null && !PRIORITIES.includes(priority)) return false;
    const comment = this.comments.find((c) => c.id === id);
    if (!comment) return false;
    comment.priority = priority;
    return this._commitUpdate(comment);
  }

  /**
   * RF3 — replaces a comment's free-form labels. Values are trimmed,
   * lowercased and de-duplicated.
   * @param {number} id
   * @param {string[]} tags
   * @returns {boolean} false when the id is unknown or tags isn't an array
   */
  setCommentTags(id, tags) {
    if (!Array.isArray(tags)) return false;
    const comment = this.comments.find((c) => c.id === id);
    if (!comment) return false;
    comment.tags = normalizeTags(tags);
    return this._commitUpdate(comment);
  }
```

- [ ] **Step 4: Declarar en `src/index.d.ts`**

En `CommentOverlayOptions`, después de `onCommentStatusChanged`:

```ts
  /** Fired after type, priority or tags change on any comment. */
  onCommentUpdated?: (comment: SerializedComment) => void;
```

En `declare class CommentOverlay`, después de `setCommentStatus`:

```ts
  setCommentType(id: number, type: CommentType | null): boolean;
  setCommentPriority(id: number, priority: CommentPriority | null): boolean;
  setCommentTags(id: number, tags: string[]): boolean;
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npx vitest run test/overlay.test.js && npm run typecheck`
Expected: PASS en ambos.

- [ ] **Step 6: Commit**

```bash
git add src/overlay.js src/index.d.ts test/overlay.test.js
git commit -m "feat(overlay): add type, priority and tag setters"
```

---

### Task 8: Auto-captura y contexto en la creación (RF1 + RF2)

**Files:**

- Modify: `src/overlay.js` (import L1, `_onDragEnd` ~L288, `_placeCommentAtPoint` ~L324, `saveComment` ~L486, `hideCommentBox` ~L462)
- Test: `test/overlay.test.js`

**Interfaces:**

- Consumes: `renderPage`, `cropRegion`, `cropViewport`, `withHiddenOverlay`, `AUTO_SCALE` (Task 4); `captureContext` (Task 2); campos de Task 5.
- Produces: opción `autoScreenshot?: boolean` (default `true`). `_placeCommentAtPoint` pasa a ser **async** — sus dos llamadores en `_onDragEnd` deben usar `await`.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `test/overlay.test.js`. El mock de `modern-screenshot` debe estar en la cabecera del archivo:

```js
vi.mock("modern-screenshot", () => ({ domToCanvas: vi.fn() }));
```

```js
import { domToCanvas } from "modern-screenshot";
import { TAG_NAME } from "../src/root-element.js";

describe("automatic context capture", () => {
  const fakeOutCanvas = () => ({
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: vi.fn() }),
    toDataURL: vi.fn(() => "data:image/jpeg;base64,auto"),
  });

  const clickAt = async (overlay, x, y) => {
    overlay.toggleCommentMode();
    overlay.handleDocumentClick(
      new MouseEvent("mousedown", { clientX: x, clientY: y, button: 0 })
    );
    await overlay._onDragEnd(
      new MouseEvent("mouseup", { clientX: x, clientY: y })
    );
  };

  it("renders at AUTO_SCALE on the no-drag path", async () => {
    vi.mocked(domToCanvas).mockResolvedValue({ width: 10, height: 10 });
    vi.spyOn(document, "createElement").mockImplementation((tag) =>
      tag === "canvas"
        ? /** @type {any} */ (fakeOutCanvas())
        : Object.getPrototypeOf(document).createElement.call(document, tag)
    );

    const overlay = makeOverlay();
    await clickAt(overlay, 50, 50);

    expect(domToCanvas).toHaveBeenCalledTimes(1);
    expect(domToCanvas).toHaveBeenCalledWith(
      document.body,
      expect.objectContaining({ scale: 0.5 })
    );
  });

  it("does not render at all when autoScreenshot is false", async () => {
    vi.mocked(domToCanvas).mockResolvedValue({ width: 10, height: 10 });
    const overlay = makeOverlay({ autoScreenshot: false });
    await clickAt(overlay, 50, 50);
    expect(domToCanvas).not.toHaveBeenCalled();
  });

  it("hides the host during the render", async () => {
    let displayDuringRender = null;
    vi.mocked(domToCanvas).mockImplementation(async () => {
      const host = document.querySelector(TAG_NAME);
      displayDuringRender = /** @type {HTMLElement} */ (host)?.style.display;
      return { width: 10, height: 10 };
    });

    const overlay = makeOverlay();
    await clickAt(overlay, 50, 50);

    expect(displayDuringRender).toBe("none");
    const host = /** @type {HTMLElement} */ (document.querySelector(TAG_NAME));
    expect(host.style.display).not.toBe("none");
  });

  it("saves the capture and the context onto the comment", async () => {
    vi.mocked(domToCanvas).mockResolvedValue({ width: 10, height: 10 });
    vi.spyOn(document, "createElement").mockImplementation((tag) =>
      tag === "canvas"
        ? /** @type {any} */ (fakeOutCanvas())
        : Object.getPrototypeOf(document).createElement.call(document, tag)
    );

    const overlay = makeOverlay();
    await clickAt(overlay, 50, 50);
    overlay.commentInput.value = "a bug";
    overlay.saveComment();

    const [comment] = overlay.comments;
    expect(comment.contextScreenshot).toBe("data:image/jpeg;base64,auto");
    expect(comment.context.version).toBe(1);
    expect(comment.context.url).toBe(location.href);
    expect(comment.context.viewport.width).toBe(window.innerWidth);
  });

  it("still saves the comment when the render fails", async () => {
    // A capture failure must never cost the user their comment.
    vi.mocked(domToCanvas).mockRejectedValue(new Error("render failed"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const overlay = makeOverlay();
    await clickAt(overlay, 50, 50);
    overlay.commentInput.value = "still saved";
    overlay.saveComment();

    expect(overlay.comments).toHaveLength(1);
    expect(overlay.comments[0].contextScreenshot).toBeNull();
    expect(overlay.comments[0].context).not.toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it("does not leak a pending capture into the next comment", async () => {
    vi.mocked(domToCanvas).mockResolvedValue({ width: 10, height: 10 });
    const overlay = makeOverlay();
    await clickAt(overlay, 50, 50);
    overlay.hideCommentBox();
    expect(overlay._pendingContextScreenshot).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run test/overlay.test.js -t "automatic context capture"`
Expected: FAIL — `domToCanvas` no se llama en la ruta sin drag.

- [ ] **Step 3: Actualizar los imports de `src/overlay.js`**

Reemplazar la línea 1:

```js
import {
  renderPage,
  cropRegion,
  cropViewport,
  withHiddenOverlay,
  AUTO_SCALE,
} from "./capture.js";
import { captureContext } from "./metadata.js";
```

- [ ] **Step 4: Añadir el default de `autoScreenshot` en el constructor**

Dentro de `this.options = { ... }`, después de `shortcutModifier`:

```js
      autoScreenshot: options.autoScreenshot !== false,
```

Y junto a `this._pendingRaf = null;`:

```js
this._pendingContextScreenshot = null;
```

- [ ] **Step 5: Reescribir el bloque de captura de `_onDragEnd`**

Reemplazar el bloque `if (width > 10 && height > 10) { ... }` completo por:

```js
      if (width > 10 && height > 10) {
        try {
          if (!this._pendingScreenshots) this._pendingScreenshots = [];
          // One render feeds both images: the PNG region the user selected
          // and the automatic JPEG context shot.
          const full = await withHiddenOverlay(() =>
            renderPage({ scale: 1 })
          );
          const dataUrl = cropRegion(full, { left, top, width, height });
          if (dataUrl && this._pendingScreenshots.length < 5) {
            this._pendingScreenshots.push(dataUrl);
          }
          if (this.options.autoScreenshot) {
            this._pendingContextScreenshot = cropViewport(full, {
              sourceScale: 1,
            });
          }
        } catch (err) {
          console.warn("Screenshot capture failed:", err);
        }
      }

      await this._placeCommentAtPoint(e.clientX, e.clientY);
    } else {
      await this._placeCommentAtPoint(this._dragStart.x, this._dragStart.y);
    }
```

Nota: el `this.overlay.style.display = "none"` / `= ""` que había alrededor de la captura desaparece — `withHiddenOverlay` oculta el host entero, que es lo que arregla el toolbar saliendo dentro de los screenshots.

- [ ] **Step 6: Añadir la captura a `_placeCommentAtPoint`**

Cambiar la firma a `async _placeCommentAtPoint(clientX, clientY) {` e insertar como primer bloque del método:

```js
// The no-drag path has no render yet. Half scale because the output is
// half scale anyway — the render is the expensive part, and it costs
// ~4x less here than at scale 1.
if (this.options.autoScreenshot && !this._pendingContextScreenshot) {
  try {
    const full = await withHiddenOverlay(() =>
      renderPage({ scale: AUTO_SCALE })
    );
    this._pendingContextScreenshot = cropViewport(full, {
      sourceScale: AUTO_SCALE,
    });
  } catch (err) {
    console.warn("HellDots: automatic screenshot failed", err);
    this._pendingContextScreenshot = null;
  }
}
```

- [ ] **Step 7: Guardar los campos en `saveComment`**

Reemplazar las líneas `context: null,` y `contextScreenshot: null,` que dejó la Task 5 por:

```js
      context: captureContext(),
      contextScreenshot: this._pendingContextScreenshot,
```

- [ ] **Step 8: Limpiar el pending en `hideCommentBox`**

Añadir dentro de `hideCommentBox()`, junto a la limpieza de `_pendingScreenshots`:

```js
this._pendingContextScreenshot = null;
```

- [ ] **Step 9: Correr los tests y verificar que pasan**

Run: `npx vitest run test/overlay.test.js test/capture.test.js`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/overlay.js test/overlay.test.js
git commit -m "feat(overlay): auto-capture viewport and context on comment creation"
```

---

### Task 9: `createPicker` genérico en `comment-actions.js`

Refactor puro: sin cambios observables. El picker de estado sigue comportándose igual, pero pasa a ser un consumidor del genérico.

**Files:**

- Modify: `src/comment-actions.js`
- Test: `test/comment-actions.test.js`

**Interfaces:**

- Consumes: `CLASSES`, `STATUSES`, `STATUS_COLORS`.
- Produces:

```js
createPicker({
  action,         // string — becomes data-action on the button ("status" | "type" | "priority")
  options,        // Array<string|null> — null renders the "Unset" entry
  value,          // string|null, initial selection
  colorOf,        // (option) => string  ("" for the null entry)
  labelOf,        // (option) => string
  tooltipLabel,   // string, prefix for the tooltip and aria-label
  onSelect,       // (option) => void
}) => HTMLElement  // a positioned wrapper containing button + menu
```

- [ ] **Step 1: Escribir el test que falla**

Añadir a `test/comment-actions.test.js`:

```js
import { createPicker } from "../src/comment-actions.js";
import { CLASSES } from "../src/constants.js";

describe("createPicker", () => {
  const build = (overrides = {}) =>
    createPicker({
      options: [null, "a", "b"],
      value: "a",
      colorOf: (o) => (o === "a" ? "#111111" : "#222222"),
      labelOf: (o) => (o === null ? "Unset" : `Label ${o}`),
      tooltipLabel: "Thing",
      onSelect: vi.fn(),
      ...overrides,
    });

  it("renders one menu item per option", () => {
    const wrapper = build();
    expect(
      wrapper.querySelectorAll(`.${CLASSES.INBOX_MENU_ITEM}`)
    ).toHaveLength(3);
  });

  it("marks the current value as checked", () => {
    const wrapper = build();
    const checked = wrapper.querySelector('[aria-checked="true"]');
    expect(checked.textContent).toContain("Label a");
  });

  it("reflects the current value in the tooltip and aria-label", () => {
    const btn = build().querySelector("button");
    expect(btn.dataset.hdTooltip).toBe("Thing: Label a");
    expect(btn.getAttribute("aria-label")).toBe("Thing: Label a");
  });

  it("toggles the menu open and closed", () => {
    const wrapper = build();
    const btn = wrapper.querySelector("button");
    const menu = wrapper.querySelector(`.${CLASSES.INBOX_MENU}`);

    expect(menu.style.display).toBe("none");
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(menu.style.display).toBe("block");
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(menu.style.display).toBe("none");
  });

  it("reports the selection and re-syncs its own UI", () => {
    const onSelect = vi.fn();
    const wrapper = build({ onSelect });
    const items = wrapper.querySelectorAll(`.${CLASSES.INBOX_MENU_ITEM}`);

    items[2].dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onSelect).toHaveBeenCalledWith("b");
    expect(wrapper.querySelector("button").dataset.hdTooltip).toBe(
      "Thing: Label b"
    );
  });

  it("passes null for the unset entry", () => {
    const onSelect = vi.fn();
    const wrapper = build({ onSelect });
    const items = wrapper.querySelectorAll(`.${CLASSES.INBOX_MENU_ITEM}`);

    items[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run test/comment-actions.test.js`
Expected: FAIL — `createPicker` no exportado. Los tests preexistentes de `createCommentActions` deben seguir pasando.

- [ ] **Step 3: Implementar `createPicker` en `src/comment-actions.js`**

Añadir después de `statusLabelOf`:

```js
/**
 * Dot-and-menu picker shared by the status, type and priority controls.
 * Keeps its own copy of the selection so the UI stays correct even when the
 * consumer's onSelect is async or doesn't mutate the comment in place.
 * @param {{
 *   options: Array<string|null>,
 *   value: string|null,
 *   colorOf: (option: string|null) => string,
 *   labelOf: (option: string|null) => string,
 *   tooltipLabel: string,
 *   onSelect: (option: string|null) => void,
 * }} config
 * @returns {HTMLElement}
 */
export const createPicker = ({
  action,
  options,
  value,
  colorOf,
  labelOf,
  tooltipLabel,
  onSelect,
}) => {
  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = CLASSES.INBOX_ACTION_BTN;
  btn.dataset.action = action;
  btn.setAttribute("aria-haspopup", "true");

  const dot = document.createElement("span");
  dot.className = CLASSES.INBOX_STATUS_DOT;
  btn.appendChild(dot);

  const menu = document.createElement("div");
  menu.className = CLASSES.INBOX_MENU;
  menu.style.display = "none";
  menu.setAttribute("role", "menu");

  let current = value;

  const syncUi = () => {
    const label = `${tooltipLabel}: ${labelOf(current)}`;
    dot.style.backgroundColor = colorOf(current);
    btn.dataset.hdTooltip = label;
    btn.setAttribute("aria-label", label);
    menu
      .querySelectorAll("[data-picker-option]")
      .forEach((/** @type {HTMLElement} */ item) => {
        const raw = item.dataset.pickerOption;
        const option = raw === "" ? null : raw;
        item.setAttribute("aria-checked", String(option === current));
      });
  };

  for (const option of options) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = CLASSES.INBOX_MENU_ITEM;
    // "" is how a null option round-trips through a dataset string.
    item.dataset.pickerOption = option === null ? "" : option;
    item.setAttribute("role", "menuitemradio");

    const itemDot = document.createElement("span");
    itemDot.className = CLASSES.INBOX_STATUS_DOT;
    itemDot.style.backgroundColor = colorOf(option);
    item.appendChild(itemDot);
    item.appendChild(document.createTextNode(labelOf(option)));

    item.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.style.display = "none";
      current = option;
      onSelect(option);
      syncUi();
    });
    menu.appendChild(item);
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.style.display = menu.style.display === "none" ? "block" : "none";
  });

  wrapper.appendChild(btn);
  wrapper.appendChild(menu);
  syncUi();
  return wrapper;
};
```

- [ ] **Step 4: Reemplazar el picker de estado por el genérico**

En `createCommentActions`, borrar todo el bloque `// --- lifecycle status picker (RF09) ---` (desde `const statusWrapper = ...` hasta `syncStatusUi();` inclusive) y poner:

```js
// --- lifecycle status picker (RF09) ---
actions.appendChild(
  createPicker({
    action: "status",
    options: STATUSES,
    value: comment.status || "open",
    colorOf: (status) => STATUS_COLORS[status] || "",
    labelOf: (status) => statusLabelOf(status, strings),
    tooltipLabel: strings.statusLabel,
    onSelect: (status) => onSetStatus(comment, status),
  })
);
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npx vitest run test/comment-actions.test.js`

Los tests preexistentes consultan las opciones del menú por `[data-status-option]`
y leen `.dataset.statusOption`. El picker genérico emite `data-picker-option`,
así que **tres tests necesitan un renombrado mecánico de selector**:

| Antes                                                 | Después                                               |
| ----------------------------------------------------- | ----------------------------------------------------- |
| `el.querySelectorAll("[data-status-option]")`         | `el.querySelectorAll("[data-picker-option]")`         |
| `checked.dataset.statusOption`                        | `checked.dataset.pickerOption`                        |
| `el.querySelector('[data-status-option="resolved"]')` | `el.querySelector('[data-picker-option="resolved"]')` |

Eso es lo único que cambia. **Ninguna aserción se toca**: los valores esperados
(`"Abierto"`, `"En progreso"`, `"Resuelto"`, `"in_progress"`, `"Status: Resolved"`,
los colores) se quedan idénticos. Las consultas por `[data-action="status"]`
siguen funcionando gracias al parámetro `action`.

Si falla algo más que esos selectores, el refactor cambió comportamiento
observable: corrige el código, no el test.

- [ ] **Step 6: Commit**

```bash
git add src/comment-actions.js test/comment-actions.test.js
git commit -m "refactor(comment-actions): extract generic createPicker"
```

---

### Task 10: Pickers de tipo y prioridad en la barra de acciones

**Files:**

- Modify: `src/comment-actions.js`
- Modify: `src/inbox.js` (`_buildCardActions` ~L370)
- Modify: `src/overlay.js` (`showThreadPopover` ~L679, `showInbox` ~L626)
- Test: `test/comment-actions.test.js`

**Interfaces:**

- Consumes: `createPicker` (Task 9); constantes de Task 1; setters de Task 7.
- Produces: `createCommentActions` acepta dos callbacks más — `onSetType(comment, type)` y `onSetPriority(comment, priority)`. También exporta `typeLabelOf(type, strings)` y `priorityLabelOf(priority, strings)`.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `test/comment-actions.test.js`:

```js
import { createCommentActions } from "../src/comment-actions.js";
import { getStrings } from "../src/i18n.js";

describe("type and priority pickers in the actions bar", () => {
  const strings = getStrings("en");
  const build = (comment, handlers = {}) =>
    createCommentActions(
      { id: 1, status: "open", type: null, priority: null, ...comment },
      {
        strings,
        onCopy: vi.fn(),
        onSetStatus: vi.fn(),
        onSetType: vi.fn(),
        onSetPriority: vi.fn(),
        onDelete: vi.fn(),
        ...handlers,
      }
    );

  it("renders five controls: copy, status, type, priority, more", () => {
    expect(build({}).querySelectorAll("button[aria-haspopup]")).toHaveLength(3);
  });

  it("labels the type picker with the current type", () => {
    const actions = build({ type: "bug" });
    const btn = actions.querySelector('[data-action="type"]');
    expect(btn.dataset.hdTooltip).toBe("Type: Bug");
  });

  it("shows Unset when the type is neutral", () => {
    const actions = build({ type: null });
    const btn = actions.querySelector('[data-action="type"]');
    expect(btn.dataset.hdTooltip).toBe("Type: Unset");
  });

  it("gives each picker its own data-action hook", () => {
    const actions = build({});
    expect(actions.querySelector('[data-action="status"]')).not.toBeNull();
    expect(actions.querySelector('[data-action="type"]')).not.toBeNull();
    expect(actions.querySelector('[data-action="priority"]')).not.toBeNull();
  });

  it("reports a type selection", () => {
    const onSetType = vi.fn();
    const actions = build({}, { onSetType });
    const item = [...actions.querySelectorAll("[data-picker-option]")].find(
      (i) => i.dataset.pickerOption === "suggestion"
    );
    item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onSetType).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      "suggestion"
    );
  });

  it("reports a priority selection", () => {
    const onSetPriority = vi.fn();
    const actions = build({}, { onSetPriority });
    const item = [...actions.querySelectorAll("[data-picker-option]")].find(
      (i) => i.dataset.pickerOption === "high"
    );
    item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onSetPriority).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      "high"
    );
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run test/comment-actions.test.js -t "type and priority pickers"`
Expected: FAIL — solo hay 1 botón con `aria-haspopup`.

- [ ] **Step 3: Implementar en `src/comment-actions.js`**

Actualizar el import de constantes:

```js
import {
  CLASSES,
  STATUSES,
  STATUS_COLORS,
  COMMENT_TYPES,
  TYPE_COLORS,
  PRIORITIES,
  PRIORITY_COLORS,
} from "./constants.js";
```

Añadir junto a `statusLabelOf`:

```js
export const typeLabelOf = (type, strings) =>
  ({
    bug: strings.typeBug,
    suggestion: strings.typeSuggestion,
    question: strings.typeQuestion,
    improvement: strings.typeImprovement,
  })[type] || strings.unset;

export const priorityLabelOf = (priority, strings) =>
  ({
    high: strings.priorityHigh,
    medium: strings.priorityMedium,
    low: strings.priorityLow,
  })[priority] || strings.unset;
```

Cambiar la firma de `createCommentActions` a:

```js
export const createCommentActions = (
  comment,
  { strings, onCopy, onSetStatus, onSetType, onSetPriority, onDelete }
) => {
```

Y añadir, justo después del `appendChild` del picker de estado:

```js
// --- category picker (RF3) ---
actions.appendChild(
  createPicker({
    action: "type",
    // `null` first: returning to the neutral state must be reachable.
    options: [null, ...COMMENT_TYPES],
    value: comment.type || null,
    colorOf: (type) => TYPE_COLORS[type] || "transparent",
    labelOf: (type) => typeLabelOf(type, strings),
    tooltipLabel: strings.typeLabel,
    onSelect: (type) => onSetType?.(comment, type),
  })
);

// --- priority picker (RF4) ---
actions.appendChild(
  createPicker({
    action: "priority",
    options: [null, ...PRIORITIES],
    value: comment.priority || null,
    colorOf: (priority) => PRIORITY_COLORS[priority] || "transparent",
    labelOf: (priority) => priorityLabelOf(priority, strings),
    tooltipLabel: strings.priorityLabel,
    onSelect: (priority) => onSetPriority?.(comment, priority),
  })
);
```

- [ ] **Step 4: Cablear los callbacks en `src/inbox.js`**

En `_buildCardActions`, añadir después de `onSetStatus`:

```js
      onSetType: (c, type) => this.callbacks.onSetType(c.id, type),
      onSetPriority: (c, priority) =>
        this.callbacks.onSetPriority(c.id, priority),
```

- [ ] **Step 5: Cablear los callbacks en `src/overlay.js`**

En `showInbox`, en el objeto de callbacks pasado a `new InboxView(...)`, junto a `onSetStatus`:

```js
          onSetType: (id, type) => this.setCommentType(id, type),
          onSetPriority: (id, priority) =>
            this.setCommentPriority(id, priority),
```

En `showThreadPopover`, en el objeto pasado a `createCommentActions`, junto a `onSetStatus`:

```js
      onSetType: (c, type) => this.setCommentType(c.id, type),
      onSetPriority: (c, priority) => this.setCommentPriority(c.id, priority),
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `npx vitest run test/comment-actions.test.js test/inbox.test.js test/overlay.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/comment-actions.js src/inbox.js src/overlay.js test/comment-actions.test.js
git commit -m "feat(comment-actions): add type and priority pickers"
```

---

### Task 11: Fila de clasificación y etiquetas en el comment box

**Files:**

- Modify: `src/components.js` (`createCommentBox` ~L209)
- Modify: `src/overlay.js` (`initOverlay`, `saveComment`, `hideCommentBox`)
- Modify: `src/styles.js`
- Test: `test/components.test.js`

**Interfaces:**

- Consumes: `createPicker`, `typeLabelOf`, `priorityLabelOf` (Tasks 9–10); constantes de Task 1.
- Produces: `createClassifyRow(strings)` en `components.js`, que devuelve
  `{ container, getType(), getPriority(), getTags() }`. `createCommentBox` monta la fila y expone la misma API vía la propiedad `classify` del elemento devuelto.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `test/components.test.js`:

```js
import { createClassifyRow, createCommentBox } from "../src/components.js";
import { getStrings } from "../src/i18n.js";
import { CLASSES } from "../src/constants.js";

describe("createClassifyRow", () => {
  const strings = getStrings("en");

  it("starts neutral", () => {
    const row = createClassifyRow(strings);
    expect(row.getType()).toBeNull();
    expect(row.getPriority()).toBeNull();
    expect(row.getTags()).toEqual([]);
  });

  it("records a type and a priority selection", () => {
    const row = createClassifyRow(strings);
    const pick = (value) =>
      [...row.container.querySelectorAll("[data-picker-option]")]
        .find((i) => i.dataset.pickerOption === value)
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));

    pick("bug");
    pick("high");

    expect(row.getType()).toBe("bug");
    expect(row.getPriority()).toBe("high");
  });

  it("adds a tag on Enter and renders it as a chip", () => {
    const row = createClassifyRow(strings);
    const input = row.container.querySelector(`.${CLASSES.TAGS_INPUT}`);

    input.value = "Checkout";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    expect(row.getTags()).toEqual(["checkout"]);
    expect(row.container.querySelectorAll(`.${CLASSES.TAG_CHIP}`)).toHaveLength(
      1
    );
    expect(input.value).toBe("");
  });

  it("adds a tag on comma", () => {
    const row = createClassifyRow(strings);
    const input = row.container.querySelector(`.${CLASSES.TAGS_INPUT}`);
    input.value = "ios";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "," }));
    expect(row.getTags()).toEqual(["ios"]);
  });

  it("ignores blanks and duplicates", () => {
    const row = createClassifyRow(strings);
    const input = row.container.querySelector(`.${CLASSES.TAGS_INPUT}`);
    const add = (value) => {
      input.value = value;
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    };

    add("checkout");
    add("  CHECKOUT  ");
    add("   ");

    expect(row.getTags()).toEqual(["checkout"]);
  });

  it("removes a tag through its chip button", () => {
    const row = createClassifyRow(strings);
    const input = row.container.querySelector(`.${CLASSES.TAGS_INPUT}`);
    input.value = "checkout";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    row.container
      .querySelector(`.${CLASSES.TAG_CHIP_REMOVE}`)
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(row.getTags()).toEqual([]);
    expect(row.container.querySelectorAll(`.${CLASSES.TAG_CHIP}`)).toHaveLength(
      0
    );
  });
});

describe("createCommentBox", () => {
  it("exposes the classification row", () => {
    const box = createCommentBox(getStrings("en"));
    expect(box.querySelector(`.${CLASSES.CLASSIFY_ROW}`)).not.toBeNull();
    expect(box.classify.getType()).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run test/components.test.js`
Expected: FAIL — `createClassifyRow is not a function`.

- [ ] **Step 3: Declarar las clases CSS de esta tarea en `src/constants.js`**

Añadir dentro del objeto `CLASSES`, justo antes de `HIGHLIGHT`:

```js
  CLASSIFY_ROW: "classify-row",
  TAGS_INPUT: "tags-input",
  TAG_CHIP: "tag-chip",
  TAG_CHIP_REMOVE: "tag-chip-remove",
  INBOX_BADGES: "inbox-badges",
```

`test/constants.test.js` verifica que toda clave de `CLASSES` esté usada en
`src/`, así que estas se declaran aquí — la tarea que las consume — y no antes.

- [ ] **Step 4: Implementar `createClassifyRow` en `src/components.js`**

Añadir al import de constantes las claves nuevas y las de clasificación, e importar los helpers:

```js
import {
  createPicker,
  typeLabelOf,
  priorityLabelOf,
} from "./comment-actions.js";
import {
  COMMENT_TYPES,
  TYPE_COLORS,
  PRIORITIES,
  PRIORITY_COLORS,
} from "./constants.js";
```

Añadir antes de `createCommentBox`:

```js
/**
 * RF3 + RF4 — the classification strip inside the new-comment box: type,
 * priority and free-form tags, all starting neutral.
 *
 * The comment box is built once and reused for every comment, so this
 * exposes reset(): without it the previous comment's selections would leak
 * into the next one.
 *
 * @param {object} strings
 * @returns {{ container: HTMLElement, getType: () => string|null,
 *   getPriority: () => string|null, getTags: () => string[],
 *   reset: () => void }}
 */
export const createClassifyRow = (strings) => {
  const container = document.createElement("div");
  container.className = CLASSES.CLASSIFY_ROW;

  let type = null;
  let priority = null;
  /** @type {string[]} */
  const tags = [];

  const chips = document.createElement("div");
  chips.className = CLASSES.INBOX_BADGES;

  const input = document.createElement("input");
  input.type = "text";
  input.className = CLASSES.TAGS_INPUT;
  input.placeholder = strings.tagsPlaceholder;
  input.setAttribute("aria-label", strings.tagsPlaceholder);

  const renderChips = () => {
    chips.innerHTML = "";
    tags.forEach((tag, index) => {
      const chip = document.createElement("span");
      chip.className = CLASSES.TAG_CHIP;
      chip.appendChild(document.createTextNode(tag));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = CLASSES.TAG_CHIP_REMOVE;
      remove.setAttribute("aria-label", `${strings.removeTag}: ${tag}`);
      remove.innerHTML = "&times;";
      remove.addEventListener("click", (e) => {
        e.stopPropagation();
        tags.splice(index, 1);
        renderChips();
      });

      chip.appendChild(remove);
      chips.appendChild(chip);
    });
  };

  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== ",") return;
    e.preventDefault();
    const tag = input.value.trim().toLowerCase();
    // Blanks and duplicates are silently ignored — nothing to tell the user.
    if (tag && !tags.includes(tag)) {
      tags.push(tag);
      renderChips();
    }
    input.value = "";
  });

  // Pickers keep their selection internally, so returning them to neutral
  // means rebuilding them — hence mount() rather than a one-shot append.
  const mount = () => {
    container.replaceChildren();
    container.appendChild(
      createPicker({
        action: "type",
        options: [null, ...COMMENT_TYPES],
        value: null,
        colorOf: (value) => TYPE_COLORS[value] || "transparent",
        labelOf: (value) => typeLabelOf(value, strings),
        tooltipLabel: strings.typeLabel,
        onSelect: (value) => (type = value),
      })
    );
    container.appendChild(
      createPicker({
        action: "priority",
        options: [null, ...PRIORITIES],
        value: null,
        colorOf: (value) => PRIORITY_COLORS[value] || "transparent",
        labelOf: (value) => priorityLabelOf(value, strings),
        tooltipLabel: strings.priorityLabel,
        onSelect: (value) => (priority = value),
      })
    );
    container.appendChild(input);
    container.appendChild(chips);
  };

  mount();

  return {
    container,
    getType: () => type,
    getPriority: () => priority,
    getTags: () => [...tags],
    reset: () => {
      type = null;
      priority = null;
      tags.length = 0;
      input.value = "";
      renderChips();
      mount();
    },
  };
};
```

- [ ] **Step 5: Montar la fila en `createCommentBox`**

Reemplazar el cuerpo entre `createInputArea(...)` y `return commentBox;`:

```js
const classify = createClassifyRow(strings);

commentBox.appendChild(classify.container);
commentBox.appendChild(inputArea);
commentBox.style.display = "none";
// Exposed so the overlay can read the selections at save time without
// re-querying the DOM.
/** @type {any} */ (commentBox).classify = classify;
return commentBox;
```

- [ ] **Step 6: Leer los valores en `saveComment`**

En `src/overlay.js`, reemplazar las líneas `type: null,`, `priority: null,` y `tags: [],` del literal por:

```js
      type: this.commentBox.classify?.getType() ?? null,
      priority: this.commentBox.classify?.getPriority() ?? null,
      tags: this.commentBox.classify?.getTags() ?? [],
```

- [ ] **Step 7: Resetear la fila al cerrar el box**

En `hideCommentBox` de `src/overlay.js`, junto a la limpieza de `_pendingScreenshots` y `_pendingContextScreenshot`:

```js
this.commentBox.classify?.reset();
```

- [ ] **Step 8: Añadir los estilos en `src/styles.js`**

Añadir dentro de la plantilla que devuelve `getStyles()`:

```css
.classify-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 10px 0;
}
.tags-input {
  flex: 1 1 90px;
  min-width: 90px;
  background: transparent;
  border: none;
  outline: none;
  color: inherit;
  font-size: 12px;
  padding: 2px 0;
}
.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 11px;
  line-height: 1.4;
}
.tag-chip-remove {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0;
  font-size: 13px;
  line-height: 1;
  opacity: 0.6;
}
.tag-chip-remove:hover {
  opacity: 1;
}
```

- [ ] **Step 9: Escribir el test de reset**

Añadir a `test/overlay.test.js`:

```js
it("resets the classification row between comments", async () => {
  const overlay = makeOverlay({ autoScreenshot: false });
  overlay.commentBox.classify.getTags(); // row is mounted

  const pick = (value) =>
    [...overlay.commentBox.querySelectorAll("[data-picker-option]")]
      .find((i) => i.dataset.pickerOption === value)
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));

  pick("bug");
  expect(overlay.commentBox.classify.getType()).toBe("bug");

  overlay.hideCommentBox();
  expect(overlay.commentBox.classify.getType()).toBeNull();
});
```

- [ ] **Step 10: Correr los tests y verificar que pasan**

Run: `npx vitest run test/components.test.js test/overlay.test.js test/styles.test.js`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/components.js src/overlay.js src/styles.js test/components.test.js test/overlay.test.js
git commit -m "feat(components): add classification row to the comment box"
```

---

### Task 12: Badges y tiempo de resolución en las cards del inbox

**Files:**

- Modify: `src/inbox.js` (`_buildCard` ~L277)
- Modify: `src/styles.js`
- Test: `test/inbox.test.js`

**Interfaces:**

- Consumes: `formatDuration` (Task 3); `typeLabelOf`, `priorityLabelOf` (Task 10); constantes de Task 1.
- Produces: `_buildBadges(comment): HTMLElement | null` en `InboxView`.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `test/inbox.test.js`:

```js
describe("card badges", () => {
  const base = {
    id: 1,
    text: "t",
    author: "Ana",
    createdAt: "2026-01-01T00:00:00.000Z",
    page: location.pathname,
    replies: [],
    screenshots: [],
    status: "open",
    type: null,
    priority: null,
    tags: [],
    resolvedAt: null,
    anchorState: "anchored",
  };

  it("renders no badge row when the comment is fully neutral", () => {
    const inbox = createInbox([{ ...base }]);
    expect(inbox.el.querySelector(`.${CLASSES.INBOX_BADGES}`)).toBeNull();
  });

  it("renders type and priority badges with their labels, not just colour", () => {
    const inbox = createInbox([{ ...base, type: "bug", priority: "high" }]);
    const badges = inbox.el.querySelectorAll(`.${CLASSES.BADGE}`);
    const labels = [...badges].map((b) => b.textContent);
    expect(labels).toContain("Bug");
    expect(labels).toContain("High");
  });

  it("renders one badge per tag", () => {
    const inbox = createInbox([{ ...base, tags: ["checkout", "ios"] }]);
    const tags = inbox.el.querySelectorAll(`.${CLASSES.BADGE_TAG}`);
    expect([...tags].map((t) => t.textContent)).toEqual(["checkout", "ios"]);
  });

  it("shows the resolution time on resolved comments", () => {
    const inbox = createInbox([
      {
        ...base,
        status: "resolved",
        createdAt: "2026-01-01T00:00:00.000Z",
        resolvedAt: "2026-01-03T04:00:00.000Z",
      },
    ]);
    const badge = inbox.el.querySelector(`.${CLASSES.BADGE_DURATION}`);
    expect(badge.textContent).toBe("Resolved in 2d 4h");
  });

  it("shows an em dash for legacy resolved comments with no resolvedAt", () => {
    // Never invent a duration from data that doesn't exist.
    const inbox = createInbox([
      { ...base, status: "resolved", resolvedAt: null },
    ]);
    expect(
      inbox.el.querySelector(`.${CLASSES.BADGE_DURATION}`).textContent
    ).toBe("Resolved in —");
  });

  it("shows no duration badge on unresolved comments", () => {
    const inbox = createInbox([{ ...base, status: "in_progress" }]);
    expect(inbox.el.querySelector(`.${CLASSES.BADGE_DURATION}`)).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run test/inbox.test.js -t "card badges"`
Expected: FAIL — no existe `.helldots-badge`.

- [ ] **Step 3: Declarar las clases CSS de esta tarea en `src/constants.js`**

Añadir dentro del objeto `CLASSES`, justo antes de `HIGHLIGHT`:

```js
  BADGE: "helldots-badge",
  BADGE_TYPE: "helldots-badge--type",
  BADGE_PRIORITY: "helldots-badge--priority",
  BADGE_TAG: "helldots-badge--tag",
  BADGE_DURATION: "helldots-badge--duration",
```

`INBOX_BADGES` ya lo declaró la Task 11 — no lo dupliques.

- [ ] **Step 4: Implementar `_buildBadges` en `src/inbox.js`**

Actualizar imports. `formatTemplate` sustituye `{n}` por cualquier string, así que sirve igual para `"2d 4h"` que para `"—"`:

```js
import { formatDuration, formatTemplate } from "./i18n.js";
import {
  createCommentActions,
  copyToClipboard,
  typeLabelOf,
  priorityLabelOf,
} from "./comment-actions.js";
```

Y añadir `TYPE_COLORS` y `PRIORITY_COLORS` a la importación de `./constants.js` que **ya existe** en el archivo (donde se importa `CLASSES`), sin crear una segunda.

Añadir el método después de `_buildTag`:

```js
  /**
   * RF3/RF4/RF5 — classification and resolution-time badges. Every badge
   * carries text: colour alone must never be the only signal (WCAG 1.4.1).
   * @param {any} comment
   * @returns {HTMLElement | null} null when there's nothing to show
   */
  _buildBadges(comment) {
    const row = document.createElement("div");
    row.className = CLASSES.INBOX_BADGES;

    const addBadge = (text, modifier, color) => {
      const badge = document.createElement("span");
      badge.className = `${CLASSES.BADGE} ${modifier}`;
      badge.textContent = text;
      if (color) badge.style.borderColor = color;
      row.appendChild(badge);
    };

    if (comment.type) {
      addBadge(
        typeLabelOf(comment.type, this.strings),
        CLASSES.BADGE_TYPE,
        TYPE_COLORS[comment.type]
      );
    }
    if (comment.priority) {
      addBadge(
        priorityLabelOf(comment.priority, this.strings),
        CLASSES.BADGE_PRIORITY,
        PRIORITY_COLORS[comment.priority]
      );
    }
    for (const tag of comment.tags || []) {
      addBadge(tag, CLASSES.BADGE_TAG, null);
    }

    if (comment.status === "resolved") {
      // Comments resolved before RF5 shipped have no timestamp — show a
      // dash rather than a duration computed from data we don't have.
      const elapsed = comment.resolvedAt
        ? formatDuration(
            new Date(comment.resolvedAt).getTime() -
              new Date(comment.createdAt).getTime(),
            this.strings
          )
        : "";
      addBadge(
        formatTemplate(this.strings.resolvedInTemplate, elapsed || "—"),
        CLASSES.BADGE_DURATION,
        null
      );
    }

    return row.children.length ? row : null;
  }
```

- [ ] **Step 5: Montar la fila en `_buildCard`**

Reemplazar las líneas `const tag = this._buildTag(comment); if (tag) card.appendChild(tag);` por:

```js
const badges = this._buildBadges(comment);
if (badges) card.appendChild(badges);

const tag = this._buildTag(comment);
if (tag) card.appendChild(tag);
```

- [ ] **Step 6: Añadir los estilos en `src/styles.js`**

```css
.inbox-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.helldots-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 10px;
  font-size: 10px;
  line-height: 1.6;
  letter-spacing: 0.01em;
  white-space: nowrap;
}
.helldots-badge--tag {
  opacity: 0.75;
}
.helldots-badge--duration {
  opacity: 0.75;
  border-style: dashed;
}
```

- [ ] **Step 7: Correr los tests y verificar que pasan**

Run: `npx vitest run test/inbox.test.js test/styles.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/inbox.js src/styles.js test/inbox.test.js
git commit -m "feat(inbox): show type, priority, tag and resolution-time badges"
```

---

### Task 13: Filtros por tipo y prioridad en el inbox

**Files:**

- Modify: `src/inbox.js` (`constructor` ~L31, `filteredComments` ~L99, `_buildFilter` ~L200)
- Test: `test/inbox.test.js`

**Interfaces:**

- Consumes: `COMMENT_TYPES`, `PRIORITIES` (Task 1); `typeLabelOf`, `priorityLabelOf` (Task 10).
- Produces: `this.typeFilter` y `this.priorityFilter`, ambos `"all"` por defecto.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `test/inbox.test.js`:

```js
describe("type and priority filters", () => {
  const make = (id, type, priority) => ({
    id,
    text: `c${id}`,
    author: "Ana",
    createdAt: "2026-01-01T00:00:00.000Z",
    page: location.pathname,
    replies: [],
    screenshots: [],
    status: "open",
    tags: [],
    resolvedAt: null,
    anchorState: "anchored",
    type,
    priority,
  });

  const comments = [
    make(1, "bug", "high"),
    make(2, "suggestion", "low"),
    make(3, null, null),
  ];

  it("defaults to showing everything", () => {
    const inbox = createInbox(comments);
    expect(inbox.filteredComments()).toHaveLength(3);
  });

  it("filters by type", () => {
    const inbox = createInbox(comments);
    inbox.typeFilter = "bug";
    expect(inbox.filteredComments().map((c) => c.id)).toEqual([1]);
  });

  it("filters by priority", () => {
    const inbox = createInbox(comments);
    inbox.priorityFilter = "low";
    expect(inbox.filteredComments().map((c) => c.id)).toEqual([2]);
  });

  it("combines type and priority with AND", () => {
    const inbox = createInbox(comments);
    inbox.typeFilter = "bug";
    inbox.priorityFilter = "low";
    expect(inbox.filteredComments()).toHaveLength(0);
  });

  it("combines with the existing status filter", () => {
    const resolved = { ...make(4, "bug", "high"), status: "resolved" };
    const inbox = createInbox([...comments, resolved]);
    inbox.typeFilter = "bug";
    inbox.statusFilter = "unresolved";
    expect(inbox.filteredComments().map((c) => c.id)).toEqual([1]);
  });

  it("renders a menu option per type and per priority", () => {
    const inbox = createInbox(comments);
    inbox.render();
    expect(inbox.el.querySelectorAll("[data-filter-type]")).toHaveLength(5);
    expect(inbox.el.querySelectorAll("[data-filter-priority]")).toHaveLength(4);
  });

  it("selecting a type option applies the filter", () => {
    const inbox = createInbox(comments);
    inbox.render();
    inbox.el
      .querySelector('[data-filter-type="bug"]')
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(inbox.typeFilter).toBe("bug");
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run test/inbox.test.js -t "type and priority filters"`
Expected: FAIL — `typeFilter` no existe, no filtra.

- [ ] **Step 3: Inicializar el estado en el constructor de `InboxView`**

Junto a donde se inicializa `this.statusFilter`:

```js
this.typeFilter = "all";
this.priorityFilter = "all";
```

- [ ] **Step 4: Aplicar los filtros en `filteredComments`**

Insertar después del bloque de `statusFilter` y antes del `return`:

```js
if (this.typeFilter !== "all") {
  comments = comments.filter((comment) => comment.type === this.typeFilter);
}
if (this.priorityFilter !== "all") {
  comments = comments.filter(
    (comment) => comment.priority === this.priorityFilter
  );
}
```

- [ ] **Step 5: Añadir las secciones al menú en `_buildFilter`**

Añadir `COMMENT_TYPES` y `PRIORITIES` a la importación de `./constants.js` que ya existe (la Task 12 le añadió `TYPE_COLORS` y `PRIORITY_COLORS`). `typeLabelOf` y `priorityLabelOf` ya vienen importados desde la Task 12.

Después del bloque `addSection(this.strings.filterByStatus)`:

```js
addSection(this.strings.filterByType);
for (const value of ["all", ...COMMENT_TYPES]) {
  addOption(
    value === "all"
      ? this.strings.filterStatusAll
      : typeLabelOf(value, this.strings),
    this.typeFilter === value,
    "filterType",
    value,
    () => (this.typeFilter = value)
  );
}

addSection(this.strings.filterByPriority);
for (const value of ["all", ...PRIORITIES]) {
  addOption(
    value === "all"
      ? this.strings.filterStatusAll
      : priorityLabelOf(value, this.strings),
    this.priorityFilter === value,
    "filterPriority",
    value,
    () => (this.priorityFilter = value)
  );
}
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `npx vitest run test/inbox.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/inbox.js test/inbox.test.js
git commit -m "feat(inbox): filter comments by type and priority"
```

---

### Task 14: Bloque de contexto en el detalle del inbox

**Files:**

- Modify: `src/inbox.js` (`_renderDetail` ~L389)
- Modify: `src/styles.js`
- Test: `test/inbox.test.js`

**Interfaces:**

- Consumes: `comment.context` y `comment.contextScreenshot` (Tasks 5 y 8).
- Produces: `_buildContextBlock(comment): HTMLElement | null`.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `test/inbox.test.js`:

```js
describe("context block in the detail view", () => {
  const withContext = {
    id: 1,
    text: "t",
    author: "Ana",
    createdAt: "2026-01-01T00:00:00.000Z",
    page: location.pathname,
    replies: [],
    screenshots: [],
    status: "open",
    type: null,
    priority: null,
    tags: [],
    resolvedAt: null,
    anchorState: "anchored",
    contextScreenshot: "data:image/jpeg;base64,auto",
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
  };

  it("lists url, viewport, screen, browser and OS", () => {
    const inbox = createInbox([withContext]);
    inbox.openDetail(1);
    const text = inbox.el.querySelector(
      `.${CLASSES.CONTEXT_BLOCK}`
    ).textContent;

    expect(text).toContain("https://example.test/pricing");
    expect(text).toContain("1440×900");
    expect(text).toContain("2560×1440");
    expect(text).toContain("Chrome 120");
    expect(text).toContain("macOS 14.2");
  });

  it("renders the automatic screenshot with its own label", () => {
    const inbox = createInbox([withContext]);
    inbox.openDetail(1);
    const block = inbox.el.querySelector(`.${CLASSES.CONTEXT_BLOCK}`);
    const img = block.querySelector("img");

    expect(img.src).toBe("data:image/jpeg;base64,auto");
    expect(img.alt).toBe("Automatic context");
  });

  it("opens the lightbox when the automatic screenshot is clicked", () => {
    const onShowLightbox = vi.fn();
    const inbox = createInbox([withContext], { onShowLightbox });
    inbox.openDetail(1);
    inbox.el
      .querySelector(`.${CLASSES.CONTEXT_BLOCK} img`)
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onShowLightbox).toHaveBeenCalledWith("data:image/jpeg;base64,auto");
  });

  it("renders nothing for legacy comments with no context", () => {
    const inbox = createInbox([
      { ...withContext, context: null, contextScreenshot: null },
    ]);
    inbox.openDetail(1);
    expect(inbox.el.querySelector(`.${CLASSES.CONTEXT_BLOCK}`)).toBeNull();
  });

  it("renders the block with only a screenshot and no metadata", () => {
    const inbox = createInbox([{ ...withContext, context: null }]);
    inbox.openDetail(1);
    const block = inbox.el.querySelector(`.${CLASSES.CONTEXT_BLOCK}`);
    expect(block.querySelector("img")).not.toBeNull();
    expect(block.querySelectorAll(`.${CLASSES.CONTEXT_ROW}`)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run test/inbox.test.js -t "context block"`
Expected: FAIL — no existe `.inbox-context`.

- [ ] **Step 3: Declarar las clases CSS de esta tarea en `src/constants.js`**

Añadir dentro del objeto `CLASSES`, justo antes de `HIGHLIGHT`:

```js
  CONTEXT_BLOCK: "inbox-context",
  CONTEXT_ROW: "inbox-context-row",
```

- [ ] **Step 4: Implementar `_buildContextBlock` en `src/inbox.js`**

Añadir después de `_buildBadges`:

```js
  /**
   * RF2 — the environment the comment was reported from, plus the
   * automatic capture. Returns null for comments created before RF1/RF2.
   * @param {any} comment
   * @returns {HTMLElement | null}
   */
  _buildContextBlock(comment) {
    const { context, contextScreenshot } = comment;
    if (!context && !contextScreenshot) return null;

    const block = document.createElement("div");
    block.className = CLASSES.CONTEXT_BLOCK;

    const title = document.createElement("div");
    title.className = CLASSES.INBOX_FILTER_SECTION;
    title.textContent = this.strings.contextSection;
    block.appendChild(title);

    if (contextScreenshot) {
      const img = document.createElement("img");
      img.className = CLASSES.SCREENSHOT_IMG;
      img.src = contextScreenshot;
      img.alt = this.strings.autoScreenshotLabel;
      img.addEventListener("click", (e) => {
        e.stopPropagation();
        this.callbacks.onShowLightbox(contextScreenshot);
      });
      block.appendChild(img);
    }

    if (context) {
      const addRow = (label, value) => {
        if (!value) return;
        const row = document.createElement("div");
        row.className = CLASSES.CONTEXT_ROW;
        const key = document.createElement("span");
        key.textContent = label;
        const val = document.createElement("span");
        val.textContent = value;
        row.appendChild(key);
        row.appendChild(val);
        block.appendChild(row);
      };

      const size = (dimensions) =>
        dimensions ? `${dimensions.width}×${dimensions.height}` : "";
      const named = (entry) =>
        entry?.name ? `${entry.name} ${entry.version || ""}`.trim() : "";

      addRow(this.strings.contextUrl, context.url);
      addRow(this.strings.contextViewport, size(context.viewport));
      addRow(this.strings.contextScreen, size(context.screen));
      addRow(this.strings.contextBrowser, named(context.browser));
      addRow(this.strings.contextOs, named(context.os));
    }

    return block;
  }
```

- [ ] **Step 5: Montar el bloque en `_renderDetail`**

Insertar justo después de `detail.appendChild(this._buildCard(comment, { interactive: false }));`:

```js
const context = this._buildContextBlock(comment);
if (context) detail.appendChild(context);
```

- [ ] **Step 6: Añadir los estilos en `src/styles.js`**

```css
.inbox-context {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 11px;
}
.inbox-context img {
  width: 100%;
  border-radius: 6px;
  margin-bottom: 6px;
  cursor: zoom-in;
}
.inbox-context-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  opacity: 0.75;
}
.inbox-context-row span:last-child {
  text-align: right;
  word-break: break-all;
}
```

- [ ] **Step 7: Correr los tests y verificar que pasan**

Run: `npx vitest run test/inbox.test.js test/styles.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/inbox.js src/styles.js test/inbox.test.js
git commit -m "feat(inbox): show capture context in the detail view"
```

---

### Task 15: Enriquecer `buildAgentContext`

**Files:**

- Modify: `src/agent-context.js`
- Test: `test/agent-context.test.js`

**Interfaces:**

- Consumes: campos de Tasks 5–8; `formatDuration` (Task 3).
- Produces: `buildAgentContext(comment, { viewportWidth, viewportHeight, strings })` — el tercer campo `strings` es nuevo y **opcional**; sin él, el tiempo de resolución se omite.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `test/agent-context.test.js`:

```js
import { getStrings } from "../src/i18n.js";

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
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run test/agent-context.test.js`
Expected: FAIL — el bloque no contiene `Type:`.

- [ ] **Step 3: Implementar en `src/agent-context.js`**

Importar `formatDuration`:

```js
import { formatDuration } from "./i18n.js";
```

Cambiar la firma y el cuerpo de `buildAgentContext`:

```js
/**
 * @param {import('./index.d.ts').Comment} comment
 * @param {{ viewportWidth: number, viewportHeight: number, strings?: object }} env
 * @returns {string}
 */
export function buildAgentContext(
  comment,
  { viewportWidth, viewportHeight, strings }
) {
```

Después del array `lines` existente (justo antes del bloque de `replies`), insertar:

```js
// Neutral classification fields are omitted rather than printed as
// "(none)" — the agent shouldn't read noise for data nobody filled in.
if (comment.type) lines.push(`Type: ${comment.type}`);
if (comment.priority) lines.push(`Priority: ${comment.priority}`);
if (comment.tags?.length) lines.push(`Tags: ${comment.tags.join(", ")}`);

const context = comment.context;
if (context) {
  if (context.url) lines.push(`URL: ${context.url}`);
  if (context.screen) {
    lines.push(`Screen: ${context.screen.width}x${context.screen.height}`);
  }
  if (context.browser?.name) {
    lines.push(
      `Browser: ${`${context.browser.name} ${context.browser.version || ""}`.trim()}`
    );
  }
  if (context.os?.name) {
    lines.push(
      `OS: ${`${context.os.name} ${context.os.version || ""}`.trim()}`
    );
  }
}

if (strings && comment.status === "resolved" && comment.resolvedAt) {
  const elapsed = formatDuration(
    new Date(comment.resolvedAt).getTime() -
      new Date(comment.createdAt).getTime(),
    strings
  );
  if (elapsed) lines.push(`Resolution time: ${elapsed}`);
}
```

- [ ] **Step 4: Pasar `strings` desde los dos llamadores**

En `src/inbox.js`, `_buildCardActions`:

```js
buildAgentContext(c, {
  viewportWidth: window.innerWidth,
  viewportHeight: window.innerHeight,
  strings: this.strings,
});
```

En `src/overlay.js`, `showThreadPopover`:

```js
buildAgentContext(c, {
  viewportWidth: window.innerWidth,
  viewportHeight: window.innerHeight,
  strings: this.strings,
});
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npx vitest run test/agent-context.test.js test/inbox.test.js test/overlay.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/agent-context.js src/inbox.js src/overlay.js test/agent-context.test.js
git commit -m "feat(agent-context): include classification and environment"
```

---

### Task 16: Cierre — gates completos, changeset y documentación

**Files:**

- Create: `.changeset/comment-context-classification.md`
- Modify: `DECISIONS.md`

- [ ] **Step 1: Correr la suite completa y todos los gates**

Run:

```bash
npm test && npm run lint && npm run typecheck && npm run format:check && npm run build && npm run size
```

Expected: todo PASS. `npm run size` debe reportar por debajo de 50 KB — anotar el número para el changeset.

Si `format:check` falla, correr `npm run format` y commitear el reformateo aparte.

- [ ] **Step 2: Verificar la cobertura**

Run: `npm run test:coverage`
Expected: sin regresión respecto al baseline. `src/metadata.js` debe salir cubierto al 100%.

- [ ] **Step 3: Verificación manual en el playground**

Run: `npx serve playground` (o el servidor estático que uses) y abrir `playground/index.html`.

Comprobar, en este orden:

1. Crear un comentario con clic simple → el screenshot automático aparece en el detalle del inbox y **no** contiene el toolbar de HellDots.
2. Crear un comentario con drag → salen las dos imágenes (recorte PNG nítido + contexto JPEG), y el toolbar tampoco aparece en el recorte manual.
3. Asignar tipo y prioridad al crear; verificar que los badges salen en la card.
4. Cambiar tipo y prioridad desde la barra de acciones del inbox y del thread popover.
5. Añadir dos etiquetas, quitar una.
6. Resolver un comentario → aparece "Resuelto en …". Reabrirlo → el badge desaparece.
7. Filtrar por tipo y por prioridad.
8. Recargar la página → todo persiste (modo `localStorage`).

- [ ] **Step 4: Escribir el changeset**

Crear `.changeset/comment-context-classification.md`:

```markdown
---
"helldots": minor
---

Automatic context capture and comment classification (RF1–RF5)

- Every new comment now captures a viewport screenshot (JPEG, half scale) and
  an environment snapshot: URL, viewport, screen resolution, device pixel
  ratio, user agent, browser, OS and language. Opt out with
  `autoScreenshot: false`.
- Comments can be categorised by type (bug, suggestion, question,
  improvement), prioritised (high, medium, low) and labelled with free-form
  tags. All three are optional and start neutral. New methods:
  `setCommentType`, `setCommentPriority`, `setCommentTags`, plus a single
  `onCommentUpdated` callback.
- Resolved comments show how long they took, computed from the new
  `resolvedAt` timestamp. Reopening a comment clears it.
- The inbox gains type and priority filters, classification badges, and a
  context block in the detail view.
- Fixed: the HellDots toolbar was being rendered into manual drag
  screenshots. Captures now hide the whole widget host.
```

- [ ] **Step 5: Documentar las decisiones en `DECISIONS.md`**

Añadir una sección al final:

```markdown
## Contexto automático, clasificación y tiempo de resolución (RF1–RF5)

- **`contextScreenshot` en un campo aparte de `screenshots[]`**: las dos
  cosas tienen semánticas distintas. `screenshots[]` es evidencia que el
  usuario adjuntó a propósito; `contextScreenshot` lo recoge la librería
  sola. Separarlos permite mostrarlos distinto, purgar solo el automático si
  se llega a tocar la cuota de localStorage, y que el usuario no borre por
  accidente algo que no puso él.
- **JPEG q0.7 a escala 0.5 para la captura automática**: un PNG de viewport a
  escala 1 pesa 300 KB–1.5 MB como data URL y con 3–4 comentarios revienta la
  cuota de ~5 MB de localStorage (toda la persistencia vive en una sola key).
  A media escala son ~40–120 KB. El drag manual se queda en PNG a escala 1:
  cuando el usuario selecciona una región a propósito, la fidelidad importa.
- **`renderPage` / `cropRegion` / `cropViewport` en vez de un solo
  `captureRegion`**: el render de la página es prácticamente todo el coste de
  una captura. Con el flujo de drag ya rindiendo una vez, una auto-captura
  independiente habría hecho que cada comentario con drag pagara ese coste
  dos veces. El canvas compartido lo evita. `captureRegion` se mantiene como
  export por compatibilidad.
- **La captura se espera antes de mostrar el comment box**: el host tiene que
  estar oculto durante el render, así que mostrar el box en paralelo sería
  una condición de carrera que lo metería a medias dentro de la propia
  captura. La ruta sin drag renderiza a `scale: 0.5` (~4× más barato) para
  acotar la latencia, y `autoScreenshot: false` la elimina del todo.
- **`withHiddenOverlay` oculta el host `<helldots-root>` entero, no solo
  `this.overlay`**: el flujo de drag anterior solo ocultaba el overlay, así
  que el toolbar de HellDots salía dentro de los screenshots manuales. Bug
  preexistente, arreglado de paso al compartir el helper.
- **`captureContext()` con `navigator.userAgentData` y fallback a regex**:
  Chromium expone marcas y plataforma ya estructuradas; Safari y Firefox
  requieren parsear el UA. El orden de la tabla es load-bearing (el UA de
  Edge contiene "Chrome", el de Chrome contiene "Safari"). El UA crudo se
  guarda siempre, así que un parseo fallido degrada a `unknown` sin perder
  información.
- **Tipos como enum fijo + `tags: string[]` libres, en vez de tipos
  configurables por el host**: los tags cubren la personalización sin que la
  librería tenga que traducir ni colorear etiquetas que no conoce.
- **La prioridad reusa el rojo de `bug` y el naranja de `in_progress`**:
  deliberado. La rampa rojo/naranja/gris se lee como escala de urgencia de
  inmediato, y son dimensiones distintas en slots distintos de la UI. Ningún
  badge comunica su significado solo con color — todos llevan texto
  (WCAG 1.4.1, y el gate de Lighthouse a11y está en 0.9).
- **`createPicker` genérico en vez de tres pickers duplicados**: estado, tipo
  y prioridad son el mismo widget con distinto diccionario. El picker de
  estado que ya existía pasó a ser su primer consumidor, sin cambio de
  comportamiento observable.
- **Un solo `onCommentUpdated` para tipo/prioridad/tags**: tres callbacks
  separados habrían sido ruido en la API. `onCommentStatusChanged` se
  mantiene intacto para no romper consumidores existentes.
- **`resolvedAt` único en vez de historial de estados**: se sella al entrar
  en `resolved` y se limpia al salir, así que el dato mostrado siempre
  corresponde a la resolución vigente. Un `statusHistory` completo daba más
  valor analítico del que el requisito pedía, a cambio de más payload por
  comentario. Los comentarios resueltos antes de este cambio no tienen
  timestamp: se muestran con `—`, nunca con una duración inventada.
- **RF6 (reacciones con emoji) queda fuera**: se reserva
  `reactions?: Record<string, string[]>` (emoji → autores). Al ser opcional
  y ausente por defecto, implementarlo después no requiere migración.
```

- [ ] **Step 6: Commit**

```bash
git add .changeset/ DECISIONS.md
git commit -m "docs: changeset and decisions for RF1-RF5"
```

---

## Cobertura del spec

| Requisito del spec                       | Task                                 |
| ---------------------------------------- | ------------------------------------ |
| RF1 — captura automática                 | 4, 8                                 |
| RF1 — política JPEG q0.7 @0.5            | 4                                    |
| RF1 — canvas compartido con el drag      | 4, 8                                 |
| RF1 — `autoScreenshot` opt-out           | 8                                    |
| RF1 — arreglo del toolbar en screenshots | 4, 8                                 |
| RF2 — metadatos de contexto              | 1, 2, 8                              |
| RF3 — tipos                              | 1, 10, 11                            |
| RF3 — etiquetas libres                   | 1, 7, 11                             |
| RF4 — prioridad                          | 1, 10, 11                            |
| RF3/RF4 — estado neutro alcanzable       | 9, 10, 11                            |
| RF5 — `resolvedAt`                       | 6                                    |
| RF5 — `formatDuration`                   | 3                                    |
| RF5 — visualización                      | 12, 15                               |
| RF6 — campo reservado, sin implementar   | 5 (tipo declarado), 16 (documentado) |
| Compatibilidad hacia atrás               | 5                                    |
| Inbox: filtros                           | 13                                   |
| Inbox: badges                            | 12                                   |
| Inbox: bloque de contexto                | 14                                   |
| agent-context enriquecido                | 15                                   |
| `index.d.ts` sincronizado                | 1, 5, 7                              |
| Changeset y DECISIONS.md                 | 16                                   |
