// Perf harness — cranial trading guest cold-load benchmark.
//
// Measures FCP, DOMContentLoaded, load, and "APPRENDER" (first paint of real
// app content, detected via a DOM selector) against a running dev/preview/prod
// URL. Uses a fresh browser context per run (cold cache) and two network
// profiles: no throttle and FAST3G (1.6Mbps down / 750Kbps up / 150ms RTT).
//
// Usage:
//   node scripts/perf-measure.mjs <url> [runs]
//
// Examples:
//   node scripts/perf-measure.mjs http://localhost:4173/login 5
//   node scripts/perf-measure.mjs https://cranial-trading-dev.web.app/login
//
// Requires playwright-core, resolved transitively via the @playwright/test
// devDependency already used for E2E (see package-lock.json) — run from the
// repo root so that resolution works.
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, '..', 'package.json'));
const { chromium } = require('playwright-core');

const url = process.argv[2] ?? 'https://cranial-trading.web.app/login';
const runs = Number(process.argv[3] ?? 5);

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

async function measure(browser, throttle) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await ctx.addInitScript(() => {
    window.__appRenderTime = null;
    const check = () => {
      if (window.__appRenderTime === null) {
        // TASK-132 review fix (LOW-2): keep in sync with
        // PAINTED_CONTENT_SELECTOR in src/utils/paintSignal.ts — this
        // standalone Node script can't import app TS source, so it carries
        // its own copy of the same literal. stores/auth.ts's
        // waitForFirstPaintOrTimeout defers the Firebase SDK fetch until
        // this same condition is true; this script measures how long it
        // takes.
        const el = document.querySelector('#app header, #app main, #app input, #app button');
        if (el) { window.__appRenderTime = Math.round(performance.now()); return; }
        requestAnimationFrame(check);
      }
    };
    requestAnimationFrame(check);
  });
  if (throttle) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
  }
  await page.goto(url, { waitUntil: 'load', timeout: 90000 });
  // Wait for the real APPRENDER paint explicitly instead of a fixed settle —
  // under FAST3G the render can land well after `load`. A fixed timeout would
  // silently record null (mapped to -1) and mix a bogus low value into the
  // median with no warning. Bounded wait + explicit TIMEOUT marker instead.
  let appRenderTimedOut = false;
  try {
    await page.waitForFunction(() => window.__appRenderTime !== null, { timeout: 30000 });
  } catch {
    appRenderTimedOut = true;
  }
  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByType('paint').find(p => p.name === 'first-contentful-paint');
    return {
      fcp: fcp ? Math.round(fcp.startTime) : null,
      dcl: Math.round(nav.domContentLoadedEventEnd),
      load: Math.round(nav.loadEventEnd),
      appRender: window.__appRenderTime,
    };
  });
  await ctx.close();
  return { ...m, appRenderTimedOut };
}

const browser = await chromium.launch();
for (const throttle of [false, true]) {
  const rs = [];
  for (let i = 0; i < runs; i++) rs.push(await measure(browser, throttle));
  const label = throttle ? 'FAST3G' : 'NOTHROTTLE';
  console.log(`${label} url=${url} runs=${runs}`);
  console.log(`  FCP  median=${median(rs.map(r => r.fcp ?? -1))}ms  all=[${rs.map(r => r.fcp).join(',')}]`);
  console.log(`  DCL  median=${median(rs.map(r => r.dcl))}ms  all=[${rs.map(r => r.dcl).join(',')}]`);
  console.log(`  LOAD median=${median(rs.map(r => r.load))}ms  all=[${rs.map(r => r.load).join(',')}]`);

  const timedOut = rs.filter(r => r.appRenderTimedOut).length;
  const validAppRender = rs.filter(r => !r.appRenderTimedOut).map(r => r.appRender);
  const appRenderDisplay = rs.map(r => r.appRenderTimedOut ? 'TIMEOUT' : r.appRender).join(',');
  const appRenderMedian = validAppRender.length ? `${median(validAppRender)}ms` : 'N/A (all runs timed out)';
  const timeoutNote = timedOut ? `  (${timedOut}/${runs} TIMEOUT — excluded from median)` : '';
  console.log(`  APPRENDER median=${appRenderMedian}  all=[${appRenderDisplay}]${timeoutNote}`);

  if (timedOut > runs / 2) {
    console.error(`FATAL: ${label} — majority of runs (${timedOut}/${runs}) timed out waiting for APPRENDER. These numbers are not trustworthy.`);
    process.exitCode = 1;
  }
}
await browser.close();
