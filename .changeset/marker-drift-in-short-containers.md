---
"helldots": patch
---

Markers no longer drift upward when a comment is left on a short element such as a navbar row. The position was clamped so that the marker's whole 28px box fit inside its anchor container, which is impossible in a container shorter than the marker — so every marker in a 36px navbar was pulled to 8px from its top, roughly 10px above the point the preview circle had just shown, and up to 25px for a click near the row's bottom edge. The clamp now keeps the clicked point inside the container and lets the marker's body overhang it. "Scroll to this comment" derives its target through the same clamp, so it can no longer disagree with where the marker was drawn.
