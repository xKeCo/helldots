# Diseño: Inbox sidebar, persistencia localStorage, estado oculto y contexto de agente

**Fecha:** 2026-07-03
**Estado:** Aprobado
**Spec previo relacionado:** `2026-07-02-comment-anchoring-design.md`

## Alcance

Cuatro features acordadas con el usuario:

1. Persistencia opcional en `localStorage` (opción de librería).
2. Estado runtime "oculto" para marcadores cuyo elemento ancla no es
   visible (caso `slogan-img` en responsive).
3. Rediseño del inbox como sidebar derecho con filtro por página, cards
   con acciones (copiar contexto de agente, estado placeholder, eliminar)
   y vista de detalle con thread (mockups estilo Vercel Toolbar).
4. Modal en el playground + verificación end-to-end con navegador real.

Decisiones del usuario: persistencia como opción de la librería; página
identificada por `location.pathname`; oculto = tamaño 0/display:none
(re-evaluado con los observers existentes); opción `user` para el nombre
del autor; menú ⋯ con "Eliminar"; los marcadores conservan su popover
actual; el botón copiar genera contexto para agentes (no copia el texto
plano).

## Arquitectura

Módulos nuevos, siguiendo el patrón de aislamiento de `anchor.js`:

- `src/storage.js` — adapter de localStorage (funciones puras + try/catch).
- `src/inbox.js` — clase `InboxView`: estado del sidebar (filtro,
  lista/detalle, navegación), renderiza dentro del shadow root, delega
  mutaciones al overlay vía un contrato estrecho de callbacks.
- `src/agent-context.js` — `buildAgentContext(comment, options)` genera el
  template de texto para agentes.
- `src/overlay.js` orquesta: carga inicial desde storage, sincroniza
  storage en cada mutación, expone `deleteComment(id)`, marca hidden en
  `updateCommentPosition`. El panel viejo del inbox (bottom-center) se
  elimina y reemplaza por `InboxView`.

## 1. Persistencia localStorage

- Nueva opción `persistence?: "localStorage" | "none"` (default `"none"`).
- Clave única `helldots-comments`: JSON array de `SerializedComment` de
  **todas** las páginas (el filtro "todos" del inbox los necesita).
- `SerializedComment` gana `page: string` (`location.pathname` capturado
  al crear) y `screenshots?: string[]` — los screenshots SÍ se persisten
  en localStorage (storage de desarrollo; las cards y el detalle los
  muestran). Los callbacks siguen omitiendo screenshots como en v1? NO:
  se unifica — `_serializeComment` ahora incluye `screenshots` (array de
  data-URLs) y `replies[].screenshots`. Justificación: el inbox los
  renderiza desde datos restaurados; mantener dos formas de serializar
  sería más complejo que el ahorro. El spec previo queda enmendado en
  este punto.
- Al iniciar con persistencia activa, `initOverlay` llama
  `loadComments(storage.read())`.
- Resolución por página: `loadComments` solo intenta `resolveAnchor` si
  `item.page === location.pathname` (o si `item.page` no existe — datos
  viejos). Los de otras páginas quedan `anchorState: "inactive"`: sin
  círculo, sin `onAnchorLost`, listados solo en el filtro "todos".
- Toda mutación (crear, responder, eliminar, cargar) re-escribe el
  storage con `serializeComments()` **fusionado** con los comentarios de
  otras páginas ya guardados (no se pisan: se reemplazan por id solo los
  presentes en memoria).
- Errores de localStorage (quota, JSON corrupto, storage deshabilitado):
  `console.warn` y seguir sin persistencia. Nunca lanzar.

## 2. Opción `user`

- `user?: { name: string }`. `saveComment` y `addReply` usan
  `this.options.user?.name || strings.anonymous`.

## 3. Estado oculto (runtime)

- En `updateCommentPosition`: si `containerRect.width <= 0 ||
containerRect.height <= 0` → `circle.style.display = "none"` y
  `comment.hidden = true`; si recupera tamaño → `display = ""` y
  `hidden = false`. Esto reemplaza el early-return actual con warn (el
  warn desaparece: tamaño cero ya no es anomalía sino estado válido).
