// The single source of ids for comments and replies.
//
// This used to be `Date.now()`, which is not an id — it is a timestamp that
// usually happens not to repeat. Two things it was already breaking:
// `mergeForStorage` deduplicates by id, and every lookup is a `find()` that
// returns the first match, so a collision means one comment silently
// overwrites another. Two people commenting on the same millisecond from
// different machines, or any programmatic import, is enough to hit it.
//
// nanoid gives ~126 bits from a 64-symbol URL-safe alphabet in 21 chars —
// stronger than a UUIDv4's 122 bits, and short enough to sit in the
// `?helldotsComment=` link without looking like a mistake. It reads its
// randomness from `crypto.getRandomValues`, which — unlike
// `crypto.randomUUID` — is NOT restricted to secure contexts, so a widget
// dropped into a dev server on plain http://192.168.x.x still works.
//
// It is a devDependency bundled into both artifacts rather than a runtime
// dependency: nanoid 6 requires Node 22+, and this package promises >=18.
// Bundling keeps that promise honest for hosts importing us under SSR, and
// costs ~516 B gzip against a 50 KB budget.
import { nanoid } from "nanoid";

/**
 * @returns {string} a fresh id for a comment or a reply
 */
export const createId = () => nanoid();
