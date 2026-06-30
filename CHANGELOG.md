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
