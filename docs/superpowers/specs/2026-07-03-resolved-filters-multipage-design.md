# Diseño: Resuelto sin marcador, filtros combinados, multi-página y hover highlight

**Fecha:** 2026-07-03
**Estado:** Aprobado
**Specs relacionados:** `2026-07-03-comment-status-lifecycle-design.md`

## 1. Eliminar "closed"

- `STATUSES = ["open", "in_progress", "resolved"]`; el picker muestra 3.
- Migración: entradas persistidas con `status: "closed"` se restauran como
  `"resolved"`. `setCommentStatus(id, "closed")` devuelve `false`.
- Tipos: `CommentStatus = "open" | "in_progress" | "resolved"`.

## 2. Resuelto

- Marcador oculto mientras `status === "resolved"` (misma vía que
  `hidden`: `updateCommentPosition` lo trata como no-visible). Cambiar a
  open/in_progress lo restaura. Cambiar el estado re-dispara
  `updateCommentPosition` del círculo afectado.
- Card en inbox: clase `inbox-card--resolved` → borde
  `rgba(48, 209, 88, 0.4)` + `opacity: 0.75` en el contenido. Sin tag.
- Orden de lista: no-resueltos primero (orden original estable), resueltos
  al final (orden original estable entre ellos).

## 3. Filtro combinado (mockup del usuario)

- Estado del InboxView: `pageFilter: "all" | "page"` (default `"page"`) y
  `statusFilter: "all" | "unresolved" | "resolved"` (default `"all"`).
- Menú único con dos secciones tituladas ("Filter by Page"/"Filtrar por
  página", "Filter by Status"/"Filtrar por estado"), separador entre
  ellas, checkmark (✓) en la opción activa de cada sección. Click en una
  opción actualiza su filtro y re-renderiza (el menú se mantiene el patrón
  actual: se cierra al seleccionar).
- `unresolved` = `open` + `in_progress`. Filtros se combinan con AND.
- Label del botón: `<labelPágina>` o `<labelPágina> · <labelEstado>`
  cuando statusFilter ≠ all (ej. "Página actual · Sin resolver").
- Strings nuevas (en/es): `filterByPage` ("Filter by Page"/"Filtrar por
  página"), `filterByStatus` ("Filter by Status"/"Filtrar por estado"),
  `filterUnresolved` ("Unresolved"/"Sin resolver"), `filterResolved`
  ("Resolved"/"Resueltos"), `filterStatusAll` ("All"/"Todos").
- La navegación ↑/↓ del detalle opera sobre la lista filtrada+ordenada.

## 4. Multi-página

- **Librería**: click en una card `inactive` (otra página) →
  `sessionStorage.setItem("helldots-pending-detail", String(id))` y
  `location.assign(comment.page)`. En `initOverlay`, si
  `persistence === "localStorage"` y la clave existe: tras
  `loadComments`, borra la clave y abre el inbox en el detalle de ese id
  (si el id no existe, abre la lista normal). Errores de sessionStorage:
  try/catch, no-op.
- **InboxView**: nuevo método `openDetail(id)` público (usado por el
  overlay para el arranque diferido) — abre el panel si está cerrado y
  muestra el detalle.
- **Playground**: nueva `playground/about.html` (página propia liviana
  con secciones/section + contenido de texto e imagen, mismo overlay:
  `persistence: "localStorage"`, `user: { name: "Kevin Collazos" }`,
  import de `../src/index.js` con el mismo import map). Links de ida y
  vuelta entre `index.html` y `about.html`.

## 5. Hover highlight

- `getGlobalStyles()` agrega `.helldots-highlight { outline: 2px solid
#2E90FA; outline-offset: 2px; border-radius: 4px; transition: outline
0.15s ease; }` (documento host, no shadow).
- En cards del inbox (solo lista): `mouseenter` → si el comentario está
  `anchored`, no `hidden` y no `resolved`, añade la clase al elemento
  vivo (`comment.target` conectado, si no `comment.container`);
  `mouseleave` la quita. `close()`/re-render del panel limpia cualquier
  highlight activo (se guarda referencia al elemento resaltado).
- Constante `CLASSES.HIGHLIGHT = "helldots-highlight"`.

## Testing

- Migración closed→resolved (load + setCommentStatus false).
- Resolver oculta el círculo; volver a abrir lo muestra.
- Orden: resueltos al final.
- Filtro combinado: 3×2 combinaciones clave (página actual + sin
  resolver excluye resueltos y otras páginas; todos + resueltos solo
  resueltos de todas las páginas); checkmarks correctos; label compuesto.
- Handoff multi-página: click en inactive guarda la clave y navega
  (mock de location.assign); init con clave abre detalle y limpia.
- Highlight: hover añade/quita clase; cerrar panel limpia; resolved no
  resalta.
- Gates completos + verificación Playwright (flujo entre páginas real).

## Criterios de aceptación

1. Solo existen 3 estados; datos viejos con closed se ven como resolved.
2. Resolver un comentario quita su marcador de la página y la card se ve
   distinta (borde verde, atenuada) y al final de la lista; reabrirlo
   restaura el marcador.
3. El dropdown combina filtro por página y por estado con secciones y
   checkmarks como el mockup; ambos aplican a la vez.
4. En el playground hay dos páginas; un comentario creado en una aparece
   en la otra bajo "Todos", y al clickearlo redirige y abre su detalle
   automáticamente.
5. Hover sobre una card con marcador visible resalta el elemento en la
   página; al salir o cerrar el inbox el resaltado desaparece.
6. Gates verdes (lint, typecheck, format, tests, build, size ≤ 50 KB).
