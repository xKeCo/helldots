---
"helldots": minor
---

Give comments and replies collision-free ids.

Ids were `Date.now()`, so anything created inside the same millisecond shared
one. That is not a cosmetic problem: `mergeForStorage` deduplicates by id and
every lookup returns the first match, so a collision silently overwrites a
comment instead of failing. A programmatic import, or two people commenting
from different machines into a shared back end, is enough to trigger it.

New ids are 21-character nanoid strings — URL-safe, so they can travel in a
link, and generated from `crypto.getRandomValues`, which works outside secure
contexts.

- `CommentId` is `string | number`. Comments already stored with numeric ids
  keep resolving, and `deleteComment(123)` still typechecks. Hosts that read
  `comment.id` into a variable typed `number` need to widen it.
- nanoid is bundled into both artifacts rather than added as a runtime
  dependency, so the package still installs on Node 18 and gains no new
  dependencies. It costs ~130 B gzip.
