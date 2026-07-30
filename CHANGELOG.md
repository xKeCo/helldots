# Changelog

## 0.5.0 — 2026-07-29

First published release. Preview: the feature set is substantial and covered
by tests, but the API may still change before 1.0.

**`createCommentOverlay` now always returns the instance.** While the document
was still loading it used to register a `DOMContentLoaded` listener _and_
return the uninvoked initializer, so a caller who invoked it — reasonable,
since the signature said it might be a function — ended up with two overlays,
and the one the listener built had no handle to `cleanup()` with. The
`readyState` branch belongs to `CommentOverlay`'s constructor, which already
had it. Typed with overloads, so `autoInit: false` still yields an initializer
and everyone else gets a `CommentOverlay` without narrowing a union.

**Anchoring.** Comments capture a JSON-serializable anchor at creation — a
best-effort CSS selector, a content fingerprint and relative coordinates — so
they re-attach after the page changes and are marked orphaned rather than
dropped when their element disappears. Public API: `serializeComments()`,
`loadComments()`, and the `onCommentCreated` / `onReplyAdded` / `onAnchorLost`
callbacks.

**Inbox.** A right-side sidebar listing every comment, with a detail view,
thread replies, delete, and a copy button that puts an agent-ready context
block on the clipboard. Optional `persistence: "localStorage"` mode stores
comments across pages; a `user` option sets authorship.

**Lifecycle.** Every comment carries a status — open, in progress or resolved —
shown as a coloured dot and changeable from a picker in both the inbox and the
thread popover. Resolved comments lose their on-page marker and sink to the
bottom of the list. `setCommentStatus()` plus an `onCommentStatusChanged`
callback.

**Automatic capture (RF1, RF2).** Every new comment records a viewport
screenshot (JPEG at half scale) and an environment snapshot: URL, viewport,
screen resolution, device pixel ratio, user agent, browser, OS and language.
The widget hides itself during the render, so its own toolbar never lands
inside the image. Opt out with `autoScreenshot: false`.

**Classification (RF3, RF4).** Comments can carry a type (bug, suggestion,
question, improvement), a priority (high, medium, low) and free-form tags. All
optional and neutral by default, settable while writing the comment or later
from the actions bar. The inbox filters on all of them. New `setCommentType()`,
`setCommentPriority()` and `setCommentTags()`, plus one `onCommentUpdated`
callback.

**Resolution time (RF5).** Resolved comments show how long they took, measured
from creation. Reopening clears it.

**Screenshot engine.** Drag-to-capture is correct on scrolled pages — the
previous engine double-counted the window scroll, so captures taken further
down showed content from higher up. Moved to `modern-screenshot` and HellDots
now owns the crop.

**Storage resilience.** When localStorage fills, the oldest automatic
screenshots are shed and the write retried, so comments survive. Screenshots a
user deliberately attached are never discarded.

**Foundations.** Shadow DOM isolation, English and Spanish locales, and
TypeScript definitions shipped with the package.

### Development notes

- **fix(shadow-dom)**: el cursor personalizado de modo comentario dejó de
  aplicarse tras la Tarea 1. La clase `comment-cursor` se sigue poniendo en
  `document.body` (fuera del shadow root), pero su regla CSS vivía dentro
  del `<style>` inyectado en el shadow root — que nunca llega al host.
  Se agrega `getGlobalStyles()` en `src/styles.js` para las pocas reglas
  que deben aplicar al host page (hoy, solo esta), inyectadas en un
  `<style id="comment-overlay-global-styles">` aparte en `document.head`
  (`CommentOverlay.injectStyles`/`cleanup`), separado del stylesheet
  encapsulado del widget. Verificado contra `dev-v2` con Playwright:
  `getComputedStyle(document.body).cursor` ahora coincide.
  Además, a pedido explícito del usuario, la regla ahora también fuerza el
  cursor sobre **todos** los descendientes del host (`.comment-cursor,
.comment-cursor *`) — antes (incluso en `dev-v2`) enlaces y botones de
  la página anfitriona conservaban su propio `cursor: pointer` porque el
  valor heredado de `body` no gana contra una regla explícita en el
  descendiente. Con `!important` + el selector `*`, el ícono de comentario
  ahora se ve sin importar sobre qué elemento del host esté el mouse. El
  selector no cruza el shadow boundary, así que los controles propios del
  widget (toolbar, botones) conservan su cursor normal.
