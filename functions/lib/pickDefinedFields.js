/**
 * pickDefinedFields — TASK-286 REABIERTO (2026-08-26).
 *
 * MEASURED against the deployed dev function 2026-08-26T23:41:26Z: a bare
 * card with no type_line/colors/rarity/cmc/_cacheFields (the exact
 * old-client scenario TASK-286 exists to cover) crashed bulkImportCards
 * entirely —
 *
 *   Error: Value for argument "data" is not a valid Firestore document.
 *   Cannot use "undefined" as a Firestore value (found in field "power").
 *   at WriteBatch.set (write-batch.js:263)
 *
 * — for Lightning Bolt, an instant with no power/toughness.
 *
 * CAUSE: mergeScryfallMetadata (cardIndexEntry.js) merges fields with
 * `||`/`??` fallbacks — `power: data.power || cache.power`. When BOTH
 * sides lack a field (any non-creature has no power/toughness; most cards
 * have no produced_mana; some layouts — transform, modal_dfc — have no
 * top-level colors/type_line; an OLD scryfall_cache doc predating a field
 * addition could lack cmc/rarity/full_art/keywords/legalities), the merge
 * still ASSIGNS that key — `power: undefined` — because a JS object
 * literal creates the property even when its value is undefined. Not one
 * field, a whole family: every field mergeScryfallMetadata fills via
 * `||`/`??` can come out this way once the source data doesn't have it.
 * USER_CARD_FIELDS then lets that key straight through into the
 * batch.set() payload, and Firestore rejects the WHOLE write — not just
 * that one field — for any card in the batch that has it.
 *
 * mergeScryfallMetadata itself is NOT changed: buildCardIndex (its other
 * caller) never Firestore-writes its output directly, so the same
 * undefined is harmless there — changing its semantics would be scope and
 * risk this ticket doesn't need. The fix lives at THIS write boundary
 * instead: build the payload with only keys that are both allowed AND
 * actually have a value.
 *
 * Dependency-free so it executes under vitest with no firebase-admin and
 * no mocked Firestore — mocks accept `undefined` without complaint, which
 * is exactly why the original TASK-286 tests didn't catch this (they
 * mocked Firestore; the client's own confirmImport path never hit it
 * because it runs everything through stripUndefined before calling
 * bulkImportCards, and bulkImportCards had no equivalent step).
 *
 * @param {object} source - card fields (already destructured of id/
 *   createdAt/updatedAt/_cacheFields by the caller)
 * @param {Set<string>} allowedKeys - USER_CARD_FIELDS
 * @returns {object} only the allowed keys whose value is not undefined
 */
function pickDefinedFields(source, allowedKeys) {
  const result = {};
  for (const [key, value] of Object.entries(source)) {
    if (allowedKeys.has(key) && value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

module.exports = { pickDefinedFields };
