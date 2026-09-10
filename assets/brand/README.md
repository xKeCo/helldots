# Brand

The mark is the outline of the shape the widget already draws: the comment
cursor (`CURSOR_SVG` in `src/constants.js`) and every marker on the page
(`border-radius: 0% 100% 100% 100%`) are the same silhouette — a sharp
top-left corner opening into three quarters of a circle. The corner is the
tip that points at the element being commented on.

| File                     | Use                                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `helldots-mark.svg`      | The mark in brand blue (`#2563EB`). Default for READMEs, sites, slides.                                                     |
| `helldots-mark-mono.svg` | Same geometry with `stroke="currentColor"`. For inline SVG that has to follow the surrounding text colour, in either theme. |

Both are 100×100 with a 12-unit stroke. The stroke is centred on the path, so
the artwork spans 4–96 and carries its own 4-unit margin — do not add padding
when placing it, and do not scale the stroke separately from the box.

`#2563EB` is the brand blue, and the widget's own accent is the same value.
It is not the `in_review` status colour, which is a separate semantic slot in
`STATUS_COLORS`.

## Not the logo

Do not recolour the mark per background — use `helldots-mark-mono.svg` when
the colour has to change. Do not fill the counter, rotate it, or round the
top-left corner: that corner is what distinguishes the mark from a circle.
