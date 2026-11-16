// Latihan menulis: Watch -> Trace -> Write, penilaian goresan oleh Hanzi Writer, Undo/Clear,
// palm rejection, rotasi, progres tersimpan.
const { test, expect } = require('@playwright/test');
const { expectAllAssetsCached } = require('./helpers');
const fs = require('fs');
const path = require('path');

const KEY = 'belajar-sarah:progress';
const CHARS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'vendor', 'hanzi-writer-data', 'chars.json'), 'utf8'));

/** Ubah titik data Hanzi Writer (kotak 1024, sumbu y ke atas) ke koordinat layar. Sama dengan Positioner Hanzi Writer. */
async function toScreen(page, pts) {
  const pad = page.locator('#pad');
  const box = await pad.boundingBox();
  const padding = Number(await pad.getAttribute('data-padding'));
  const size = Math.floor(Math.min(box.width, box.height));
  const scale = (size - 2 * padding) / 1024;
  const yOffset = 124 * scale + padding;
  return pts.map(([x, y]) => ({ x: box.x + padding + x * scale, y: box.y + size - yOffset - y * scale }));
}

/** Gambar satu goresan dengan mouse (Pointer Events pointerType 'mouse'). */
async function drawPoints(page, screenPts) {
  await page.mouse.move(screenPts[0].x, screenPts[0].y);
  await page.mouse.down();
  for (let i = 1; i < screenPts.length; i++) {
    const a = screenPts[i - 1];
    const b = screenPts[i];
    for (let t = 1; t <= 4; t++) await page.mouse.move(a.x + ((b.x - a.x) * t) / 4, a.y + ((b.y - a.y) * t) / 4);
  }
  await page.mouse.up();
}

async function drawStroke(page, char, n) {
  await expect(page.locator('#pad')).toHaveAttribute('data-ready', '1');
  await drawPoints(page, await toScreen(page, CHARS[char].medians[n]));
}

/** Goresan yang jelas salah: garis vertikal di tepi kiri. */
async function drawWrong(page) {
  await expect(page.locator('#pad')).toHaveAttribute('data-ready', '1');
  await drawPoints(page, await toScreen(page, [[60, 860], [60, 500], [60, 0]]));
}

async function seedStarted(page, ids) {
  await page.goto('index.html');
  await page.evaluate(
    ([k, ids]) => {
      const leitner = Object.fromEntries(ids.map((id) => [id, { box: 2, due: '2099-01-01', right: 1, wrong: 0, first: '2026-01-01' }]));
      localStorage.setItem(k, JSON.stringify({ schemaVersion: 2, nickname: '', leitner, writing: {} }));
    },
    [KEY, ids],
  );
}

const readProgress = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => {
    throw e;
  });
});

test('lesson menu links to writing; with no word cards yet, the first 3 characters of the lesson are picked', async ({ page }) => {
  await page.goto('lesson.html?n=1');
  await page.locator('#ex-write').tap();
  await expect(page).toHaveURL(/\/docs\/write\.html\?n=1$/);
  await expect(page.locator('#page-title')).toHaveText('Writing · Lesson 1');
  await expect(page.locator('#char-list .char')).toHaveText(['旅', '游', '觉']); // kata pertama pelajaran 1
  await page.locator('#back-btn').tap();
  await expect(page).toHaveURL(/\/docs\/lesson\.html\?n=1$/);
});

