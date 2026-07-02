# Diseño: Anclaje serializable de comentarios (Requisito #1)

**Fecha:** 2026-07-02
**Estado:** Aprobado (Opción A — ancla híbrida: selector en cascada + fingerprint con scoring)

## Contexto y problema

Hoy un comentario ancla a su elemento mediante una referencia viva
`comment.container: HTMLElement` + coordenadas fraccionales
`relativeX`/`relativeY` (0–1 respecto al `getBoundingClientRect()` del
contenedor). Eso soporta tracking en vivo (resize/scroll/mutaciones) pero
**no es serializable**: al recargar la página se pierde todo. No existe
generación de selectores, persistencia ni re-anclaje.

## Decisiones acordadas

1. **Persistencia**: HellDots solo serializa y expone callbacks; la app
   anfitriona decide dónde guardar. Sin `localStorage` integrado.
2. **Páginas objetivo**: cualquiera (librería genérica) — la estrategia debe
   degradar con elegancia en SPAs con clases dinámicas.
3. **Huérfanos**: un comentario cuyo ancla no se resuelve al restaurar queda
   visible en el inbox con indicador de "desanclado", sin marcador en página.
   Nunca se posiciona "mejor esfuerzo" sobre contenido equivocado.
4. **Formato del ancla**: libre — se prioriza robustez sobre cumplir
   literalmente "CSS/XPath". No se genera XPath.

## Modelo de datos

```ts
interface CommentAnchor {
  version: 1; // migraciones futuras del formato
  selector: string | null; // CSS selector "mejor esfuerzo"; null si no hubo match único
  fingerprint: {
    tagName: string; // "SECTION"
    textSnippet: string; // ~64 chars de textContent normalizado (trim + colapso de espacios)
    attributes: Record<string, string>; // subconjunto estable: id, name, role, aria-label, data-* no generados
    siblingIndex: number; // posición entre hermanos del mismo tagName (0-based)
    siblingCount: number; // total de hermanos del mismo tagName
  };
  relativeX: number; // fracción 0–1 dentro del contenedor
  relativeY: number;
}

interface SerializedComment {
  id: number;
  text: string;
  anchor: CommentAnchor;
  replies: CommentReply[];
  author: string;
  createdAt: string;
  // screenshots quedan FUERA de la serialización v1: son data-URLs pesados.
  // La app anfitriona puede persistirlos aparte usando el id del comentario.
}
```

El `Comment` en memoria conserva `container: HTMLElement` (el tracking en
vivo no cambia) y gana:

- `anchor: CommentAnchor`
- `anchorState: "anchored" | "orphaned"`

## Módulo nuevo: `src/anchor.js`

Funciones puras, sin estado, testeables aisladamente.

### `createAnchor(element, relativeX, relativeY): CommentAnchor`

Genera el selector con una cascada, parando en el primer nivel que produzca
un match **único** en el documento (`querySelectorAll(sel).length === 1`):

1. `#id` — si el elemento tiene id único (se escapa con `CSS.escape`).
2. Atributo estable con prefijo de tag: `tag[data-testid="…"]`,
   `tag[name="…"]`, `tag[aria-label="…"]`.
3. Path corto de clases estables — hasta 3 niveles de ancestros, usando solo
   clases que pasen el filtro heurístico de "clase estable" (ver abajo).
4. Path estructural `tag:nth-of-type(n)` encadenado desde el ancestro con id
   más cercano (o `body`), máximo 5 niveles.
5. Si nada produce match único → `selector: null` (el fingerprint hace todo
   el trabajo al restaurar).

El fingerprint se captura **siempre**, independiente del selector.

**Filtro de clase estable (heurística):** se descartan clases que parecen
generadas por tooling: contienen dígitos mezclados con letras en sufijos de
5+ caracteres (`css-1x2y3z`, `jsx-3812093`), prefijos conocidos de CSS-in-JS
(`css-`, `sc-`, `jsx-`, `emotion-`), o son un hash puro. Se conservan clases
"humanas" (`hero`, `card-title`, `container`).

**Atributos estables:** `id`, `name`, `role`, `aria-label` y `data-*`
excepto los que aparenten ser generados (mismo criterio de hash) o sean de
frameworks (`data-reactid`, `data-v-*`).

### `resolveAnchor(anchor, doc = document): { element, confidence } | null`

1. **Vía selector**: si `anchor.selector` existe, `querySelectorAll`; cada
   candidato se puntúa contra el fingerprint. El mejor con score ≥ **0.6**
   gana. Un match de selector NUNCA se acepta sin verificar el fingerprint —
   esto impide anclar en silencio al elemento equivocado.
2. **Búsqueda de rescate**: si no hubo ganador, `querySelectorAll(tagName)`
   sobre todo el documento; se puntúan todos los candidatos y gana el mejor
   con score ≥ **0.7** (umbral más alto porque no hubo señal estructural).
3. Si nadie supera el umbral → `null` → huérfano.

**Scoring (0–1):**

- Similitud de `textSnippet` — peso **0.5**. Igualdad exacta del snippet
  normalizado = 1; contención (uno prefijo del otro) = 0.8; si no,
  coeficiente de Dice sobre tokens (palabras).
- Coincidencia de `attributes` — peso **0.3**. Fracción de atributos del
  fingerprint presentes con el mismo valor en el candidato. Si el
  fingerprint no tiene atributos, este peso se redistribuye al texto.
- Posición entre hermanos — peso **0.2**. 1 si `siblingIndex` y
  `siblingCount` coinciden exactos; decae linealmente con la distancia de
  índice (mín. 0).
- Caso degenerado: si el fingerprint no tiene NI texto NI atributos (p. ej.
  un `div` decorativo vacío), solo puede resolverse vía selector con match
  estructural exacto (score estructural = posición de hermanos); el rescate
  se omite porque no hay señal suficiente.

