// Moxfield Proxy Worker - Cloudflare Workers
// Evita CORS y Cloudflare protection

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const deckId = url.searchParams.get('id') || url.pathname.split('/').pop();

    // Validate deck ID
    if (!deckId || !/^[a-zA-Z0-9_-]+$/.test(deckId)) {
      return new Response(
        JSON.stringify({ error: 'Invalid deck ID' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    try {
      const moxfieldResponse = await fetch(`https://api2.moxfield.com/v3/decks/all/${deckId}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Referer': 'https://www.moxfield.com/',
        }
      });

      if (!moxfieldResponse.ok) {
        return new Response(
          JSON.stringify({ error: `Moxfield error: ${moxfieldResponse.status}` }),
          { status: moxfieldResponse.status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      const data = await moxfieldResponse.json();
      return new Response(JSON.stringify(data), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch deck' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
  }
};
