// TASK-178 — isolates, ONE VARIABLE AT A TIME, which of /inicio's boot
// bytes actually block the hero search input from becoming usable, vs which
// are merely present but non-blocking.
//
// Method: navigate under a slow-network profile with specific resources
// BLOCKED via CDP Network.setBlockedURLs (the resource never loads at all —
// not delayed, not throttled differently, just absent). If heroInputAt is
// unaffected (or the page still reaches it, just possibly later due to the
// network profile alone), that resource is NOT a hard blocker. If the hero
// input never appears (timeout) or appears dramatically later than the
// no-block baseline, that resource IS on the critical path.
//
// This does NOT change any application code — it is a pure measurement
// technique (the browser is told to fail the request, as if offline for
// that URL only), so it can answer "does the hero need X" before touching
// src/.
//
// Usage:
//   node scripts/perf-inicio-blocking-audit.mjs <url> [--profile=harsh4g|fast3g] [--storage-state=<path>] [--block=<url-substring>]...
//
// Pass --block multiple times to block several resources in the SAME run
// (e.g. to test "2 of 3 fonts gone"). Omit --block entirely for the
// no-block baseline.
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

const url = process.argv[2];
if (!url) {
  console.error('Usage: node scripts/perf-inicio-blocking-audit.mjs <url> [--profile=harsh4g] [--storage-state=<path>] [--block=<substr>]...');
  process.exit(1);
}
const profileArg = process.argv.find(a => a.startsWith('--profile='));
const profileName = profileArg ? profileArg.slice('--profile='.length) : 'harsh4g';
const storageStateArg = process.argv.find(a => a.startsWith('--storage-state='));
const STORAGE_STATE = storageStateArg
  ? path.resolve(storageStateArg.slice('--storage-state='.length))
  : path.resolve(__dirname, '..', 'e2e', '.auth', 'user.json');
const blockSubstrings = process.argv.filter(a => a.startsWith('--block=')).map(a => a.slice('--block='.length));

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

await page.addInitScript(() => {
  window.__marks = { longtasks: [] };
  window.__heroInputAt = null;
  const checkHero = () => {
    if (window.__heroInputAt === null) {
      const el = document.querySelector('[data-testid="home-search"] input');
      if (el) { window.__heroInputAt = Math.round(performance.now()); return; }
      requestAnimationFrame(checkHero);
    }
  };
  requestAnimationFrame(checkHero);
});

const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');

// Log every request's URL + whether it got blocked, so the report shows
// what was ACTUALLY intercepted (confirms the block substring matched the
// real chunk hash, not a typo that silently blocked nothing).
const requestLog = [];
cdp.on('Network.requestWillBeSent', (e) => {
  requestLog.push({ url: e.request.url, startedAtMs: Math.round(e.timestamp * 1000) });
});

if (blockSubstrings.length > 0) {
  // CDP Network.setBlockedURLs takes wildcard patterns.
  await cdp.send('Network.setBlockedURLs', { urls: blockSubstrings.map(s => `*${s}*`) });
}

await cdp.send('Network.emulateNetworkConditions', {
  offline: false,
  ...NETWORK_PROFILES[profileName],
});

const navStart = Date.now();
let navError = null;
try {
  await page.goto(url, { waitUntil: 'commit', timeout: 120000 });
} catch (e) {
  navError = String(e);
}

let timedOut = false;
try {
  await page.waitForFunction(() => window.__heroInputAt !== null, { timeout: 60000 });
} catch {
  timedOut = true;
}

const heroInputAt = await page.evaluate(() => window.__heroInputAt);
const wallClockToHero = timedOut ? null : Date.now() - navStart;

console.log(`\n=== TASK-178 blocking audit — profile=${profileName} block=[${blockSubstrings.join(', ') || 'NONE (baseline)'}] ===`);
if (navError) console.log(`  nav error: ${navError}`);
console.log(`  heroInputAt (page-relative performance.now): ${timedOut ? 'TIMEOUT (60s) — hero NEVER appeared' : heroInputAt + 'ms'}`);
console.log(`  wall-clock nav-start to hero: ${wallClockToHero !== null ? wallClockToHero + 'ms' : 'N/A (timed out)'}`);
if (blockSubstrings.length > 0) {
  const matchedRequests = requestLog.filter(r => blockSubstrings.some(s => r.url.includes(s)));
  console.log(`  requests matching block pattern(s) actually seen: ${matchedRequests.length}`);
  matchedRequests.forEach(r => console.log(`    ${r.url}`));
  if (matchedRequests.length === 0) {
    console.log('  WARNING: no request matched the block pattern — the block substring may not match the real (hashed) filename. Check dist output before trusting this result.');
  }
}

await browser.close();
