/**
 * Cloud Functions for Cranial Trading
 *
 * Functions:
 * - moxfieldDeck: Proxy for Moxfield API (CORS bypass)
 * - notifyMatchUser: Cross-user match notification (bypasses security rules)
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
