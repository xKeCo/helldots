# Decisiones de diseño

Registro de decisiones técnicas tomadas durante la ejecución del plan de mejora
técnica de HellDots, cuando el plan no especificaba una opción concreta.

## Shadow DOM (Tarea 1)

- **Custom element vs. `attachShadow` en un `<div>` suelto**: se optó por un
  custom element `<helldots-root>` (`src/root-element.js`) registrado vía
  `customElements.define`, en línea con lo sugerido por el plan, en vez de
  llamar `attachShadow` directamente sobre un `<div>` (que el spec también
  permite). Un custom element deja la intención explícita en el DOM del host
  y facilita debug (`document.querySelector('helldots-root')`).
- **Mount singleton**: `getShadowRoot()` reutiliza el host existente si ya fue
  montado, en vez de crear uno nuevo por instancia de `CommentOverlay`. Si en
  el futuro se necesita soportar múltiples overlays independientes en la
  misma página, esto deberá revisarse.
- **Aislamiento de estilos**: se añadió una regla `:host { all: initial; ... }`
  al inicio de la hoja de estilos inyectada (`src/styles.js`) para anular
  cualquier propiedad heredable que el host pudiera filtrar hacia adentro del
  shadow tree (p. ej. un reset agresivo `* { all: unset !important; }` en la
  página anfitriona). Las reglas CSS del host no pueden seleccionar nodos
  dentro del shadow tree (el shadow boundary no es atravesado por selectores),
  pero sí pueden filtrar *valores heredados* (color, font-family, etc.) hacia
  el host element — `:host { all: initial }` corta esa herencia.
- **Retargeting de eventos**: los listeners globales en `document` (click
  fuera para cerrar comment box / thread popover) usaban `e.target`, que se
  retarget al shadow host cuando el listener vive fuera del shadow tree. Se
  cambiaron a `e.composedPath()[0]` para recuperar el nodo real dentro del
  shadow tree antes de hacer `.contains()` / `.closest()`.
- **Anclaje de comentarios**: el contenedor de anclaje (`comment.container`)
  sigue siendo siempre un elemento del DOM "light" (host), nunca un nodo del
  shadow tree — esto no cambió. Solo los círculos visuales (que se posicionan
  con `position: fixed`/`absolute` en coordenadas de viewport) viven dentro
  del shadow root.

## Build pipeline (Tarea 2)

- **esbuild sobre Rollup/Webpack**: se eligió esbuild por simplicidad de
  configuración (un script `scripts/build.mjs` con la API de Node, sin
  archivo de config aparte) y velocidad. El proyecto no tiene necesidades de
  bundling complejas (sin code-splitting entre múltiples entradas, sin
  plugins de framework) que justifiquen Rollup.
- **`html2canvas` como dependencia externa en el bundle ESM**: medido en
  ~45 KB gzip (`html2canvas.min.js` por sí solo), bundlearlo dejaría casi sin
  margen el presupuesto de 50 KB. Se marca `external: ["html2canvas"]` en el
  build ESM (`dist/helldots.esm.js`, el artefacto medido por `npm run size`)
  y se deja como `dependency` normal en `package.json` — cualquier bundler
  del consumidor (Vite, webpack, esbuild, etc.) lo resuelve igual que
  cualquier otra dependencia transitiva de npm. Verificado importando el
  bundle desde un proyecto Vite de prueba: resuelve y compila sin errores.
- **`dist/helldots.umd.js` (IIFE) SÍ empaqueta `html2canvas`**: es un
  artefacto de conveniencia para `<script>` plano sin bundler ni resolución
  de módulos disponible, así que necesita ser autocontenido. Por eso queda
  **fuera** del presupuesto de 50 KB que mide `npm run size` — ese gate solo
  audita el punto de entrada real del paquete npm (`dist/helldots.esm.js`),
  que es el que importan la inmensa mayoría de consumidores reales.
- **El playground no usa `dist/`**: sigue importando `../src/index.js`
  directamente vía ES Modules nativos (con `html2canvas` resuelto por
  import map a un CDN), tal como antes del pipeline de build. `dist/` solo
  se genera para publicar el paquete, nunca se commitea (ya estaba en
  `.gitignore`).
