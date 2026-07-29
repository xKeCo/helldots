# Diseño: Contexto automático, clasificación y tiempo de resolución (RF1–RF5)

**Fecha:** 2026-07-29
**Estado:** Aprobado
**Specs relacionados:** `2026-07-03-comment-status-lifecycle-design.md`,
`2026-07-03-inbox-sidebar-persistence-design.md`

## Alcance

1. **RF1** — Screenshot automático del estado de la página al crear el comentario.
2. **RF2** — Metadatos de contexto: URL, viewport, user-agent, navegador, sistema
   operativo, resolución y timestamp.
3. **RF3** — Categorización por tipo (bug / sugerencia / pregunta / mejora) y
   etiquetas personalizadas. Opcional: estado neutro permitido.
4. **RF4** — Prioridad (Alta / Media / Baja). Opcional: estado neutro permitido.
5. **RF5** — Tiempo de resolución por comentario (creación → estado Resuelto).

**Fuera de alcance:** RF6 (reacciones con emoji). Se reserva el campo y se
documenta la forma de datos aquí para que su implementación posterior no
requiera migración, pero no se implementa nada en este ciclo.

## Contexto y restricciones

- El presupuesto de `npm run size` está en **19.63 KB de 50 KB gzip** — hay
  ~30 KB de holgura. El tamaño **no** es una restricción de diseño aquí.
- `localStorage` sí lo es: toda la persistencia vive en una sola key
  (`helldots-comments`) con las imágenes en base64. Un PNG de viewport a
  escala 1 pesa 300 KB – 1.5 MB como data URL; con 3–4 comentarios se revienta
  la cuota de ~5 MB. De ahí la política de compresión del RF1.
- `src/overlay.js` está en 1.643 líneas. El código nuevo no debe engordarlo:
  `overlay.js` orquesta, los módulos hacen.

## Modelo de datos

Campos nuevos en `Comment` y `SerializedComment`:

| Campo               | Tipo                      | Default | RF  |
| ------------------- | ------------------------- | ------- | --- |
| `contextScreenshot` | `string \| null`          | `null`  | 1   |
| `context`           | `CommentContext \| null`  | `null`  | 2   |
| `type`              | `CommentType \| null`     | `null`  | 3   |
| `tags`              | `string[]`                | `[]`    | 3   |
| `priority`          | `CommentPriority \| null` | `null`  | 4   |
| `resolvedAt`        | `string \| null`          | `null`  | 5   |

```ts
export type CommentType = "bug" | "suggestion" | "question" | "improvement";
export type CommentPriority = "high" | "medium" | "low";

export interface CommentContext {
  version: 1;
  /** location.href completa al crear el comentario. */
  url: string;
  viewport: { width: number; height: number };
  /** Resolución de pantalla (screen.width/height). */
  screen: { width: number; height: number };
  devicePixelRatio: number;
  /** UA crudo — se guarda siempre, aunque el parseo de browser/os falle. */
  userAgent: string;
  browser: { name: string; version: string };
  os: { name: string; version: string };
  language: string;
}
```

`contextScreenshot` es un campo **separado** de `screenshots[]`. Los dos
tienen semánticas distintas: `screenshots[]` es evidencia que el usuario
adjuntó a propósito (drag-to-capture o archivo), `contextScreenshot` es
contexto que la librería recogió sola. Mantenerlos separados permite
mostrarlos distinto en el inbox, purgar solo el automático si se llega a
tocar la cuota de storage, y que el usuario no borre por accidente algo que
no puso él.

**El "timestamp" del RF2 es `createdAt`**, que ya existe y se sella en el
mismo instante en que se captura el contexto. No se añade un campo duplicado.

### Campo reservado para el RF6

No se implementa en este ciclo. Forma acordada para cuando se implemente:

```ts
/** RF6 — emoji → lista de autores que reaccionaron. Reservado. */
reactions?: Record<string, string[]>;
```

Al ser opcional y ausente por defecto, añadirlo después no rompe nada ya
persistido.

## RF1 — Screenshot automático

### Refactor de `src/capture.js`

`_onDragEnd` ya paga un `domToCanvas(document.body)` completo, que es
prácticamente todo el coste de una captura. Si la auto-captura hiciera su
propio render, cada comentario creado con drag pagaría ese coste **dos
veces**. El módulo se refactoriza a un primitivo compartido:

```
renderPage({ scale })                     → HTMLCanvasElement (el render caro)
cropRegion(canvas, rect)                  → PNG escala 1      (drag manual)
cropViewport(canvas, { quality })         → JPEG              (automático)
```

`captureRegion` se mantiene como export para no romper consumidores, pero
pasa a ser `renderPage()` + `cropRegion()`.

`renderPage` acepta escala porque las dos rutas tienen necesidades distintas:

- **Sin drag** (clic simple): se renderiza directamente a `scale: 0.5`. El
  render es la parte cara y a media escala cuesta ~4× menos que a escala 1 —
  y como la salida automática es a media escala de todos modos, no se pierde
  nada.
- **Con drag**: se renderiza una vez a `scale: 1` (lo necesita el recorte
  manual, que va en PNG a escala completa) y del **mismo canvas** se derivan
  las dos imágenes. Sin este canvas compartido, cada comentario con drag
  pagaría el render completo dos veces.

### Política de compresión

Automático: **JPEG, calidad 0.7, escala 0.5** → ~40–120 KB por captura en vez
de 300 KB–1.5 MB. Suficiente para reconocer de qué hablaba el comentario, y
permite decenas de comentarios dentro de la cuota de localStorage.

El drag manual **no cambia**: sigue en PNG a escala 1. Cuando el usuario
selecciona una región a propósito suele ser para mostrar texto o un detalle
fino, y ahí la fidelidad importa.

### Momento de captura

En `_placeCommentAtPoint`, **antes** de `createPreviewCircle()` y
`showCommentBox()`. Si se capturara en `saveComment()`, el comment box y el
círculo de preview saldrían tapando justo la zona que el usuario está
comentando.

La captura se **espera** antes de mostrar el comment box. No es una elección
libre: el host tiene que estar oculto durante el render, así que mostrar el
box en paralelo sería una condición de carrera que lo metería a medias dentro
de la propia captura. Es además el comportamiento que `_onDragEnd` ya tiene
hoy — espera a `captureRegion` antes de `_placeCommentAtPoint`.

Consecuencias aceptadas:

- Si el usuario cancela el comment box, se hizo un render que se descarta. Es
  el precio de que la captura muestre la página limpia.
- Hay una latencia entre el clic y la aparición del box. Se acota rindiendo a
  `scale: 0.5` en la ruta sin drag, y `autoScreenshot: false` la elimina por
  completo para apps host donde no compense.

### Ocultación de la UI propia

Durante `renderPage()` se oculta el host `<helldots-root>` completo, no solo
`this.overlay`.

**Esto arregla un bug preexistente:** el flujo de drag actual solo oculta
`this.overlay`, así que el toolbar de HellDots aparece dentro de los
screenshots manuales. Al compartir el helper, ambos caminos quedan limpios.
El arreglo entra en este alcance.

### Configuración y degradación

- Opción nueva `autoScreenshot?: boolean`, default `true`. Un render de canvas
  por comentario no es gratis y hay apps host donde no se quiere.
- Un fallo de render deja `contextScreenshot: null` y emite un warning por
  consola. **Nunca bloquea ni aborta el guardado del comentario** — mismo
  criterio que ya sigue `_onDragEnd`.

## RF2 — Metadatos de contexto

Módulo nuevo `src/metadata.js`, con un único export `captureContext()`:
función pura sobre `window`/`navigator`, sin estado, testeable inyectando
dobles.

Detección de navegador y SO: se usa `navigator.userAgentData` cuando está
disponible (Chromium expone marcas y plataforma ya estructuradas, sin
parsear), con fallback a una tabla de regex sobre el UA string para Safari y
Firefox. Como el UA crudo se guarda siempre en `context.userAgent`, un
parseo fallido degrada a `{ name: "unknown", version: "" }` sin que se pierda
información: quien lea el comentario todavía tiene el string completo.

`captureContext()` se llama en `saveComment()` (no requiere ocultar UI ni
esperar a un render, así que no hay razón para adelantarlo).

## RF3 y RF4 — Tipo, etiquetas y prioridad

### Constantes

En `src/constants.js`, junto a `STATUSES` / `STATUS_COLORS`:

