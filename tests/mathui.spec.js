// Layar soal cerita matematika: daftar bab, cerita + glosarium, keypad sendiri, petunjuk saat salah, pie chart.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { KEY, readProgress } = require('./helpers');

const SYLLABUS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'content', 'math', 'syllabus.json'), 'utf8'));
const chapter = (id) => SYLLABUS.chapters.find((c) => c.id === id);
const example = (id) => SYLLABUS.chapters.flatMap((c) => c.examples).find((e) => e.id === id);

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => {
    throw e;
  });
});

/** Ketik lewat keypad layar. '_' = tombol spasi (pecahan campuran), '<' = hapus, 'C' = clear. */
async function type(page, keys) {
  const map = { _: '␣', '<': '⌫' };
  for (const k of keys) await page.locator(`#keypad .key[data-key="${map[k] || k}"]`).tap();
}

async function expectStory(page, id) {
  await expect(page.locator('#story')).toHaveText(example(id).story);
}

test('home → Math → chapter list → a chapter; chapters without problems are not clickable', async ({ page }) => {
  await page.goto('index.html');
  await page.locator('#go-math').tap();
  await expect(page).toHaveURL(/\/docs\/math\.html$/);
  await expect(page.locator('#chapter-list .lesson-card')).toHaveCount(4);
  await expect(page.locator('.lesson-card[data-chapter="6B-07"]')).toContainText('Speed');
  await expect(page.locator('.lesson-card[data-chapter="6B-07"]')).toContainText('0 / 6 problems');
  await expect(page.locator('.lesson-card[data-chapter="6B-10"]')).toHaveClass(/disabled/);
  await expect(page.locator('.lesson-card[data-chapter="6B-10"]')).toContainText('Coming later');
  expect(await page.locator('a.lesson-card[data-chapter="6B-10"]').count()).toBe(0);

  await page.locator('.lesson-card[data-chapter="6B-08"]').tap();
  await expect(page).toHaveURL(/mathq\.html\?c=6B-08$/);
  await expect(page.locator('#page-title')).toHaveText('Volume of Solids and Liquids');
  await page.locator('#back-btn').tap();
  await expect(page).toHaveURL(/\/docs\/math\.html$/);
  await page.locator('#home-btn').tap();
  await expect(page).toHaveURL(/\/docs\/index\.html$/);
});

test('an unknown chapter, or one without problems, goes back to the chapter list', async ({ page }) => {
  for (const url of ['mathq.html', 'mathq.html?c=nope', 'mathq.html?c=6B-10']) {
    await page.goto(url);
    await expect(page).toHaveURL(/\/docs\/math\.html$/);
    await expect(page.locator('#chapter-list .lesson-card')).toHaveCount(4);
  }
});

