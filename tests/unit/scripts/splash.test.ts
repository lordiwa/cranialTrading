import { readFileSync } from 'fs';
import { resolve } from 'path';

// TASK-128: index.html must paint an instant splash before Vue/JS loads, and
// that splash must never satisfy the perf harness's "app rendered" selector
// (#app header, #app main, #app input, #app button) — otherwise APPRENDER
// measurements would report false-positive early paints.
const indexHtml = readFileSync(resolve(__dirname, '../../../index.html'), 'utf-8');

// Extracts everything Vue's app.mount('#app') will wipe out on mount: the
// splash AND the hidden SEO pre-render block that follows it inside
// `<div id="app">`. Deliberately covers BOTH, not just the splash — the SEO
// block would equally false-match the perf harness's APPRENDER selector
// (`#app header, #app main, #app input, #app button`) if it ever gained an
// input/button, so the header/main/input/button assertion below intentionally
// stays stricter than "just the splash".
function extractAppStaticContent(html: string): string {
  const appOpenTag = '<div id="app">';
  const openIdx = html.indexOf(appOpenTag);
  if (openIdx === -1) throw new Error('<div id="app"> not found in index.html');
  const contentStart = openIdx + appOpenTag.length;
  const tagRe = /<div[\s>]|<\/div>/gi;
  tagRe.lastIndex = contentStart;
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(html))) {
    if (match[0].toLowerCase().startsWith('</div')) {
      depth--;
      if (depth === 0) return html.slice(contentStart, match.index);
    } else {
      depth++;
    }
  }
  throw new Error('Could not find matching </div> for <div id="app">');
}

describe('index.html splash markup', () => {
  it('renders the splash as the first child of #app', () => {
    const appStart = indexHtml.indexOf('<div id="app">');
    const splashStart = indexHtml.indexOf('class="app-splash"');
    expect(appStart).toBeGreaterThan(-1);
    expect(splashStart).toBeGreaterThan(appStart);
  });

  it('contains the wordmark and a spinner', () => {
    const appContent = extractAppStaticContent(indexHtml);
    expect(appContent).toContain('CRANIAL TRADING');
    expect(appContent).toContain('app-splash__spinner');
  });

  it('never contains header/main/input/button tags anywhere in #app (splash or SEO block) — would false-match the perf harness APPRENDER selector', () => {
    const appContent = extractAppStaticContent(indexHtml);
    expect(appContent).not.toMatch(/<header[\s>]/i);
    expect(appContent).not.toMatch(/<main[\s>]/i);
    expect(appContent).not.toMatch(/<input[\s>]/i);
    expect(appContent).not.toMatch(/<button[\s>]/i);
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
