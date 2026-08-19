import { describe, it, expect, vi, afterEach } from "vitest";
import { toCsv, commentRows, metricRows, downloadCsv } from "../src/csv.js";
import { computeMetrics } from "../src/metrics.js";

describe("toCsv", () => {
  const columns = [
    { key: "id", label: "ID" },
    { key: "text", label: "Text" },
  ];

  it("puts the labels on the header row, not the keys", () => {
    expect(toCsv([], columns).split("\r\n")[0]).toBe("ID,Text");
  });

  it("separates records with CRLF, as RFC 4180 asks", () => {
    const csv = toCsv(
      [
        { id: 1, text: "a" },
        { id: 2, text: "b" },
      ],
      columns
    );
    expect(csv).toBe("ID,Text\r\n1,a\r\n2,b");
  });

  it("quotes a field holding the delimiter", () => {
    expect(toCsv([{ id: 1, text: "one, two" }], columns)).toContain(
      '"one, two"'
    );
  });

  it("quotes a field holding a newline, so a row cannot split in two", () => {
    expect(toCsv([{ id: 1, text: "line\nbreak" }], columns)).toContain(
      '"line\nbreak"'
    );
  });

  it("doubles an embedded quote instead of escaping it with a backslash", () => {
    expect(toCsv([{ id: 1, text: 'say "hi"' }], columns)).toContain(
      '"say ""hi"""'
    );
  });

  it("writes an empty field for null and undefined, never the words", () => {
    const csv = toCsv([{ id: null, text: undefined }], columns);
    expect(csv.split("\r\n")[1]).toBe(",");
  });

  it("neutralises a value a spreadsheet would execute as a formula", () => {
    // =HYPERLINK(...) pasted into Excel runs on open. A leading apostrophe is
    // the standard defusing, and it survives a round trip through pandas.
    const csv = toCsv([{ id: 1, text: "=1+1" }], columns);
    expect(csv).toContain("'=1+1");
  });
});

describe("commentRows", () => {
  const comment = {
    id: "c1",
    page: "/pricing",
    author: "Ana Pérez",
    authorId: "u_42",
    text: "The header wraps",
    status: "resolved",
    type: "bug",
    priority: "high",
    tags: ["mobile", "header"],
    createdAt: "2026-08-18T10:00:00.000Z",
    resolvedAt: "2026-08-18T12:00:00.000Z",
    replies: [{ id: "r1" }],
    contextScreenshot: "data:image/jpeg;base64,AAAA",
    screenshots: ["data:image/png;base64,BBBB"],
    history: [
      {
        type: "created",
        at: "2026-08-18T10:00:00.000Z",
        actor: { name: "Ana" },
      },
      {
        type: "status",
        at: "2026-08-18T12:00:00.000Z",
        actor: { name: "Ana" },
        from: "open",
        to: "resolved",
      },
    ],
  };

  it("flattens one comment to one row", () => {
    const [row] = commentRows([comment]);

    expect(row.id).toBe("c1");
    expect(row.author).toBe("Ana Pérez");
    expect(row.authorId).toBe("u_42");
    expect(row.status).toBe("resolved");
    expect(row.replies).toBe(1);
  });

  it("joins tags into one field so the row shape stays fixed", () => {
    expect(commentRows([comment])[0].tags).toBe("mobile header");
  });

  it("carries the resolution time in hours, which is what a report reads", () => {
    expect(commentRows([comment])[0].resolutionHours).toBe(2);
  });

  it("keeps every data URL out — a 33 KB base64 in a cell is not data", () => {
    const csv = toCsv(commentRows([comment]), [{ key: "id", label: "ID" }]);
    expect(csv).not.toContain("base64");
    expect(JSON.stringify(commentRows([comment]))).not.toContain("base64");
  });
});

describe("metricRows", () => {
  it("writes one long-format row per bucket", () => {
    const metrics = computeMetrics([
      {
        id: "a",
        status: "open",
        type: "bug",
        priority: null,
        createdAt: "2026-08-18T10:00:00.000Z",
      },
    ]);
    const rows = metricRows(metrics);

    expect(rows).toContainEqual({ section: "total", key: "", value: 1 });
    expect(rows).toContainEqual({ section: "status", key: "open", value: 1 });
    expect(rows).toContainEqual({ section: "type", key: "bug", value: 1 });
    expect(rows).toContainEqual({
      section: "priority",
      key: "unset",
      value: 1,
    });
    expect(rows).toContainEqual({
      section: "perDay",
      key: "2026-08-18",
      value: 1,
    });
  });

  it("uses stable keys rather than translated labels", () => {
    // The file is an interchange format: a column that changes spelling with
    // the widget's locale cannot be joined against anything.
    const rows = metricRows(computeMetrics([]));
    expect(rows.every((row) => /^[a-zA-Z]+$/.test(row.section))).toBe(true);
  });
});

describe("downloadCsv", () => {
  afterEach(() => vi.restoreAllMocks());

  const stubObjectUrl = () => {
    const created = [];
    URL.createObjectURL = vi.fn((blob) => {
      created.push(blob);
      return "blob:stub";
    });
    URL.revokeObjectURL = vi.fn();
    return created;
  };

  it("hands the browser a file named as asked", () => {
    stubObjectUrl();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    downloadCsv("metrics.csv", "a,b");

    expect(click).toHaveBeenCalledOnce();
    expect(click.mock.instances[0].download).toBe("metrics.csv");
  });

  it("leads with a BOM, or Excel renders every accent as mojibake", async () => {
    const created = stubObjectUrl();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadCsv("metrics.csv", "Ana Pérez");

    // Blob.text() runs a UTF-8 decode, which strips a leading BOM by spec —
    // so the assertion has to look at the bytes themselves.
    const bytes = new Uint8Array(await created[0].arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("releases the object URL, so a long session does not leak blobs", () => {
    stubObjectUrl();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadCsv("metrics.csv", "a,b");

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:stub");
  });
});
