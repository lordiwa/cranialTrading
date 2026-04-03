#!/usr/bin/env node
/**
 * populateScryfallCache.cjs
 *
 * One-time (or re-runnable) admin script that downloads Scryfall's bulk data
 * and writes every card to the Firestore `scryfall_cache` collection.
 *
 * Usage:
 *   # From functions/ directory:
 *   node populateScryfallCache.cjs --project cranial-trading-dev
 *   node populateScryfallCache.cjs --project cranial-trading-dev --type all-cards
 *
 * Defaults to `default-cards` (~90k printings, ~150MB). Use `all-cards` for
 * full coverage (~350k printings, ~1.5GB) — requires more time and memory.
 *
 * Idempotent: re-running overwrites existing docs with fresh data (merge: true).
 */

const admin = require('firebase-admin');

// ── Config ──────────────────────────────────────────────────────────────────────

const COLLECTION = 'scryfall_cache';
const BATCH_SIZE = 500;
const SCRYFALL_BULK_API = 'https://api.scryfall.com/bulk-data';

// Fields we store in the cache (matches what the app needs for Card hydration)
const CACHE_FIELDS = [
  'name', 'set', 'set_name', 'collector_number', 'rarity', 'type_line',
  'mana_cost', 'cmc', 'colors', 'color_identity', 'power', 'toughness',
  'image_uris', 'card_faces', 'oracle_text', 'keywords', 'legalities',
  'full_art', 'produced_mana', 'prices',
];

// ── Helpers ─────────────────────────────────────────────────────────────────────

function pickFields(card) {
  const result = {};
  for (const field of CACHE_FIELDS) {
    if (card[field] !== undefined && card[field] !== null) {
      result[field] = card[field];
    }
  }
  return result;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let project = null;
  let bulkType = 'default_cards';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' && args[i + 1]) {
      project = args[++i];
    } else if (args[i] === '--type' && args[i + 1]) {
      bulkType = args[++i].replace('-', '_');
    }
  }

  return { project, bulkType };
}

// ── Main ────────────────────────────────────────────────────────────────────────

async function main() {
  const { project, bulkType } = parseArgs();

  // Initialize Firebase Admin
  const initOptions = {};
  if (project) initOptions.projectId = project;
  admin.initializeApp(initOptions);
  const db = admin.firestore();

  console.log(`\n=== Scryfall Cache Population ===`);
  console.log(`Bulk type: ${bulkType}`);
  console.log(`Project:   ${project || '(default)'}\n`);

  // Step 1: Get the download URI from Scryfall's bulk-data API
  console.log('Fetching bulk data catalog from Scryfall...');
  const catalogResponse = await fetch(SCRYFALL_BULK_API);
  if (!catalogResponse.ok) {
    throw new Error(`Scryfall bulk-data API error: ${catalogResponse.status}`);
  }
  const catalog = await catalogResponse.json();
  const entry = catalog.data.find(d => d.type === bulkType);
  if (!entry) {
    throw new Error(`Bulk type "${bulkType}" not found. Available: ${catalog.data.map(d => d.type).join(', ')}`);
  }

  console.log(`Download URI: ${entry.download_uri}`);
  console.log(`Updated at:   ${entry.updated_at}`);
  console.log(`Size:         ~${Math.round(entry.size / 1024 / 1024)}MB\n`);

  // Step 2: Download and parse JSON
  console.log('Downloading bulk data (this may take a minute)...');
  const downloadResponse = await fetch(entry.download_uri);
  if (!downloadResponse.ok) {
    throw new Error(`Download failed: ${downloadResponse.status}`);
  }

  const allCards = await downloadResponse.json();
  console.log(`Downloaded ${allCards.length} cards. Writing to Firestore...\n`);

  // Step 3: Write to Firestore in batches
  let totalWritten = 0;
  let batch = db.batch();
  let batchCount = 0;
  let batchNumber = 0;
  const startTime = Date.now();

  for (const card of allCards) {
    if (!card.id) continue;

    const ref = db.collection(COLLECTION).doc(card.id);
    const now = admin.firestore.Timestamp.now();
    const data = {
      ...pickFields(card),
      _cachedAt: now,
      _metadataUpdatedAt: now,
      _pricesUpdatedAt: now,
    };

    batch.set(ref, data, { merge: true });
    batchCount++;

    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      batchNumber++;
      totalWritten += batchCount;
      batchCount = 0;
      batch = db.batch();

      if (batchNumber % 20 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const rate = Math.round(totalWritten / (elapsed || 1));
        console.log(`  [${elapsed}s] ${totalWritten}/${allCards.length} cards written (${rate}/s)`);
      }
    }
  }

  // Flush remaining
  if (batchCount > 0) {
    await batch.commit();
    totalWritten += batchCount;
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== Done ===`);
  console.log(`Processed: ${allCards.length} cards`);
  console.log(`Written:   ${totalWritten} docs to ${COLLECTION}`);
  console.log(`Time:      ${elapsed}s`);
  console.log(`Rate:      ${Math.round(totalWritten / (elapsed || 1))}/s\n`);

  process.exit(0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
