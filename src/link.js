// Deep links to a single comment.
//
// There is no redirect hop here on purpose. Hosted tools can afford one
// because their back end knows which deployment a thread belongs to and has
// to resolve that before it can send you anywhere. HellDots has no server:
// the page a comment lives on is already recorded on the comment, so the
// link can point straight at its final destination.

export const DEFAULT_LINK_PARAM = "helldotsComment";

/**
 * The shareable URL for one comment.
 *
 * For a comment on the page the user is currently looking at, this keeps the
 * rest of the current URL — query and hash included. That matters more than
 * it looks: a comment left on `/products?filter=archived` is *about* that
 * filtered view, and a link that drops the filter lands the reader somewhere
 * the comment does not make sense. For other pages only `comment.page` is
 * known (it stores `location.pathname`), so that is all the link can carry.
 *
 * @param {{ id: import('./index.d.ts').CommentId, page?: string }} comment
 * @param {string} [param]
 * @param {string} [href] current document URL; injectable for tests
 * @returns {string}
 */
export const buildCommentLink = (
  comment,
  param = DEFAULT_LINK_PARAM,
  href = location.href
) => {
  const current = new URL(href);
  const page = comment.page || current.pathname;
  const url = page === current.pathname ? current : new URL(page, current);
  url.searchParams.set(param, String(comment.id));
  return url.href;
};

/**
 * The comment id requested by the current URL, if any.
 * @param {string} [param]
 * @param {string} [href]
 * @returns {string | null}
 */
export const readCommentLinkParam = (
  param = DEFAULT_LINK_PARAM,
  href = location.href
) => {
  try {
    return new URL(href).searchParams.get(param);
  } catch {
    // A malformed URL is not worth breaking startup over — the widget just
    // opens without honouring a link it could not read.
    return null;
  }
};