- **revert(a11y)**: por decisión explícita del usuario, se quitaron los 4
  anillos `:focus-visible` agregados en la Tarea 8 (toolbar, input de
  comentario, input de respuesta, círculo de comentario) para restaurar el
  aspecto visual exacto de antes de esa tarea — verificado pixel a pixel
  contra `dev-v2`. El resto de la Tarea 8 (roles ARIA, `aria-label`,
  activación por teclado de los círculos, contraste del placeholder) se
  mantiene intacto. Ver `DECISIONS.md` para el trade-off de accesibilidad
  que esto reintroduce.

- **feat(shadow-dom)**: HellDots ahora se monta dentro de un custom element
  `<helldots-root>` con un shadow root abierto (`src/root-element.js`). Toda
  la UI (toolbar, comment box, tooltips, popovers, lightbox, selection rect) y
  los estilos inyectados (`src/styles.js`) viven dentro del shadow tree, en
  vez de en `document.body` / `document.head`. Esto cumple RNF07: ningún
  estilo del widget se filtra al host ni viceversa. El anclaje de comentarios
  a elementos del host (fuera del shadow root) y el atajo de teclado
  configurable siguen funcionando sin cambios en la API pública. Ver
  `DECISIONS.md` para detalle de las decisiones tomadas.
- **test**: se agrega Vitest + jsdom (`vitest.config.js`, `test/`) con la
  primera suite de pruebas, enfocada en regresión de la encapsulación Shadow
  DOM (Tarea 1 del plan técnico). `npm test` ahora corre Vitest.
- **build**: se agrega un pipeline de build con esbuild (`scripts/build.mjs`).
  `npm run build` genera `dist/helldots.esm.js` (ESM, minificado, tree-shake
  friendly, `html2canvas` externo) y `dist/helldots.umd.js` (IIFE
  autocontenido para `<script>` plano, con `html2canvas` empaquetado).
  `npm run size` mide el tamaño gzip de `dist/helldots.esm.js` y falla si
  supera el presupuesto de 50 KB (RNF01/RNF08) — actualmente ~10.4 KB gzip.
  `package.json` ahora apunta `main`/`module`/`exports` a `dist/`; el
  playground sigue importando directamente desde `src/index.js`, sin
  bundler. Ver `DECISIONS.md` para el tratamiento de `html2canvas`.
- **test**: cobertura medible ≥80% sobre `src/` (RNF08). Se agrega
  `@vitest/coverage-v8` con umbrales (`lines`/`functions`/`branches`/
  `statements`) configurados en `vitest.config.js`; `npm run test:coverage`
  falla si la cobertura cae por debajo de 80%. Se añadieron suites para
  `index.js`, `components.js`, `overlay.js`, `styles.js`, `constants.js` y
  `root-element.js` (105 tests, ~97%/85%/95%/99% stmts/branches/funcs/lines).
  Escribir estas pruebas encontró y corrigió tres bugs reales:
  - `cleanup()` nunca quitaba el listener `mousedown` de `handleDocumentClick`
    de `document`, dejándolo filtrarse (memory/listener leak) cada vez que se
    destruía una instancia de `CommentOverlay`.
  - `CLASSES.TOOLBAR`, `CLASSES.COMMENT_BOX` y `CLASSES.SCREENSHOT_PREVIEW`
    eran constantes muertas (nunca usadas como className en ningún lado, dos
    de ellas además colisionaban en valor con sus `IDS` homónimos) — removidas.
  - El selector `:scope > .screenshots-container` en `showThreadPopover` no
    es resoluble de forma fiable en todos los entornos de testing basados en
    jsdom; se reemplazó por una búsqueda explícita sobre `popover.children`
    con el mismo comportamiento en navegadores reales pero verificable en CI.
- **lint/format**: se agrega ESLint (flat config, `eslint.config.js`) con
  `@eslint/js` recomendado + `eslint-config-prettier`, y Prettier
  (`.prettierrc.json`). `npm run lint` corre sin errores sobre `src/`,
  `test/` y `scripts/`; `npm run format` / `npm run format:check` formatean
  o verifican el repo (excluyendo `playground/index.html`, una plantilla de
  terceros que no es código de HellDots — ver `DECISIONS.md`). Se eliminó
  un parámetro `circle` sin usar en `createMutationObserver`.
