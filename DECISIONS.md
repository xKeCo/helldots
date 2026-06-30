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
  pero sí pueden filtrar _valores heredados_ (color, font-family, etc.) hacia
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

## Testing y cobertura (Tarea 3)

- **Vitest + jsdom**: ya eran la elección natural dado que el proyecto corre
  100% en ESM sin transpilador (Vitest soporta ESM nativo) y `jsdom` es
  necesario para testear manipulación de Shadow DOM, `MutationObserver`, etc.
  `happy-dom` se consideró pero `jsdom` tiene mejor soporte de Shadow DOM en
  la práctica (aunque con limitaciones, ver abajo).
- **`createOverlay` en tests crea `new CommentOverlay(options)` directamente,
  sin llamar `.initOverlay()` aparte**: el constructor de `CommentOverlay` ya
  llama `initOverlay()` de forma síncrona salvo que `document.readyState`
  sea `"loading"` (no lo es en jsdom). `autoInit` es un concepto que solo
  consume la factory `createCommentOverlay()` de `index.js`, no la clase en
  sí — pasarlo directamente a `new CommentOverlay()` no tiene efecto. Una
  primera versión de las pruebas llamaba `.initOverlay()` una segunda vez
  "por si acaso", lo que registraba cada listener del documento dos veces y
  causaba fugas de listeners detectables entre tests (ver bug de `cleanup()`
  abajo). Ya corregido en `test/overlay.test.js` y `test/shadow-dom.test.js`.
- **Límite real de jsdom con `:scope` dentro de un shadow root**: al escribir
  pruebas para `showThreadPopover`, se detectó que `element.querySelector(
':scope > .clase')` devuelve `null` quando `element` vive dentro de un
  shadow root en jsdom (nwsapi no resuelve `:scope` correctamente ahí),
  aunque la combinación es válida y funciona en todos los navegadores reales.
  Se optó por **eliminar la dependencia de `:scope`** en `src/overlay.js`
  (reemplazada por una búsqueda sobre `popover.children`) en vez de dejar ese
  camino sin cobertura — mismo comportamiento observable, pero ahora
  verificable en CI con el stack de testing elegido para todo el proyecto.

## Linting y formato (Tarea 5)

- **ESLint flat config + `eslint-config-prettier`**: se usa la config plana
  (`eslint.config.js`) en vez del formato legado `.eslintrc`, ya que es el
  formato recomendado para proyectos ESM nuevos. `eslint-config-prettier`
  desactiva las reglas de estilo de ESLint que pisarían a Prettier, evitando
  conflictos entre ambas herramientas.
- **`playground/index.html` excluido de Prettier**: es una plantilla HTML de
  terceros ("Dev Space" de Lapa Ninja) usada solo como fixture visual de
  desarrollo, no código propio de HellDots. Reformatearla generaba un diff
  enorme e irrelevante; se excluyó vía `.prettierignore` en vez de
  reformatearla.
- **`no-empty: { allowEmptyCatch: true }`**: los bloques `catch {}` vacíos en
  la limpieza de `ResizeObserver`/`MutationObserver` (`src/overlay.js`) son
  intencionales (ignoran errores de `disconnect()` en observers ya
  desconectados) — se permite la excepción vía configuración de ESLint en
  vez de añadir comentarios o lógica superflua solo para silenciar la regla.