- Se re-evalúa con los mecanismos existentes: ResizeObserver del
  contenedor, MutationObserver, resize/scroll/load handlers.
- `hidden` NO se serializa (depende del viewport del momento).
- La card del inbox muestra tag "Hidden"/"Oculto" cuando
  `comment.hidden === true`.

## 4. Inbox sidebar

### Layout

- Panel `position: fixed`, lado derecho: `top: 16px; right: 16px;
bottom: 16px; width: 380px` (en viewports < 420px: `left: 16px`,
  ancho fluido). Fondo `#1C1C1E`, `border-radius: 12px`, scroll interno,
  z-index `COMMENT_BOX`.
- Se abre con el botón Inbox de la toolbar (toggle), cierra con X,
  Escape o click fuera. Reemplaza por completo el panel bottom-center
  de la iteración anterior.

### Header (vista lista)

- Izquierda: `<select>`-like dropdown (botón + menú propio, no `<select>`
  nativo, para poder estilarlo dentro del shadow root) con dos opciones:
  "All comments"/"Todos los comentarios" y "Current page"/"Página
  actual". Default: "Current page". La selección vive en la instancia de
  `InboxView` (se conserva mientras el overlay viva, no se persiste).
- Derecha: botón X (cierra el panel).

### Card (vista lista)

- Fila 1: autor (bold) + tiempo relativo (izquierda); iconos a la
  derecha: **copiar** (contexto de agente), **círculo de estado**
  (solo visual, sin handler, título "Status"), **⋯** (menú con
  "Delete"/"Eliminar").
- Fila 2: texto del comentario (completo, sin truncar — como el mockup).
- Fila 3 (si hay): thumbnails de screenshots (reutiliza
  `createScreenshotsDisplay`; click abre lightbox).
- Tags condicionales: "Unanchored"/"Desanclado" (orphaned),
  "Hidden"/"Oculto" (hidden), y para `inactive` en el filtro "todos" se
  muestra el pathname de su página como tag informativo.
- Fila 4: link "Reply"/"Responder" — abre el detalle con foco en el input.
- Click en cualquier parte de la card → vista detalle. Enter/Space
  también (cards con `role="button"` + `tabindex="0"`).

### Vista detalle

- Header: "‹ Back" (vuelve a la lista), flechas ↑/↓ (navegan al
  comentario anterior/siguiente dentro del filtro actual, deshabilitadas
  en los extremos), X (cierra el panel).
- Cuerpo: card del comentario (mismas acciones copiar/estado/⋯) +
  respuestas (autor, tiempo, texto, screenshots) + input de respuesta
  con botón de adjuntar imagen y enviar (reutiliza `createInputArea` y
  la lógica de screenshots pendientes del thread popover).
- Al abrir el detalle de un comentario anclado y visible:
  `container.scrollIntoView({ block: "center" })`.
- Las respuestas nuevas persisten (storage) y disparan `onReplyAdded`.

### Eliminar

- Método público `deleteComment(id): boolean` en `CommentOverlay`:
  quita círculo + observers (reutiliza `_removeComment`), borra del
  storage (incluida la copia de otras páginas si el id coincide), y
  dispara `onCommentDeleted?.(id)`.
- El menú ⋯ llama `deleteComment` y re-renderiza la vista actual del
  inbox (si se eliminó el comentario abierto en detalle, vuelve a la
  lista).

### Popover de marcadores

- Sin cambios: click en un círculo sigue abriendo el thread popover
  anclado al punto.

## 5. Contexto de agente (copiar)

`buildAgentContext(comment, { viewport, locale })` devuelve texto plano:

```
Page: <comment.page>
Viewport: <innerWidth>x<innerHeight>
Anchor state: <anchored|orphaned|inactive|hidden>
Selector: <anchor.selector ?? "(none)">
Element: <opening tag del container si está vivo, si no del fingerprint:
  "<section id=\"pricing\" class=\"plans\">">
DOM path: <body > main.flex > … > section#pricing — construido con
  tag + id + primeras 2 clases por nivel, desde body hasta el elemento,
  solo si el container está vivo; si no, "(unavailable)">
Nearby text: "<fingerprint.textSnippet>"
Comment by <author> (<createdAt>):
"<texto>"
Replies (<n>):
- <author>: "<texto>"
```

