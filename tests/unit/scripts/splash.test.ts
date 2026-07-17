import { readFileSync } from 'fs';
import { resolve } from 'path';

// TASK-128: index.html must paint an instant splash before Vue/JS loads, and
// that splash must never satisfy the perf harness's "app rendered" selector
// (#app header, #app main, #app input, #app button) — otherwise APPRENDER
// measurements would report false-positive early paints.
const indexHtml = readFileSync(resolve(__dirname, '../../../index.html'), 'utf-8');

function extractSplashMarkup(html: string): string {
  const start = html.indexOf('class="app-splash"');
  if (start === -1) throw new Error('app-splash element not found in index.html');
  const divOpen = html.lastIndexOf('<div', start);
  const closeTagIndex = html.indexOf('</div>', start);
  const secondCloseTagIndex = html.indexOf('</div>', closeTagIndex + 1);
  return html.slice(divOpen, secondCloseTagIndex + '</div>'.length);
}

describe('index.html splash markup', () => {
  it('renders the splash as the first child of #app', () => {
    const appStart = indexHtml.indexOf('<div id="app">');
    const splashStart = indexHtml.indexOf('class="app-splash"');
    expect(appStart).toBeGreaterThan(-1);
    expect(splashStart).toBeGreaterThan(appStart);
  });

  it('contains the wordmark and a spinner', () => {
    const splash = extractSplashMarkup(indexHtml);
    expect(splash).toContain('CRANIAL TRADING');
    expect(splash).toContain('app-splash__spinner');
  });

  it('never contains header/main/input/button tags (would false-match the perf harness APPRENDER selector)', () => {
    const splash = extractSplashMarkup(indexHtml);
    expect(splash).not.toMatch(/<header[\s>]/i);
    expect(splash).not.toMatch(/<main[\s>]/i);
    expect(splash).not.toMatch(/<input[\s>]/i);
    expect(splash).not.toMatch(/<button[\s>]/i);
  });

  it('adds zero extra network requests (no external font/image/script refs inside the splash style or markup)', () => {
    const styleStart = indexHtml.indexOf('.app-splash {');
    const styleBlockStart = indexHtml.lastIndexOf('<style>', styleStart);
    const styleBlockEnd = indexHtml.indexOf('</style>', styleStart);
    const styleBlock = indexHtml.slice(styleBlockStart, styleBlockEnd);
    // The @font-face inside this style block must reuse the already-preloaded
    // Space Grotesk woff2 (same URL as the <link rel="preload"> in <head>),
    // never a new/different font file.
    const fontUrls = [...styleBlock.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)].map(m => m[1]);
    for (const url of fontUrls) {
      expect(indexHtml).toContain(`href="${url}"`);
    }
  });
});