test('full flow for 千: watch, trace (with a mistake), write from memory, progress saved', async ({ page }) => {
  await seedStarted(page, ['hsk2-qian']);
  await page.goto('write.html?n=3');
  await expect(page.locator('#char-list .char')).toHaveText(['千']);
  await page.locator('#start-btn').tap();

  // 1 Watch
  await expect(page.locator('#steps li.current')).toHaveText('1 Watch');
  await expect(page.locator('#hw-target svg')).toBeVisible();
  await expect(page.locator('#word')).toHaveText('千');
  await expect(page.locator('#word-pinyin')).toHaveText('qiān');
  await expect(page.locator('#undo-btn')).toBeHidden();
  await page.locator('#next-btn').tap();

  // 2 Trace
  await expect(page.locator('#steps li.current')).toHaveText('2 Trace');
  await expect(page.locator('#next-btn')).toBeHidden(); // harus selesai dulu
  await expect(page.locator('#undo-btn')).toBeDisabled();
  await drawStroke(page, '千', 0);
  await expect(page.locator('#undo-btn')).toBeEnabled();
  await drawWrong(page);
  await expect(page.locator('#step-msg')).toContainText('Almost');
  await drawStroke(page, '千', 1);
  await drawStroke(page, '千', 2);
  await expect(page.locator('#step-msg')).toContainText('Great');
  await expect(page.locator('#next-btn')).toBeVisible();
  let p = await readProgress(page);
  expect(p.writing['千']).toMatchObject({ trace: 1, write: 0 });
  await page.locator('#next-btn').tap();

  // 3 Write (tanpa garis bantu)
  await expect(page.locator('#steps li.current')).toHaveText('3 Write');
  await expect(page.locator('#step-msg')).toContainText('from memory');
  for (let i = 0; i < 3; i++) await drawStroke(page, '千', i);
  await expect(page.locator('#step-msg')).toContainText('Perfect');
  p = await readProgress(page);
  expect(p.writing['千']).toMatchObject({ trace: 1, write: 1, lastMistakes: 0, best: 0 });
  await page.locator('#next-btn').tap();

  await expect(page.locator('#screen-done')).toBeVisible();
  await expect(page.locator('#done-summary')).toContainText('You wrote 1 character: 千 (1 perfect!)');

  // Reload: progres tetap, dan 千 sudah selesai hari ini.
  await page.reload();
  await expect(page.locator('#char-list')).toContainText('All done for today');
  await expect(page.locator('#start-btn')).toBeHidden();
});

test('Undo removes the last correct stroke; Clear restarts the character', async ({ page }) => {
  await seedStarted(page, ['hsk2-qian']);
  await page.goto('write.html?n=3');
  await page.locator('#start-btn').tap();
  await page.locator('#next-btn').tap();

  const completed = page.locator('#pad');
  await drawStroke(page, '千', 0);
  await drawStroke(page, '千', 1);
  await expect(completed).toHaveAttribute('data-completed', '2');
  await page.locator('#undo-btn').tap();
  await expect(completed).toHaveAttribute('data-completed', '1');
  // Setelah Undo, goresan ke-2 harus digambar lagi dan diterima.
  await drawStroke(page, '千', 1);
  await expect(completed).toHaveAttribute('data-completed', '2');
  await expect(page.locator('#step-msg')).not.toContainText('Almost');
  await drawStroke(page, '千', 2);
  await expect(page.locator('#next-btn')).toBeVisible();

  // Clear di langkah berikutnya
  await page.locator('#next-btn').tap();
  await drawStroke(page, '千', 0);
  await expect(page.locator('#clear-btn')).toBeEnabled();
  await page.locator('#clear-btn').tap();
  await expect(page.locator('#clear-btn')).toBeDisabled();
  await expect(page.locator('#undo-btn')).toBeDisabled();
  await expect(completed).toHaveAttribute('data-completed', '0');
  for (let i = 0; i < 3; i++) await drawStroke(page, '千', i);
  await expect(page.locator('#next-btn')).toBeVisible();
});

