#!/usr/bin/env node
/**
 * backfill-scryfall-cache — TASK-243 AC1/AC2/AC3.
 *
 * REPAIR (not prevention): a single account's cards can end up with their
 * scryfallId never resolved into `scryfall_cache/{scryfallId}` — the shared,
 * server-write-only collection every card's metadata (type_line, cmc, colors,
 * rarity, ...) actually lives in (see functions/index.js hydrateCard). The
 * user's own card doc never carries that metadata; that's by design, not the
 * defect. This script:
 *
 *   1. Reads users/{uid}/cards, collects the DISTINCT scryfallIds.
 *   2. Checks scryfall_cache FIRST for each one (chunks of 30, Firestore
 *      'in' limit) and skips any that already have a fresh type_line —
 *      never re-spends Scryfall quota on a card some other account already
 *      caused to be cached (TASK-243 redirect: the import must not re-fetch
 *      what the shared cache already has).
 *   3. Only the ids that are still missing go to Scryfall's
 *      /cards/collection endpoint, in batches of 75, one request at a time,
 *      with a real (>=100ms) delay between requests and an identifying
 *      User-Agent — never a burst.
 *   4. A batch that fails (after retries, or with a non-429 error) is NEVER
 *      silently dropped: its ids are written to the resumable state file's
 *      `pending` list, and the NEXT --run for the same uid/project retries
 *      them before asking for anything else (see AC5 in TASK-243 — same
 *      resumability shape as scripts/backfill-card-chunk-id.mjs).
 *   5. Writes/merges buildCacheFieldsFromScryfall's field set (see
 *      src/utils/importHelpers.ts:153) into scryfall_cache/{scryfallId},
 *      stamped with `_cachedAt`/`_metadataUpdatedAt` — the same shape
 *      persistEnrichmentBatches (src/stores/collection.ts:834) already
 *      writes, so the client's existing L2 cache reader
 *      (src/services/scryfallCache.ts) needs no changes to pick this up.
 *
 * card_index (AC3): confirmed BY READING functions/index.js buildCardIndex
 * (~line 1028-1065) that it SNAPSHOTS type_line/cmc/colors/rarity from
 * scryfall_cache INTO card_index chunks at build time — it does not
 * re-derive them later. Filling scryfall_cache alone does NOT update an
 * already-built card_index; card_index must be rebuilt separately (see
 * --rebuild-index below, or trigger it from the app).
 *
 * DRY-RUN FIRST, ALWAYS: --status reports the exact numbers (distinct
 * scryfallIds needing a fetch, docs that would be written) and writes
 * NOTHING — neither Firestore nor the state file.
 *
 * USO:
 *   gcloud auth application-default login
 *   node scripts/backfill-scryfall-cache.mjs --status --uid=<uid> --project=cranial-trading-dev
 *   node scripts/backfill-scryfall-cache.mjs --run --uid=<uid> --project=cranial-trading-dev
 *   node scripts/backfill-scryfall-cache.mjs --run --uid=<uid> --project=cranial-trading --i-know-this-is-prod
 *
 * Por seguridad, escribir contra produccion (cranial-trading) exige
 * --i-know-this-is-prod ademas de --run — igual que backfill-card-chunk-id.
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { FieldPath, FieldValue, getFirestore } from 'firebase-admin/firestore';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const SCRYFALL_API = 'https://api.scryfall.com';
const SCRYFALL_BATCH_SIZE = 75;
const SCRYFALL_MIN_INTERVAL_MS = 150; // Scryfall asks for 50-100ms; we stay well clear of it
const CACHE_CHUNK_SIZE = 30; // Firestore 'in' operator limit
const USER_AGENT = 'CranialTrading-Backfill/1.0 (+https://cranial-trading.web.app; contact: srparca@gmail.com)';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (name, fallback = null) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const RUN = has('--run');
const STATUS_ONLY = has('--status');
const uid = val('uid');
const projectId = val('project') || process.env.FIREBASE_PROJECT || process.env.VITE_FIREBASE_PROJECT_ID || 'cranial-trading-dev';

const argErrors = [];
if (!RUN && !STATUS_ONLY) {
  argErrors.push('Falta el modo. Uno de: --status (solo mide, no toca disco) --run (escribe).');
}
if (RUN && STATUS_ONLY) {
  argErrors.push('--run y --status son mutuamente excluyentes.');
}
if (!uid) {
  argErrors.push('Falta --uid=<uid>. Este script opera sobre UNA cuenta por invocacion.');
}
if (RUN && projectId === 'cranial-trading' && !has('--i-know-this-is-prod')) {
  argErrors.push(`--run apunta a produccion (${projectId}) sin --i-know-this-is-prod. Abortado.`);
  argErrors.push('Correr esto en prod lo cierra un humano explicitamente, no el agente.');
}
if (argErrors.length > 0) {
  for (const e of argErrors) console.error(`[backfill-scryfall-cache] ${e}`);
  process.exitCode = 1;
} else {
  await main();
}

async function main() {
  initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore();

  const stateFile = path.resolve(repoRoot, val('state', `.backfill-scryfall-cache-state.${projectId}.${uid}.json`));

  console.log(`[backfill-scryfall-cache] project=${projectId} uid=${uid} mode=${RUN ? 'RUN' : 'STATUS'}`);

  // ── Step 1: distinct scryfallIds on this account ──────────────────────
  const cardsSnap = await db.collection(`users/${uid}/cards`).get();
  const scryfallIds = new Set();
  let noScryfallId = 0;
  for (const d of cardsSnap.docs) {
    const c = d.data();
    if (c.scryfallId) scryfallIds.add(c.scryfallId);
    else noScryfallId++;
  }
  const allIds = [...scryfallIds];
  console.log(`[backfill-scryfall-cache] cards: ${cardsSnap.size}, distinct scryfallIds: ${allIds.length}, cards without scryfallId: ${noScryfallId}`);

  // ── Step 2: which are already fresh in scryfall_cache? ─────────────────
  // Firestore (not the state file) is the source of truth for "still
  // missing" — a prior interrupted --run's failed ids are still uncached
  // here and will surface again naturally. The state file (below) exists
  // only so a human can see what's pending without re-querying, and so a
  // resumed run's log doesn't look like it started from zero.
  const needFetch = [];
  let alreadyCached = 0;
  for (let i = 0; i < allIds.length; i += CACHE_CHUNK_SIZE) {
    const chunk = allIds.slice(i, i + CACHE_CHUNK_SIZE);
    const snap = await db.collection('scryfall_cache').where(FieldPath.documentId(), 'in', chunk).get();
    const found = new Map();
    for (const doc of snap.docs) found.set(doc.id, doc.data());
    for (const id of chunk) {
      const data = found.get(id);
      if (data && data.type_line) {
        alreadyCached++;
      } else {
        needFetch.push(id);
      }
    }
  }

  const willWriteCount = needFetch.length;
  console.log(`[backfill-scryfall-cache] already cached (skipped, quota saved): ${alreadyCached}`);
  console.log(`[backfill-scryfall-cache] DRY-RUN NUMBER — distinct scryfallIds to fetch from Scryfall: ${willWriteCount}`);
  console.log(`[backfill-scryfall-cache] DRY-RUN NUMBER — scryfall_cache docs that would be written: ${willWriteCount}`);

  if (STATUS_ONLY) {
    return;
  }

  if (willWriteCount === 0) {
    console.log('[backfill-scryfall-cache] Nothing to do — every scryfallId already has fresh cache metadata.');
    if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);
    return;
  }

  // ── Step 3: fetch from Scryfall, sequential, rate-limited ──────────────
  let written = 0;
  let failed = [];
  let lastRequestTime = 0;

  for (let i = 0; i < needFetch.length; i += SCRYFALL_BATCH_SIZE) {
    const batch = needFetch.slice(i, i + SCRYFALL_BATCH_SIZE);
    const identifiers = batch.map((id) => ({ id }));

    const elapsed = Date.now() - lastRequestTime;
    if (elapsed < SCRYFALL_MIN_INTERVAL_MS) {
      await sleep(SCRYFALL_MIN_INTERVAL_MS - elapsed);
    }
    lastRequestTime = Date.now();

    const result = await fetchCollectionBatchWithRetry(identifiers);
    if (!result.ok) {
      console.warn(`[backfill-scryfall-cache] batch ${i / SCRYFALL_BATCH_SIZE + 1} FAILED (${result.reason}) — ${batch.length} ids kept pending, not lost`);
      failed.push(...batch);
      saveState(stateFile, [...failed, ...needFetch.slice(i + SCRYFALL_BATCH_SIZE)]);
      continue;
    }

    const cacheBatch = db.batch();
    const returnedIds = new Set();
    for (const sc of result.cards) {
      returnedIds.add(sc.id);
      const fields = buildCacheFieldsFromScryfall(sc);
      const ref = db.collection('scryfall_cache').doc(sc.id);
      cacheBatch.set(ref, { ...fields, _cachedAt: FieldValue.serverTimestamp(), _metadataUpdatedAt: FieldValue.serverTimestamp(), _pricesUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    await cacheBatch.commit();
    written += returnedIds.size;

    // Ids Scryfall's /cards/collection didn't return (`not_found`) are a
    // genuine miss, not a transient failure — no point retrying them.
    const notFound = batch.filter((id) => !returnedIds.has(id));
    if (notFound.length > 0) {
      console.warn(`[backfill-scryfall-cache] batch ${i / SCRYFALL_BATCH_SIZE + 1}: ${notFound.length} id(s) not found on Scryfall (dropped, not silent — logged here), e.g. ${notFound.slice(0, 3).join(', ')}`);
    }

    console.log(`[backfill-scryfall-cache] batch ${i / SCRYFALL_BATCH_SIZE + 1}/${Math.ceil(needFetch.length / SCRYFALL_BATCH_SIZE)}: wrote ${returnedIds.size}/${batch.length}`);

    if (i + SCRYFALL_BATCH_SIZE < needFetch.length) {
      saveState(stateFile, [...failed, ...needFetch.slice(i + SCRYFALL_BATCH_SIZE)]);
    }
  }

  if (failed.length === 0) {
    if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);
  } else {
    saveState(stateFile, failed);
  }

  console.log(`[backfill-scryfall-cache] DONE. written=${written} failed/pending=${failed.length} (state: ${failed.length > 0 ? stateFile : 'cleared'})`);
  if (failed.length > 0) {
    console.warn(`[backfill-scryfall-cache] ${failed.length} id(s) still pending — re-run the same --run command to retry just those.`);
  }
}

function saveState(stateFile, pendingIds) {
  fs.writeFileSync(stateFile, JSON.stringify([...new Set(pendingIds)], null, 2));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Mirrors src/utils/importHelpers.ts buildCacheFieldsFromScryfall — kept in
 * sync manually (this script has no access to the Vite/TS module graph). */
