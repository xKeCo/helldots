---
"helldots": minor
---

Adopt the official mark, and move the accent onto the brand blue.

The mark is not new artwork: it is the outline of the shape the widget has
always drawn — the comment cursor and every marker on the page share that
silhouette, a sharp top-left corner opening into three quarters of a circle,
where the corner is the tip that points at the element. `assets/brand/` now
carries it as a file, in brand blue and in `currentColor`, with a PNG for the
npm README, which renders neither SVG nor relative paths.

The accent moves with it, from `#2E90FA` to `#2563EB`, together with the two
shades derived from it (`#1570D6` → `#1D4ED8` on the darker hovers, `#57A6FB`
→ `#3B82F6` on the lighter one) and the `rgba()` tints spelled from the same
value. Markers, the active toolbar button, focus rings, the selection
rectangle, the reaction pill and the comment cursor all shift by the same
step, so nothing inside the widget goes out of tune with anything else.

It also retires a blue that had drifted out of the set: the marker's hover,
highlight and active states were painted `rgb(0, 123, 255)`, a hue of 211
against the 221 everything else sits on. It was the lift for the old accent
and reads as a different colour next to the new one, so it becomes `#3B82F6`
— the same lighter step the other hovers already use.

`STATUS_COLORS.in_review` deliberately stays `#2E90FA`. It is a semantic slot
in a palette that has to stay mutually distinguishable — it shares that panel
with `question` and `improvement` — and its blue was only ever the accent's by
coincidence.
