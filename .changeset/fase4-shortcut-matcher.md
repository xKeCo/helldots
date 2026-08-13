---
"helldots": patch
---

Fix: configuring a custom shortcut now disables the default Alt+C — the hardcoded fallback chords fired unconditionally and could not be turned off. Custom Alt chords also work on macOS now: the matcher accepts the physical key (`e.code`) for Alt combinations, where Option+letter types a dead character and `e.key` never spells the configured letter.
