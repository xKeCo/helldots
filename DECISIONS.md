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

## CI/CD (Tarea 4)

- **GitHub Actions, un solo workflow `ci.yml`**: corre en cada push/PR a
  `main` y encadena lint → test → coverage → build → size → Lighthouse, en
  ese orden (falla rápido en los gates más baratos antes de los más caros).
- **Fixture dedicado para Lighthouse (`playground/lighthouse.html`) en vez
  de auditar `playground/index.html`**: el demo de `playground/index.html`
  es una plantilla de terceros ("Dev Space" de Lapa Ninja) con problemas de
  accesibilidad preexistentes y ajenos a HellDots (`color-contrast`,
  `heading-order`, `link-name` en el propio markup de la plantilla) — medido
  localmente con `@lhci/cli`: 0.82 de Accessibility, por debajo del umbral
  de RNF09. Auditar esa página haría que el gate de CI fallara por razones
  que HellDots no controla y no puede arreglar (no se reformatea código de
  terceros, ver Tarea 5). Se creó un fixture mínimo y semánticamente limpio
  que monta el widget sobre una página propia, para que el gate de
  Lighthouse audite exclusivamente la UI que HellDots controla. Con el
  fixture: Accessibility 1.0 tras corregir el bug de abajo.
- **Bug real encontrado por el gate de accesibilidad**: los botones
  solo-ícono de la toolbar (Comment/Inbox) no tenían nombre accesible,
  haciendo fallar la auditoría `button-name` incluso en el fixture limpio.
  Se agregaron `aria-label` a esos botones y a los demás botones solo-ícono
  del widget (adjuntar imagen, enviar respuesta, cerrar tooltip/lightbox,
  quitar captura), y `alt` a las imágenes de captura de pantalla. Esto
  adelanta una porción mínima de la Tarea 8 (accesibilidad WCAG 2.1 AA);
  el resto de esa tarea (navegación completa por teclado documentada,
  contraste de color, roles ARIA en popovers) queda pendiente como P2.
- **Sin comparación de regresión de Performance contra el run anterior**:
  el plan pide fallar "si Performance regresa más de un umbral razonable
  (ej. 10 puntos) respecto al run anterior", lo cual requiere almacenamiento
  persistente entre runs (LHCI server con base de datos, o un servicio como
  Lighthouse CI Server / temporary-public-storage con histórico). Se
  consideró fuera de alcance para este gate inicial — en su lugar se aplica
  un umbral absoluto mínimo (`warn` a partir de 0.5) que no bloquea el
  merge pero deja constancia en el log. Documentado aquí como limitación
  conocida, no como criterio cumplido al 100%.
- **`release.yml` documentado pero no funcional**: publica a npm en tags
  `v*`, pero depende de un secret `NPM_TOKEN` que no existe en este
  repositorio — el workflow fallará en el paso de publish hasta que alguien
  con acceso al repo lo configure. Es intencional: el plan pide dejar este
  flujo "documentado pero sin secretos reales".

## Typecheck (Tarea 6)

- **`checkJs` en vez de migrar a TypeScript**: exactamente lo que pedía el
  plan — validar consistencia sin migrar. `tsconfig.json` tiene `allowJs`,
  `checkJs`, `noEmit`, sin `declaration`.
- **Bug real de TypeScript descubierto al implementar el gate**: cuando un
  `foo.d.ts` vive junto a un `foo.js` (nuestro caso: `src/index.d.ts` junto
  a `src/index.js`), TypeScript deja de re-derivar/chequear el cuerpo del
  `.js` y trata el `.d.ts` como la única fuente de verdad para ese módulo.
  Un primer intento de `npm run typecheck` "pasaba" incluso con
  `index.d.ts` deliberadamente roto (comprobado insertando un método que no
  existe en la implementación real y cambiando el tipo de `commentMode`):
  el archivo `src/index.js` simplemente nunca se estaba analizando.
  Verificado con `tsc --listFiles`, que no listaba `src/index.js` en el
  programa compilado.