test('palm rejection: finger touches are ignored while the Pencil is in use', async ({ page }) => {
  await seedStarted(page, ['hsk2-qian']);
  await page.goto('write.html?n=3');
  await page.locator('#start-btn').tap();
  await page.locator('#next-btn').tap();
  await expect(page.locator('#pad')).toHaveAttribute('data-ready', '1');

  const [first] = await toScreen(page, [CHARS['千'].medians[0][0]]);
  const result = await page.evaluate(({ x, y }) => {
    const canvas = document.querySelector('#pad canvas.ink');
    const svg = document.querySelector('#hw-target svg');
    let replayed = 0;
    svg.addEventListener('mousedown', () => replayed++);
    const fire = (type, pointerId, pointerType, dx = 0, pressure = 0.5) =>
      canvas.dispatchEvent(
        new PointerEvent(type, { bubbles: true, cancelable: true, pointerId, pointerType, isPrimary: true, clientX: x + dx, clientY: y, pressure, buttons: type === 'pointerup' ? 0 : 1 }),
      );
    const stroke = (id, type, pressure) => {
      fire('pointerdown', id, type, 0, pressure);
      for (let dx = 10; dx <= 80; dx += 10) fire('pointermove', id, type, dx, pressure);
      fire('pointerup', id, type, 80, pressure);
    };
    const out = {};
    // 1) Goresan Pencil diteruskan ke penilai.
    stroke(1, 'pen', 0.9);
    out.afterPen = replayed;
    // 2) Jari tepat sesudah Pencil -> diabaikan.
    stroke(2, 'touch');
    out.afterFinger = replayed;
    // 3) Telapak tangan menyentuh duluan, lalu Pencil turun: goresan telapak dibuang.
    fire('pointerdown', 3, 'touch');
    fire('pointermove', 3, 'touch', 30);
    stroke(4, 'pen', 0.4);
    fire('pointerup', 3, 'touch', 30);
    out.afterPalm = replayed;
    return out;
  }, first);
  expect(result).toEqual({ afterPen: 1, afterFinger: 1, afterPalm: 2 });
});

test('finger works normally when no Pencil is used', async ({ page }) => {
  await seedStarted(page, ['hsk2-qian']);
  await page.goto('write.html?n=3');
  await page.locator('#start-btn').tap();
  await page.locator('#next-btn').tap();
  await expect(page.locator('#pad')).toHaveAttribute('data-ready', '1');
  const pts = await toScreen(page, CHARS['千'].medians[0]);
  await page.evaluate((pts) => {
    const canvas = document.querySelector('#pad canvas.ink');
    const fire = (type, p) =>
      canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: p.x, clientY: p.y }));
    fire('pointerdown', pts[0]);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      for (let t = 1; t <= 4; t++) fire('pointermove', { x: a.x + ((b.x - a.x) * t) / 4, y: a.y + ((b.y - a.y) * t) / 4 });
    }
    fire('pointerup', pts[pts.length - 1]);
  }, pts);
  await expect(page.locator('#undo-btn')).toBeEnabled(); // goresan 1 diterima
});

test('rotating the iPad keeps the progress inside the character', async ({ page }) => {
  await seedStarted(page, ['hsk2-qian']);
  await page.goto('write.html?n=3');
  await page.locator('#start-btn').tap();
  await page.locator('#next-btn').tap();
  await drawStroke(page, '千', 0);
  const before = (await page.locator('#pad').boundingBox()).width;

  const vp = page.viewportSize();
  await page.setViewportSize({ width: vp.height, height: vp.width });
  await expect.poll(async () => Math.round((await page.locator('#pad').boundingBox()).width)).not.toBe(Math.round(before));
  // Writer dibangun ulang dengan ukuran baru; goresan 1 tetap dihitung.
  await expect(page.locator('#pad')).toHaveAttribute('data-completed', '1');
  await drawStroke(page, '千', 1);
  await drawStroke(page, '千', 2);
  await expect(page.locator('#next-btn')).toBeVisible();
});

