// TASK-166 perf harness — started as a hero-input-timing tool, now doubles
// as a boot BYTE BUDGET auditor for /inicio under slow-network profiles.
//
// Ticket pivot (2026-08-10): Rafael's original 7s measurement was on real
// 4G, not desktop broadband — the actual problem is total bytes moved
// before /inicio is usable, not a specific millisecond gap. See per-run
// byte breakdown by origin + deferrable/irreducible split below.
//
// Reuses the Playwright storageState the E2E suite already produces
// (e2e/.auth/user.json, via e2e/auth.setup.ts) instead of a fresh login flow.
//
// Usage:
//   node scripts/perf-measure-inicio.mjs <url> [runs] [--cold|--warm] [--profile=fast3g|harsh4g] [--storage-state=<path>]
//
// --cold (default): fresh IndexedDB every run (clears 'mtgjson-prices' DB
//   before navigation) — simulates a first-ever visit, preloadPriceData must
//   fetch+parse the full gzip.
// --warm: leaves IndexedDB populated across runs after the first — simulates
//   a returning visitor where preloadPriceData's cache hit short-circuits
//   the network fetch (see isCacheValid in src/services/mtgjson.ts).
// --profile=fast3g: CDP FAST3G (1.6Mbps down / 750Kbps up / 150ms RTT), same
//   profile as scripts/perf-measure.mjs.
// --profile=harsh4g: CDP slow-4G approximation for the actual target market
//   (~600Kbps down / 300Kbps up / 300ms RTT) — this is the profile that
//   matters for the byte-budget verdict, per team-lead direction.
//   Either profile makes the app's own JS chunks compete on the SAME
//   constrained pipe as the mtgjson.com fetch, unlike a plain localhost run
//   where local chunks arrive at disk speed regardless of what mtgjson is
//   doing.
// --storage-state=<path>: use a specific storageState file instead of the
//   default e2e/.auth/user.json (e.g. one scoped to a deployed origin,
//   produced by scripts/perf-remote-login.mjs).
//
// Captures, per run, via CDP Network domain (not performance.getEntriesByType
// ('resource') — that API zeroes transferSize for any cross-origin response
// lacking a Timing-Allow-Origin header, which mtgjson.com does not send, so
// resource-timing alone silently hides the exact bytes that matter most
// here):
//   - every request's real encodedDataLength (compressed bytes over the
//     wire), grouped by origin, with a deferrable/irreducible tag
//   - marks for: hero input appearing in DOM
//   - a long-task observer (PerformanceObserver 'longtask') for main-thread
//     attribution, kept from the original hero-gap investigation
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, '..', 'package.json'));
const { chromium } = require('playwright-core');

