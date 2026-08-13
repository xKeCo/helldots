import { describe, it, expect } from "vitest";
import {
  buildCommentLink,
  readCommentLinkParam,
  DEFAULT_LINK_PARAM,
} from "../src/link.js";

const HERE = "https://app.test/products?filter=archived#reviews";

describe("buildCommentLink", () => {
  it("points at the comment's own page with its id attached", () => {
    const link = buildCommentLink(
      { id: "V1StGXR8_Z5jdHi6B-myT", page: "/pricing" },
      DEFAULT_LINK_PARAM,
      HERE
    );
    expect(link).toBe(
      "https://app.test/pricing?helldotsComment=V1StGXR8_Z5jdHi6B-myT"
    );
  });

  it("keeps the query and hash of the page the reader is already on", () => {
    // A comment left on a filtered view is *about* that view. Dropping the
    // filter lands the reader somewhere the comment does not make sense.
    const link = buildCommentLink(
      { id: "abc", page: "/products" },
      undefined,
      HERE
    );
    expect(link).toBe(
      "https://app.test/products?filter=archived&helldotsComment=abc#reviews"
    );
  });

  it("honours a host-supplied parameter name", () => {
    const link = buildCommentLink({ id: "abc", page: "/pricing" }, "c", HERE);
    expect(link).toBe("https://app.test/pricing?c=abc");
  });

  it("replaces an id already in the URL rather than appending a second one", () => {
    const link = buildCommentLink(
      { id: "second", page: "/products" },
      DEFAULT_LINK_PARAM,
      "https://app.test/products?helldotsComment=first"
    );
    expect(link).toBe("https://app.test/products?helldotsComment=second");
  });

  it("survives a numeric id from a comment created before nanoid", () => {
    const link = buildCommentLink(
      { id: 1754923847123, page: "/pricing" },
      DEFAULT_LINK_PARAM,
      HERE
    );
    expect(link).toBe("https://app.test/pricing?helldotsComment=1754923847123");
  });
});

describe("readCommentLinkParam", () => {
  it("reads the id back out of a link", () => {
    expect(
      readCommentLinkParam(
        DEFAULT_LINK_PARAM,
        "https://app.test/pricing?helldotsComment=abc"
      )
    ).toBe("abc");
  });

  it("returns null when the parameter is absent", () => {
    expect(readCommentLinkParam(DEFAULT_LINK_PARAM, HERE)).toBeNull();
  });

  it("returns null instead of throwing on a URL it cannot parse", () => {
    // Not worth breaking startup over: the widget just opens without
    // honouring a link it could not read.
    expect(readCommentLinkParam(DEFAULT_LINK_PARAM, "not a url")).toBeNull();
  });
});