| `type`        | en          | es         | color     |
| ------------- | ----------- | ---------- | --------- |
| `bug`         | Bug         | Bug        | `#FF453A` |
| `suggestion`  | Suggestion  | Sugerencia | `#BF5AF2` |
| `question`    | Question    | Pregunta   | `#64D2FF` |
| `improvement` | Improvement | Mejora     | `#5E5CE6` |

| `priority` | en     | es    | color     |
| ---------- | ------ | ----- | --------- |
| `high`     | High   | Alta  | `#FF453A` |
| `medium`   | Medium | Media | `#FF9F0A` |
| `low`      | Low    | Baja  | `#8E8E93` |

La prioridad usa una rampa rojo/naranja/gris, que se lee como escala de
urgencia de inmediato. La colisión de `high` con `bug` y de `medium` con
`in_progress` es deliberada: son dimensiones distintas que viven en slots
distintos de la UI, y **ningún badge comunica su significado solo con color**
— todos llevan texto (WCAG 1.4.1, y el proyecto tiene un gate de Lighthouse
a11y en 0.9).

### Picker reutilizable

`src/comment-actions.js` ya tiene un picker con menú, dot de color,
`aria-checked` y sincronización de estado local. Status, tipo y prioridad son
el mismo widget con distinto diccionario. Se extrae:

```js
createPicker({ options, value, colorOf, labelOf, onSelect, tooltip });
```

El picker de status pasa a ser su primer consumidor (refactor sin cambio de
comportamiento observable), y tipo y prioridad se suman como consumidores
dos y tres. Alternativa rechazada: duplicar ~70 líneas tres veces.

Todos los pickers de tipo y prioridad incluyen una opción **"Sin definir"**
que devuelve el campo a `null` — el estado neutro tiene que ser alcanzable,
no solo el inicial.

Barra de acciones resultante, en inbox y thread popover:
`[copiar] [status] [tipo] [prioridad] [⋯]`.

### En el comment box (creación)

Una fila compacta con los pickers de tipo y prioridad, ambos arrancando en
neutro, más un input de etiquetas: texto libre, `Enter` o coma confirma un
tag, cada tag se renderiza como chip removible. Se normalizan a minúsculas y
sin espacios en los bordes; los duplicados se ignoran.

### API pública

```ts
setCommentType(id: number, type: CommentType | null): boolean;
setCommentPriority(id: number, priority: CommentPriority | null): boolean;
setCommentTags(id: number, tags: string[]): boolean;
```

Mismo contrato que `setCommentStatus`: valida id y valor, los inválidos
devuelven `false` sin efectos secundarios, actualiza memoria, sincroniza
storage y dispara el callback.

**Un solo callback nuevo** `onCommentUpdated?: (comment: SerializedComment) => void`
para los tres. `onCommentStatusChanged` se mantiene intacto — la API
existente no se rompe.

## RF5 — Tiempo de resolución

`setCommentStatus` gana la responsabilidad de sellar el timestamp:

- Al entrar en `resolved` → `resolvedAt = new Date().toISOString()`.
- Al salir de `resolved` (reapertura) → `resolvedAt = null`.
- Si se reabre y se vuelve a resolver, se sobrescribe con la fecha nueva. El
  dato mostrado siempre corresponde a la resolución vigente.

`formatDuration(ms, strings)` vive en `src/i18n.js`, junto a `formatTemplate`
que ya está ahí:

| Rango   | Salida   |
| ------- | -------- |
| < 1 min | `<1m`    |
| < 1 h   | `45m`    |
| < 24 h  | `3h 12m` |
| ≥ 24 h  | `2d 4h`  |

Strings i18n: `resolvedIn` (`"Resolved in {n}"` / `"Resuelto en {n}"`).

Se muestra en la card del inbox (badge, solo en comentarios resueltos), en el
panel de detalle, y en el bloque de agent-context.

**Comentarios legacy ya resueltos y sin `resolvedAt`** muestran `—`, nunca
una duración inventada a partir de datos que no existen.

## Inbox y agent-context

**Filtros:** dos secciones nuevas (tipo, prioridad) en `_buildFilter`,
siguiendo el patrón de las secciones de página y estado que ya existen.
Ambas incluyen "Todos" y se combinan con los filtros existentes por AND.

**Cards:** badges de tipo, prioridad y tags. Badge de tiempo de resolución en
los resueltos.

