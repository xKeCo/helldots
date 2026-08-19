---
"helldots": minor
---

Add a metrics dashboard and report exports.

The inbox header gains a **Metrics** button that swaps the list for a
dashboard: totals, resolved and reopened counts, average and median resolution
time, bars per status, type and priority, and a daily distribution. It measures
whatever the panel is filtered to; `overlay.getMetrics()` returns the same
shape over the whole corpus.

Three exports, from the dashboard or directly:

- `overlay.exportCommentsCsv()` — one row per comment
- `overlay.exportMetricsCsv()` — the aggregate figures in `section, key, value`
- `overlay.printMetricsReport()` — the browser's print dialog, where "Save as
  PDF" produces a real PDF

The CSVs are RFC 4180 with a UTF-8 BOM so Excel reads accents correctly, and
values that a spreadsheet would evaluate as formulas are neutralised. No new
dependency: the charts are hand-drawn SVG and the PDF is the browser's own, so
the whole feature costs 4.28 KB gzip.

Also fixes `mountStyles` constructing its stylesheet in the calling realm
rather than the target's, which prevented styles from being adopted into a
document other than the caller's.
