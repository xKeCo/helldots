---
"helldots": patch
---

Performance: clicking to place a comment opens the comment box immediately — the automatic context capture renders in the background and is awaited at save time, instead of gating the box for hundreds of ms on heavy pages. Captures now exclude the widget from the render via a clone filter rather than hiding the whole UI, so nothing flashes off screen. Saving is guarded against double-submit while a capture is in flight.
