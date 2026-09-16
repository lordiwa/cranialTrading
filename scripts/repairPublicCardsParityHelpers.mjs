/**
 * Pure, side-effect-free logic for scripts/repair-public-cards-parity.mjs
 * (TASK-290). Extracted so it can be unit-tested directly (same pattern as
 * scripts/backfillCardChunkIdHelpers.mjs and scripts/usernameMigration.mjs)
 * without touching Firestore.
 *
 * TASK-290 context: dev's root `public_cards` collection had drifted to 400
 * documents while the seller (`qa_mtg`) had 2,202 cards with
 * status=sale/trade AND public=true — the nightly E2E sensor
 * (`user-profile.spec.ts`, floor of 1000) requires it back above parity.
 */

/**
 * The write-gate predicate for public_cards — MUST mirror `isPublicCard` in
 * src/services/publicCards.ts (module-private there, TASK-085's sale/trade
 * whitelist + strict `public === true`, deliberately NOT a 'collection'
 * blacklist — see that function's own doc comment for why). Duplicated here
 * rather than exported from publicCards.ts because that module's only
 * production callers need the LOOK-gate (`isPossiblyPublicCard`), not this
 * WRITE-gate, and exporting a second predicate nobody else needs would be
 * exactly the kind of unused surface Rule 2/minimalism argues against. If
 * `isPublicCard`'s logic in publicCards.ts ever changes, this copy must
 * change with it.
 */
export function isEligibleForPublicCards(card) {
  return (card.status === 'sale' || card.status === 'trade') && card.public === true;
}

/**
 * Document id public_cards uses for a given seller/card pair — MUST match
 * syncCardToPublic / batchSyncCardsToPublic / syncAllUserCards in
 * src/services/publicCards.ts exactly, or re-seeding duplicates documents
 * instead of upserting them (the one thing that would make this script NOT
 * idempotent).
 */
export function computePublicCardId(userId, cardId) {
  if (!userId || !cardId) {
    throw new Error(`computePublicCardId: userId and cardId must both be non-empty, got userId=${JSON.stringify(userId)} cardId=${JSON.stringify(cardId)}`);
  }
  return `${userId}_${cardId}`;
}

/**
 * Diff between the public_cards documents that SHOULD exist for a seller
 * (derived from their currently-eligible cards) and the ones that actually
 * do. `toCreate` is reported for operability (how many were actually
 * missing vs. merely refreshed); the caller still upserts every expected id
 * unconditionally (not just `toCreate`) so a card whose content drifted
 * (price, condition, ...) is repaired too, not just a card that's fully
 * missing. `toDelete` is the orphan list — the caller MUST actually delete
 * these, or a card that stopped being eligible (sold, made private, deleted)
 * leaves a stale ghost document behind.
 */
export function diffPublicCardIds(expectedIds, existingIds) {
  const expectedSet = new Set(expectedIds);
  const existingSet = new Set(existingIds);
  const toCreate = [...expectedSet].filter((id) => !existingSet.has(id)).sort();
  const toDelete = [...existingSet].filter((id) => !expectedSet.has(id)).sort();
  return { toCreate, toDelete };
}

/**
 * Guard against the measured Firestore-vs-mock divergence (this project,
 * 2026-08-27): a mock Firestore silently accepts `undefined` in a
 * batch.set()/setDoc() payload where the REAL Firestore SDK rejects the
 * whole write. `buildPublicCardDoc` is written to never produce `undefined`
 * (every optional field defaults to '' / null / false), but this script
 * writes through firebase-admin directly rather than the client SDK path
 * that function was designed for — this is the candado that catches a
 * silent regression in that assumption before a real `batch.commit()` finds
 * out the hard way (and takes the REST of that same batch down with it).
 *
 * @param {Record<string, unknown>} doc
 * @param {string} [docId] included in the thrown message for operability
 * @throws {Error} if any own-enumerable field is `undefined`
 */
export function assertNoUndefinedFields(doc, docId = '(unknown id)') {
  const undefinedFields = Object.keys(doc).filter((key) => doc[key] === undefined);
  if (undefinedFields.length > 0) {
    throw new Error(
      `assertNoUndefinedFields: public_cards doc ${docId} has undefined field(s) [${undefinedFields.join(', ')}] — ` +
      'a real Firestore batch.commit() rejects the WHOLE batch on this, unlike this project\'s vitest mocks.'
    );
  }
  return doc;
}

/**
 * `buildPublicCardDoc` (src/services/publicCards.ts) stamps `updatedAt`
 * with the CLIENT SDK's `Timestamp.now()` (from `firebase/firestore`).
 * firebase-admin's Firestore refuses to write that class instance directly
 * — MEASURED: "Detected an object of type \"Timestamp\" that doesn't match
 * the expected instance ... Please ensure that the Firestore types you are
 * using are from the same NPM package." Converting to a plain `Date` via
 * `.toDate()` is the value both the client and admin SDKs accept and
 * round-trip identically (admin re-encodes any `Date` as its own
 * `Timestamp` on write).
 *
 * @param {{ toDate: () => Date }} clientTimestamp
 */
export function toAdminWritableDate(clientTimestamp) {
  if (!clientTimestamp || typeof clientTimestamp.toDate !== 'function') {
    throw new Error(`toAdminWritableDate: expected a client Timestamp-shaped value with .toDate(), got ${JSON.stringify(clientTimestamp)}`);
  }
  return clientTimestamp.toDate();
}

/** Split a list into fixed-size chunks — Firestore batches cap at 500 ops. */
export function chunkList(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