- Copia con `navigator.clipboard.writeText`; fallback a
  `document.execCommand("copy")` con textarea temporal si no existe
  (jsdom/HTTP). Feedback: el icono cambia a check ~1.5s (título
  "Copied"/"Copiado").

## 6. Playground

- Botón "Open modal" en el playground que abre un modal propio
  (backdrop + dialog con título, texto e imagen de prueba, botón cerrar).
  El modal usa `display:none` cuando está cerrado → al cerrar, los
  comentarios anclados dentro quedan `hidden` (ejercita la feature 3).
- El playground inicializa
  `createCommentOverlay({ persistence: "localStorage", user: { name: "Kevin Collazos" } })`.

## Verificación end-to-end (Playwright, manual post-implementación)

1. Comentar dentro del modal → ancla apunta a contenido del modal.
2. Cerrar modal → círculo desaparece; inbox marca "Oculto".
3. Recargar → comentarios restaurados desde localStorage.
4. Viewport angosto (media query oculta `slogan-img`) → círculo oculto +
   tag en inbox.
5. Filtro "Página actual" vs "Todos" con un comentario inyectado de otra
   página en localStorage.
6. Copiar contexto → portapapeles contiene el template.
7. Eliminar desde ⋯ → desaparece de página, inbox y localStorage.

## Tipos (index.d.ts)

- `CommentOverlayOptions` += `persistence?: "localStorage" | "none"`,
  `user?: { name: string }`, `onCommentDeleted?: (id: number) => void`.
- `SerializedComment` += `page: string`, `screenshots: string[]`;
  `CommentReply` += `screenshots?: string[]`.
- `AnchorState` = `"anchored" | "orphaned" | "inactive"`.
- `Comment` += `page: string`, `hidden: boolean`, `screenshots: string[]`.
- `CommentOverlay` += `deleteComment(id: number): boolean`.

## i18n (en/es)

Nuevas strings: filtro ("All comments"/"Todos los comentarios",
"Current page"/"Página actual"), "Hidden"/"Oculto", "Back"/"Volver",
"Delete"/"Eliminar", "Copy agent context"/"Copiar contexto de agente",
"Copied"/"Copiado", "Status"/"Estado", "Previous comment"/"Comentario
anterior", "Next comment"/"Comentario siguiente", "Reply"/"Responder"
(link de card).

## Fuera de alcance

- Círculo de estado funcional (workflow de estados de comentario).
- Avatares, reacciones (emoji), deep-links de copiar.
- Árbol de componentes de framework en el contexto de agente.
- Sincronización multi-pestaña del localStorage (evento `storage`).

## Criterios de aceptación

1. Con `persistence: "localStorage"`, crear → recargar → los comentarios
   reaparecen anclados; sin la opción, no se toca localStorage.
2. Comentarios de otra página no renderizan círculo, no disparan
   `onAnchorLost`, aparecen solo en el filtro "Todos" con tag de página.
3. Elemento ancla con tamaño 0 → círculo oculto; recupera tamaño →
   círculo visible; card marca "Oculto" mientras tanto.
4. Sidebar derecho con filtro funcional, X, Escape y click-fuera.
5. Card con autor/tiempo/copiar/estado/⋯/texto/screenshots/Reply; click
   abre detalle; detalle navega ↑/↓ dentro del filtro, permite responder
   (persistido) y volver con Back.
6. Copiar produce el template de agente (page/viewport/selector/element/
   DOM path/nearby text/comment/replies) en el portapapeles.
7. `deleteComment` elimina de memoria, página, storage y notifica; el ⋯
   de la card lo invoca.
8. `user.name` aparece como autor de comentarios y respuestas.
9. Playground con modal funcional y overlay configurado con persistencia
   y usuario; verificación Playwright de los flujos 1-7 de la sección de
   verificación.
10. Gates: lint, typecheck, format, tests, build, size ≤ 50 KB gzip.