- **Archivo de consistencia dedicado (`typecheck/consistency-check.ts`),
  fuera de `src/`**: importa la implementación real (`src/overlay.js`, que
  al no tener un `.d.ts` hermano sí conserva su tipo inferido) y los tipos
  declarados (`src/index.d.ts`), y los asigna entre sí — si divergen, este
  archivo deja de compilar. Verificado deliberadamente: romper
  `commentMode: boolean` a `string`, o agregar un método inexistente, hace
  fallar `npm run typecheck` (exit code 2) apuntando exactamente a la
  discrepancia; revertido el cambio, vuelve a pasar (exit 0).
- **Trampa adicional con el nombre del archivo**: un primer intento se
  llamó `src/index.d.consistency.ts`. TypeScript también lo clasificó como
  archivo de declaración ambient (cualquier nombre con el infijo `.d.`
  activa esa heurística, no solo el sufijo exacto `.d.ts`), por lo que las
  aserciones de tipo dentro de él tampoco se chequeaban — mismo síntoma que
  el bug anterior. Renombrado a `typecheck/consistency-check.ts` (sin `.d.`
  en el nombre) para evitarlo.
- **`src/index.js` con JSDoc que referencia `import('./index.d.ts').X`
  directamente**: hace que la implementación declare explícitamente su
  contrato contra el `.d.ts`, en vez de que `checkJs` intente inferir tipos
  de parámetros JS sin anotar (que habrían quedado como `any` en la mayoría
  de los casos, sin dar ninguna señal útil).

## Versionado (Tarea 7)

- **changesets sobre `standard-version`**: se eligió changesets porque
  encaja mejor con un flujo de PRs individuales (cada cambio agrega su
  propio archivo de changeset, sin depender de que el mensaje de commit de
  merge tenga el prefijo correcto) y porque soporta bien un único paquete
  publicado con `access: "public"`, que es nuestro caso.
- **`CHANGELOG.md` de la raíz vs. el generado por changesets**: son
  documentos distintos con propósitos distintos, no un conflicto — ver
  `CONTRIBUTING.md`. El de la raíz narra decisiones de arquitectura durante
  la ejecución de este plan técnico; el de changesets (que se antepone al
  mismo archivo a partir de la primera release real) documenta versiones
  de npm publicadas. Cuando se corte la primera release, ambos coexistirán
  en el mismo archivo, con las entradas de versión arriba.

## Accesibilidad (Tarea 8)

- **Marcadores de comentario como `<div role="button">` en vez de
  `<button>`**: se necesita la forma custom del círculo (border-radius
  asimétrico) y posicionamiento absoluto que un `<button>` real complicaría
  ligeramente por sus estilos base; en vez de pelear con el reset, se usó
  el patrón estándar `role="button"` + `tabindex="0"` + manejo explícito de
  `keydown` para `Enter`/`Space` (documentado como patrón válido en la
  guía ARIA Authoring Practices).
- **`role="dialog"` sin `aria-modal="true"` en popover/tooltip/comment
  box**: no se implementó un verdadero focus-trap (que exigiría
  interceptar `Tab`/`Shift+Tab` para ciclar el foco dentro del diálogo) —
  fuera de alcance para esta pasada. `aria-modal` sin un trap real sería
  engañoso para tecnología asistiva, así que se omitió deliberadamente en
  vez de declarar una garantía que no se cumple.
- **Colocar un comentario nuevo sigue requiriendo el mouse**: es inherente
  a la función (anclar a una posición arbitraria de la página host), no
  una omisión — mismo trade-off que hacen Vercel Toolbar, Userback,
  BugHerd y Marker.io. Todo lo demás (activar un marcador existente,
  responder, cerrar tooltips/popovers/lightbox, salir del modo comentario)
  es 100% operable por teclado, verificado en `TESTING.md`.