test('Speed chapter: glossary, keypad, hints from common_mistakes, trap note, reveal; saved on first answer', async ({ page }) => {
  await page.goto('mathq.html?c=6B-07');
  // Jawaban diisi lewat keypad sendiri: tidak ada <input> yang memunculkan keyboard iOS.
  await expect(page.locator('input, textarea, [contenteditable]')).toHaveCount(0);

  // --- Soal 1 (7-1, level 1): glosarium + jawaban benar ---
  await expect(page.locator('#counter')).toHaveText('1 / 5');
  await expectStory(page, '7-1');
  await expect(page.locator('#level-tag')).toHaveText('Level 1');
  await expect(page.locator('#answer-unit')).toHaveText('km');
  await expect(page.locator('#hint-box')).toBeHidden();
  await page.locator('#story .term', { hasText: 'uniform speed' }).tap();
  await expect(page.locator('#glossary-note')).toHaveText('uniform speed = kecepatan tetap');
  await type(page, '180');
  await expect(page.locator('#answer-display')).toHaveText('180');
  await page.locator('#check-btn').tap();
  await expect(page.locator('#hint-title')).toHaveText('Yes! 180 km ✔');
  await expect(page.locator('#hint-box')).toHaveAttribute('data-kind', 'right');
  await expect(page.locator('#keypad .key').first()).toBeDisabled();
  let p = await readProgress(page);
  expect(p.schemaVersion).toBe(5);
  expect(p.math['7-1']).toMatchObject({ seen: 1, right: 1, errors: {} });
  await page.locator('#next-btn').tap();

  // --- Soal 2 (7-2): salah -> daftar common_mistakes bab ini, lalu benar (tidak dinilai ulang) ---
  await expectStory(page, '7-2');
  await type(page, '20');
  await page.locator('#check-btn').tap();
  await expect(page.locator('#hint-box')).toHaveAttribute('data-kind', 'mistakes');
  await expect(page.locator('#hint-items li')).toHaveText(chapter('6B-07').common_mistakes);
  await expect(page.locator('#answer-display')).toHaveText(''); // dikosongkan untuk coba lagi
  await expect(page.locator('#next-btn')).toBeHidden();
  p = await readProgress(page);
  expect(p.math['7-2']).toMatchObject({ seen: 1, right: 0, errors: { calculation: 1 } });
  await type(page, '12');
  await page.locator('#check-btn').tap();
  await expect(page.locator('#hint-title')).toHaveText('Yes! 12 km/h ✔');
  p = await readProgress(page);
  expect(p.math['7-2']).toMatchObject({ seen: 1, right: 0, errors: { calculation: 1 } });
  await page.locator('#next-btn').tap();

  // --- Soal 3 (7-3): jawaban jebakan 45 -> trap_note; salah ke-2 -> yang diketahui; salah ke-3 -> jawaban ---
  await expectStory(page, '7-3');
  await type(page, '45');
  await page.locator('#check-btn').tap();
  await expect(page.locator('#hint-box')).toHaveAttribute('data-kind', 'trap');
  await expect(page.locator('#hint-items li')).toHaveText([example('7-3').trap_note]);
  await type(page, '50');
  await page.locator('#check-btn').tap();
  await expect(page.locator('#hint-box')).toHaveAttribute('data-kind', 'known');
  await expect(page.locator('#hint-items li')).toHaveText(example('7-3').known);
  await type(page, '51');
  await page.locator('#check-btn').tap();
  await expect(page.locator('#hint-box')).toHaveAttribute('data-kind', 'reveal');
  await expect(page.locator('#hint-title')).toContainText('The answer is 48 km/h');
  await expect(page.locator('#answer-display')).toHaveText('48');
  p = await readProgress(page);
  expect(p.math['7-3']).toMatchObject({ seen: 1, right: 0, errors: { calculation: 1 } });
  await page.locator('#next-btn').tap();

  // --- Soal 4 (7-4): Check tanpa angka bukan percobaan ---
  await expectStory(page, '7-4');
  await page.locator('#check-btn').tap();
  await expect(page.locator('#hint-title')).toContainText('Type your answer');
  p = await readProgress(page);
  expect(p.math['7-4']).toBeUndefined();
  await type(page, '2');
  await page.locator('#check-btn').tap();
  await expect(page.locator('#hint-title')).toHaveText('Yes! 2 h ✔');
  await page.locator('#next-btn').tap();

  // --- Soal 5 (7-6, jawaban 2.5): pecahan campuran 2 1/2 diterima ---
  await expectStory(page, '7-6');
  await type(page, '2_1/2');
  await expect(page.locator('#answer-display')).toHaveText('2 1/2');
  await page.locator('#check-btn').tap();
  await expect(page.locator('#hint-title')).toHaveText('Yes! 2.5 h ✔');
  await page.locator('#next-btn').tap();

  await expect(page.locator('#screen-done')).toBeVisible();
  await expect(page.locator('#done-summary')).toHaveText('You got 3 of 5 right on the first try.');

  // Reload: progres tetap; daftar bab menampilkannya.
  await page.goto('math.html');
  await expect(page.locator('.lesson-card[data-chapter="6B-07"]')).toContainText('5 / 6 problems');
  // Sesi berikutnya memuat yang tadi salah (7-2, 7-3) dan yang belum pernah (7-5); urutan tampil mudah -> sulit.
  const nextIds = await page.evaluate(async (k) => {
    const M = await import('./js/mathlogic.js');
    const data = await M.loadSyllabus();
    const records = JSON.parse(localStorage.getItem(k)).math;
    return M.pickQuestions(data.chapters[0].examples, records).map((e) => e.id);
  }, KEY);
  expect(nextIds).toEqual(expect.arrayContaining(['7-2', '7-3', '7-5']));
  expect(nextIds).toHaveLength(5);
  await page.locator('.lesson-card[data-chapter="6B-07"]').tap();
  await expectStory(page, nextIds[0]);
});

