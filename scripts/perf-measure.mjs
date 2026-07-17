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
// Requires playwright-core (already a devDependency) — run from the repo root.
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
  // esperar FCP disponible + settle corto
  await page.waitForTimeout(1500);
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
  return m;
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
  console.log(`  APPRENDER median=${median(rs.map(r => r.appRender ?? -1))}ms  all=[${rs.map(r => r.appRender).join(',')}]`);
}
await browser.close();
