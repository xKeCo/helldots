---
"helldots": patch
---

Drag-selected screenshots line up with the selection again. The render was
anchored to `<body>`, and the clone lands in a document where the user-agent's
`body { margin: 8px }` applies once more — even on a page that zeroed it — so
every element in normal flow sat 8px right and 8px down inside a canvas that
did not grow, losing 8px off the right edge and putting every crop 8px out.
Rendering `<html>` instead removes the offset: page coordinates and canvas
pixels now map 1:1, which is what the crops always assumed.
