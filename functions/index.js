/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const logger = require("firebase-functions/logger");

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
