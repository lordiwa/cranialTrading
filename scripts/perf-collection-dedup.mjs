// TASK-166 follow-up — checks whether fetchPriceData() (src/services/mtgjson.ts)
// dedupes CONCURRENT in-flight calls. It memoizes the RESOLVED value
// (`priceDataCache = response.data`, set only after the fetch completes) but
// never memoizes the in-flight PROMISE itself. On /collection, each visible
// CollectionGridCard(Compact|Full) fires getCardPrices() from its own
// IntersectionObserver (rootMargin 200px) as soon as it enters/nears the
// viewport — several cards typically become visible within the same tick on
// initial load. Hypothesis: with a cold IndexedDB cache, that produces
// multiple concurrent 5.48MB mtgjson.com fetches instead of one.
//
// This script counts requests to mtgjson.com/api/v5/AllPricesToday.json.gz
// on a single navigation to /collection and reports their start times so
// overlap (not just count) is visible — under harsh4g each individual
// download takes >60s, so if request #2 starts before #1 finishes, they are
// genuinely competing for the same throttled pipe, not just sequential.
//
// Usage:
//   node scripts/perf-collection-dedup.mjs <url> [--profile=fast3g|harsh4g] [--storage-state=<path>]
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

const url = process.argv[2] ?? 'http://localhost:4173/collection';
const profileArg = process.argv.find(a => a.startsWith('--profile='));
const profileName = profileArg ? profileArg.slice('--profile='.length) : 'harsh4g';
const storageStateArg = process.argv.find(a => a.startsWith('--storage-state='));
const STORAGE_STATE = storageStateArg
  ? path.resolve(storageStateArg.slice('--storage-state='.length))
  : path.resolve(__dirname, '..', 'e2e', '.auth', 'user.json');

if (!fs.existsSync(STORAGE_STATE)) {
  console.error(`Missing ${STORAGE_STATE}`);
  process.exit(1);
}
if (!NETWORK_PROFILES[profileName]) {
  console.error(`Unknown --profile=${profileName}`);
  process.exit(1);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: STORAGE_STATE });
const page = await ctx.newPage();

// Cold IndexedDB — this is the condition under which fetchPriceData() has
// nothing to short-circuit on, so every getCardPrices() call must go
// through the full memory-cache-miss -> IndexedDB-miss -> network path.
await page.addInitScript(() => {
  try { indexedDB.deleteDatabase('mtgjson-prices'); } catch { /* ignore */ }
});

const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
const mtgjsonRequests = []; // { requestId, startedAt, finishedAt }
const t0 = Date.now();
cdp.on('Network.requestWillBeSent', (e) => {
  if (e.request.url.includes('mtgjson.com')) {
    mtgjsonRequests.push({ requestId: e.requestId, url: e.request.url, startedAtMs: Date.now() - t0, finishedAtMs: null });
  }
});
cdp.on('Network.loadingFinished', (e) => {
  const r = mtgjsonRequests.find(r => r.requestId === e.requestId);
  if (r) r.finishedAtMs = Date.now() - t0;
});
cdp.on('Network.loadingFailed', (e) => {
  const r = mtgjsonRequests.find(r => r.requestId === e.requestId);
  if (r) r.finishedAtMs = `FAILED: ${e.errorText}`;
});

await cdp.send('Network.emulateNetworkConditions', {
  offline: false,
  ...NETWORK_PROFILES[profileName],
});

console.log(`Navigating to ${url} with profile=${profileName}, cold IndexedDB...`);
await page.goto(url, { waitUntil: 'commit', timeout: 120000 });

// Give the grid time to mount and its visible cards' IntersectionObservers
// to fire — generous under throttle since even small Firestore reads/local
// chunks are slower here. We only need to observe REQUEST START events
// (headers), not full completion, to answer the dedup question.
await page.waitForTimeout(90000);

console.log(`\n=== TASK-166 /collection mtgjson dedup check — profile=${profileName} ===`);
console.log(`mtgjson.com/AllPricesToday.json.gz requests observed: ${mtgjsonRequests.length}`);
mtgjsonRequests.forEach((r, i) => {
  console.log(`  #${i + 1} started=${r.startedAtMs}ms finished=${r.finishedAtMs ?? 'still in flight at snapshot'}`);
});
if (mtgjsonRequests.length > 1) {
  const overlapping = mtgjsonRequests.filter((r, i) => i > 0 && (r.finishedAtMs === null || r.startedAtMs < (mtgjsonRequests[0].finishedAtMs ?? Infinity)));
  console.log(`  >1 request confirmed. Requests starting before #1 finished (genuine overlap, not just sequential): ${overlapping.length}`);
} else if (mtgjsonRequests.length === 1) {
  console.log('  Only 1 request — dedup hypothesis NOT confirmed on this run (single fetch, as expected if visible cards happened to serialize or only one card triggered a fetch in time).');
} else {
  console.log('  0 requests — no card triggered a price fetch within the wait window.');
}

await browser.close();
