/**
 * Cloud Functions for Cranial Trading
 *
 * Functions:
 * - moxfieldDeck: Proxy for Moxfield API (CORS bypass)
 * - notifyMatchUser: Cross-user match notification (bypasses security rules)
 * - bulkImportCards: Server-side bulk card import (bypasses browser write stream limit)
 * - loadCollectionChunk: Server-side paginated card read (100k cards in ~20s vs 2+ min from browser)
 * - refreshScryfallCache: Weekly scheduled bulk population of scryfall_cache from Scryfall bulk data
 * - populateScryfallCacheManual: HTTP trigger for manual/initial cache population
 * - buildCardIndex: Builds lightweight card index for fast filtering & pagination
 * - loadCardPage: Fetches full card objects by IDs with scryfall_cache join
 */

const {setGlobalOptions} = require("firebase-functions");
const {onRequest, onCall, HttpsError} = require("firebase-functions/https");
const {onSchedule} = require("firebase-functions/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const cheerio = require("cheerio");
const { parseImagePath, storagePath: cardImageStoragePath, scryfallUrl: cardImageScryfallUrl, createThrottle } = require("./lib/cardImage");
const { mapWithConcurrency } = require("./lib/concurrency");
// TASK-245: single definition of a card_index entry (and of the
// scryfall_cache join that feeds it), shared by buildCardIndex and
// applyCardIndexDelta — the two used to disagree, which is what blanked
// type_line/cmc/colors/rarity on every status change.
const { isDualFaced, buildIndexEntry } = require("./lib/cardIndexEntry");

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

// Proxy para Moxfield API (evita CORS y Cloudflare)
exports.moxfieldDeck = onRequest({ cors: true }, async (request, response) => {
  const deckId = request.query.id || request.path.split('/').pop();

  if (!deckId || !/^[a-zA-Z0-9_-]+$/.test(deckId)) {
    response.status(400).json({ error: 'Invalid deck ID' });
    return;
  }

  try {
    const moxfieldResponse = await fetch(`https://api2.moxfield.com/v3/decks/all/${deckId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      }
    });

    if (!moxfieldResponse.ok) {
      logger.warn(`Moxfield returned ${moxfieldResponse.status} for deck ${deckId}`);
      response.status(moxfieldResponse.status).json({
        error: `Moxfield error: ${moxfieldResponse.status}`
      });
      return;
    }

    const data = await moxfieldResponse.json();
    response.json(data);
  } catch (error) {
    logger.error('Moxfield proxy error:', error);
    response.status(500).json({ error: 'Failed to fetch deck' });
  }
});

/**
 * notifyMatchUser - Creates a match notification in another user's collection
 *
 * This function bypasses Firestore security rules to allow cross-user writes.
 * It's called when User A finds a match with User B, so User B gets notified.
 *
 * Required auth: User must be authenticated
 *
 * @param {Object} data - Match notification data
 * @param {string} data.targetUserId - The user ID to notify
 * @param {string} data.matchId - Unique match identifier
 * @param {string} data.fromUserId - The sender's user ID
 * @param {string} data.fromUsername - The sender's username
 * @param {string} data.fromLocation - The sender's location (optional)
 * @param {Array} data.myCards - Cards the sender offers
 * @param {Array} data.otherCards - Cards the sender wants
 * @param {number} data.compatibility - Match compatibility percentage
 * @param {string} data.type - Match type (BIDIRECTIONAL or UNIDIRECTIONAL)
 */
exports.notifyMatchUser = onCall({ cors: true }, async (request) => {
  // Verify authentication
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const callerUid = request.auth.uid;
  const data = request.data;

  // Validate required fields
  if (!data.targetUserId || !data.matchId) {
    throw new HttpsError('invalid-argument', 'Missing required fields: targetUserId, matchId');
  }

  // Prevent self-notification
  if (data.targetUserId === callerUid) {
    throw new HttpsError('invalid-argument', 'Cannot notify yourself');
  }

  // Verify caller is the fromUserId
  if (data.fromUserId && data.fromUserId !== callerUid) {
    throw new HttpsError('permission-denied', 'fromUserId must match authenticated user');
  }

  try {
    const matchRef = db.collection('users').doc(data.targetUserId).collection('matches_nuevos');

    // Check if match notification already exists (prevent duplicates)
    const existingQuery = await matchRef
      .where('_notificationOf', '==', data.matchId)
      .limit(1)
      .get();

    if (!existingQuery.empty) {
      logger.info(`Match notification already exists for ${data.matchId}`);
      return { success: true, alreadyExists: true };
    }

    // Create the notification
    const notificationData = {
      id: `${data.targetUserId}_${callerUid}_${Date.now()}`,
      otherUserId: callerUid,
      otherUsername: data.fromUsername || 'Unknown',
      otherLocation: data.fromLocation || null,
      otherAvatarUrl: data.fromAvatarUrl || null,
      // Swap cards - what sender offers becomes what recipient receives
      myCards: data.otherCards || [],
      otherCards: data.myCards || [],
      myTotalValue: data.theirTotalValue || 0,
      theirTotalValue: data.myTotalValue || 0,
      valueDifference: -(data.valueDifference || 0),
      compatibility: data.compatibility || 0,
      type: data.type || 'UNIDIRECTIONAL',
      status: 'nuevo',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lifeExpiresAt: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + 15 * 24 * 60 * 60 * 1000) // 15 days
      ),
      _notificationOf: data.matchId, // Track original match ID
    };

    await matchRef.add(notificationData);

    logger.info(`Match notification sent from ${callerUid} to ${data.targetUserId}`);
    return { success: true };

  } catch (error) {
    logger.error('Error in notifyMatchUser:', error);
    throw new HttpsError('internal', 'Failed to create match notification');
  }
});

// ========== PLATFORM STATS ==========

/**
 * updatePlatformStats — Scheduled every 6 hours.
 * Counts users, public cards, and shared matches, writes to /platform_stats/current.
 */
exports.updatePlatformStats = onSchedule(
  { schedule: 'every 6 hours', maxInstances: 1, timeoutSeconds: 60 },
  async () => {
    logger.info('Starting updatePlatformStats...');

    try {
      const [usersSnap, publicCardsSnap, matchesSnap] = await Promise.all([
        db.collection('users').count().get(),
        db.collection('public_cards').count().get(),
        db.collection('shared_matches').count().get(),
      ]);

      const stats = {
        users: usersSnap.data().count,
        publicCards: publicCardsSnap.data().count,
        matches: matchesSnap.data().count,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await db.doc('platform_stats/current').set(stats);
      logger.info('Platform stats updated:', stats);
    } catch (err) {
      logger.error('Failed to update platform stats:', err.message);
    }
  },
);

// ========== MARKET DATA FUNCTIONS ==========

const FORMATS = ['standard', 'modern', 'pioneer', 'legacy', 'vintage', 'pauper', 'commander'];
const MTGSTOCKS_ENDPOINTS = [
  { type: 'average_regular', url: 'https://api.mtgstocks.com/interests/average/regular' },
  { type: 'average_foil', url: 'https://api.mtgstocks.com/interests/average/foil' },
  { type: 'market_regular', url: 'https://api.mtgstocks.com/interests/market/regular' },
  { type: 'market_foil', url: 'https://api.mtgstocks.com/interests/market/foil' },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Parse MTGGoldfish format-staples page for a given format.
 * Returns { overall, creatures, spells, lands } arrays.
 */
/**
 * Parse a single MTGGoldfish staples table page.
 * Works for both the summary page and /full/ pages.
 */
function parseStaplesTable($, table) {
  const cards = [];
  $(table).find('tr').each((_idx, row) => {
    const cols = $(row).find('td');
    if (cols.length === 0) return; // skip thead row

    // td[0]=rank, td[1]=card name (in <a> tag), td[2]=mana cost, td[3]=% decks, td[4]=# played
    // Lands table has no mana cost column: td[0]=rank, td[1]=name, td[2]=% decks, td[3]=# played
    const name = $(cols[1]).find('a').first().text().trim();
    const hasCostCol = cols.length >= 5;
    const pctCol = hasCostCol ? 3 : 2;
    const copiesCol = hasCostCol ? 4 : 3;

    const percentDecks = Number.parseFloat($(cols[pctCol]).text().replace('%', '').trim()) || 0;
    const avgCopies = Number.parseFloat($(cols[copiesCol]).text().trim()) || 0;

    if (name) {
      cards.push({ name, percentDecks, avgCopies, rank: cards.length + 1 });
    }
  });
  return cards;
}

async function parseFormatStaples(format) {
  const categoryKeys = ['all', 'creatures', 'spells', 'lands'];
  const categoryNames = ['overall', 'creatures', 'spells', 'lands'];
  const categories = {};

  for (let i = 0; i < categoryKeys.length; i++) {
    const url = `https://www.mtggoldfish.com/format-staples/${format}/full/${categoryKeys[i]}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
    });

    if (!res.ok) {
      logger.warn(`MTGGoldfish returned ${res.status} for ${format}/${categoryKeys[i]}`);
      categories[categoryNames[i]] = [];
      continue;
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const table = $('table.table-striped').first();
    categories[categoryNames[i]] = table.length ? parseStaplesTable($, table).slice(0, 50) : [];

    // Rate limit between requests
    if (i < categoryKeys.length - 1) await sleep(500);
  }

  return {
    overall: categories.overall || [],
    creatures: categories.creatures || [],
    spells: categories.spells || [],
    lands: categories.lands || [],
  };
}

/**
 * Fetch price movers from MTGStocks for a given endpoint.
 * Returns { winners, losers } arrays (top 50 each).
 */
async function fetchMoversFromEndpoint(endpoint) {
  const res = await fetch(endpoint.url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`MTGStocks returned ${res.status} for ${endpoint.type}`);
  }

  const data = await res.json();
  const interests = data.interests || [];

  const mapped = interests.map((item) => ({
    name: item.print?.name || 'Unknown',
    setName: item.print?.set_name || '',
    rarity: item.print?.rarity || '',
    image: item.print?.image || '',
    pastPrice: item.past_price || 0,
    presentPrice: item.present_price || 0,
    percentChange: item.percentage || 0,
    foil: !!item.foil,
  }));

  const MIN_DOLLAR_CHANGE = 1.5;

  const winners = mapped
    .filter((c) => c.percentChange > 0 && (c.presentPrice - c.pastPrice) >= MIN_DOLLAR_CHANGE)
    .sort((a, b) => b.percentChange - a.percentChange);

  const losers = mapped
    .filter((c) => c.percentChange < 0 && (c.pastPrice - c.presentPrice) >= MIN_DOLLAR_CHANGE)
    .sort((a, b) => a.percentChange - b.percentChange);

  return { winners, losers };
}

/**
 * scrapeFormatStaples — Scheduled every 12 hours.
 * Fetches format staples from MTGGoldfish and writes to Firestore.
 */
exports.scrapeFormatStaples = onSchedule(
  { schedule: 'every 12 hours', maxInstances: 1, timeoutSeconds: 300 },
  async () => {
    logger.info('Starting scrapeFormatStaples...');

    for (const format of FORMATS) {
      try {
        const categories = await parseFormatStaples(format);
        await db.doc(`market_data/staples/formats/${format}`).set({
          format,
          categories,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        logger.info(`Scraped staples for ${format}: ${categories.overall.length} overall cards`);
      } catch (err) {
        logger.error(`Failed to scrape ${format}:`, err.message);
      }

      await sleep(1000);
    }

    logger.info('scrapeFormatStaples completed.');
  },
);

/**
 * fetchPriceMovers — Scheduled every 6 hours.
 * Fetches price winners/losers from MTGStocks and writes to Firestore.
 */
exports.fetchPriceMovers = onSchedule(
  { schedule: 'every 6 hours', maxInstances: 1, timeoutSeconds: 60 },
  async () => {
    logger.info('Starting fetchPriceMovers...');

    for (const endpoint of MTGSTOCKS_ENDPOINTS) {
      try {
        const { winners, losers } = await fetchMoversFromEndpoint(endpoint);
        await db.doc(`market_data/movers/types/${endpoint.type}`).set({
          winners,
          losers,
          sourceDate: new Date().toISOString().split('T')[0],
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        logger.info(`Fetched movers for ${endpoint.type}: ${winners.length} winners, ${losers.length} losers`);
      } catch (err) {
        logger.error(`Failed to fetch ${endpoint.type}:`, err.message);
      }

      await sleep(500);
    }

    logger.info('fetchPriceMovers completed.');
  },
);

/**
 * refreshMarketData — HTTP trigger for manual refresh.
 * Query param: ?type=staples|movers|all
 */
exports.refreshMarketData = onRequest({ cors: true, maxInstances: 1, timeoutSeconds: 540 }, async (request, response) => {
  const type = request.query.type || 'all';

  try {
    if (type === 'staples' || type === 'all') {
      logger.info('Manual refresh: staples');
      for (const format of FORMATS) {
        try {
          const categories = await parseFormatStaples(format);
          await db.doc(`market_data/staples/formats/${format}`).set({
            format,
            categories,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          logger.info(`Refreshed staples for ${format}`);
        } catch (err) {
          logger.error(`Failed to refresh ${format}:`, err.message);
        }
        await sleep(1000);
      }
    }

    if (type === 'movers' || type === 'all') {
      logger.info('Manual refresh: movers');
      for (const endpoint of MTGSTOCKS_ENDPOINTS) {
        try {
          const { winners, losers } = await fetchMoversFromEndpoint(endpoint);
          await db.doc(`market_data/movers/types/${endpoint.type}`).set({
            winners,
            losers,
            sourceDate: new Date().toISOString().split('T')[0],
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          logger.info(`Refreshed movers for ${endpoint.type}`);
        } catch (err) {
          logger.error(`Failed to refresh ${endpoint.type}:`, err.message);
        }
        await sleep(500);
      }
    }

    response.json({ success: true, type, timestamp: new Date().toISOString() });
  } catch (error) {
    logger.error('refreshMarketData error:', error);
    response.status(500).json({ error: 'Failed to refresh market data' });
  }
});

// ============================================================
// BULK IMPORT CARDS
// Server-side batch writes bypass the browser SDK's write stream limit
// ============================================================
// Fields persisted on the user doc. Scryfall metadata (cmc, type_line, etc.) is
// ALSO written here — same as pre-07f5d08 behavior — so buildCardIndex and any
// client-side reader (mana curve, filters, card grid) can access the fields
// without joining scryfall_cache. The cache still receives these via
// `_cacheFields` below for cross-user sharing.
const USER_CARD_FIELDS = new Set([
  'scryfallId', 'quantity', 'condition', 'foil', 'status', 'public',
  'price', 'language', 'name', 'edition', 'setCode', 'image', 'deckName',
  'cmc', 'type_line', 'colors', 'rarity', 'power', 'toughness',
  'full_art', 'produced_mana', 'keywords', 'legalities', 'oracle_text',
]);

exports.bulkImportCards = onCall(
  { maxInstances: 5, timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in to import cards");
    }

    const userId = request.auth.uid;
    const { cards } = request.data;

    if (!Array.isArray(cards) || cards.length === 0) {
      throw new HttpsError("invalid-argument", "cards must be a non-empty array");
    }
    if (cards.length > 5000) {
      throw new HttpsError("invalid-argument", "Maximum 5000 cards per call");
    }

    const colRef = db.collection(`users/${userId}/cards`);
    const createdIds = [];
    const BATCH_SIZE = 500;

    // TASK-230: sticky chunkId, written once at creation and never
    // recalculated — NOT read anywhere yet, see the ticket for why. position
    // continues from the account's EXISTING card count so a second import
    // call into a non-empty collection doesn't collide chunkId with cards a
    // prior call (or addCard) already created; it then increments once per
    // card across the WHOLE `cards` array, not per BATCH_SIZE chunk, so
    // chunkId stays a single monotonic sequence over this entire call.
    let position = (await colRef.count().get()).data().count;

    for (let i = 0; i < cards.length; i += BATCH_SIZE) {
      const chunk = cards.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      const refs = [];

      for (const card of chunk) {
        const ref = colRef.doc();
        // Strip any client-sent id/createdAt/updatedAt — server controls these
        const { id, createdAt, updatedAt, _cacheFields, ...cardData } = card;

        // Write only user-specific fields + convenience copies to user doc
        const userFields = {};
        for (const [key, value] of Object.entries(cardData)) {
          if (USER_CARD_FIELDS.has(key)) {
            userFields[key] = value;
          }
        }

        const chunkId = Math.floor(position / INDEX_CHUNK_SIZE);
        position += 1;

        batch.set(ref, {
          ...userFields,
          chunkId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        refs.push(ref);
      }

      await batch.commit();
      refs.forEach((r) => createdIds.push(r.id));
    }

    // Write unique scryfallIds to cache (fire-and-forget, best-effort)
    // Only writes cards that have _cacheFields or enough Scryfall data
    const cacheWrites = new Map();
    for (const card of cards) {
      if (!card.scryfallId) continue;
      if (cacheWrites.has(card.scryfallId)) continue;
      if (card._cacheFields) {
        cacheWrites.set(card.scryfallId, card._cacheFields);
      }
    }

    if (cacheWrites.size > 0) {
      try {
        const cacheBatches = [];
        let cacheBatch = db.batch();
        let cacheCount = 0;
        const now = admin.firestore.Timestamp.now();

        for (const [scryfallId, fields] of cacheWrites) {
          const ref = db.collection(SCRYFALL_CACHE_COLLECTION).doc(scryfallId);
          cacheBatch.set(ref, {
            ...fields,
            _cachedAt: now,
            _metadataUpdatedAt: now,
            _pricesUpdatedAt: now,
          }, { merge: true });
          cacheCount++;

          if (cacheCount >= BATCH_SIZE) {
            cacheBatches.push(cacheBatch.commit());
            cacheBatch = db.batch();
            cacheCount = 0;
          }
        }
        if (cacheCount > 0) cacheBatches.push(cacheBatch.commit());
        await Promise.all(cacheBatches);
        logger.info(`[bulkImportCards] ${cacheWrites.size} unique cards written to scryfall_cache`);
      } catch (err) {
        logger.warn('[bulkImportCards] Cache write failed (non-fatal):', err.message);
      }
    }

    logger.info(`[bulkImportCards] ${createdIds.length} cards imported for user ${userId}`);
    return { cardIds: createdIds, count: createdIds.length };
  }
);

// ============================================================
// LOAD COLLECTION CHUNK
// Server-side paginated read — 100k cards in ~20s vs 2+ min from browser
// Supports normalized mode: joins slim user docs with scryfall_cache
// ============================================================

/**
 * Build the `image` field from a scryfall_cache doc, matching the format
 * that CollectionGridCard.vue expects:
 * - Plain URL string for single-face cards
 * - JSON string with card_faces array for split/dual-face cards
 */
function buildImageField(cacheDoc) {
  if (cacheDoc.card_faces && cacheDoc.card_faces.length > 1) {
    // Split card: JSON-stringify the faces array (same format the app expects)
    const faces = cacheDoc.card_faces
      .filter(f => f.image_uris)
      .map(f => ({ image_uris: f.image_uris }));
    if (faces.length > 1) {
      return JSON.stringify({ card_faces: faces });
    }
  }
  // Single-face: use normal image URI
  if (cacheDoc.image_uris && cacheDoc.image_uris.normal) {
    return cacheDoc.image_uris.normal;
  }
  // Fallback: try first face's image
  if (cacheDoc.card_faces && cacheDoc.card_faces[0]?.image_uris?.normal) {
    return cacheDoc.card_faces[0].image_uris.normal;
  }
  return '';
}

/**
 * Hydrate a slim user card doc with scryfall_cache data.
 * Returns a full Card object matching the app's Card interface.
 */
function hydrateCard(userDoc, cacheDoc) {
  if (!cacheDoc) {
    // Cache miss — return user doc as-is (backward compat)
    return userDoc;
  }

  return {
    // User-specific fields (from user doc, take precedence)
    id: userDoc.id,
    scryfallId: userDoc.scryfallId,
    quantity: userDoc.quantity,
    condition: userDoc.condition,
    foil: userDoc.foil,
    status: userDoc.status,
    public: userDoc.public,
    price: userDoc.price,
    language: userDoc.language,
    createdAt: userDoc.createdAt,
    updatedAt: userDoc.updatedAt,

    // Scryfall fields (from cache, fallback to user doc convenience copies)
    name: cacheDoc.name || userDoc.name,
    edition: cacheDoc.set_name || userDoc.edition,
    setCode: (cacheDoc.set || userDoc.setCode || '').toUpperCase(),
    image: buildImageField(cacheDoc) || userDoc.image,
    type_line: cacheDoc.type_line || userDoc.type_line,
    cmc: cacheDoc.cmc ?? userDoc.cmc,
    colors: cacheDoc.colors || userDoc.colors,
    rarity: cacheDoc.rarity || userDoc.rarity,
    power: cacheDoc.power || userDoc.power,
    toughness: cacheDoc.toughness || userDoc.toughness,
    oracle_text: cacheDoc.oracle_text || userDoc.oracle_text,
    keywords: cacheDoc.keywords || userDoc.keywords,
    legalities: cacheDoc.legalities || userDoc.legalities,
    full_art: cacheDoc.full_art ?? userDoc.full_art,
    produced_mana: cacheDoc.produced_mana || userDoc.produced_mana,
  };
}

exports.loadCollectionChunk = onCall(
  { maxInstances: 5, timeoutSeconds: 60, memory: '1GiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }

    const userId = request.auth.uid;
    const {
      limit: cardLimit = 10000,
      startAfterId,
      includeSummary = false,
      normalized = false,
    } = request.data || {};
    const effectiveLimit = Math.min(cardLimit, 10000);

    const colRef = db.collection(`users/${userId}/cards`);

    // Cursor-based pagination (no offset cost)
    let query = colRef
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(effectiveLimit);

    if (startAfterId) {
      query = query.startAfter(startAfterId);
    }

    const snapshot = await query.get();
    let cards;

    if (normalized && snapshot.docs.length > 0) {
      // ── Normalized mode: join with scryfall_cache ──
      const userDocs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      // Collect unique scryfallIds
      const scryfallIds = [...new Set(
        userDocs.map(d => d.scryfallId).filter(Boolean)
      )];

      // Batch-read from scryfall_cache using db.getAll (no 'in' limit)
      const cacheMap = new Map();
      if (scryfallIds.length > 0) {
        const cacheRefs = scryfallIds.map(id =>
          db.collection(SCRYFALL_CACHE_COLLECTION).doc(id)
        );
        const cacheDocs = await db.getAll(...cacheRefs);
        for (const cDoc of cacheDocs) {
          if (cDoc.exists) {
            cacheMap.set(cDoc.id, cDoc.data());
          }
        }
        logger.info(`[loadCollectionChunk] Normalized: ${cacheMap.size}/${scryfallIds.length} cache hits for ${userDocs.length} cards`);
      }

      // Hydrate each user card
      cards = userDocs.map(ud => hydrateCard(ud, cacheMap.get(ud.scryfallId)));
    } else {
      // ── Legacy mode: return full user docs as-is ──
      cards = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    }

    const lastId = snapshot.docs.length > 0
      ? snapshot.docs[snapshot.docs.length - 1].id
      : null;

    const result = {
      cards,
      lastId,
      hasMore: snapshot.docs.length === effectiveLimit,
    };

    // Only calculate summary on first chunk (count aggregation — no docs in memory)
    if (includeSummary) {
      const [totalSnap, collSnap, saleSnap, tradeSnap, wishSnap] = await Promise.all([
        colRef.count().get(),
        colRef.where('status', '==', 'collection').count().get(),
        colRef.where('status', '==', 'sale').count().get(),
        colRef.where('status', '==', 'trade').count().get(),
        colRef.where('status', '==', 'wishlist').count().get(),
      ]);
      result.summary = {
        totalCards: totalSnap.data().count,
        statusCounts: {
          collection: collSnap.data().count,
          sale: saleSnap.data().count,
          trade: tradeSnap.data().count,
          wishlist: wishSnap.data().count,
        },
      };
      logger.info(`[loadCollectionChunk] First chunk: ${cards.length} cards, total: ${result.summary.totalCards}`);
    }

    return result;
  }
);

// ============================================================
// SCRYFALL CACHE — Bulk population & refresh
// Downloads Scryfall bulk data and writes to scryfall_cache collection
// ============================================================

const SCRYFALL_CACHE_COLLECTION = 'scryfall_cache';
const SCRYFALL_CACHE_FIELDS = [
  'name', 'set', 'set_name', 'collector_number', 'rarity', 'type_line',
  'mana_cost', 'cmc', 'colors', 'color_identity', 'power', 'toughness',
  'image_uris', 'card_faces', 'oracle_text', 'keywords', 'legalities',
  'full_art', 'produced_mana', 'prices',
];

function pickCacheFields(card) {
  const result = {};
  for (const field of SCRYFALL_CACHE_FIELDS) {
    if (card[field] !== undefined && card[field] !== null) {
      result[field] = card[field];
    }
  }
  return result;
}

/**
 * refreshScryfallCache — Scheduled weekly.
 * Downloads Scryfall's default-cards bulk data (~90k printings) and
 * upserts every card into /scryfall_cache/{scryfallId}.
 *
 * Memory: 1GiB (stream-parses ~150MB JSON)
 * Timeout: 540s (enough for ~90k writes at ~500/batch)
 */
exports.refreshScryfallCache = onSchedule(
  { schedule: 'every monday 04:00', timeZone: 'America/Mexico_City', maxInstances: 1, timeoutSeconds: 540, memory: '1GiB' },
  async () => {
    logger.info('[refreshScryfallCache] Starting...');
    const startTime = Date.now();

    try {
      // Step 1: Get download URL from Scryfall bulk-data API
      const catalogRes = await fetch('https://api.scryfall.com/bulk-data');
      if (!catalogRes.ok) throw new Error(`Scryfall bulk-data API: ${catalogRes.status}`);
      const catalog = await catalogRes.json();
      const entry = catalog.data.find(d => d.type === 'default_cards');
      if (!entry) throw new Error('default_cards not found in Scryfall bulk catalog');

      logger.info(`[refreshScryfallCache] Downloading from ${entry.download_uri} (~${Math.round(entry.size / 1024 / 1024)}MB)`);

      // Step 2: Stream-download and parse
      const downloadRes = await fetch(entry.download_uri);
      if (!downloadRes.ok) throw new Error(`Download failed: ${downloadRes.status}`);

      const allCards = await downloadRes.json();
      logger.info(`[refreshScryfallCache] Downloaded ${allCards.length} cards, writing to Firestore...`);

      let totalWritten = 0;
      let batchCount = 0;
      let batch = db.batch();
      const BATCH_SIZE = 500;

      for (const card of allCards) {
        if (!card.id) continue;

        const ref = db.collection(SCRYFALL_CACHE_COLLECTION).doc(card.id);
        const now = admin.firestore.Timestamp.now();
        batch.set(ref, {
          ...pickCacheFields(card),
          _cachedAt: now,
          _metadataUpdatedAt: now,
          _pricesUpdatedAt: now,
        }, { merge: true });
        batchCount++;

        if (batchCount >= BATCH_SIZE) {
          await batch.commit();
          totalWritten += batchCount;
          batchCount = 0;
          batch = db.batch();
        }
      }

      // Flush remaining
      if (batchCount > 0) {
        await batch.commit();
        totalWritten += batchCount;
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.info(`[refreshScryfallCache] Done: ${totalWritten} cards written in ${elapsed}s`);
    } catch (err) {
      logger.error('[refreshScryfallCache] Failed:', err.message);
      throw err;
    }
  }
);

/**
 * populateScryfallCacheManual — HTTP trigger for manual cache population.
 * Query param: ?type=default_cards|all_cards (defaults to default_cards)
 *
 * Use this for initial population or forced refresh.
 */
exports.populateScryfallCacheManual = onRequest(
  { cors: true, maxInstances: 1, timeoutSeconds: 540, memory: '1GiB' },
  async (request, response) => {
    const bulkType = request.query.type || 'default_cards';
    logger.info(`[populateScryfallCacheManual] Starting with type=${bulkType}`);
    const startTime = Date.now();

    try {
      const catalogRes = await fetch('https://api.scryfall.com/bulk-data');
      if (!catalogRes.ok) throw new Error(`Scryfall bulk-data API: ${catalogRes.status}`);
      const catalog = await catalogRes.json();
      const entry = catalog.data.find(d => d.type === bulkType);
      if (!entry) {
        response.status(400).json({ error: `Bulk type "${bulkType}" not found` });
        return;
      }

      const downloadRes = await fetch(entry.download_uri);
      if (!downloadRes.ok) throw new Error(`Download failed: ${downloadRes.status}`);

      const allCards = await downloadRes.json();
      logger.info(`[populateScryfallCacheManual] Downloaded ${allCards.length} cards, writing...`);

      let totalWritten = 0;
      let batchCount = 0;
      let batch = db.batch();
      const BATCH_SIZE = 500;

      for (const card of allCards) {
        if (!card.id) continue;

        const ref = db.collection(SCRYFALL_CACHE_COLLECTION).doc(card.id);
        const now = admin.firestore.Timestamp.now();
        batch.set(ref, {
          ...pickCacheFields(card),
          _cachedAt: now,
          _metadataUpdatedAt: now,
          _pricesUpdatedAt: now,
        }, { merge: true });
        batchCount++;

        if (batchCount >= BATCH_SIZE) {
          await batch.commit();
          totalWritten += batchCount;
          batchCount = 0;
          batch = db.batch();
        }
      }

      if (batchCount > 0) {
        await batch.commit();
        totalWritten += batchCount;
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.info(`[populateScryfallCacheManual] Done: ${totalWritten} cards in ${elapsed}s`);
      response.json({ success: true, totalWritten, elapsed: `${elapsed}s`, bulkType });
    } catch (err) {
      logger.error('[populateScryfallCacheManual] Failed:', err.message);
      response.status(500).json({ error: err.message });
    }
  }
);

// ============================================================
// CARD INDEX — Lightweight index for fast filtering & pagination
// Stores compact card summaries in chunked docs (5000 cards/chunk)
// ============================================================

const INDEX_CHUNK_SIZE = 2000;
const INDEX_VERSION = 3; // Bump when index format changes — client auto-rebuilds stale indexes
// v3 (2026-04-27): added `e` (edition / set_name) — fixes SCRUM-35 duplicate bug where stale `sc` uppercase clobbered set_name canon

/**
 * toIndexCard / mergeScryfallMetadata / isDualFaced moved to
 * ./lib/cardIndexEntry.js (TASK-245) — dependency-free so vitest can
 * EXECUTE them (tests/unit/functions/cardIndexEntry.test.ts) instead of
 * only asserting on this file's source text, and so there is exactly ONE
 * definition of an index entry for both writers of the index.
 */

/**
 * Batch-read scryfall_cache documents for a set of scryfallIds.
 * db.getAll supports up to ~10k refs per call, so this batches.
 *
 * TASK-245: shared by buildCardIndex (full rebuild) and
 * applyCardIndexDelta (per-mutation patch). The user card documents on
 * older accounts carry NO Scryfall metadata (type_line/cmc/colors/rarity
 * live only here), so any writer of a card_index entry MUST do this join
 * — applyCardIndexDelta did not, and blanked those fields on every card a
 * status change touched.
 *
 * @param {string[]} scryfallIds
 * @returns {Promise<Map<string, object>>} scryfallId -> cache doc data
 */
async function fetchScryfallCacheMap(scryfallIds) {
  const map = new Map();
  const CACHE_BATCH = 5000;
  for (let i = 0; i < scryfallIds.length; i += CACHE_BATCH) {
    const batch = scryfallIds.slice(i, i + CACHE_BATCH);
    const refs = batch.map(id => db.collection(SCRYFALL_CACHE_COLLECTION).doc(id));
    if (refs.length === 0) continue;
    // eslint-disable-next-line no-await-in-loop
    const cacheDocs = await db.getAll(...refs);
    for (const cDoc of cacheDocs) {
      if (!cDoc.exists) continue;
      map.set(cDoc.id, cDoc.data());
    }
  }
  return map;
}

/**
 * buildCardIndex — Builds or rebuilds the card_index for the calling user.
 *
 * TASK-211: this used to accept an optional { userId } from the client and
 * fall back to request.auth.uid only when omitted — i.e. it trusted a
 * client-supplied uid with no check that it matched the caller, letting any
 * logged-in user rebuild (and rewrite/delete stale chunks of) another
 * user's card_index. No legitimate caller ever passed one, so the
 * parameter is removed rather than validated.
 */
exports.buildCardIndex = onCall(
  { maxInstances: 3, timeoutSeconds: 300, memory: '2GiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }

    const userId = request.auth.uid;
    logger.info(`[buildCardIndex] Starting for user ${userId}`);
    const startTime = Date.now();

    const colRef = db.collection(`users/${userId}/cards`);
    const indexRef = db.collection(`users/${userId}/card_index`);

    // Read all cards with cursor-based pagination + field projection
    // Only select fields needed for the index (reduces memory ~80%)
    const INDEX_FIELDS = [
      'scryfallId', 'name', 'status', 'quantity', 'price', 'cmc',
      'colors', 'rarity', 'type_line', 'foil', 'setCode', 'edition', 'power',
      'toughness', 'full_art', 'produced_mana', 'keywords', 'legalities',
      'createdAt', 'condition', 'public', 'image',
      // TASK-232 HIGH (verification-round finding): without this, the Phase 1
      // projected read strips chunkId off every card, so allRawCards[i].data.chunkId
      // is always undefined and the "only rewrite what actually drifted" comparison
      // below is always true — every card, every rebuild, unconditionally. Measured
      // consequence at 59k cards: 59,083 doc writes / 119 serial batch commits per
      // rebuild instead of ~0 on a re-run, pushing an already 89-105s operation
      // toward (or past) the 300s timeout.
      'chunkId',
    ];

    // Phase 1: Read all user cards
    const allRawCards = [];
    let lastDoc = null;
    const READ_CHUNK = 2000;

    while (true) {
      let query = colRef
        .select(...INDEX_FIELDS)
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(READ_CHUNK);

      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snapshot = await query.get();
      if (snapshot.empty) break;

      for (const doc of snapshot.docs) {
        allRawCards.push({ id: doc.id, data: doc.data() });
      }

      lastDoc = snapshot.docs[snapshot.docs.length - 1];
      if (snapshot.docs.length < READ_CHUNK) break;
    }

    // Phase 2: Batch-read scryfall_cache for two purposes:
    //   1. Detect dual-faced cards accurately (dualFacedIds)
    //   2. Merge Scryfall metadata (cmc/type_line/colors/etc) into the index —
    //      cards created before USER_CARD_FIELDS started copying those fields
    //      onto the user doc have them ONLY here, so the cache is the
    //      authoritative source. Without this merge, reloads show cmc=0 for every
    //      such card even though bulkImportCards wrote the cache.
    //      TASK-245: applyCardIndexDelta now does the SAME join — see
    //      fetchScryfallCacheMap and lib/cardIndexEntry.js.
    const uniqueScryfallIds = [...new Set(allRawCards.map(c => c.data.scryfallId).filter(Boolean))];
    const scryfallCacheMap = await fetchScryfallCacheMap(uniqueScryfallIds); // scryfallId -> cache doc data
    const dualFacedIds = new Set();
    for (const [cacheId, cData] of scryfallCacheMap) {
      if (isDualFaced(cData)) dualFacedIds.add(cacheId);
    }

    logger.info(`[buildCardIndex] Found ${dualFacedIds.size} dual-faced cards out of ${uniqueScryfallIds.length} unique scryfallIds (cache hits: ${scryfallCacheMap.size})`);

    // Phase 3: Build index cards with accurate df flag and cache-merged metadata
    const allIndexCards = allRawCards.map(({ id, data }) => {
      const cache = data.scryfallId ? scryfallCacheMap.get(data.scryfallId) : null;
      // buildIndexEntry sets df from the cache (isDualFaced) — identical to
      // the dualFacedIds lookup this used to do, since dualFacedIds is built
      // from the SAME map with the SAME predicate. dualFacedIds now only
      // feeds the count in the log line above.
      return buildIndexEntry(id, data, cache);
    });

    logger.info(`[buildCardIndex] Read ${allIndexCards.length} cards, writing index chunks...`);

    // Write index chunks individually (batch.set exceeds 10MB limit for large collections)
    const totalChunks = Math.ceil(allIndexCards.length / INDEX_CHUNK_SIZE) || 1;

    for (let c = 0; c < totalChunks; c++) {
      const chunkCards = allIndexCards.slice(
        c * INDEX_CHUNK_SIZE,
        (c + 1) * INDEX_CHUNK_SIZE
      );
      await indexRef.doc(`chunk_${c}`).set({
        cards: chunkCards,
        count: chunkCards.length,
        version: INDEX_VERSION,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Delete stale chunks (if collection shrank)
    const existingChunks = await indexRef.listDocuments();
    const validChunkIds = new Set(Array.from({ length: totalChunks }, (_, i) => `chunk_${i}`));
    const staleRefs = existingChunks.filter(ref => !validChunkIds.has(ref.id));

    if (staleRefs.length > 0) {
      const batch = db.batch();
      for (const ref of staleRefs) {
        batch.delete(ref);
      }
      await batch.commit();
      logger.info(`[buildCardIndex] Deleted ${staleRefs.length} stale chunks`);
    }

    // TASK-232 HIGH-1 (team-lead review): re-align the sticky `chunkId`
    // TASK-230 wrote on each card doc with the chunk THIS rebuild is
    // actually putting it in. Without this, chunkId drifts permanently the
    // moment a rebuild's position-by-documentId order disagrees with
    // whatever assigned chunkId at creation time (bulkImportCards' creation
    // order, or an earlier rebuild's own drift compounding) — and
    // applyCardIndexDelta trusts chunkId to locate a card's chunk. A
    // DELETE whose chunkId points at the wrong chunk finds nothing there
    // and (pre-fix) silently concluded "already absent" — a phantom, with
    // no log anywhere. Only the cards whose chunkId is actually WRONG are
    // rewritten (comparing against the position this rebuild just computed
    // for them) — bounded to however much has drifted, not every card on
    // every rebuild.
    const chunkIdFixes = [];
    for (let i = 0; i < allRawCards.length; i++) {
      const correctChunkId = Math.floor(i / INDEX_CHUNK_SIZE);
      if (allRawCards[i].data.chunkId !== correctChunkId) {
        chunkIdFixes.push({ id: allRawCards[i].id, chunkId: correctChunkId });
      }
    }
    if (chunkIdFixes.length > 0) {
      const FIX_BATCH = 500;
      for (let i = 0; i < chunkIdFixes.length; i += FIX_BATCH) {
        const batch = db.batch();
        for (const fix of chunkIdFixes.slice(i, i + FIX_BATCH)) {
          batch.update(colRef.doc(fix.id), { chunkId: fix.chunkId });
        }
        // eslint-disable-next-line no-await-in-loop
        await batch.commit();
      }
    }
    // Unconditional (team-lead review): a log line that only appears when
    // there's something to report is indistinguishable from "the whole
    // block didn't run" — the exact "verification tool affirms success over
    // an empty read" class this ticket family keeps running into (the
    // backfill --status false positive, the fixture false positive). An
    // explicit "0 doc(s)" is a claim; an absent line is not.
    logger.info(`[buildCardIndex] Re-aligned chunkId on ${chunkIdFixes.length} card doc(s) that had drifted from this rebuild's actual placement`);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`[buildCardIndex] Done: ${allIndexCards.length} cards → ${totalChunks} chunks in ${elapsed}s`);

    return {
      success: true,
      totalCards: allIndexCards.length,
      chunks: totalChunks,
      elapsed: `${elapsed}s`,
    };
  }
);

// ============================================================
// APPLY CARD INDEX DELTA — TASK-232
// Patches ONLY the card_index chunk(s) a status-change or delete actually
// touches, using the sticky `chunkId` field TASK-230 wrote onto each card
// document — no full-index rebuild, no client-side chunk write.
// ============================================================

/**
 * applyCardIndexDelta — TASK-232. Moves card_index chunk writes for
 * status-change and delete mutations off the browser and onto the server.
 * See TASK-232's ticket comments for the full decision write-up; summary:
 *
 *   - onCall with an explicit delta, NOT a Firestore trigger on
 *     users/{uid}/cards/{cardId} — a trigger would also fire for
 *     bulkImportCards' up-to-5000-per-call writes, amplifying exactly the
 *     write-volume problem this exists to kill.
 *   - chunkId is resolved SERVER-SIDE from each card's own document, never
 *     trusted from the client (the client only says WHICH card and WHAT
 *     action, never WHERE).
 *   - Concurrency with buildCardIndex (TASK-226, not resolved here): each
 *     affected chunk is patched inside its own runTransaction. buildCardIndex
 *     writes chunks with a plain .set() with no transaction — that does NOT
 *     eliminate the race, but a plain .set() landing on a chunk this
 *     transaction has already read IS a version conflict Firestore detects
 *     at commit time, forcing a retry against the now-fresh document. A
 *     rebuild that lands mid-delta therefore re-applies the delta on top of
 *     the rebuilt chunk (correct, slower) instead of being silently
 *     clobbered. A delta landing mid-rebuild — after buildCardIndex has
 *     read all cards but before it writes chunk_c — is NOT covered: its own
 *     .set() has no transaction to conflict against and can still overwrite
 *     this function's patch with an older snapshot. That specific order is
 *     TASK-226's open problem, unchanged by this ticket.
 *
 * mutations: Array<{ cardId: string, action: 'update'|'delete', allowInsert?: boolean }>
 *   - 'update': the card doc must already carry the NEW values — the client
 *     calls this AFTER its own updateDoc/batch.update. Only patches an
 *     entry that already exists in its chunk; never fabricates a new one
 *     UNLESS allowInsert is true (see below) — TASK-232 gap #1.
 *   - 'delete': the client calls this BEFORE deleting the card doc, because
 *     chunkId can only be read while the doc still exists. If the doc is
 *     already gone, or has no chunkId, this does a bounded FALLBACK scan of
 *     every chunk to locate the entry by id instead of skipping — skipping
 *     would leave a phantom (an index entry with no card behind it),
 *     exactly the class of bug this function must not introduce. Measured
 *     2026-08-13: prod's 6,535 pre-TASK-230-backfill docs have no chunkId,
 *     so this is the NORMAL case there today, not an edge case — the prod
 *     backfill (TASK-230 AC5) is a hard prerequisite for this fallback to
 *     stay rare rather than be the common path.
 *   - allowInsert: only meant for the deleteCard/batchDeleteCards
 *     COMPENSATION call after a delete-delta already succeeded but the
 *     actual Firestore doc delete then failed (TASK-232 gap #1: without
 *     this, that card's document survives but its index entry doesn't —
 *     an invisible card). The doc still exists with its real chunkId at
 *     that point, so re-inserting its entry is grounded in a fresh read,
 *     not a guess.
 *
 * Never silent: every mutation this call could not resolve is reported back
 * in `skippedIds`, and logged server-side. A "0 written, 0 error" result
 * here is not possible for a mutation this function actually looked at.
 *
 * NOT ATOMIC across chunks, and this claim does NOT cover a hard crash.
 * "Never silent" above only holds for a call that returns (normally or via
 * a thrown HttpsError) — chunk transactions are independent BY DESIGN (see
 * "Chunks are independent — safe to run concurrently" below), so if the
 * invocation is killed mid-batch (OOM, or the 60s timeout) some chunks can
 * already be committed while others were never attempted, and nothing is
 * returned to the client at all — there is no partial response to read
 * `applied`/`skippedIds` from. MEASURED 2026-08-13: a 29-mutation call that
 * OOM'd left 10 applied, 19 not, with the client's only signal being a
 * generic rejection carrying no count. The mapWithConcurrency bound above
 * (TASK-232) makes hitting this rarer by removing OOM as a cause for wide
 * chunk spreads, but does not add atomicity or a way to report progress
 * from a killed invocation — a genuine platform-level kill happens before
 * any response can be constructed, by construction, regardless of what
 * this function's own code does. Making a mid-batch crash's outcome
 * visible (not necessarily atomic) is open — see TASK-232 hand-off notes.
 */
// TASK-232 OOM fix (dev finding, 2026-08-13): 256MiB was measured OOMing —
// 'Memory limit of 256 MiB exceeded with 257 MiB used' — on 29 mutations
// spread across 29 of a 59,083-card account's 30 card_index chunks
// (~818KB JSON each, ~24MB raw for the whole index). The prior code
// Promise.all'd every distinct chunk a call touched with no concurrency
// cap, so a call spread across most/all of an account's chunks held all
// of them parsed in memory at once, on top of the ~150-200MB Node +
// firebase-admin baseline a 256MiB container leaves almost no room for.
// Fixed two ways together, not one or the other:
//   1. applyChunkTransactions now runs chunk transactions through
//      mapWithConcurrency (limit below) instead of an unbounded
//      Promise.all, so peak resident chunk data is bounded by the
//      concurrency limit, not by how many distinct chunks the mutation
//      set happens to touch. Chunks remain fully independent (each still
//      its own runTransaction) — only the concurrency is capped, not the
//      atomicity documented above.
//   2. Memory raised to 1GiB: even with (1) bounding the transaction
//      step, scanAndAssign's fallback (delete mutations whose own doc
//      has no chunkId, or whose believed chunk didn't have them) reads
//      the ENTIRE card_index collection in one query snapshot — that
//      part scales with account size and is NOT bounded by (1). Sized
//      one tier below buildCardIndex/queryCardIndex's 2GiB (those hold
//      the full index AND rebuild/rewrite it; this only reads it) and
//      matching loadCollectionChunk's 1GiB, which moves comparable data
//      volumes. Until TASK-230 AC5's prod chunkId backfill lands,
//      scanAndAssign is the COMMON path there (prod's 6,535 pre-backfill
//      docs have no chunkId), so this must hold up at prod scale, not
//      just the 59k dev account this was measured against.
const CHUNK_TX_CONCURRENCY = 6;
exports.applyCardIndexDelta = onCall(
  { maxInstances: 10, timeoutSeconds: 60, memory: "1GiB" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }
    const userId = request.auth.uid;

    const rawMutations = Array.isArray(request.data?.mutations) ? request.data.mutations : [];
    if (rawMutations.length === 0) {
      throw new HttpsError("invalid-argument", "mutations must be a non-empty array");
    }
    if (rawMutations.length > 500) {
      throw new HttpsError("invalid-argument", "mutations cannot exceed 500 per call");
    }

    // Validate shape and dedupe by cardId — last mutation for a given id
    // wins (this is "apply the current state", not an event log).
    const byId = new Map();
    for (const m of rawMutations) {
      if (!m || typeof m.cardId !== "string" || !m.cardId) continue;
      if (m.action !== "update" && m.action !== "delete") continue;
      byId.set(m.cardId, {
        action: m.action,
        allowInsert: m.action === "update" && m.allowInsert === true,
      });
    }
    const cardIds = [...byId.keys()];
    if (cardIds.length === 0) {
      throw new HttpsError("invalid-argument", "No valid mutations after validation");
    }

    // Resolve chunkId + (for updates) fresh field values from each card's
    // own document — never trust a client-supplied chunkId or field
    // payload for what goes into the index.
    const cardRefs = cardIds.map((id) => db.collection(`users/${userId}/cards`).doc(id));
    const cardSnaps = await db.getAll(...cardRefs);

    // TASK-245: join scryfall_cache BEFORE building any index entry, the
    // same join buildCardIndex does. Without it this function wrote each
    // touched entry from the raw user document alone — and on older
    // accounts those documents carry no type_line/cmc/colors/rarity at all
    // (they exist only in scryfall_cache), so every status change blanked
    // them. Measured in dev 2026-08-18: 6787/6787 cards touched by one bulk
    // status change lost type_line; lands visible in the index 7129 -> 376.
    // Only UPDATEs need it — a delete removes the entry, it doesn't rebuild
    // one — and mutations are capped at 500 per call, so this is a single
    // getAll of <=500 refs.
    const updateScryfallIds = new Set();
    cardSnaps.forEach((snap, i) => {
      const m = byId.get(cardIds[i]);
      if (!m || m.action !== "update" || !snap.exists) return;
      const sid = snap.data().scryfallId;
      if (sid) updateScryfallIds.add(sid);
    });
    const scryfallCacheMap = await fetchScryfallCacheMap([...updateScryfallIds]);
    const cacheFor = (raw) => (raw && raw.scryfallId ? scryfallCacheMap.get(raw.scryfallId) || null : null);

    const byChunk = new Map(); // chunkNumber -> [{ cardId, action, data, cache, allowInsert }]
    const deleteFallbackIds = [];
    const updateFallbackIds = [];
    const skippedIds = [];
    // URGENT PROD FIX (2026-08-18): cardId -> { action, data, cache, allowInsert }
    // for every mutation whose own document was readable, regardless of
    // whether its chunkId resolved a usable chunk. scanAndAssign (below)
    // needs this to re-attach the RIGHT action/data when it locates an
    // entry by scanning — before this fix it hard-coded 'delete', which is
    // why it could only ever be used for the delete fallback.
    const idToEntry = new Map();

    cardSnaps.forEach((snap, i) => {
      const cardId = cardIds[i];
      const { action, allowInsert } = byId.get(cardId);

      if (action === "update") {
        if (!snap.exists) {
          skippedIds.push(cardId);
          return;
        }
        const data = snap.data();
        // The card's scryfall_cache doc travels WITH the mutation, so every
        // downstream writer of this entry (fast path, fallback scan, round-2
        // escalation) hands buildIndexEntry the same pair and writes the same
        // complete entry — TASK-245.
        const cache = cacheFor(data);
        idToEntry.set(cardId, { action, data, cache, allowInsert });
        if (typeof data.chunkId !== "number") {
          // TASK-230: no sticky chunkId on this doc yet. Used to skip
          // outright here — now resolved the same way a missing-chunkId
          // DELETE already was: a full-index fallback scan instead of
          // leaving the index permanently stale (URGENT PROD FIX, see
          // updateFallbackIds below).
          updateFallbackIds.push(cardId);
          return;
        }
        if (!byChunk.has(data.chunkId)) byChunk.set(data.chunkId, []);
        byChunk.get(data.chunkId).push({ cardId, action, data, cache, allowInsert });
        return;
      }

      // action === 'delete'
      if (snap.exists) {
        const data = snap.data();
        idToEntry.set(cardId, { action, data, cache: null, allowInsert: false });
        if (typeof data.chunkId === "number") {
          if (!byChunk.has(data.chunkId)) byChunk.set(data.chunkId, []);
          byChunk.get(data.chunkId).push({ cardId, action, data, cache: null, allowInsert: false });
          return;
        }
      } else {
        idToEntry.set(cardId, { action, data: null, cache: null, allowInsert: false });
      }
      // Doc gone, or doc exists with no chunkId — resolve by scanning
      // instead of skipping (TASK-232 gap #2: skipping here is exactly how
      // a phantom index entry gets left behind).
      deleteFallbackIds.push(cardId);
    });

    // TASK-232 HIGH-1 (team-lead review): the chunkId a card's OWN document
    // carries is not guaranteed to match where its entry actually lives —
    // bulkImportCards assigns chunkId by creation order, buildCardIndex
    // assigns chunks by documentId order, and any position-based rewrite
    // (a full rebuild) can leave chunkId stale for cards it re-partitions
    // without touching their sticky field (buildCardIndex now
    // self-corrects this going forward, but existing drift predates that
    // fix and a delta call can still land on an unrewritten doc). A DELETE
    // whose believed chunk does NOT actually contain the entry must not be
    // read as "already absent" — that is exactly how a phantom (index says
    // present, no document backs it — the INVERSE here: index entry
    // survives untouched somewhere else while this call wrongly concludes
    // there's nothing to do) gets left behind silently. scanAndAssign runs
    // the same full-index fallback search used for missing/unreadable
    // chunkId, reused for this escalation too.
    // URGENT PROD FIX (2026-08-18): scanAndAssign used to hard-code
    // `action: "delete"` for every id it located, which is why it could
    // only ever serve the delete fallback — an UPDATE whose chunkId was
    // stale or missing had no equivalent path and went straight to
    // skippedIds (see updateFallbackIds/notFoundUpdateIds below). It now
    // looks up each id's real action/data/allowInsert from idToEntry so the
    // SAME full-index scan serves both mutation kinds.
    let fallbackUsed = 0;
    const scanAndAssign = async (ids, reason) => {
      if (ids.length === 0) return new Set();
      fallbackUsed += ids.length;
      const indexSnapshot = await db.collection(`users/${userId}/card_index`).get();
      const wantedIds = new Set(ids);
      for (const chunkDoc of indexSnapshot.docs) {
        const m = /^chunk_(\d+)$/.exec(chunkDoc.id);
        if (!m) continue;
        const chunkNum = parseInt(m[1], 10);
        const data = chunkDoc.data();
        const cardsArr = Array.isArray(data.cards) ? data.cards : [];
        for (const c of cardsArr) {
          if (wantedIds.has(c.i)) {
            const entry = idToEntry.get(c.i);
            if (entry) {
              if (!byChunk.has(chunkNum)) byChunk.set(chunkNum, []);
              byChunk.get(chunkNum).push({ cardId: c.i, action: entry.action, data: entry.data, cache: entry.cache, allowInsert: entry.allowInsert });
            }
            wantedIds.delete(c.i);
          }
        }
      }
      // Anything still in wantedIds genuinely has no entry anywhere in the
      // index. For a delete this means already consistent (not a phantom),
      // nothing to do — not added to skippedIds: skipped means "could not
      // act", this means "nothing to act on". For an update the caller
      // (below) still needs to know, since a real document exists with no
      // index entry at all to patch — that IS unresolved and must be
      // reported, not silently dropped.
      logger.info(
        `[applyCardIndexDelta] Fallback scan for user ${userId} (${reason}): ${ids.length} mutation(s) — ${ids.length - wantedIds.size} located, ${wantedIds.size} not found anywhere in the index.`
      );
      return wantedIds;
    };

    const initialStillMissing = await scanAndAssign([...deleteFallbackIds, ...updateFallbackIds], "missing doc or chunkId");
    for (const id of initialStillMissing) {
      const entry = idToEntry.get(id);
      if (entry && entry.action === "update") skippedIds.push(id);
    }

    // Patch each affected chunk inside its own transaction (see concurrency
    // note above). Chunks are independent — safe to run concurrently.
    // Returns the delete cardIds that were NOT found in their believed
    // chunk (round 1) — these need the fallback scan too, not a silent
    // "already absent".
    const applyChunkTransactions = async (chunkMap) => {
      const chunkNumbers = [...chunkMap.keys()];
      // TASK-232 OOM fix: bounded concurrency instead of Promise.all over
      // every distinct chunk (see comment on the exports.applyCardIndexDelta
      // declaration above) — chunks stay independent transactions, only how
      // many are held in memory at once changes.
      const results = await mapWithConcurrency(
        chunkNumbers,
        CHUNK_TX_CONCURRENCY,
        async (chunkNum) => {
          const chunkRef = db.collection(`users/${userId}/card_index`).doc(`chunk_${chunkNum}`);
          const entries = chunkMap.get(chunkNum);

          return db.runTransaction(async (tx) => {
            const chunkSnap = await tx.get(chunkRef);
            const existingCards = chunkSnap.exists && Array.isArray(chunkSnap.data().cards)
              ? chunkSnap.data().cards
              : [];
            const byIndexId = new Map(existingCards.map((c, idx) => [c.i, idx]));
            const nextCards = existingCards.slice();
            let applied = 0;
            const notFoundUpdates = [];
            const notFoundDeletes = [];

            // TASK-245: entries are built by lib/cardIndexEntry's
            // buildIndexEntry — the SAME function buildCardIndex uses, so the
            // two writers of the index cannot disagree. It does the
            // scryfall_cache merge itself; `cache` comes from the join right
            // after the db.getAll above.
            for (const { cardId, action, data, cache, allowInsert } of entries) {
              const existingIdx = byIndexId.get(cardId);
              if (action === "delete") {
                if (existingIdx === undefined) {
                  // Not where its chunkId said it would be — do NOT treat
                  // as "already absent" (TASK-232 HIGH-1). Escalate to the
                  // fallback scan after this round instead of concluding
                  // silently.
                  notFoundDeletes.push(cardId);
                  continue;
                }
                nextCards[existingIdx] = null; // filtered out below
                applied++;
              } else if (existingIdx === undefined) {
                if (allowInsert) {
                  nextCards.push(buildIndexEntry(cardId, data, cache));
                  applied++;
                } else {
                  notFoundUpdates.push(cardId);
                }
              } else {
                nextCards[existingIdx] = buildIndexEntry(cardId, data, cache);
                applied++;
              }
            }

            const filteredCards = nextCards.filter((c) => c !== null);
            tx.set(chunkRef, {
              cards: filteredCards,
              count: filteredCards.length,
              version: INDEX_VERSION,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return { applied, notFoundUpdates, notFoundDeletes };
          });
        }
      );

      let appliedCount = 0;
      const notFoundUpdateIds = [];
      const notFoundDeleteIds = [];
      for (const r of results) {
        appliedCount += r.applied;
        notFoundUpdateIds.push(...r.notFoundUpdates);
        notFoundDeleteIds.push(...r.notFoundDeletes);
      }
      return { appliedCount, notFoundUpdateIds, notFoundDeleteIds };
    };

    // Round 1: the fast path (own doc's chunkId) plus whatever the initial
    // fallback scan above already resolved into byChunk.
    const round1 = await applyChunkTransactions(byChunk);
    let appliedCount = round1.appliedCount;

    // Round 2: mutations whose believed chunk didn't actually have them —
    // escalate to a fresh fallback scan + a second (disjoint-chunk)
    // transaction round. URGENT PROD FIX (2026-08-18): this used to be
    // delete-only (round1.notFoundDeleteIds) with round1.notFoundUpdateIds
    // pushed straight to skippedIds a few lines above, no scan attempted —
    // exactly the mechanism behind the live prod bug (status-change updates
    // silently no-op'd, HTTP 200, applied:0, skipped:1). The card's own
    // chunkId can be stale for the SAME reason on either action (TASK-230
    // LOW-2 / TASK-232 HIGH-1: append-order chunkId vs rank-order
    // rebuild/backfill), so both need the same escalation.
    const staleIds = [...round1.notFoundUpdateIds, ...round1.notFoundDeleteIds];
    if (staleIds.length > 0) {
      // Snapshot each chunk's entry-array LENGTH before the scan appends
      // anything — scanAndAssign mutates the SHARED `byChunk` map (used by
      // round 1 too), and the wrong chunk round 1 already tried still has
      // its OLD (now-stale) entry sitting in that array. Filtering by id
      // alone would pick that stale entry back up too — a redundant
      // transaction re-processing a chunk with nothing left to change (the
      // team-lead review's LOW finding). Comparing against the pre-scan
      // length isolates exactly what THIS scan just appended.
      const preScanLengths = new Map([...byChunk.entries()].map(([k, v]) => [k, v.length]));
      const round2Chunk = new Map();
      const stillMissing = await scanAndAssign([...round1.notFoundUpdateIds, ...round1.notFoundDeleteIds], "chunkId pointed at the wrong chunk");
      for (const [chunkNum, entries] of byChunk) {
        const newlyAdded = entries.slice(preScanLengths.get(chunkNum) ?? 0);
        if (newlyAdded.length > 0) round2Chunk.set(chunkNum, newlyAdded);
      }
      if (round2Chunk.size > 0) {
        const round2 = await applyChunkTransactions(round2Chunk);
        appliedCount += round2.appliedCount;
        // Round 2 itself is not re-escalated to a Round 3 — same accepted
        // design limit as before this fix — but any of ITS own not-founds
        // must still be reported, not silently dropped.
        skippedIds.push(...round2.notFoundUpdateIds);
      }
      // Anything the scan still could not locate anywhere in the index:
      // for a delete that's already consistent (not a phantom, not a
      // skip). For an update it means a real document exists with no index
      // entry to patch at all — genuinely unresolved, must be reported.
      for (const id of stillMissing) {
        const entry = idToEntry.get(id);
        if (entry && entry.action === "update") skippedIds.push(id);
      }
    }

    const uniqueSkipped = [...new Set(skippedIds)];
    if (uniqueSkipped.length > 0) {
      logger.warn(
        `[applyCardIndexDelta] ${uniqueSkipped.length} mutation(s) skipped for user ${userId} (missing doc/chunkId, or update target not found in its chunk): ${uniqueSkipped.join(", ")}`
      );
    }

    return { applied: appliedCount, skipped: uniqueSkipped.length, skippedIds: uniqueSkipped, fallbackUsed };
  }
);

// ============================================================
// LOAD CARD PAGE — Fetch full cards by IDs with scryfall_cache join
// Used for paginated grid display (50 cards at a time)
// ============================================================

/**
 * loadCardPage — Fetches full card objects for a list of card IDs.
 * Performs server-side join with scryfall_cache (reuses hydrateCard).
 *
 * Input: { cardIds: string[] } (max 200)
 * Returns: { cards: Card[] }
 */
exports.loadCardPage = onCall(
  { maxInstances: 10, timeoutSeconds: 30, memory: '256MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }

    const userId = request.auth.uid;
    const { cardIds } = request.data || {};

    if (!Array.isArray(cardIds) || cardIds.length === 0) {
      throw new HttpsError("invalid-argument", "cardIds must be a non-empty array");
    }
    if (cardIds.length > 200) {
      throw new HttpsError("invalid-argument", "Maximum 200 cards per page request");
    }

    // Read user card docs by ID
    const cardRefs = cardIds.map(id =>
      db.collection(`users/${userId}/cards`).doc(id)
    );
    const cardDocs = await db.getAll(...cardRefs);

    // Collect scryfallIds for cache join
    const userCards = [];
    const scryfallIds = new Set();
    for (const doc of cardDocs) {
      if (!doc.exists) continue;
      const data = { id: doc.id, ...doc.data() };
      userCards.push(data);
      if (data.scryfallId) scryfallIds.add(data.scryfallId);
    }

    // Batch-read from scryfall_cache
    const cacheMap = new Map();
    if (scryfallIds.size > 0) {
      const cacheRefs = [...scryfallIds].map(id =>
        db.collection(SCRYFALL_CACHE_COLLECTION).doc(id)
      );
      const cacheDocs = await db.getAll(...cacheRefs);
      for (const cDoc of cacheDocs) {
        if (cDoc.exists) {
          cacheMap.set(cDoc.id, cDoc.data());
        }
      }
    }

    // Hydrate each card (reuse existing hydrateCard function)
    const cards = userCards.map(uc => hydrateCard(uc, cacheMap.get(uc.scryfallId)));

    return { cards };
  }
);

// ============================================================
// QUERY CARD INDEX — Server-side filter, sort & pagination
// Reads card_index chunks, applies filters/sort, returns one page
// ============================================================

// ── Pure helper: rarity name → first character ──
const RARITY_INITIAL = {
  common: 'c',
  uncommon: 'u',
  rare: 'r',
  mythic: 'm',
};

/**
 * Flatten chunked index documents into a single array of index cards.
 */
function expandIndexCards(chunks) {
  const result = [];
  for (const chunk of chunks) {
    if (chunk.cards && chunk.cards.length > 0) {
      for (const card of chunk.cards) {
        result.push(card);
      }
    }
  }
  return result;
}

/**
 * Apply filters to an array of index cards.
 * All filters use AND logic; within array-valued filters, OR logic is used.
 */
function filterIndexCards(cards, filters) {
  let result = cards;

  // Search: case-insensitive substring on name
  if (filters.search && filters.search.trim() !== '') {
    const q = filters.search.toLowerCase();
    result = result.filter(c => c.n.toLowerCase().includes(q));
  }

  // Status
  if (filters.status && filters.status.length > 0) {
    const statusSet = new Set(filters.status);
    result = result.filter(c => statusSet.has(c.st));
  }

  // Edition (setCode, case-insensitive)
  if (filters.edition && filters.edition.length > 0) {
    const editionSet = new Set(filters.edition.map(e => e.toUpperCase()));
    result = result.filter(c => editionSet.has(c.sc.toUpperCase()));
  }

  // Color (OR: card has at least one matching color)
  if (filters.color && filters.color.length > 0) {
    const colorSet = new Set(filters.color.map(c => c.toUpperCase()));
    result = result.filter(c => {
      if (c.co.length === 0) return false;
      return c.co.some(color => colorSet.has(color.toUpperCase()));
    });
  }

  // Rarity (map full names to first char)
  if (filters.rarity && filters.rarity.length > 0) {
    const rarityChars = new Set(
      filters.rarity.map(r => RARITY_INITIAL[r.toLowerCase()] || r.charAt(0).toLowerCase())
    );
    result = result.filter(c => rarityChars.has(c.r.toLowerCase()));
  }

  // Type (substring match, OR across types)
  if (filters.type && filters.type.length > 0) {
    const typeTerms = filters.type.map(t => t.toLowerCase());
    result = result.filter(c => {
      const typeLine = c.t.toLowerCase();
      return typeTerms.some(term => typeLine.includes(term));
    });
  }

  // Foil
  if (filters.foil !== undefined && filters.foil !== null) {
    result = result.filter(c => c.f === filters.foil);
  }

  // Condition
  if (filters.condition && filters.condition.length > 0) {
    const conditionSet = new Set(filters.condition.map(c => c.toUpperCase()));
    result = result.filter(c => conditionSet.has(c.cn.toUpperCase()));
  }

  // Price range
  if (filters.minPrice !== undefined && filters.minPrice !== null) {
    result = result.filter(c => c.p >= filters.minPrice);
  }
  if (filters.maxPrice !== undefined && filters.maxPrice !== null) {
    result = result.filter(c => c.p <= filters.maxPrice);
  }

  return result;
}

/**
 * Sort index cards by field and direction. Returns a new array.
 */
function sortIndexCards(cards, sort) {
  const sorted = [...cards];
  const dir = sort.direction === 'desc' ? -1 : 1;

  switch (sort.field) {
    case 'name':
      sorted.sort((a, b) => dir * a.n.localeCompare(b.n));
      break;
    case 'price':
      sorted.sort((a, b) => dir * (a.p - b.p));
      break;
    case 'edition':
      sorted.sort((a, b) => dir * a.sc.localeCompare(b.sc));
      break;
    case 'quantity':
      sorted.sort((a, b) => dir * (a.q - b.q));
      break;
    case 'dateAdded':
      sorted.sort((a, b) => dir * (a.ca - b.ca));
      break;
    default:
      sorted.sort((a, b) => b.ca - a.ca);
      break;
  }

  return sorted;
}

/**
 * Slice for the requested page. If mode is 'ids', return only card IDs.
 */
function paginateResults(cards, page, pageSize, mode) {
  const total = cards.length;
  const start = page * pageSize;
  const end = start + pageSize;
  const pageCards = cards.slice(start, end);
  const hasMore = end < total;

  return {
    cards: mode === 'ids' ? pageCards.map(c => c.i) : pageCards,
    total,
    page,
    pageSize,
    hasMore,
  };
}

/**
 * queryCardIndex — Callable Cloud Function.
 *
 * Reads card_index chunks for a user, applies filters/sort, and returns
 * one page of results plus the total matching count.
 *
 * TASK-214: this used to accept a client-supplied userId (destructured from
 * request.data, falling back to request.auth.uid only when omitted) and
 * query that user's card_index with no check that it matched the caller —
 * any logged-in user could read another user's full card inventory. No
 * legitimate caller ever sent one (both call sites in src/stores/collection.ts
 * pass their own uid), so the parameter is removed rather than validated.
 * Reading someone else's inventory has no legitimate use here either — the
 * public-profile flow serves from /public_cards, not card_index (see
 * firestore.rules).
 *
 * Input:
 *   filters: { search?, status?[], edition?[], color?[], rarity?[],
 *              type?[], foil?, condition?[], minPrice?, maxPrice? }
 *   sort: { field, direction }
 *   page: number             - 0-based
 *   pageSize: number         - default 50, max 100
 *   mode?: 'cards' | 'ids'   - 'ids' returns only card IDs (for select-all)
 *
 * Returns:
 *   { cards, total, page, pageSize, hasMore }
 */
exports.queryCardIndex = onCall(
  // PARCHE 2026-08-11 (TASK-187): con 512MiB la funcion moria por OOM ("Memory limit of
  // 512 MiB exceeded with 521 MiB used" / "signal 6") en CASI TODAS las busquedas de una
  // cuenta de ~59k cartas, porque lee el indice entero y lo filtra y ordena en RAM para
  // devolver 50 filas. Esto NO es el arreglo: solo corre el techo mas arriba y desbloquea
  // la medicion. El arreglo de fondo es dejar de traer el indice completo.
  { maxInstances: 10, timeoutSeconds: 60, memory: '2GiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }

    const {
      filters = {},
      sort = { field: 'dateAdded', direction: 'desc' },
      page = 0,
      pageSize: rawPageSize = 50,
      mode = 'cards',
    } = request.data || {};

    const targetUserId = request.auth.uid;

    // Validate page
    if (typeof page !== 'number' || page < 0 || !Number.isInteger(page)) {
      throw new HttpsError('invalid-argument', 'page must be a non-negative integer');
    }

    // Clamp pageSize to [1, 100]
    const pageSize = Math.max(1, Math.min(100, rawPageSize || 50));

    // Validate mode
    if (mode !== 'cards' && mode !== 'ids') {
      throw new HttpsError('invalid-argument', 'mode must be "cards" or "ids"');
    }

    // Validate sort
    const validSortFields = ['name', 'price', 'edition', 'quantity', 'dateAdded'];
    if (sort.field && !validSortFields.includes(sort.field)) {
      throw new HttpsError('invalid-argument', `sort.field must be one of: ${validSortFields.join(', ')}`);
    }
    if (sort.direction && sort.direction !== 'asc' && sort.direction !== 'desc') {
      throw new HttpsError('invalid-argument', 'sort.direction must be "asc" or "desc"');
    }

    try {
      // Step 1: Read all card_index chunks for the user
      const indexRef = db.collection(`users/${targetUserId}/card_index`);
      const snapshot = await indexRef.get();

      if (snapshot.empty) {
        return { cards: [], total: 0, page, pageSize, hasMore: false };
      }

      const chunks = snapshot.docs.map(doc => doc.data());

      // Step 2: Expand chunks into flat array
      const allCards = expandIndexCards(chunks);

      // Step 3: Apply filters
      const filtered = filterIndexCards(allCards, filters);

      // Step 4: Sort
      const sorted = sortIndexCards(filtered, sort);

      // Step 5: Paginate
      const result = paginateResults(sorted, page, pageSize, mode);

      logger.info(`[queryCardIndex] User ${targetUserId}: ${allCards.length} total → ${filtered.length} filtered → page ${page} (${result.cards.length} items)`);

      return result;
    } catch (error) {
      if (error.code) throw error; // Re-throw HttpsError
      logger.error('[queryCardIndex] Error:', error);
      throw new HttpsError('internal', 'Failed to query card index');
    }
  }
);

// ============================================================
// CARD IMAGE PROXY/CACHE — TASK-241 (reopened 2026-08-18)
//
// AC1 (bytes) already shipped: the grid requests Scryfall's `thumb`/`grid`
// WEBP variants instead of `normal`/`small` JPG. This section addresses the
// re-scoped problem — Rafael's argument is REQUEST COUNT to Scryfall, not
// bytes: a grid load fires one Scryfall request per card, every time, and
// Scryfall is measured slow FOR HIM specifically (84 KB in 30s = 2.8 KB/s,
// vs 0.62s for the same file from elsewhere) — so cutting the request count
// down to "once per card, ever" is the fix, not shrinking each request.
//
// GET /img/{variant}/{face}/{scryfallId}.webp (variant: thumb|grid, face:
// front|back — see functions/lib/cardImage.js for the shared, unit-tested
// URL/path helpers). Cache hit: served straight from Firebase Storage with
// a long Cache-Control (AC4). Cache miss: fetched from Scryfall exactly
// once (throttled — AC6), stored, then served; every later request for the
// same (variant, face, scryfallId) is a Storage hit and never touches
// Scryfall again (AC3/AC9). Any internal failure degrades to a 302 redirect
// straight to the Scryfall CDN URL (AC7) — the browser's own onerror
// fallback (src/utils/cardImageUrl.ts's scryfallFallbackUrl) is the second
// layer, for when our own domain/function can't be reached at all.
// ============================================================

const CARD_IMAGE_STORAGE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
// AC6: identify ourselves — Scryfall's own good-citizenship guidance
// (scryfall.com/docs/api/http-concerns) asks embedders to be identifiable.
const CARD_IMAGE_USER_AGENT = 'CranialTrading/1.0 (+https://cranial-trading.web.app; contact: srparca@gmail.com)';
// AC6: never burst — 100ms floor between our OWN calls to Scryfall's image
// CDN from this function instance (see createThrottle's own doc comment in
// functions/lib/cardImage.js for the per-instance-only caveat).
const cardImageFillThrottle = createThrottle(100);

exports.cardImage = onRequest({ cors: true }, async (request, response) => {
  const parsed = parseImagePath(request.path);
  if (!parsed) {
    response.status(400).json({ error: 'Invalid image request' });
    return;
  }

  const objectPath = cardImageStoragePath(parsed);
  const scryfallSrc = cardImageScryfallUrl(parsed);

  try {
    const bucket = admin.storage().bucket();
    const file = bucket.file(objectPath);
    const [exists] = await file.exists();

    if (exists) {
      // AC3/AC9 cache hit — served from Storage, Scryfall is never called.
      response.set('Content-Type', 'image/webp');
      response.set('Cache-Control', CARD_IMAGE_STORAGE_CACHE_CONTROL);
      file.createReadStream()
        .on('error', (err) => {
          logger.error('[cardImage] Storage read failed after exists()=true, degrading to Scryfall', err);
          if (!response.headersSent) response.redirect(302, scryfallSrc);
        })
        .pipe(response);
      return;
    }

    // Cache miss — fetch from Scryfall exactly once (AC3), throttled (AC6).
    await cardImageFillThrottle();
    const scryfallRes = await fetch(scryfallSrc, {
      headers: { 'User-Agent': CARD_IMAGE_USER_AGENT },
    });

    if (!scryfallRes.ok) {
      logger.warn(`[cardImage] Scryfall returned ${scryfallRes.status} for ${scryfallSrc}`);
      response.redirect(302, scryfallSrc); // AC7 degradation
      return;
    }

    const buf = Buffer.from(await scryfallRes.arrayBuffer());

    // Best-effort persist — a failed write must not fail the response the
    // user is waiting on; the next request just re-fetches from Scryfall.
    file.save(buf, {
      contentType: 'image/webp',
      metadata: { cacheControl: CARD_IMAGE_STORAGE_CACHE_CONTROL },
    }).catch((err) => logger.error('[cardImage] Storage save failed (served the response anyway)', err));

    response.set('Content-Type', 'image/webp');
    response.set('Cache-Control', CARD_IMAGE_STORAGE_CACHE_CONTROL);
    response.status(200).send(buf);
  } catch (err) {
    // AC7 degradation — our proxy is unavailable for any reason; the card
    // still renders by falling all the way back to Scryfall directly.
    logger.error('[cardImage] Unexpected error, degrading to direct Scryfall URL', err);
    response.redirect(302, scryfallSrc);
  }
});