## API pública

### Callbacks (en `CommentOverlayOptions`)

- `onCommentCreated?(comment: SerializedComment): void` — al guardar un
  comentario nuevo.
- `onReplyAdded?(comment: SerializedComment, reply: CommentReply): void` —
  al agregar una respuesta (incluye respuestas sobre comentarios cargados).
- `onAnchorLost?(comment: SerializedComment): void` — por cada comentario
  que quedó huérfano durante `loadComments`.

### Métodos (en `CommentOverlay`)

- `serializeComments(): SerializedComment[]` — snapshot serializable de
  todos los comentarios (anclados y huérfanos).
- `loadComments(data: SerializedComment[]): { anchored: number; orphaned: number }`
  — restaura comentarios: resuelve cada ancla, renderiza círculo para los
  resueltos (reutilizando el pipeline actual `renderCommentCircle` con el
  elemento resuelto como `container`), marca huérfanos los demás. Reemplaza
  los comentarios cargados previos con el mismo `id` (idempotente); no toca
  comentarios creados en la sesión con ids distintos.

## Inbox mínimo

El botón Inbox de la toolbar hoy es un stub. Se implementa un panel simple
anclado a la toolbar (dentro del shadow root, mismo patrón visual que el
thread popover):

- Lista todos los comentarios: texto (truncado), autor, fecha.
- Los huérfanos muestran un badge "desanclado" (i18n: en/es).
- Click en un comentario anclado hace scroll al círculo
  (`scrollIntoView`) y abre su thread popover.
- Click en un huérfano abre su thread popover centrado en el viewport
  (lectura + responder; sin posición en página).
- Contador en el badge del botón cuando hay comentarios.

## Flujo de datos

1. **Creación**: `_placeCommentAtPoint` ya calcula `container` +
   `relativeX/Y` → se añade `createAnchor(container, relativeX, relativeY)`
   al `currentPosition`. `saveComment()` adjunta `anchor` y
   `anchorState: "anchored"` al comentario y dispara `onCommentCreated`.
2. **Persistencia**: la app anfitriona guarda lo que recibe por callbacks o
   llama `serializeComments()` cuando quiera (p. ej. `beforeunload`).
3. **Restauración**: la app llama `loadComments(data)` tras montar el
   overlay. Por cada comentario: `resolveAnchor` → círculo o huérfano.
4. **Tracking en vivo**: sin cambios — los comentarios resueltos usan el
   mismo mecanismo actual de observers + `updateCommentPosition`.

## Manejo de errores

- `loadComments` con datos malformados (sin `anchor`, versión desconocida,
  campos faltantes): el comentario se trata como huérfano si tiene al menos
  `id` y `text`; si ni eso, se ignora con `console.warn`. Nunca se lanza.
- `querySelector` con selector inválido (datos corruptos): se captura la
  excepción y se pasa directo a la búsqueda de rescate.
- `CSS.escape` no disponible (entornos viejos): fallback a escape manual
  mínimo o saltar el nivel de la cascada.

## Testing

- **Unit (`test/anchor.test.js`)**: cascada de selectores (id, atributo
  estable, clases filtradas, nth-of-type, null); filtro de clases
  generadas; captura de fingerprint; resolución feliz; verificación que
  rechaza un match de selector con fingerprint discordante; rescate por
  fingerprint cuando el selector falla; huérfano cuando nada supera umbral;
  caso degenerado sin texto ni atributos; selector inválido no lanza.
- **Integración (`test/overlay.test.js` + nuevo `test/persistence.test.js`)**:
  `saveComment` produce `anchor` completo; round-trip
  `serializeComments()` → `loadComments()` re-renderiza círculos en la
  posición correcta; carga con elemento eliminado → huérfano sin círculo +
  `onAnchorLost`; idempotencia de `loadComments` por `id`; inbox lista
  comentarios y marca huérfanos.
- **Tipos**: actualizar `src/index.d.ts` y `typecheck/consistency-check.ts`.
- **Gates**: `npm run lint && npm run typecheck && npm test && npm run build && npm run size`.

## Fuera de alcance (v1)

- Serialización de screenshots (data-URLs pesados; la app anfitriona puede
  persistirlos aparte por `id`).
- XPath (decisión explícita: no aporta robustez sobre la combinación
  selector CSS + fingerprint).
- Re-anclaje diferido para contenido que carga tarde (SPA lazy-load): si el
  elemento no existe al llamar `loadComments`, queda huérfano; la app puede
  volver a llamar `loadComments` cuando su contenido esté listo (la
  idempotencia por `id` lo permite).
- Storage integrado (localStorage/backend).

## Criterios de aceptación

1. Crear un comentario genera un `anchor` serializable (JSON round-trip sin
   pérdida) con selector (o null), fingerprint y coordenadas relativas.
2. `serializeComments()` + `loadComments()` en un DOM idéntico restaura el
   100% de los comentarios en su posición original.
3. Con clases dinámicas cambiadas (selector roto) pero contenido intacto,
   el rescate por fingerprint re-ancla el comentario al elemento correcto.
4. Con el elemento eliminado, el comentario queda huérfano: sin marcador,
   visible en inbox con badge, y `onAnchorLost` disparado.
5. Un match de selector sobre un elemento con contenido claramente distinto
   NO se acepta (verificación por fingerprint).
6. Callbacks `onCommentCreated` / `onReplyAdded` / `onAnchorLost` funcionan.
7. Todos los gates pasan: lint, typecheck, tests (con cobertura de
   `src/anchor.js`), build y presupuesto de tamaño (≤ 50 KB gzip ESM).