test('keypad rules: one decimal point, fraction bar only after a digit, delete and clear', async ({ page }) => {
  await page.goto('mathq.html?c=6B-08');
  const display = page.locator('#answer-display');
  await type(page, '/._'); // tidak bisa mulai dengan garis pecahan atau spasi; titik boleh
  await expect(display).toHaveText('.');
  await type(page, 'C3.5.2');
  await expect(display).toHaveText('3.52'); // titik kedua diabaikan
  await type(page, '/'); // desimal tidak bisa jadi pecahan
  await expect(display).toHaveText('3.52');
  await type(page, '<<');
  await expect(display).toHaveText('3.');
  await type(page, 'C3/4/5');
  await expect(display).toHaveText('3/45'); // garis pecahan kedua diabaikan
  await type(page, 'C1_1/2');
  await expect(display).toHaveText('1 1/2');
  await type(page, 'C1234567890123');
  await expect(display).toHaveText('123456789'); // panjang dibatasi
  // Pecahan yang nilainya sama dengan jawaban diterima: 8-1 = 480.
  await type(page, 'C960/2');
  await page.locator('#check-btn').tap();
  await expect(page.locator('#hint-title')).toHaveText('Yes! 480 cm³ ✔');
});

test('Pie Charts chapter: the pie is drawn from pie_data, with "?" for the rest; money answers show $', async ({ page }) => {
  await page.goto('mathq.html?c=6B-09');
  await expectStory(page, '9-1');
  await expect(page.locator('#pie-box svg .pie-sector')).toHaveCount(3);
  await expect(page.locator('#pie-box svg')).toHaveAttribute('aria-label', 'Pie chart: Apples 1/4, Bananas 1/2, Oranges 1/4');
  // Sektor 1/2 benar-benar setengah lingkaran: dari kanan (jam 3) ke kiri (jam 9) lewat bawah.
  const half = await page.locator('#pie-box svg .pie-sector').nth(1).getAttribute('d');
  expect(half).toBe('M 130 130 L 250 130 A 120 120 0 0 1 10 130 Z');
  await type(page, '60');
  await page.locator('#check-btn').tap();
  await expect(page.locator('#hint-title')).toHaveText('Yes! 60 pupils ✔');
  await page.locator('#next-btn').tap();

  await expectStory(page, '9-2');
  await expect(page.locator('#pie-box svg .pie-sector')).toHaveCount(4);
  await expect(page.locator('#pie-box svg')).toHaveAttribute('aria-label', 'Pie chart: Rent 30%, Food 25%, Transport 15%, Savings ?');
  await expect(page.locator('#answer-prefix')).toHaveText('$');
  await expect(page.locator('#answer-unit')).toHaveText('');
  await type(page, '1080');
  await page.locator('#check-btn').tap();
  await expect(page.locator('#hint-title')).toHaveText('Yes! $1080 ✔');
});

test('no pie outside the pie chapter; every glossary word in a story is tappable', async ({ page }) => {
  await page.goto('mathq.html?c=6B-08');
  await expect(page.locator('#pie-box')).toBeHidden();
  const terms = await page.locator('#story .term').allTextContents();
  const glossary = Object.keys(chapter('6B-08').glossary).map((k) => k.toLowerCase());
  expect(terms.length).toBeGreaterThan(0);
  expect(terms.every((t) => glossary.includes(t.toLowerCase()))).toBe(true);
});

