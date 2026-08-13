---
"helldots": patch
---

Internal: `overlay.js` (~2,500 lines) is split into three modules along its real seams — `capture-flow.js` (drag + screenshot orchestration), `popover-controller.js` (thread popover lifecycle and editing) and `marker-engine.js` (positioning, occlusion, observers). No public API or behavior change; the overlay keeps compatibility facades for its internal surface.