test('writing practice works offline (library and stroke data are cached)', async ({ page, context, browserName }) => {
  await seedStarted(page, ['hsk2-qian']);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const cached = await expectAllAssetsCached(page);
  expect(cached.missing).toEqual([]); // termasuk hanzi-writer.esm.js dan chars.json
  if (browserName === 'webkit') {
    // Playwright WebKit tidak bisa bernavigasi offline lewat service worker (internal error);
    // navigasi offline dites di Chromium, di iPad dicek manual dengan mode pesawat.
    return;
  }
  await context.setOffline(true);
  await page.goto('write.html?n=3');
  await page.locator('#start-btn').tap();
  await expect(page.locator('#hw-target svg')).toBeVisible();
  await page.locator('#next-btn').tap();
  await drawStroke(page, '千', 0);
  await expect(page.locator('#undo-btn')).toBeEnabled();
  await context.setOffline(false);
});

test('schema v1 progress (iteration 1) is migrated to v2 without losing flashcards', async ({ page }) => {
  await page.goto('index.html');
  await page.evaluate((k) => {
    localStorage.setItem(k, JSON.stringify({ schemaVersion: 1, nickname: '', leitner: { 'hsk2-qian': { box: 3, due: '2099-01-01', right: 2, wrong: 0, first: '2026-01-01' } } }));
  }, KEY);
  await page.goto('write.html?n=3');
  await expect(page.locator('#char-list .char')).toHaveText(['千']);
  await page.locator('#start-btn').tap();
  await page.locator('#next-btn').tap();
  for (let i = 0; i < 3; i++) await drawStroke(page, '千', i);
  const p = await readProgress(page);
  expect(p.schemaVersion).toBe(5); // selalu dimigrasi ke versi terbaru
  expect(p.leitner['hsk2-qian'].box).toBe(3);
  expect(p.writing['千'].trace).toBe(1);
});

test.describe('writing.js logic', () => {
  test.beforeEach(async ({ page }) => page.goto('index.html'));

  test('pickCharacters: started words only, least-written first, skips today', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const W = await import('./js/writing.js');
      const words = [
        { id: 'a', hanzi: '你' },
        { id: 'b', hanzi: '谢谢' },
        { id: 'c', hanzi: '大' },
        { id: 'd', hanzi: '小' },
        { id: 'e', hanzi: '朋友' },
      ];
      const leitner = { b: {}, c: {}, d: {}, e: {} };
      const writing = {
        谢: { write: 2, last: '2026-11-10' },
        大: { write: 1, last: '2026-11-16' }, // sudah hari ini
        小: { write: 1, last: '2026-11-12' },
      };
      return {
        normal: W.pickCharacters(words, leitner, writing, '2026-11-16').map((x) => x.char),
        none: W.pickCharacters(words, {}, {}, '2026-11-16').map((x) => x.char),
        ctx: W.pickCharacters(words, leitner, writing, '2026-11-16')[0].word.hanzi,
      };
    });
    expect(r.normal).toEqual(['朋', '友', '小']);
    expect(r.none).toEqual(['你', '谢', '大']);
    expect(r.ctx).toBe('朋友');
  });

  test('recordStep counts trace/write and keeps the best score', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const W = await import('./js/writing.js');
      let w = {};
      w = W.recordStep(w, '大', 'trace', 3, '2026-11-16');
      w = W.recordStep(w, '大', 'write', 2, '2026-11-16');
      w = W.recordStep(w, '大', 'write', 5, '2026-11-17');
      return w['大'];
    });
    expect(r).toEqual({ trace: 1, write: 2, lastMistakes: 5, best: 2, last: '2026-11-17' });
  });
});

test('on an iPhone-sized screen the header counter stays on one line', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 }); // iPhone 15
  await seedStarted(page, ['hsk2-gaosu']); // 告诉: 2 karakter
  await page.goto('write.html?n=8');
  await page.locator('#start-btn').tap();
  await expect(page.locator('#counter')).toHaveText('1 / 2');
  const h = (await page.locator('#counter').boundingBox()).height;
  expect(h).toBeLessThan(40);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
});
