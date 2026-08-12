---
"helldots": patch
---

Fix opening a comment from the inbox scrolling to an unrelated part of the
page. The scroll targeted the comment's anchor container, which falls back to
`<body>` whenever the commented element has no `section`/container ancestor —
centring `<body>` lands halfway down the document. It now scrolls to the
marker's own position, derived from the anchor so it is correct even when the
marker's rendered coordinates have not been refreshed yet.