- **Fixture de Lighthouse sin escenario interactivo**: la auditoría de
  accesibilidad de CI (`playground/lighthouse.html`) solo audita el estado
  inicial de la página (toolbar visible, nada más montado) porque Lighthouse
  no simula interacción de usuario. El recorrido por teclado que ejercita
  popover/tooltip/comment box se verificó manualmente vía Playwright y se
  documentó en `TESTING.md`, no vía el gate automatizado de CI.

## i18n (Tarea 9)

- **`src/locales/en.js` / `es.js` en vez de `.json`**: el plan sugería
  `.json`, pero importar JSON con ES Modules nativos en el navegador exige
  la sintaxis `import x from './y.json' with { type: 'json' }`, cuyo
  soporte entre navegadores es más reciente e irregular que un `import`
  de módulo JS normal — y el playground carga `src/index.js` sin bundler,
  directo en el navegador (Tarea 2). Un módulo `.js` con
  `export default {...}` es funcionalmente idéntico a un `.json` para
  este propósito, funciona igual en Vitest/esbuild/navegador sin
  condicionales, y evita ese riesgo de compatibilidad por completo.
- **Nombres de mes vía `Intl.DateTimeFormat` en vez de una tabla `MONTHS`
  traducida a mano**: más simple, más correcto (usa datos reales de
  localización del runtime en vez de una traducción propia que solo
  cubriría `en`/`es`), y elimina una categoría entera de strings
  hardcodeados sin tener que mantenerla.
- **Cobertura de i18n limitada a `en`/`es`**: es lo que pide la Tarea 9
  explícitamente ("locale: 'es' | 'en'"). `detectLocale()` cae a `en` para
  cualquier idioma de navegador no soportado (no lanza error ni deja
  strings vacíos), así que agregar más locales después es aditivo: un
  archivo nuevo en `src/locales/` y una entrada en el mapa de `i18n.js`,
  sin tocar `components.js`/`overlay.js`.
- **Limitación conocida, no nueva de esta tarea**: `getShadowRoot()`
  reutiliza un único host `<helldots-root>` por página (decisión de la
  Tarea 1). Si una página monta dos instancias de `CommentOverlay` con
  locales distintos, ambas comparten el mismo shadow root y "gana" quien
  montó su toolbar primero — no es algo que esta tarea introduce ni
  intenta resolver (el caso de uso real es una sola instancia por página).

## Anclaje serializable de comentarios (Requisito #1)

