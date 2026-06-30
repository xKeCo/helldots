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
