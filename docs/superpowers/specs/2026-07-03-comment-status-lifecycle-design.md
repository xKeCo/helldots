# Diseño: Ciclo de vida del comentario (RF09) + acciones en el thread popover

**Fecha:** 2026-07-03
**Estado:** Aprobado
**Specs relacionados:** `2026-07-03-inbox-sidebar-persistence-design.md`

## Alcance

1. Estado del ciclo de vida por comentario (RF09): Abierto, En progreso,
   Resuelto, Cerrado — con color identificador y selector para cambiarlo.
2. El thread popover gana las mismas tres acciones de las cards del inbox:
   copiar contexto de agente, círculo de estado y menú ⋯ (Eliminar).
3. Tooltips en esos tres botones con el mismo patrón CSS que
   `thread-time[data-full-date]`.

## Modelo de datos

- `Comment.status: "open" | "in_progress" | "resolved" | "closed"`,
  default `"open"` al crear. Se serializa (`SerializedComment.status`) y
  persiste; entradas legacy sin `status` se restauran como `"open"`.
- Método público `setCommentStatus(id, status): boolean` — valida id y
  estado (los inválidos devuelven false sin efectos), actualiza memoria,
  sincroniza storage y dispara `onCommentStatusChanged?.(serialized)`.
- Nueva opción/callback: `onCommentStatusChanged?: (comment: SerializedComment) => void`.

## Colores y labels (i18n en/es)

| status        | en          | es          | color     |
| ------------- | ----------- | ----------- | --------- |
| `open`        | Open        | Abierto     | `#2E90FA` |
| `in_progress` | In progress | En progreso | `#FF9F0A` |
| `resolved`    | Resolved    | Resuelto    | `#30D158` |
| `closed`      | Closed      | Cerrado     | `#8E8E93` |

Constantes en `src/constants.js` (`STATUSES`, `STATUS_COLORS`); labels en
`src/locales/*` (`statusOpen`, `statusInProgress`, `statusResolved`,
`statusClosed`). El círculo se pinta relleno con el color del estado
actual (antes: borde gris vacío).

## Componente compartido: `src/comment-actions.js`

`createCommentActions(comment, deps)` — extraído de
`InboxView._buildCardActions`. `deps`:

```
{
  strings, locale,
  onCopy(comment): void        // construye y copia el agent context
  onSetStatus(comment, status): void
  onDelete(comment): void
}
```

Devuelve el elemento `.inbox-card-actions` con:

- **Copy** (`data-action="copy"`): copia; feedback check 1.5s; tooltip
  "Copy agent context"/"Copiar contexto de agente" → "Copied"/"Copiado".
- **Status** (`data-action="status"`): ahora es `<button>` con el círculo
  coloreado; click abre menú (mismo patrón que ⋯/filtro) con las 4
  opciones — punto de color + label, estado activo marcado
  (`aria-checked`). Tooltip "Status: <label actual>"/"Estado: <...>".
- **⋯** (`data-action="menu"`): menú con "Delete"/"Eliminar". Tooltip
  "More"/"Más" (nuevas strings `moreOptions`).

Consumidores:

- `InboxView._buildCard` (reemplaza su implementación privada).
- `showThreadPopover` en `overlay.js`: inserta las acciones en el
  `THREAD_HEADER` entre el meta y el botón de cerrar. Delete desde el
  popover cierra el popover además de eliminar. Cambio de estado desde el
  popover recolorea su propio círculo (y refresca el inbox si está
  abierto).

## Tooltips genéricos

- Atributo `data-hd-tooltip="<texto>"` + regla CSS compartida en
  `styles.js` (selector `[data-hd-tooltip]`), mismo estilo que
  `.thread-time::after` (fondo negro, hover, sin wrap, encima del botón).
- `thread-time` conserva su regla actual (sin migrar, para no tocar lo
  que funciona).

## Agent context

`buildAgentContext` agrega la línea `Status: <status>` (valor crudo
`open|in_progress|resolved|closed`, útil para agentes) tras
`Anchor state:`.

## Testing

- `test/comment-actions.test.js` (nuevo): render de los 3 botones con
  tooltips correctos; menú de estado lista 4 opciones con labels
  localizados; seleccionar llama `onSetStatus` y recolorea; copy llama
  `onCopy` y muestra feedback.
- `test/persistence.test.js`: default `"open"`; `setCommentStatus`
  round-trip por localStorage; estado inválido → false; callback.
- `test/inbox.test.js`: cards siguen funcionando con el componente
  compartido; cambiar estado desde la card refresca el color.
- `test/overlay.test.js` o `persistence.test.js`: popover muestra las 3
  acciones; delete desde popover cierra popover y elimina; cambio de
  estado desde popover actualiza el comentario.
- Gates completos; verificación visual en playground (Playwright).

## Fuera de alcance

- Filtrar el inbox por estado; transiciones restringidas entre estados;
  historial de cambios de estado.

## Criterios de aceptación

1. Todo comentario nace `open`; el estado sobrevive serialización,
   localStorage y recarga.
2. El círculo muestra el color del estado en inbox y popover; el menú
   permite cambiar entre los 4 estados RF09 con labels es/en.
3. El thread popover muestra copy/status/⋯ funcionales e idénticos a los
   del inbox.
4. Tooltips visibles al hover en los 3 botones (patrón data-attribute).
5. `setCommentStatus` + `onCommentStatusChanged` funcionan y el agent
   context incluye `Status:`.
6. Gates verdes (lint, typecheck, format, 200+ tests, build, size ≤ 50 KB).
