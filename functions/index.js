/**
 * Cloud Functions for Cranial Trading
 *
 * Functions:
 * - moxfieldDeck: Proxy for Moxfield API (CORS bypass)
 * - notifyMatchUser: Cross-user match notification (bypasses security rules)
 */

const {setGlobalOptions} = require("firebase-functions");
const {onRequest, onCall, HttpsError} = require("firebase-functions/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

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
