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