- **ci**: se agrega `.github/workflows/ci.yml`, que en cada push/PR a `main`
  corre `npm run lint`, `npm test`, `npm run test:coverage`, `npm run build`,
  `npm run size`, y una auditoría de Lighthouse CI sobre un fixture mínimo
  (`playground/lighthouse.html`) que falla si Accessibility < 90 (proxy de
  RNF09/WCAG 2.1 AA). Se agrega también `.github/workflows/release.yml`
  (documentado, sin publicar realmente — requiere un secret `NPM_TOKEN` que
  no está configurado). Escribir el gate de accesibilidad encontró un bug
  real: los botones de la toolbar (Comment/Inbox) y otros botones solo-ícono
  (adjuntar imagen, enviar, cerrar, quitar captura) no tenían nombre
  accesible (`aria-label`) — corregido en `src/components.js`/`src/overlay.js`,
  además de `alt` en las imágenes de captura de pantalla. Ver `DECISIONS.md`
  para el porqué del fixture dedicado en vez de auditar `playground/index.html`.
- **typecheck**: se agrega `tsconfig.json` (`checkJs`, sin emitir) y
  `npm run typecheck` (`tsc --noEmit`), integrado como gate en
  `ci.yml`/`release.yml`. Se anotó `src/index.js` con JSDoc que referencia
  los tipos de `src/index.d.ts`, y se corrigieron ~20 errores de tipos reales
  en `src/overlay.js`/`src/components.js` (elementos DOM sin narrowing —
  `HTMLInputElement`, `HTMLTextAreaElement`, `HTMLImageElement`, etc.) vía
  anotaciones JSDoc puntuales, sin cambiar ningún comportamiento. Se agrega
  `typecheck/consistency-check.ts` (fuera de `src/`, no se publica) para que
  el checkeo realmente contraste `index.d.ts` contra la implementación —
  ver `DECISIONS.md` para el problema de TypeScript que esto rodea.
- **versionado**: se agrega [changesets](https://github.com/changesets/changesets)
  (`.changeset/`, `npm run changeset`, `npm run release`) para versionado
  semántico y `CHANGELOG.md` de releases de npm automatizados a partir de
  los changesets acumulados. Documentado en `CONTRIBUTING.md`, junto con la
  convención de Conventional Commits que ya seguía el historial del repo.
  Verificado manualmente: un changeset de prueba (`minor`) hace que
  `npm run release` haga bump de `1.0.0 → 1.1.0` y anteponga la entrada
  correspondiente a `CHANGELOG.md`; revertido después de confirmar.
- **accesibilidad (WCAG 2.1 AA)**: cierre de la Tarea 8. Los marcadores de
  comentario (círculos) ahora son alcanzables por teclado
  (`role="button"`, `tabindex="0"`, `aria-label` con el texto del
  comentario, `Enter`/`Space` los activa igual que un click). Los botones
  de cerrar (`×`) pasaron de `<span>` a `<button>` reales con
  `aria-label="Close"`. El botón "Comment" de la toolbar expone
  `aria-pressed` reflejando si el modo comentario está activo. Los
  contenedores de comment box / tooltip / popover llevan `role="dialog"` y
  `aria-label`; los inputs de texto tienen `aria-label`. Se agregaron
  anillos de foco visibles (`:focus-visible`) en botones, inputs y círculos
  donde antes se quitaba el `outline` sin reemplazo. Se corrigió el único
  contraste de color bajo el umbral (placeholder text `rgba(255,255,255,0.4)`
  → `0.5`, de 3.79:1 a 5.16:1). Verificado con Lighthouse (fixture: 100/100
  Accessibility, supera el objetivo de ≥95) y con un recorrido 100% por
  teclado en un navegador real vía Playwright — documentado en
  `TESTING.md`. Colocar un comentario **nuevo** sigue requiriendo apuntar a
  un punto de la página con el mouse (inherente a anclar comentarios a
  ubicaciones arbitrarias, igual que Vercel Toolbar/Userback/Marker.io);
  todo lo demás es 100% operable por teclado.
- **i18n**: se agrega internacionalización mínima (Tarea 9, cierra P2). Todos
  los strings visibles de `src/components.js` se extrajeron a
  `src/locales/en.js` / `src/locales/es.js` (no `.json` — ver
  `DECISIONS.md`). Nueva opción `locale: "en" | "es"` en
  `createCommentOverlay(...)`, con detección automática desde
  `navigator.language` como default (`src/i18n.js`). Los nombres de mes en
  el tooltip de fecha completa (`data-full-date`) usan
  `Intl.DateTimeFormat(locale, ...)` en vez de una tabla de meses en inglés
  a mano, localizándose gratis para cualquier locale del navegador, no solo
  `en`/`es`. Verificado: cero strings hardcodeados en `src/components.js`
  (test de regresión con regex sobre el archivo fuente), y un cambio de
  `locale: "es"` visible de punta a punta (toolbar, comment box, thread
  popover, reply) tanto en Vitest como en un navegador real vía Playwright.
