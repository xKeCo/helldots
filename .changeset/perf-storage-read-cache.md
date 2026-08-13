---
"helldots": patch
---

With `persistence: "localStorage"`, every mutation used to re-read and JSON.parse the whole cross-page corpus (megabytes once context screenshots accumulate) before writing it back. The parsed corpus is now cached and kept in step with what the instance writes; a `storage` event from another tab drops the cache so the next sync re-reads instead of clobbering the other tab's write.
