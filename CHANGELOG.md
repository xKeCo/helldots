# Changelog

## Unreleased

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