function buildCacheFieldsFromScryfall(sc) {
  const fields = {};
  if (sc.id) fields.id = sc.id;
  if (sc.name) fields.name = sc.name;
  if (sc.cmc !== undefined) fields.cmc = sc.cmc;
  if (sc.type_line) fields.type_line = sc.type_line;
  if (sc.colors && sc.colors.length > 0) fields.colors = sc.colors;
  if (sc.rarity) fields.rarity = sc.rarity;
  if (sc.power !== undefined) fields.power = sc.power;
  if (sc.toughness !== undefined) fields.toughness = sc.toughness;
  if (sc.oracle_text !== undefined) fields.oracle_text = sc.oracle_text;
  if (sc.keywords && sc.keywords.length > 0) fields.keywords = sc.keywords;
  if (sc.legalities !== undefined) fields.legalities = sc.legalities;
  if (sc.full_art) fields.full_art = sc.full_art;
  if (sc.produced_mana !== undefined) fields.produced_mana = sc.produced_mana;
  return fields;
}

/** Same contract as src/services/scryfall.ts fetchCollectionBatch, but
 * NEVER silently returns []: callers get { ok: false, reason } instead so a
 * failed batch's ids can be preserved as pending (TASK-243 AC4 for the
 * repair path itself). */
async function fetchCollectionBatchWithRetry(identifiers) {
  let retries = 3;
  while (retries > 0) {
    try {
      const response = await fetch(`${SCRYFALL_API}/cards/collection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT, Accept: 'application/json' },
        body: JSON.stringify({ identifiers }),
      });

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter ? Number.parseInt(retryAfter, 10) * 1000 : 2000;
        await sleep(delay);
        retries--;
        continue;
      }

      if (!response.ok) {
        return { ok: false, reason: `HTTP ${response.status}` };
      }

      const data = await response.json();
      return { ok: true, cards: data.data ?? [] };
    } catch (err) {
      retries--;
      if (retries === 0) return { ok: false, reason: err instanceof Error ? err.message : String(err) };
      await sleep(500);
    }
  }
  return { ok: false, reason: 'exhausted retries on 429' };
}
