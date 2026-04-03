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
// Fields that belong to the user doc (not the cache)
const USER_CARD_FIELDS = new Set([
  'scryfallId', 'quantity', 'condition', 'foil', 'status', 'public',
  'price', 'language', 'name', 'edition', 'setCode', 'image', 'deckName',
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

        batch.set(ref, {
          ...userFields,
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
// MIGRATE USER CARDS
// Strips Scryfall-only fields from user card docs (lazy migration)
// Requires scryfall_cache to be populated first
// ============================================================

const SCRYFALL_ONLY_FIELDS = [
  'type_line', 'cmc', 'colors', 'rarity', 'power', 'toughness',
  'oracle_text', 'keywords', 'legalities', 'full_art', 'produced_mana',
];

/**
 * migrateUserCards — Callable function for lazy data migration.
 * Strips Scryfall-only fields from a user's card docs after verifying
 * they exist in scryfall_cache. Keeps convenience copies (name, edition, image, setCode).
 *
 * Call with: { userId } (admin) or no args (self-migration)
 */
exports.migrateUserCards = onCall(
  { maxInstances: 3, timeoutSeconds: 300, memory: '512MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }

    // Allow self-migration or admin-triggered migration
    const userId = request.data?.userId || request.auth.uid;
    logger.info(`[migrateUserCards] Starting migration for user ${userId}`);
    const startTime = Date.now();

    const colRef = db.collection(`users/${userId}/cards`);
    const snapshot = await colRef.get();

    if (snapshot.empty) {
      return { success: true, migrated: 0, skipped: 0, message: 'No cards to migrate' };
    }

    // Collect all unique scryfallIds and verify they exist in cache
    const scryfallIds = [...new Set(
      snapshot.docs.map(d => d.data().scryfallId).filter(Boolean)
    )];

    const cacheRefs = scryfallIds.map(id =>
      db.collection(SCRYFALL_CACHE_COLLECTION).doc(id)
    );

    const cachedIds = new Set();
    if (cacheRefs.length > 0) {
      // getAll supports up to ~100 refs per call efficiently
      const GETALL_CHUNK = 100;
      for (let i = 0; i < cacheRefs.length; i += GETALL_CHUNK) {
        const chunk = cacheRefs.slice(i, i + GETALL_CHUNK);
        const cacheDocs = await db.getAll(...chunk);
        for (const cDoc of cacheDocs) {
          if (cDoc.exists) cachedIds.add(cDoc.id);
        }
      }
    }

    logger.info(`[migrateUserCards] Cache coverage: ${cachedIds.size}/${scryfallIds.length} scryfallIds`);

    let migrated = 0;
    let skipped = 0;
    const BATCH_SIZE = 500;

    for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
      const chunk = snapshot.docs.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      let batchHasWrites = false;

      for (const docSnap of chunk) {
        const data = docSnap.data();

        // Skip if scryfallId not in cache (can't safely strip fields)
        if (!data.scryfallId || !cachedIds.has(data.scryfallId)) {
          skipped++;
          continue;
        }

        // Check if any Scryfall-only fields exist on this doc
        const hasFieldsToRemove = SCRYFALL_ONLY_FIELDS.some(f => data[f] !== undefined);
        if (!hasFieldsToRemove) continue;

        // Build delete update
        const deleteUpdate = {};
        for (const field of SCRYFALL_ONLY_FIELDS) {
          if (data[field] !== undefined) {
            deleteUpdate[field] = admin.firestore.FieldValue.delete();
          }
        }

        batch.update(docSnap.ref, deleteUpdate);
        batchHasWrites = true;
        migrated++;
      }

      if (batchHasWrites) {
        await batch.commit();
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`[migrateUserCards] Done: ${migrated} migrated, ${skipped} skipped in ${elapsed}s`);

    // Mark user as migrated
    await db.doc(`users/${userId}`).set({ _migrated: true }, { merge: true });

    return { success: true, migrated, skipped, elapsed: `${elapsed}s` };
  }
);

// ============================================================
// CARD INDEX — Lightweight index for fast filtering & pagination
// Stores compact card summaries in chunked docs (5000 cards/chunk)
// ============================================================

const INDEX_CHUNK_SIZE = 2000;

/**
 * Extract compact index fields from a full card document.
 * Uses short keys to minimize doc size (~170 bytes per card).
 */
function toIndexCard(id, data) {
  // Compact legalities: only store format names where card is legal
  let lg = [];
  if (data.legalities && typeof data.legalities === 'object') {
    lg = Object.entries(data.legalities)
      .filter(([, v]) => v === 'legal')
      .map(([k]) => k);
  }

  // Compact rarity: first char
  const rarity = data.rarity ? data.rarity.charAt(0) : '';

  // Compact createdAt: timestamp in ms
  let ca = 0;
  if (data.createdAt) {
    if (typeof data.createdAt.toMillis === 'function') {
      ca = data.createdAt.toMillis();
    } else if (data.createdAt._seconds) {
      ca = data.createdAt._seconds * 1000;
    }
  }

  return {
    i: id,
    s: data.scryfallId || '',
    n: data.name || '',
    st: data.status || 'collection',
    q: data.quantity || 1,
    p: data.price || 0,
    cm: data.cmc ?? 0,
    co: data.colors || [],
    r: rarity,
    t: data.type_line || '',
    f: !!data.foil,
    sc: data.setCode || '',
    pw: data.power || '',
    to: data.toughness || '',
    fa: !!data.full_art,
    pm: data.produced_mana || [],
    kw: data.keywords || [],
    lg,
    ca,
    cn: data.condition || 'NM',
    pb: data.public !== false,
  };
}

/**
 * buildCardIndex — Builds or rebuilds the card_index for a user.
 * Reads all card docs, extracts compact fields, writes in chunks of 5000.
 *
 * Call with: no args (self) or { userId } (admin-triggered)
 */
exports.buildCardIndex = onCall(
  { maxInstances: 3, timeoutSeconds: 300, memory: '2GiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }

    const userId = request.data?.userId || request.auth.uid;
    logger.info(`[buildCardIndex] Starting for user ${userId}`);
    const startTime = Date.now();

    const colRef = db.collection(`users/${userId}/cards`);
    const indexRef = db.collection(`users/${userId}/card_index`);

    // Read all cards with cursor-based pagination + field projection
    // Only select fields needed for the index (reduces memory ~80%)
    const INDEX_FIELDS = [
      'scryfallId', 'name', 'status', 'quantity', 'price', 'cmc',
      'colors', 'rarity', 'type_line', 'foil', 'setCode', 'power',
      'toughness', 'full_art', 'produced_mana', 'keywords', 'legalities',
      'createdAt', 'condition', 'public',
    ];

    const allIndexCards = [];
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
        allIndexCards.push(toIndexCard(doc.id, doc.data()));
      }

      lastDoc = snapshot.docs[snapshot.docs.length - 1];
      if (snapshot.docs.length < READ_CHUNK) break;
    }

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