const NETWORK_PROFILES = {
  fast3g: { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
  harsh4g: { latency: 300, downloadThroughput: (600 * 1024) / 8, uploadThroughput: (300 * 1024) / 8 },
};

const url = process.argv[2] ?? 'http://localhost:4175/inicio';
const runsArg = process.argv.find((a, i) => i >= 3 && /^\d+$/.test(a));
const runs = Number(runsArg ?? 3);
const mode = process.argv.includes('--warm') ? 'warm' : 'cold';
const profileArg = process.argv.find(a => a.startsWith('--profile='));
const profileName = profileArg ? profileArg.slice('--profile='.length) : null;
const throttle = !!profileName;
if (profileName && !NETWORK_PROFILES[profileName]) {
  console.error(`Unknown --profile=${profileName}. Valid: ${Object.keys(NETWORK_PROFILES).join(', ')}`);
  process.exit(1);
}
const storageStateArg = process.argv.find(a => a.startsWith('--storage-state='));

const STORAGE_STATE = storageStateArg
  ? path.resolve(storageStateArg.slice('--storage-state='.length))
  : path.resolve(__dirname, '..', 'e2e', '.auth', 'user.json');
if (!fs.existsSync(STORAGE_STATE)) {
  console.error(`Missing ${STORAGE_STATE} — run the E2E auth setup first (npx playwright test --project=setup), or pass --storage-state=<path> from scripts/perf-remote-login.mjs.`);
  process.exit(1);
}

async function measure(ctx, keepIndexedDb, applyThrottle = throttle, waitForCacheSeed = false) {
  const page = await ctx.newPage();

  // CDP Network domain — real wire bytes (encodedDataLength) per request,
  // regardless of Timing-Allow-Origin. requestId correlates
  // requestWillBeSent (url) with loadingFinished (actual transferred size).
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  const reqMeta = new Map(); // requestId -> { url, resourceType }
  const byteLog = new Map(); // url -> { url, resourceType, declaredBytes, actualBytes, finished }
  cdp.on('Network.requestWillBeSent', (e) => {
    reqMeta.set(e.requestId, { url: e.request.url, resourceType: e.type });
  });
  cdp.on('Network.responseReceived', (e) => {
    const meta = reqMeta.get(e.requestId);
    if (!meta) return;
    // Headers arrive fast even under throttle (small payload) — the
    // Content-Length header gives the DECLARED total size immediately,
    // which is what a byte budget cares about, independent of whether the
    // body finishes downloading inside our measurement window.
    const headers = e.response.headers || {};
    const cl = headers['content-length'] ?? headers['Content-Length'];
    byteLog.set(meta.url, {
      url: meta.url,
      resourceType: meta.resourceType,
      declaredBytes: cl ? Number(cl) : null,
      actualBytes: null,
      finished: false,
    });
  });
  cdp.on('Network.loadingFinished', (e) => {
    const meta = reqMeta.get(e.requestId);
    if (!meta) return;
    const entry = byteLog.get(meta.url);
    if (entry) {
      entry.actualBytes = e.encodedDataLength;
      entry.finished = true;
    }
  });

  if (applyThrottle) {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      ...NETWORK_PROFILES[profileName],
    });
  }

  await page.addInitScript((keepDb) => {
    window.__marks = { longtasks: [] };
    // Long-task observer — anything >50ms blocking the main thread, with
    // attribution when the browser provides it (script container src etc).
    try {
      const po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          window.__marks.longtasks.push({
            start: Math.round(e.startTime),
            duration: Math.round(e.duration),
            attribution: (e.attribution || []).map(a => ({
              name: a.name, container: a.containerType, src: a.containerSrc,
            })),
          });
        }
      });
      po.observe({ type: 'longtask', buffered: true });
    } catch { /* longtask not supported */ }

    // Hero input appearance timestamp.
    window.__heroInputAt = null;
    const checkHero = () => {
      if (window.__heroInputAt === null) {
        const el = document.querySelector('[data-testid="home-search"] input');
        if (el) { window.__heroInputAt = Math.round(performance.now()); return; }
        requestAnimationFrame(checkHero);
      }
    };
    requestAnimationFrame(checkHero);

    if (!keepDb) {
      // Cold run: wipe the mtgjson IndexedDB cache before app code runs so
      // preloadPriceData() cannot short-circuit on a cache hit.
      try { indexedDB.deleteDatabase('mtgjson-prices'); } catch { /* ignore */ }
    }
  }, keepIndexedDb);

  await page.goto(url, { waitUntil: 'commit', timeout: 120000 });

  // Wait for hero input, bounded. Longer under --throttle: FAST3G/harsh4G
  // can legitimately push this well past the untouched-mode 30s bound.
  let timedOut = false;
  try {
    await page.waitForFunction(() => window.__heroInputAt !== null, { timeout: throttle ? 90000 : 30000 });
  } catch {
    timedOut = true;
  }

  // Let long tasks and in-flight response HEADERS (not bodies — those can
  // legitimately still be downloading for tens of seconds under throttle,
  // see NETWORK_PROFILES) settle briefly.
  await page.waitForTimeout(500);

  if (waitForCacheSeed) {
    // Warm-mode seed run: block here (unthrottled, so this is fast) until
    // preloadPriceData's IndexedDB write actually lands — otherwise a
    // throttled seed run would still be mid-fetch when we move on to the
    // "warm" runs, and they'd see an EMPTY cache and refetch, silently
    // defeating the whole point of --warm under --profile.
    try {
      await page.waitForFunction(async () => {
        return await new Promise((resolve) => {
          const req = indexedDB.open('mtgjson-prices');
          req.onerror = () => resolve(false);
          req.onsuccess = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('prices')) { db.close(); resolve(false); return; }
            const tx = db.transaction('prices', 'readonly');
            const getReq = tx.objectStore('prices').get('allPrices');
            getReq.onsuccess = () => { db.close(); resolve(!!getReq.result); };
            getReq.onerror = () => { db.close(); resolve(false); };
          };
        });
      }, { timeout: 20000 });
    } catch {
      console.log('  WARNING: cache seed did not land within 20s — subsequent "warm" runs may still be cold.');
    }
  }

  const data = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    return {
      dcl: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      heroInputAt: window.__heroInputAt,
      longtasks: window.__marks.longtasks,
    };
  });

  await page.close();
  return { ...data, timedOut, byteLog: Array.from(byteLog.values()) };
}

const browser = await chromium.launch();
const results = [];
if (mode === 'warm') {
  // IndexedDB is scoped to the browser context's storage partition, not to
  // individual pages — a fresh newContext() per run starts with an empty
  // IndexedDB every time (no on-disk persistence for a non-persistent
  // context). To exercise the "cache already populated" path we reuse ONE
  // context across all runs: run 1 populates IndexedDB (cold navigation,
  // preloadPriceData fetches+parses+saves), runs 2..N navigate again in the
  // SAME context and should hit the isCacheValid() cache path.
  const ctx = await browser.newContext({ storageState: STORAGE_STATE });
  for (let i = 0; i < runs; i++) {
    console.log(`[warm] run ${i + 1}/${runs}...`);
    if (i === 0) {
      // Seed run: ALWAYS unthrottled and blocked until the IndexedDB write
      // actually lands, regardless of --profile — a throttled seed run
      // would still be mid-fetch (5.48MB @ 600Kbps ≈ 73s) when we moved on,
      // leaving subsequent "warm" runs cold too. See waitForCacheSeed above.
      const r = await measure(ctx, false, false, true);
      results.push(r);
    } else {
      // Only the very first run wipes IndexedDB; the rest keep it (keepIndexedDb=true).
      const r = await measure(ctx, true, throttle, false);
      results.push(r);
    }
  }
  await ctx.close();
  // Drop run 1 from the "warm" report — it's the cold seed run, not a warm sample.
  results.shift();
} else {
  for (let i = 0; i < runs; i++) {
    console.log(`[cold] run ${i + 1}/${runs}...`);
    const ctx = await browser.newContext({ storageState: STORAGE_STATE });
    const r = await measure(ctx, false);
    await ctx.close();
    results.push(r);
  }
}
await browser.close();

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

