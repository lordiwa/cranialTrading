// TASK-166 perf harness — measures the ~7s gap on /inicio between the last
// Firestore getDoc of the auth/profile boot sequence and the hero search
// input becoming available in the DOM.
//
// Reuses the Playwright storageState the E2E suite already produces
// (e2e/.auth/user.json, via e2e/auth.setup.ts) instead of a fresh login flow.
//
// Usage:
//   node scripts/perf-measure-inicio.mjs <url> [runs] [--cold|--warm]
//
// --cold (default): fresh IndexedDB every run (clears 'mtgjson-prices' DB
//   before navigation) — simulates a first-ever visit, preloadPriceData must
//   fetch+parse the full gzip.
// --warm: leaves IndexedDB populated across runs after the first — simulates
//   a returning visitor where preloadPriceData's cache hit short-circuits
//   the network fetch (see isCacheValid in src/services/mtgjson.ts).
//
// Captures, per run:
//   - full performance.getEntriesByType('resource') (not just Firestore)
//   - marks for: last boot getDoc end, hero input appearing in DOM
//   - a CDP Tracing profile is NOT used here (too heavy for N runs); instead
//     we rely on resource-timing + a long-task observer (PerformanceObserver
//     'longtask') to show what occupies the main thread during the gap.
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, '..', 'package.json'));
const { chromium } = require('playwright-core');

const url = process.argv[2] ?? 'http://localhost:4175/inicio';
const runsArg = process.argv.find((a, i) => i >= 3 && /^\d+$/.test(a));
const runs = Number(runsArg ?? 3);
const mode = process.argv.includes('--warm') ? 'warm' : 'cold';

const STORAGE_STATE = path.resolve(__dirname, '..', 'e2e', '.auth', 'user.json');
if (!fs.existsSync(STORAGE_STATE)) {
  console.error(`Missing ${STORAGE_STATE} — run the E2E auth setup first (npx playwright test --project=setup).`);
  process.exit(1);
}

async function measure(ctx, keepIndexedDb) {
  const page = await ctx.newPage();

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

  const resourceTimings = [];
  page.on('request', () => {}); // keep for future extension, unused for now

  await page.goto(url, { waitUntil: 'commit', timeout: 90000 });

  // Wait for hero input, bounded.
  let timedOut = false;
  try {
    await page.waitForFunction(() => window.__heroInputAt !== null, { timeout: 30000 });
  } catch {
    timedOut = true;
  }

  // Let long tasks still in flight settle briefly.
  await page.waitForTimeout(300);

  const data = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource').map(r => ({
      name: r.name,
      startTime: Math.round(r.startTime),
      duration: Math.round(r.duration),
      transferSize: r.transferSize ?? null,
      initiatorType: r.initiatorType,
    }));
    return {
      dcl: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      heroInputAt: window.__heroInputAt,
      longtasks: window.__marks.longtasks,
      resources,
    };
  });

  await page.close();
  return { ...data, timedOut };
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
    // Only the very first run wipes IndexedDB; the rest keep it (keepIndexedDb=true).
    const r = await measure(ctx, i > 0);
    results.push(r);
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

console.log(`\n=== TASK-166 /inicio hero-input gap — mode=${mode} url=${url} runs=${runs} ===`);
results.forEach((r, i) => {
  console.log(`\n--- run ${i + 1} ---`);
  console.log(`  heroInputAt: ${r.timedOut ? 'TIMEOUT' : r.heroInputAt + 'ms'}`);
  const mtgjsonRes = r.resources.filter(res => res.name.includes('mtgjson.com'));
  console.log(`  mtgjson.com resources: ${mtgjsonRes.length}`);
  mtgjsonRes.forEach(res => console.log(`    ${res.initiatorType} ${res.name} start=${res.startTime}ms dur=${res.duration}ms size=${res.transferSize}`));
  const firestoreRes = r.resources.filter(res => res.name.includes('firestore.googleapis.com'));
  console.log(`  firestore resources: ${firestoreRes.length}`);
  firestoreRes.forEach(res => console.log(`    start=${res.startTime}ms dur=${res.duration}ms`));
  console.log(`  longtasks (>50ms main-thread blocks): ${r.longtasks.length}`);
  r.longtasks.forEach(lt => console.log(`    start=${lt.start}ms dur=${lt.duration}ms attribution=${JSON.stringify(lt.attribution)}`));
  const totalLongtaskMs = r.longtasks.reduce((a, lt) => a + lt.duration, 0);
  console.log(`  sum(longtask duration)=${totalLongtaskMs}ms`);
});

const validHero = results.filter(r => !r.timedOut).map(r => r.heroInputAt);
console.log(`\nheroInputAt median=${validHero.length ? median(validHero) : 'N/A'}ms  all=[${results.map(r => r.timedOut ? 'TIMEOUT' : r.heroInputAt).join(',')}]`);
