---
"helldots": minor
---

New `onChange` option: one subscription point that fires for every change, typed as a discriminated union on `event.type` (`comment:created`, `reply:added`, `comment:status-changed`, …). The nine existing callbacks are unchanged and keep firing at the same moments — this is additive. Handlers that throw are now caught and warned about instead of propagating out of the mutation that already happened.