// Byte classification for the boot budget. DEFERRABLE = not needed to paint
// or use /inicio (confirmed by the earlier TASK-166 hero-timing runs: hero
// input appears well before mtgjson finishes downloading in every condition
// tested, cold/warm/throttled/deployed — it's fire-and-forget in
// src/App.vue and never gates render). IRREDUCIBLE = needed for the page to
// render or the session to be usable as currently built (app JS/CSS,
// fonts, auth token refresh, the Firestore profile read, UI icons/avatar).
function classify(u) {
  if (u.includes('mtgjson.com')) return 'DEFERRABLE (preloadPriceData, fire-and-forget)';
  if (u.includes('firestore.googleapis.com')) return 'irreducible (profile read)';
  if (u.includes('identitytoolkit.googleapis.com') || u.includes('securetoken.googleapis.com')) return 'irreducible (auth token)';
  if (u.includes('dicebear.com')) return 'irreducible (avatar, tiny)';
  if (u.includes('/Fonts/')) return 'irreducible (webfonts)';
  if (u.endsWith('.js') || u.endsWith('.css') || u.includes('icons.svg')) return 'irreducible (app bundle)';
  return 'irreducible (other)';
}
function originOf(u) {
  try { return new URL(u).host; } catch { return u; }
}

console.log(`\n=== TASK-166 /inicio BYTE BUDGET — mode=${mode} url=${url} runs=${runs} profile=${profileName ?? 'none'} ===`);
results.forEach((r, i) => {
  console.log(`\n--- run ${i + 1} ---`);
  console.log(`  heroInputAt: ${r.timedOut ? 'TIMEOUT' : r.heroInputAt + 'ms'}`);
  console.log(`  longtasks (>50ms main-thread blocks): ${r.longtasks.length}, sum=${r.longtasks.reduce((a, lt) => a + lt.duration, 0)}ms`);

  const byOrigin = new Map();
  let totalDeclared = 0, totalActual = 0, totalDeferrable = 0, totalIrreducible = 0;
  for (const entry of r.byteLog) {
    const bytes = entry.declaredBytes ?? entry.actualBytes ?? 0;
    const origin = originOf(entry.url);
    const cls = classify(entry.url);
    if (!byOrigin.has(origin)) byOrigin.set(origin, { declared: 0, actual: 0, count: 0 });
    const o = byOrigin.get(origin);
    o.declared += entry.declaredBytes ?? 0;
    o.actual += entry.actualBytes ?? 0;
    o.count += 1;
    totalDeclared += entry.declaredBytes ?? 0;
    totalActual += entry.actualBytes ?? 0;
    if (cls.startsWith('DEFERRABLE')) totalDeferrable += bytes; else totalIrreducible += bytes;
  }

  console.log(`  bytes by origin (declared Content-Length / actual-over-wire-if-finished-in-window):`);
  [...byOrigin.entries()].sort((a, b) => b[1].declared - a[1].declared).forEach(([origin, o]) => {
    console.log(`    ${origin}: ${o.count} req, declared=${(o.declared / 1024).toFixed(1)}KB, actual(finished)=${(o.actual / 1024).toFixed(1)}KB`);
  });
  console.log(`  TOTAL declared=${(totalDeclared / 1024 / 1024).toFixed(2)}MB  |  deferrable=${(totalDeferrable / 1024 / 1024).toFixed(2)}MB  irreducible=${(totalIrreducible / 1024).toFixed(1)}KB`);

  console.log(`  per-request detail:`);
  [...r.byteLog].sort((a, b) => (b.declaredBytes ?? 0) - (a.declaredBytes ?? 0)).forEach(entry => {
    const kb = entry.declaredBytes != null ? (entry.declaredBytes / 1024).toFixed(1) + 'KB' : 'unknown';
    const finishedNote = entry.finished ? '' : ' [BODY STILL IN FLIGHT at snapshot]';
    console.log(`    ${kb.padStart(10)}  ${classify(entry.url).padEnd(38)} ${entry.resourceType.padEnd(8)} ${entry.url}${finishedNote}`);
  });
});

const validHero = results.filter(r => !r.timedOut).map(r => r.heroInputAt);
console.log(`\nheroInputAt median=${validHero.length ? median(validHero) : 'N/A'}ms  all=[${results.map(r => r.timedOut ? 'TIMEOUT' : r.heroInputAt).join(',')}]  (secondary metric — see byte budget above for the primary verdict)`);
