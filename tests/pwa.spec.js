// PWA: path relatif (GitHub Pages sub-path), service worker, offline, Mode Papi, log error.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const DOCS = path.join(__dirname, '..', 'docs');

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? listFiles(p) : [p];
  });
}

test('no absolute paths in HTML, CSS, JS or manifest', () => {
  const offenders = [];
  const patterns = [
    /(?:href|src|action)\s*=\s*["']\//g, // href="/..."
    /url\(\s*["']?\//g, // url(/...)
    /(?:fetch|register|import)\s*\(\s*["'`]\//g, // fetch('/...'), register('/sw.js')
    /from\s+["']\//g, // import ... from '/js/x.js'
    /["'](?:start_url|scope|src|id)["']\s*:\s*["']\//g, // manifest
  ];
  for (const f of listFiles(DOCS).filter((f) => /\.(html|css|js|json)$/.test(f))) {
    const src = fs.readFileSync(f, 'utf8');
    for (const re of patterns) for (const m of src.matchAll(re)) offenders.push(`${path.relative(DOCS, f)}: ${m[0]}`);
  }
  // sw.js: setiap entri precache harus relatif.
  const sw = fs.readFileSync(path.join(DOCS, 'sw.js'), 'utf8');
  const assets = [...sw.matchAll(/^\s*'([^']+)',$/gm)].map((m) => m[1]);
  expect(assets.length).toBeGreaterThan(10);
  for (const a of assets) if (a.startsWith('/')) offenders.push(`sw.js: ${a}`);
  expect(offenders).toEqual([]);
});

test('every precached asset exists, and every docs/ file is precached', () => {
  const sw = fs.readFileSync(path.join(DOCS, 'sw.js'), 'utf8');
  const assets = [...sw.matchAll(/^\s*'([^']+)',$/gm)].map((m) => m[1]).filter((a) => a !== './');
  for (const a of assets) expect(fs.existsSync(path.join(DOCS, a)), `missing ${a}`).toBe(true);
  const all = listFiles(DOCS)
    .map((f) => path.relative(DOCS, f).split(path.sep).join('/'))
    .filter((f) => f !== 'sw.js');
  expect(all.filter((f) => !assets.includes(f))).toEqual([]);
});

test('cache version in sw.js matches APP_VERSION', () => {
  const sw = fs.readFileSync(path.join(DOCS, 'sw.js'), 'utf8');
  const ver = fs.readFileSync(path.join(DOCS, 'js', 'version.js'), 'utf8');
  const a = sw.match(/CACHE_NAME = '([^']+)'/)[1];
  const b = ver.match(/APP_VERSION = '([^']+)'/)[1];
  expect(a).toMatch(/^belajar-v\d+$/);
  expect(a).toBe(b);
});

test('manifest is valid and relative', async ({ page, baseURL }) => {
  const res = await page.request.get('manifest.json');
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m.start_url).toBe('./');
  expect(m.scope).toBe('./');
  expect(m.display).toBe('standalone');
  for (const icon of m.icons) {
    const r = await page.request.get(new URL(icon.src, baseURL + 'manifest.json').href);
    expect(r.ok(), icon.src).toBe(true);
  }
  await page.goto('index.html');
  const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect((await page.request.get(touch)).ok()).toBe(true);
});

test('service worker registers under /docs/ and the app works offline', async ({ page, context, baseURL }) => {
  await page.goto('index.html');
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toBe(baseURL);
  // Halaman pertama belum dikontrol SW; reload agar dikontrol (clients.claim juga cukup).
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.goto('hanzi.html');
  await expect(page.locator('#boxes .box')).toHaveCount(5); // vocab.json dari cache
  await page.locator('#start-btn').tap();
  await expect(page.locator('#card-hanzi')).toHaveText('你');
  await page.goto('index.html');
  await expect(page.locator('#go-mandarin')).toBeVisible();
  await context.setOffline(false);
});

test('Papi mode: long-press logo 3 s opens dialog with export and reset', async ({ page }) => {
  await page.goto('hanzi.html');
  await page.locator('#start-btn').tap();
  await page.locator('#reveal-btn').tap();
  await page.locator('#knew-btn').tap();
  await page.locator('#home-btn').tap();

  const logo = page.locator('#logo');
  const box = await logo.boundingBox();
  // Tekan singkat tidak membuka apa-apa.
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  await expect(page.locator('dialog')).toHaveCount(0);

  await page.mouse.down();
  await page.waitForTimeout(3300);
  await page.mouse.up();
  const dlg = page.locator('dialog[open]');
  await expect(dlg).toContainText('Mode Papi');
  await expect(dlg).toContainText('Error log (0)');

  // Export: unduhan JSON berisi progres (di browser tanpa Web Share untuk file).
  const canShareFiles = await page.evaluate(() => {
    try {
      return !!navigator.canShare?.({ files: [new File(['x'], 'a.json', { type: 'application/json' })] });
    } catch {
      return false;
    }
  });
  if (!canShareFiles) {
    const [download] = await Promise.all([page.waitForEvent('download'), dlg.getByRole('button', { name: 'Export progress' }).tap()]);
    const json = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    expect(json.progress.leitner['hsk1-ni'].box).toBe(2);
    expect(download.suggestedFilename()).toMatch(/^belajar-progress-\d{4}-\d{2}-\d{2}\.json$/);
  } else {
    await dlg.getByRole('button', { name: 'Close' }).tap();
  }

  // Reset lewat dialog konfirmasi buatan sendiri (bukan confirm()).
  await page.mouse.down();
  await page.waitForTimeout(3300);
  await page.mouse.up();
  await page.locator('dialog[open]').getByRole('button', { name: 'Reset data…' }).tap();
  await expect(page.locator('dialog[open]')).toContainText('Reset all progress?');
  await page.locator('dialog[open]').getByRole('button', { name: 'Yes, reset' }).tap();
  await page.waitForLoadState('load');
  await expect(page.locator('#mandarin-status')).toHaveText('Flashcards · start here!');
});

test('unexpected errors are logged and show the friendly Oops screen with a Home button', async ({ page }) => {
  await page.goto('hanzi.html');
  await page.evaluate(() => setTimeout(() => Promise.reject(new Error('test boom')), 0));
  await expect(page.locator('#oops')).toBeVisible();
  await expect(page.locator('#oops')).toContainText('Oops');
  const log = await page.evaluate(() => JSON.parse(localStorage.getItem('belajar-sarah:errors')));
  expect(log.at(-1).message).toBe('test boom');
  await page.locator('#oops a').tap();
  await expect(page).toHaveURL(/index\.html$/);
});

test('error log keeps at most 50 entries', async ({ page }) => {
  await page.goto('index.html');
  await page.evaluate(async () => {
    const { logError, readLog } = await import('./js/errors.js');
    for (let i = 0; i < 60; i++) logError(`e${i}`);
    window.__len = readLog().length;
    window.__first = readLog()[0].message;
  });
  expect(await page.evaluate(() => window.__len)).toBe(50);
  expect(await page.evaluate(() => window.__first)).toBe('e10');
});
