---
"helldots": patch
---

`deleteComment`, `deleteReply`, `setCommentStatus`, `setCommentType`, `setCommentPriority` and `setCommentTags` now resolve a legacy numeric id in either spelling (number or string), as the type declarations always promised. They compared ids strictly, so an id that had crossed a JSON or URL boundary could be edited but silently not deleted or reclassified. Every id lookup now goes through one shared helper.
