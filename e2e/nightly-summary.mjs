// Reads the Playwright JSON reporter output and writes a compact markdown
// summary to stdout — piped into $GITHUB_STEP_SUMMARY by the nightly
// workflow so the pass/fail result is visible without opening the job log.
// No dependencies (stdlib fs only) so it runs with plain `node` in CI.
import { readFileSync, existsSync } from 'node:fs';

const REPORT_PATH = process.argv[2] || 'nightly-results.json';

if (!existsSync(REPORT_PATH)) {
  console.log('## Nightly E2E — no report found\n');
  console.log(`Expected JSON report at \`${REPORT_PATH}\` — the run likely crashed before Playwright wrote it.`);
  process.exit(0);
}

const report = JSON.parse(readFileSync(REPORT_PATH, 'utf-8'));

let passed = 0;
let failed = 0;
let flaky = 0;
let skipped = 0;
const failedTitles = [];

function walkSuite(suite, titlePath) {
  // Fold this suite's own title (file name or describe block) into the path
  // BEFORE using it for specs at this level — otherwise a spec's fullTitle
  // skips its enclosing file/describe and only shows the bare test title.
  const path = suite.title ? [...titlePath, suite.title] : titlePath;

  for (const spec of suite.specs || []) {
    const fullTitle = [...path, spec.title].join(' › ');
    for (const test of spec.tests || []) {
      const status = test.status; // 'expected' | 'unexpected' | 'flaky' | 'skipped'
      if (status === 'expected') passed++;
      else if (status === 'unexpected') {
        failed++;
        failedTitles.push(fullTitle);
      } else if (status === 'flaky') flaky++;
      else if (status === 'skipped') skipped++;
    }
  }
  for (const child of suite.suites || []) {
    walkSuite(child, path);
  }
}

for (const suite of report.suites || []) {
  walkSuite(suite, []);
}

const total = passed + failed + flaky + skipped;
const icon = failed > 0 ? '🔴' : flaky > 0 ? '🟡' : '🟢';

console.log(`## ${icon} Nightly E2E (dev)\n`);
console.log(`| Passed | Flaky (retried) | Failed | Skipped | Total |`);
console.log(`|--------|------------------|--------|---------|-------|`);
console.log(`| ${passed} | ${flaky} | ${failed} | ${skipped} | ${total} |\n`);

if (failed > 0) {
  console.log('### Failed tests\n');
  for (const title of failedTitles) {
    console.log(`- ${title}`);
  }
  console.log('');
}

console.log('Full HTML report attached as the `nightly-playwright-report` artifact.');