**Detalle:** bloque de contexto nuevo con URL, viewport, resolución,
navegador, SO y timestamp, más el `contextScreenshot` mostrado por encima de
los screenshots manuales y visualmente diferenciado (etiqueta "Contexto
automático") para que se entienda que no lo adjuntó nadie.

**`buildAgentContext`** se enriquece con tipo, prioridad, tags, navegador/SO/
resolución y tiempo de resolución. Los campos en neutro se omiten del bloque
en vez de imprimirse como `(none)` — ruido que el agente no necesita leer.

## Compatibilidad hacia atrás

Es el punto de mayor riesgo del cambio: hay comentarios en el localStorage de
usuarios reales con el esquema anterior.

`loadComments` normaliza todo comentario entrante que no traiga los campos
nuevos a sus defaults neutros (`null`, `[]`). Ningún campo nuevo se asume
presente en ninguna ruta de lectura, y ninguna resolución de valor por
defecto depende de que la migración haya corrido antes.

## Módulos tocados

| Archivo                  | Cambio                                                          |
| ------------------------ | --------------------------------------------------------------- |
| `src/metadata.js`        | **Nuevo.** `captureContext()`                                   |
| `src/capture.js`         | Refactor a `renderPage` / `cropRegion` / `cropViewport`         |
| `src/constants.js`       | `COMMENT_TYPES`, `TYPE_COLORS`, `PRIORITIES`, `PRIORITY_COLORS` |
| `src/comment-actions.js` | Extraer `createPicker`; pickers de tipo y prioridad             |
| `src/components.js`      | Fila de clasificación + input de tags en el comment box         |
| `src/overlay.js`         | Orquestación: captura, contexto, setters nuevos                 |
| `src/inbox.js`           | Filtros, badges, bloque de contexto en el detalle               |
| `src/agent-context.js`   | Campos nuevos en el bloque copiado                              |
| `src/i18n.js`            | `formatDuration`                                                |
| `src/locales/{en,es}.js` | Strings de tipos, prioridades, tags y tiempo de resolución      |
| `src/index.d.ts`         | Tipos y firmas nuevas                                           |

## Tests

- `test/metadata.test.js` — **nuevo**: parseo de UA con y sin
  `userAgentData`, degradación a `unknown`, forma del objeto devuelto.
- `test/capture.test.js` — `renderPage` se invoca **una sola vez** en la ruta
  de drag y a `scale: 1`; la ruta sin drag lo invoca a `scale: 0.5`; el host
  `<helldots-root>` está oculto durante el render y restaurado después
  (incluso si el render lanza); `cropViewport` produce JPEG; un fallo de
  render deja `contextScreenshot: null` sin abortar el guardado;
  `autoScreenshot: false` no invoca `renderPage` en absoluto.
- `test/comment-actions.test.js` — `createPicker` genérico; los tres pickers;
  la opción "Sin definir" devuelve `null`.
- `test/inbox.test.js` — filtros por tipo y prioridad, combinados con los
  existentes; badges; bloque de contexto en el detalle.
- `test/agent-context.test.js` — campos nuevos presentes; campos neutros
  omitidos.
- `test/persistence.test.js` — carga de un registro pre-migración sin ningún
  campo nuevo; `resolvedAt` se sella y se limpia en las transiciones de
  estado, incluida la reapertura.
- `test/components.test.js` — fila de clasificación e input de tags:
  normalización, duplicados, chips removibles.
- `typecheck/consistency-check.ts` obliga a que `index.d.ts` no se
  desincronice del implementado: los métodos nuevos tienen que declararse ahí
  o `npm run typecheck` falla.

## Riesgos

| Riesgo                                                        | Mitigación                                                                                      |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Cuota de localStorage con muchas capturas automáticas         | JPEG q0.7 @0.5; `autoScreenshot: false` como escape; `writeStoredComments` ya falla en silencio |
| Latencia entre el clic y el comment box (el render se espera) | Ruta sin drag renderiza a `scale: 0.5` (~4× más barato); `autoScreenshot: false` la elimina     |
| `userAgentData` ausente en Safari/Firefox                     | Fallback a regex; UA crudo siempre persistido                                                   |
| Refactor de `capture.js` rompe el drag manual existente       | `captureRegion` se mantiene como export; cobertura en `test/capture.test.js`                    |
