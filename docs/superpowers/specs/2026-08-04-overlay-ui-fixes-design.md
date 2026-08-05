# Overlay UI fixes — design

Eight reported defects and improvements across the inbox, the comment box,
the tooltip, the comment circles and the responsive behaviour. They are
grouped here because four of them are solved by the same two extractions.

## Shared extractions

Two view builders currently live as private methods on `InboxView` but are
needed outside it:

| New export                                                              | Moved from                     | Home                         |
| ----------------------------------------------------------------------- | ------------------------------ | ---------------------------- |
| `createBadgeRow(comment, strings, { includeStatus })`                   | `InboxView._buildBadges`       | `src/components.js`          |
| `createContextBlock(comment, { strings, onShowLightbox, collapsible })` | `InboxView._buildContextBlock` | `src/context-block.js` (new) |

`InboxView` keeps thin wrappers so its call sites do not change shape.
`createContextBlock` gets its own module rather than joining `components.js`,
which is already the largest view file and is the one the i18n regression
test scans.

## 1 — Inbox card header

`.inbox-card-header` packs the author/time meta and five controls (copy,
status, type, priority, more) into a single row. Inside a 380 px panel that
leaves roughly 90 px for the name, so it wraps onto two lines.

The action strip moves into a card footer shared with the reply link:

```
Kevin Collazos                        4d
Testing
[Bug] [High]
Reply              [copy] [●] [Bug ▾] [High ▾] [⋯]
```

`.thread-meta` becomes `flex: 1; min-width: 0` and `.thread-author`
truncates with an ellipsis, so a long name degrades instead of wrapping. In
the detail view there is no reply link and the actions sit alone on the
right. No action is hidden and the card gets shorter.

## 2 — Comment box proportions

- `.classify-row` drops its own `8px 10px 0` padding — which offset it 10 px
  from the textarea — for `padding: 0 0 10px` plus a bottom hairline, the
  mirror of the border `.thread-input-area` already carries on top.
- The type/priority pickers inside the classify row get a 26 px height and a
  1 px border so they read as controls rather than loose text.
- `#comment-input` normalises to `padding: 8px 0`.
- `.screenshots-container` drops its 16 px bottom margin to 8 px.

Resulting rhythm: 16 px box padding → classification → 10 px → text → 12 px
→ actions bar.

## 3 — Tooltip information

`createTooltip` inserts `createBadgeRow(comment, strings, { includeStatus:
true })` between the body and the screenshots: status, type, priority, any
stored tags and the resolution duration.

Status is shown in the tooltip even when it is `open`, because the tooltip is
the only surface with no status control of its own. Inbox cards keep omitting
it — there the status picker and its coloured dot already carry the value.

## 4 — Active comment circle

A `comment-circle--active` class, added by `showThreadPopover()` and removed
by `closeThreadPopover()`, gives the selected marker the same `scale(1.2)` as
hover plus a focus ring. Size and ring, not colour alone, so WCAG 1.4.1 still
holds.

## 5 — Chip-based filter menu

`.inbox-filter-menu` grows to 300 px (bounded by `calc(100vw - 40px)`) with a
"Filter · Clear" header and four chip groups: page, status, type, priority.

`statusFilter` changes from `all | unresolved | resolved` to
`all | open | in_progress | resolved`, aligning it with the `STATUSES`
constant that the data model already uses. Status, type and priority chips
toggle — clicking the active chip clears that group back to "all". The page
group keeps two explicit chips because it has no neutral state.

String changes: `filterUnresolved`, `filterResolved` and `filterStatusAll`
are removed; `filterTitle` and `filterClear` are added; the four
`filterBy*` keys shorten to bare group names.

## 6 — Tags input removed

The tags input is the only way to add a tag, it renders unreadably inside the
dark comment box, and it is the least valuable part of the classification
strip. `createClassifyRow` loses the input, the chip list and `getTags()`;
`saveComment` stores `tags: []`.

The data model is untouched: `tags` stays on the comment, `setCommentTags()`
stays in the public API, and stored tags still render as badges. Only the
authoring affordance goes away, so nothing already saved is lost and no
consumer breaks.

## 7 — Context block in the thread popover

The automatic context capture is reachable only from the inbox detail. The
popover gets the same block as a disclosure, collapsed by default, inserted
between the screenshots and the replies. It is built in `showThreadPopover()`
because it needs the `onShowLightbox` callback. The inbox passes
`collapsible: false` and is visually unchanged.

## 8 — Responsive

- `#comment-box`, `.comment-tooltip` and `.comment-thread-popover` become
  `width: min(400px, calc(100vw - 24px))`.
- `showCommentBox()` loses the `boxWidth = 300` constant — the actual root
  cause, since the CSS width is 400 px — and measures the box instead, then
  clamps against the right edge.
- `positionPopoverAtCircle()` replaces its hardcoded `400` with the measured
  `elRect.width` and gains the same clamp.
- The inbox panel's narrow-viewport media query moves from 420 px to 480 px.

## Verification

Extended tests: `components.test.js` (badge row, classify row without tags),
`inbox.test.js` (chips, clear, card footer, new status semantics),
`overlay.test.js` (active circle class, context disclosure, width clamping).
The `getTags` tests are deleted with the function. `npm run verify` gates the
whole change; a `minor` changeset ships it.