test('touch targets: keys and glossary words ≥ 48 px; fits iPad landscape and an iPhone-sized screen', async ({ page }) => {
  for (const vp of [{ width: 1180, height: 820 }, { width: 820, height: 1180 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(vp);
    await page.goto('mathq.html?c=6B-07');
    await expect(page.locator('#keypad .key')).toHaveCount(15);
    const small = await page.locator('#keypad .key, #story .term, #check-btn').evaluateAll((els) =>
      els
        .map((e) => ({ t: e.textContent, w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height, ta: getComputedStyle(e).touchAction }))
        .filter((x) => x.w < 48 || x.h < 48 || x.ta !== 'manipulation'),
    );
    expect(small, JSON.stringify(vp)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), JSON.stringify(vp)).toBe(0);
  }
});

test('progress from before Math (schema v4) is migrated to v5 and kept', async ({ page }) => {
  await page.goto('index.html');
  await page.evaluate((k) => {
    localStorage.setItem(k, JSON.stringify({ schemaVersion: 4, leitner: { 'hsk2-lvyou': { box: 3, due: '2099-01-01' } }, sentences: { 'L1-f1': { fill: { seen: 1, right: 1 } } } }));
  }, KEY);
  await page.goto('mathq.html?c=6B-08');
  await type(page, '480');
  await page.locator('#check-btn').tap();
  const p = await readProgress(page);
  expect(p.schemaVersion).toBe(5);
  expect(p.leitner['hsk2-lvyou'].box).toBe(3);
  expect(p.sentences['L1-f1'].fill.right).toBe(1);
  expect(p.math['8-1'].right).toBe(1);
});

test.describe('mathlogic.js', () => {
  test.beforeEach(async ({ page }) => page.goto('index.html'));

  test('tokenizeStory: longest phrase first, whole words only, case-insensitive, text preserved', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const M = await import('./js/mathlogic.js');
      const g = { speed: 'kecepatan', 'average speed': 'kecepatan rata-rata', apart: 'berjarak', 'set off': 'berangkat' };
      const story = 'Set off early. What was its Average Speed? Apartments are 5 km apart; speeding is bad.';
      const t = M.tokenizeStory(story, g);
      return { terms: t.filter((x) => x.meaning).map((x) => `${x.text}=${x.meaning}`), joined: t.map((x) => x.text).join('') === story };
    });
    expect(r.terms).toEqual(['Set off=berangkat', 'Average Speed=kecepatan rata-rata', 'apart=berjarak']);
    expect(r.joined).toBe(true);
  });

  test('pickQuestions: missed first, then unseen, easy before hard; recordMath counts error types', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const M = await import('./js/mathlogic.js');
      const ex = [
        { id: 'a', level: 1 }, { id: 'b', level: 2 }, { id: 'c', level: 3 }, { id: 'd', level: 2 }, { id: 'e', level: 1 },
      ];
      let rec = {};
      rec = M.recordMath(rec, 'a', true, '2026-11-16', 'calculation');
      rec = M.recordMath(rec, 'c', false, '2026-11-16', 'calculation');
      rec = M.recordMath(rec, 'c', false, '2026-11-17', 'model');
      rec = M.recordMath(rec, 'c', true, '2026-11-18', 'calculation');
      return { top3: M.pickQuestions(ex, rec, 3).map((x) => x.id), all: M.pickQuestions(ex, rec, 9).map((x) => x.id), c: rec.c, a: rec.a };
    });
    expect(r.top3).toEqual(['e', 'b', 'c']); // c (1/3 benar) + e, b (belum pernah); ditampilkan mudah -> sulit
    expect(r.all).toEqual(['a', 'e', 'b', 'd', 'c']);
    expect(r.c).toEqual({ seen: 3, right: 1, last: '2026-11-18', errors: { calculation: 1, model: 1 } });
    expect(r.a).toEqual({ seen: 1, right: 1, last: '2026-11-16', errors: {} });
  });

  test('pieSectors fill the whole circle for every pie in the syllabus', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const M = await import('./js/mathlogic.js');
      const data = await M.loadSyllabus();
      return data.chapters
        .flatMap((c) => c.examples)
        .filter((e) => e.pie_data)
        .map((e) => {
          const s = M.pieSectors(e.pie_data);
          return { id: e.id, end: Number(s.at(-1).end.toFixed(9)), contiguous: s.every((x, i) => i === 0 || x.start === s[i - 1].end), rest: s.filter((x) => x.isRest).map((x) => Number((x.end - x.start).toFixed(9))) };
        });
    });
    expect(r).toEqual([
      { id: '9-1', end: 1, contiguous: true, rest: [] },
      { id: '9-2', end: 1, contiguous: true, rest: [0.3] },
      { id: '9-3', end: 1, contiguous: true, rest: [] },
    ]);
  });
});