- **Sin XPath, pese a que el requisito original decía "selector CSS/XPath"**:
  acordado explícitamente con el usuario ("este requisito puede ser
  modificado, solo quiero el mejor formato"). Un XPath estructural es
  estrictamente más frágil que la combinación elegida (selector CSS en
  cascada + fingerprint de contenido con scoring) y no aporta nada que el
  selector CSS no cubra. Diseño completo en
  `docs/superpowers/specs/2026-07-02-comment-anchoring-design.md`.
- **Verificación obligatoria del fingerprint**: un match de
  `querySelector` nunca se acepta a ciegas — se puntúa contra el
  fingerprint (texto 0.5 / atributos 0.3 / posición entre hermanos 0.2,
  con redistribución de pesos cuando falta una señal). Umbral 0.6 vía
  selector, 0.7 vía búsqueda de rescate (sin señal estructural se exige
  más confianza). Elementos "anónimos" (sin texto ni atributos) solo se
  resuelven vía selector; el rescate se omite porque cualquier match
  tag-wide sería una adivinanza.
- **Screenshots fuera de la serialización v1**: son data-URLs de cientos
  de KB; `SerializedComment` debe ser barato de persistir. La app
  anfitriona puede guardarlos aparte usando el `id` del comentario.
- **Persistencia delegada a la app anfitriona**: HellDots expone
  `serializeComments()` / `loadComments()` y callbacks
  (`onCommentCreated`, `onReplyAdded`, `onAnchorLost`); no incluye
  `localStorage` ni backend propio — patrón de librería sin opiniones de
  storage, decidido en el brainstorm.
- **Bug real encontrado por el test de round-trip JSON**: un contenedor
  con tamaño 0 (display:none, aún sin layout) producía
  `relativeX/Y = Infinity` (división por cero), que ni siquiera es
  JSON-serializable (`JSON.stringify` lo vuelve `null`). Se agregó un
  guard en `_placeCommentAtPoint` que colapsa a 0 en ese caso.
- **Inbox mínimo**: el botón de la toolbar era un stub; ahora abre un
  panel que lista todos los comentarios y marca los huérfanos con un
  badge localizado ("Unanchored"/"Desanclado"). Click en un huérfano abre
  su thread popover centrado en el viewport (`showThreadPopover` acepta
  `circle = null`), porque un comentario desanclado no tiene posición
  válida en la página — nunca se posiciona "mejor esfuerzo" sobre
  contenido equivocado.

## Inbox sidebar, persistencia localStorage y estado oculto

- **Enmienda a la serialización v1**: `SerializedComment` ahora SÍ incluye
  `screenshots` (y `replies[].screenshots`). El modo `localStorage` y las
  cards del inbox los necesitan; mantener dos formatos de serialización
  (con y sin screenshots) costaba más que el ahorro. También se agregó
  `page` (`location.pathname` al crear) para el filtro por página.
- **`anchorState: "inactive"` para comentarios de otras páginas**: al
  restaurar, un comentario cuyo `page` no coincide con el pathname actual
  no está "roto" — su elemento simplemente no existe aquí. No se intenta
  resolver su ancla, no renderiza círculo y no dispara `onAnchorLost`
  (evita falsas alarmas); solo aparece en el filtro "Todos" del inbox con
  su pathname como tag.
- **`hidden` es estado runtime, no serializado**: depende del viewport del
  momento (media queries). Se detecta con tamaño 0 del contenedor en
  `updateCommentPosition` — el `console.warn` de "invalid dimensions" se
  eliminó porque tamaño cero dejó de ser anomalía: es el estado normal de
  un elemento con `display:none` responsive (caso `slogan-img`).
- **El botón "copiar" genera contexto para agentes**, no copia el texto:
  decisión del usuario inspirada en Vercel Toolbar. El template
  (`src/agent-context.js`) incluye page/viewport/estado/selector/elemento/
  DOM path/texto cercano/thread — sin árbol de componentes de framework
  (HellDots es framework-agnóstico; el DOM real es lo que puede ofrecer).
- **`InboxView` como vista pura** (`src/inbox.js`): toda mutación
  (responder, eliminar) vuelve al overlay vía callbacks; el sidebar nunca
  toca storage ni los marcadores directamente. El panel bottom-center de
  la iteración anterior se eliminó por completo.
- **El modal del playground usa `class="modal-content"`** deliberadamente:
  el selector de contenedores de anclaje
  (`section, div[class*="container"], div[class*="content"]`) debe
  matchear el dialog para que los comentarios anclen al modal y no a
  `document.body` — si anclaran a body, cerrar el modal no ocultaría el
  marcador.

## Migración de html2canvas a modern-screenshot (captura de pantalla)

- **Bug real que motivó el cambio**: con la página con scroll, la captura
  por arrastre devolvía contenido desplazado hacia arriba exactamente
  `window.scrollY` px (aparecía el hero al capturar secciones inferiores).
  Reproducido y aislado con Playwright: html2canvas v1.4.1 usa por defecto
  `scrollX/scrollY = window.pageXOffset/pageYOffset` y desplaza el render
  del clon; nuestro recorte ya sumaba el scroll a `x/y` → doble conteo
  (issues conocidos #1878/#2333 de html2canvas). Verificado empíricamente:
  `scrollX: 0, scrollY: 0` producía el recorte correcto.
- **Migración en vez de solo el fix** (decisión del usuario): html2canvas
  está sin mantenimiento desde 2022 y no soporta CSS moderno (funciones de
  color `oklch`/`lab` que usa p. ej. Tailwind v4 — rompería la captura en
  páginas modernas). `modern-screenshot` (fork mantenido de html-to-image,
  ~10 KB gzip vs ~45 KB) usa SVG foreignObject con mejor fidelidad.
- **El recorte ahora es nuestro** (`src/capture.js`): se renderiza la
  página completa una vez (`domToCanvas`, `scale: 1` = píxeles CSS) y el
  recorte se hace con `drawImage` en coordenadas de página
  (`viewport + scroll`). Al no delegar el crop a la librería, la clase de
  bug de doble-scroll queda eliminada por diseño, y cambiar de motor de
  render en el futuro no toca la lógica de coordenadas.
- **Mismo tratamiento de dependencia**: external en el bundle ESM (dentro
  del presupuesto de 50 KB), bundleada en el UMD autocontenido; import
  maps del playground actualizados a esm.sh/modern-screenshot@4.7.0.
- **Fondo efectivo de página, no blanco fijo**: los renders DOM-based
  producen PNG transparente cuando `<html>`/`<body>` no pintan fondo (el
  blanco que se ve en pantalla lo pinta el navegador, fuera del DOM) — la
  captura quedaba invisible sobre la UI oscura del inbox. Se pasa
  `backgroundColor` a `domToCanvas` resolviendo el color computado de
  html → body → `#ffffff` como fallback (replica lo que el usuario ve:
  páginas oscuras salen oscuras, páginas sin fondo salen blancas).
  Verificado midiendo el alfa de los píxeles del PNG capturado en
  `/about` antes (0) y después (255).

## Fix de paridad visual post-Shadow DOM

- **Bug real: cursor de modo comentario roto por el shadow root**: al
  encapsular estilos en la Tarea 1, la regla `.comment-cursor` (que
  necesita aplicar a `document.body`, un elemento del host que el widget
  no controla) quedó atrapada dentro del `<style>` del shadow root. Un
  shadow root no permite que sus estilos escapen hacia el documento — por
  diseño — así que la regla dejó de tener efecto. Se separó en
  `getGlobalStyles()`, inyectado en un segundo `<style>` en
  `document.head`. Es la primera (y por ahora única) regla que necesita
  este tratamiento; si aparecen más casos así, agregarlas a
  `getGlobalStyles()` en vez de duplicar el mecanismo.
- **`.comment-cursor *` en vez de solo `.comment-cursor`**: el pedido
  original era "restaurar el cursor", pero al verificar contra `dev-v2` se
  confirmó que ni siquiera la versión original forzaba el cursor sobre
  elementos con su propio `cursor` explícito (links, botones de la
  plantilla) — la herencia de `cursor` en CSS no puede ganarle a una
  declaración explícita en el propio elemento, con o sin Shadow DOM de por
  medio. El usuario pidió expresamente que el ícono aparezca "sea donde
  sea que me mueva el cursor", así que se agregó el descendant selector
  `*` junto con `!important` para forzarlo sobre todo el host mientras
  dura el modo comentario. No cruza el shadow boundary (los selectores CSS
  no pueden hacerlo), así que los controles propios del widget (toolbar,
  botones del comment box) conservan su cursor normal — solo se ve
  afectada la página anfitriona, que es la intención.
- **Reversión deliberada de los 4 `:focus-visible` de la Tarea 8**: el
  usuario probó la rama contra `dev-v2` (el estado pre-Shadow DOM) y pidió
  explícitamente restaurar el aspecto visual exacto de antes, incluyendo
  perder el anillo de foco visible que se había agregado por accesibilidad
  (WCAG 2.1 AA, criterio 2.4.7 Focus Visible). Es una decisión consciente
  de producto, no un descuido: se documenta aquí para que quede claro que
  **esto reintroduce una brecha de accesibilidad conocida** — los
  elementos interactivos del widget (toolbar, inputs, círculos) vuelven a
  no mostrar ningún indicador de foco al navegar por teclado, igual que en
  `dev-v2`. Si en el futuro se requiere volver a cumplir ese criterio,
  revisar el historial de la Tarea 8 y este commit de reversión.
