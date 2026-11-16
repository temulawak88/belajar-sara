// Layar soal cerita matematika: daftar bab, cerita + glosarium, 4 langkah (Find / Know / Picture / Answer),
// keypad sendiri, petunjuk saat salah, jenis kesalahan, pie chart.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { KEY, readProgress, failOnPageError } = require('./helpers');

const SYLLABUS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'content', 'math', 'syllabus.json'), 'utf8'));
const chapter = (id) => SYLLABUS.chapters.find((c) => c.id === id);
const example = (id) => SYLLABUS.chapters.flatMap((c) => c.examples).find((e) => e.id === id);

test.beforeEach(async ({ page }) => {
  failOnPageError(page);
});

/** Ketik lewat keypad layar. '_' = tombol spasi (pecahan campuran), '<' = hapus, 'C' = clear. */
async function type(page, keys) {
  const map = { _: '␣', '<': '⌫' };
  for (const k of keys) await page.locator(`#keypad .key[data-key="${map[k] || k}"]`).tap();
}

async function expectStory(page, id) {
  await expect(page.locator('#story')).toHaveText(example(id).story);
}

const currentStep = (page) => page.locator('#math-steps li.current');

async function passAsked(page) {
  await expect(currentStep(page)).toHaveText('1 Find');
  await page.locator('#asked-options [data-correct="1"]').tap();
}

async function passKnown(page) {
  await expect(currentStep(page)).toHaveText('2 Know');
  for (const b of await page.locator('#known-options [data-kind="known"]').all()) await b.tap();
  await page.locator('#known-check').tap();
}

async function passModel(page) {
  await expect(currentStep(page)).toHaveText('3 Picture');
  await page.locator('#model-options [data-correct="1"]').tap();
}

/** Lewati langkah 1–3 dengan benar sampai keypad muncul. */
async function passSteps(page) {
  await passAsked(page);
  await passKnown(page);
  await passModel(page);
  await expect(currentStep(page)).toHaveText('4 Answer');
  await expect(page.locator('#keypad')).toBeVisible();
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

test('Speed chapter, all four steps: clean solve, one mistake per step, shown after two mistakes; error types saved', async ({ page }) => {
  // Tes terpanjang (5 soal, ±22 detik): batas bawaan 30 detik kadang terlewati saat laptop sibuk.
  test.setTimeout(90_000);
  await page.goto('mathq.html?c=6B-07');
  // Jawaban diisi lewat keypad sendiri: tidak ada <input> yang memunculkan keyboard iOS.
  await expect(page.locator('input, textarea, [contenteditable]')).toHaveCount(0);

  // ===== Soal 1 (7-1): semua langkah benar =====
  await expect(page.locator('#counter')).toHaveText('1 / 5');
  await expectStory(page, '7-1');
  await expect(page.locator('#level-tag')).toHaveText('Level 1');
  await expect(page.locator('#math-steps li:visible')).toHaveText(['1 Find', '2 Know', '3 Picture', '4 Answer']);
  await expect(page.locator('#keypad')).toBeHidden(); // belum boleh menjawab sebelum memahami soal
  await page.locator('#story .term', { hasText: 'uniform speed' }).tap();
  await expect(page.locator('#glossary-note')).toHaveText('uniform speed = kecepatan tetap');

  // 1 Find: 3 pilihan berbeda, tepat satu benar = `asked` soal ini; pengecoh dari soal lain di bab ini.
  const asked = await page.locator('#asked-options .choice').allTextContents();
  expect(new Set(asked).size).toBe(3);
  expect(asked.every((a) => chapter('6B-07').examples.some((e) => e.asked === a))).toBe(true);
  await expect(page.locator('#asked-options [data-correct="1"]')).toHaveText('distance');
  await passAsked(page);
  await expect(page.locator('#hint-box')).toHaveAttribute('data-kind', 'right');

  // 2 Know: fakta soal ini + 2 fakta dari soal lain. Tanpa memilih apa pun belum bisa lolos.
  await expect(page.locator('#known-options .fact')).toHaveCount(4);
  expect((await page.locator('#known-options [data-kind="known"]').allTextContents()).sort()).toEqual([...example('7-1').known].sort());
  await expect(page.locator('#known-options [data-kind="other"]')).toHaveCount(2);
  const fact = page.locator('#known-options [data-kind="known"]').first();
  await fact.tap();
  await expect(fact).toHaveAttribute('aria-pressed', 'true');
  await fact.tap();
  await expect(fact).toHaveAttribute('aria-pressed', 'false'); // tap lagi = batal pilih
  await passKnown(page);

  // 3 Picture: 3 gambar SVG, yang benar = journey.
  await expect(page.locator('#model-options .choice svg')).toHaveCount(3);
  await expect(page.locator('#model-options [data-correct="1"]')).toHaveAttribute('data-model', 'journey');
  await passModel(page);

  // 4 Answer
  await expect(page.locator('#answer-unit')).toHaveText('km');
  await type(page, '180');
  await page.locator('#check-btn').tap();
  await expect(page.locator('#hint-title')).toHaveText('Yes! 180 km ✔');
  await expect(page.locator('#keypad .key').first()).toBeDisabled();
  let p = await readProgress(page);
  expect(p.schemaVersion).toBe(5);
  expect(p.math['7-1']).toMatchObject({ seen: 1, right: 1, errors: {} });
  await page.locator('#next-btn').tap();

  // ===== Soal 2 (7-2): satu kesalahan di setiap langkah, lalu diperbaiki =====
  await expectStory(page, '7-2');
  // Find salah -> petunjuk + pilihan itu nonaktif; langsung tercatat sebagai comprehension.
  const wrongAsked = page.locator('#asked-options [data-correct="0"]').first();
  await wrongAsked.tap();
  await expect(page.locator('#hint-box')).toHaveAttribute('data-kind', 'retry');
  await expect(page.locator('#hint-title')).toContainText('Read the question sentence again');
  await expect(wrongAsked).toBeDisabled();
  await expect(currentStep(page)).toHaveText('1 Find');
  p = await readProgress(page);
  expect(p.math['7-2']).toMatchObject({ seen: 1, right: 0, errors: { comprehension: 1 } });
  await passAsked(page);
  // Know: ikut memilih fakta dari soal lain -> belum lolos. comprehension tidak dihitung dua kali.
  for (const b of await page.locator('#known-options [data-kind="known"]').all()) await b.tap();
  await page.locator('#known-options [data-kind="other"]').first().tap();
  await page.locator('#known-check').tap();
  await expect(page.locator('#hint-title')).toContainText('nothing else');
  await expect(currentStep(page)).toHaveText('2 Know');
  await page.locator('#known-options [data-kind="other"]').first().tap(); // batalkan
  await page.locator('#known-check').tap();
  // Picture salah -> model
  await expect(currentStep(page)).toHaveText('3 Picture');
  await page.locator('#model-options [data-correct="0"]').first().tap();
  await expect(page.locator('#hint-title')).toContainText('What is the story about');
  p = await readProgress(page);
  expect(p.math['7-2'].errors).toEqual({ comprehension: 1, model: 1 });
  await passModel(page);
  // Answer salah -> calculation + daftar common_mistakes
  await type(page, '20');
  await page.locator('#check-btn').tap();
  await expect(page.locator('#hint-box')).toHaveAttribute('data-kind', 'mistakes');
  await expect(page.locator('#hint-items li')).toHaveText(chapter('6B-07').common_mistakes);
  await expect(page.locator('#answer-display')).toHaveText('');
  await type(page, '12');
  await page.locator('#check-btn').tap();
  await expect(page.locator('#hint-title')).toHaveText('Yes! 12 km/h ✔');
  p = await readProgress(page);
  expect(p.math['7-2']).toMatchObject({ seen: 1, right: 0, errors: { comprehension: 1, model: 1, calculation: 1 } });
  await page.locator('#next-btn').tap();

  // ===== Soal 3 (7-3): dua kali salah di setiap langkah -> jawabannya ditunjukkan, lalu Continue =====
  await expectStory(page, '7-3');
  const wrongs = page.locator('#asked-options [data-correct="0"]');
  await wrongs.nth(0).tap();
  await wrongs.nth(1).tap();
  await expect(page.locator('#hint-box')).toHaveAttribute('data-kind', 'reveal');
  await expect(page.locator('#hint-title')).toContainText(example('7-3').asked);
  await expect(page.locator('#asked-options [data-correct="1"]')).toHaveClass(/right/);
  await expect(page.locator('#asked-options .choice').first()).toBeDisabled();
  await page.locator('#continue-btn').tap();
  // Know: Check tanpa memilih, dua kali -> fakta yang benar ditandai.
  await page.locator('#known-check').tap();
  await page.locator('#known-check').tap();
  await expect(page.locator('#known-options [data-kind="known"].right')).toHaveCount(example('7-3').known.length);
  await expect(page.locator('#known-options [data-kind="other"][aria-pressed="true"]')).toHaveCount(0);
  await expect(page.locator('#known-check')).toBeHidden();
  await page.locator('#continue-btn').tap();
  // Picture: dua kali salah.
  const wrongModels = page.locator('#model-options [data-correct="0"]');
  await wrongModels.nth(0).tap();
  await wrongModels.nth(1).tap();
  await expect(page.locator('#hint-title')).toContainText('journey line fits');
  await expect(page.locator('#model-options [data-correct="1"]')).toHaveClass(/right/);
  await page.locator('#continue-btn').tap();
  await expect(page.locator('#continue-btn')).toBeHidden();
  // Answer: jebakan 45 -> trap_note; 50 -> yang diketahui; 51 -> jawaban.
  await type(page, '45');
  await page.locator('#check-btn').tap();
  await expect(page.locator('#hint-box')).toHaveAttribute('data-kind', 'trap');
  await expect(page.locator('#hint-items li')).toHaveText([example('7-3').trap_note]);
  await type(page, '50');
  await page.locator('#check-btn').tap();
  await expect(page.locator('#hint-box')).toHaveAttribute('data-kind', 'known');
  await type(page, '51');
  await page.locator('#check-btn').tap();
  await expect(page.locator('#hint-title')).toContainText('The answer is 48 km/h');
  await expect(page.locator('#answer-display')).toHaveText('48');
  p = await readProgress(page);
  expect(p.math['7-3']).toMatchObject({ seen: 1, right: 0, errors: { comprehension: 1, model: 1, calculation: 1 } });
  await page.locator('#next-btn').tap();

  // ===== Soal 4 (7-4): Check tanpa angka bukan percobaan =====
  await expectStory(page, '7-4');
  await passSteps(page);
  await page.locator('#check-btn').tap();
  await expect(page.locator('#hint-title')).toContainText('Type your answer');
  p = await readProgress(page);
  expect(p.math['7-4']).toBeUndefined();
  await type(page, '2');
  await page.locator('#check-btn').tap();
  await expect(page.locator('#hint-title')).toHaveText('Yes! 2 h ✔');
  await page.locator('#next-btn').tap();

  // ===== Soal 5 (7-6, jawaban 2.5): pecahan campuran 2 1/2 diterima =====
  await expectStory(page, '7-6');
  await passSteps(page);
  await type(page, '2_1/2');
  await expect(page.locator('#answer-display')).toHaveText('2 1/2');
  await page.locator('#check-btn').tap();
  await expect(page.locator('#hint-title')).toHaveText('Yes! 2.5 h ✔');
  await page.locator('#next-btn').tap();

  await expect(page.locator('#screen-done')).toBeVisible();
  await expect(page.locator('#done-summary')).toHaveText('You solved 3 of 5 without a mistake.');

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

test('a wrong answer after clean steps is recorded as a calculation mistake only', async ({ page }) => {
  await page.goto('mathq.html?c=6B-08');
  await expectStory(page, '8-1');
  await passSteps(page);
  await type(page, '25');
  await page.locator('#check-btn').tap();
  const p = await readProgress(page);
  expect(p.math['8-1']).toMatchObject({ seen: 1, right: 0, errors: { calculation: 1 } });
});

test('unit-conversion facts are optional in the Know step', async ({ page }) => {
  // Bab 8 hanya berisi 8-4 (punya "1 L = 1000 cm³"), 8-5, 8-6 -> 8-4 pasti soal pertama.
  await page.route('**/content/math/syllabus.json', async (route) => {
    const res = await route.fetch();
    const data = await res.json();
    const ch = data.chapters.find((c) => c.id === '6B-08');
    ch.examples = ch.examples.filter((e) => ['8-4', '8-5', '8-6'].includes(e.id));
    await route.fulfill({ response: res, json: data });
  });
  await page.goto('mathq.html?c=6B-08');
  await expectStory(page, '8-4');
  await passAsked(page);
  await expect(page.locator('#known-options [data-kind="optional"]')).toHaveText(['1 L = 1000 cm³']);
  // Fakta konversi dari soal lain (6 L = 6000 cm³) tidak pernah jadi pengecoh.
  expect(await page.locator('#known-options [data-kind="other"]').allTextContents()).not.toContain('6 L = 6000 cm³');
  await passKnown(page); // hanya fakta wajib yang dipilih -> lolos
  await expect(currentStep(page)).toHaveText('3 Picture');
  await expect(page.locator('#model-options [data-correct="1"]')).toHaveAttribute('data-model', 'tank');
});

test('keypad rules: one decimal point, fraction bar only after a digit, delete and clear', async ({ page }) => {
  await page.goto('mathq.html?c=6B-08');
  await passSteps(page);
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
  await passAsked(page);
  await passKnown(page);
  await expect(page.locator('#model-options [data-correct="1"]')).toHaveAttribute('data-model', 'pie');
  await passModel(page);
  await type(page, '60');
  await page.locator('#check-btn').tap();
  await expect(page.locator('#hint-title')).toHaveText('Yes! 60 pupils ✔');
  await page.locator('#next-btn').tap();

  await expectStory(page, '9-2');
  await expect(page.locator('#pie-box svg .pie-sector')).toHaveCount(4);
  await expect(page.locator('#pie-box svg')).toHaveAttribute('aria-label', 'Pie chart: Rent 30%, Food 25%, Transport 15%, Savings ?');
  await passSteps(page);
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

test('touch targets in every step are ≥ 48 px; fits iPad landscape, portrait and an iPhone-sized screen', async ({ page }) => {
  const small = (sel) =>
    page.locator(sel).evaluateAll((els) =>
      els
        .filter((e) => e.offsetParent !== null)
        .map((e) => ({ t: e.textContent.slice(0, 14), w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height), ta: getComputedStyle(e).touchAction }))
        .filter((x) => x.w < 48 || x.h < 48 || x.ta !== 'manipulation'),
    );
  const noOverflow = async (label) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), label).toBe(0);
  for (const vp of [{ width: 1180, height: 820 }, { width: 820, height: 1180 }, { width: 393, height: 852 }]) {
    const label = JSON.stringify(vp);
    await page.setViewportSize(vp);
    await page.goto('mathq.html?c=6B-07');
    await expect(page.locator('#asked-options .choice')).toHaveCount(3);
    expect(await small('#asked-options .choice, #story .term'), label).toEqual([]);
    await noOverflow(label);
    await passAsked(page);
    expect(await small('#known-options .choice, #known-check'), label).toEqual([]);
    await noOverflow(label);
    await passKnown(page);
    expect(await small('#model-options .choice'), label).toEqual([]);
    await noOverflow(label);
    await passModel(page);
    await expect(page.locator('#keypad .key')).toHaveCount(15);
    expect(await small('#keypad .key, #check-btn'), label).toEqual([]);
    await noOverflow(label);
  }
});

test('progress from before Math (schema v4) is migrated to v5 and kept', async ({ page }) => {
  await page.goto('index.html');
  await page.evaluate((k) => {
    localStorage.setItem(k, JSON.stringify({ schemaVersion: 4, leitner: { 'hsk2-lvyou': { box: 3, due: '2099-01-01' } }, sentences: { 'L1-f1': { fill: { seen: 1, right: 1 } } } }));
  }, KEY);
  await page.goto('mathq.html?c=6B-08');
  await passSteps(page);
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

  test('pickQuestions: missed first, then unseen, easy before hard; recordMath and addMathError count error types', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const M = await import('./js/mathlogic.js');
      const ex = [
        { id: 'a', level: 1 }, { id: 'b', level: 2 }, { id: 'c', level: 3 }, { id: 'd', level: 2 }, { id: 'e', level: 1 },
      ];
      let rec = {};
      rec = M.recordMath(rec, 'a', true, '2026-11-16', 'calculation');
      rec = M.recordMath(rec, 'c', false, '2026-11-16', 'comprehension');
      rec = M.addMathError(rec, 'c', 'calculation');
      rec = M.recordMath(rec, 'c', false, '2026-11-17', 'model');
      rec = M.recordMath(rec, 'c', true, '2026-11-18');
      const untouched = M.addMathError(rec, 'zzz', 'model') === rec;
      return { top3: M.pickQuestions(ex, rec, 3).map((x) => x.id), all: M.pickQuestions(ex, rec, 9).map((x) => x.id), c: rec.c, a: rec.a, untouched };
    });
    expect(r.top3).toEqual(['e', 'b', 'c']); // c (1/3 benar) + e, b (belum pernah); ditampilkan mudah -> sulit
    expect(r.all).toEqual(['a', 'e', 'b', 'd', 'c']);
    expect(r.c).toEqual({ seen: 3, right: 1, last: '2026-11-18', errors: { comprehension: 1, calculation: 1, model: 1 } });
    expect(r.a).toEqual({ seen: 1, right: 1, last: '2026-11-16', errors: {} });
    expect(r.untouched).toBe(true);
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

  test('step options are well-formed for every problem in the syllabus', async ({ page }) => {
    const bad = await page.evaluate(async () => {
      const M = await import('./js/mathlogic.js');
      const data = await M.loadSyllabus();
      const out = [];
      for (const ch of data.chapters) {
        for (const ex of ch.examples) {
          for (let k = 0; k < 20; k++) {
            const asked = M.askedOptions(ch, ex);
            if (asked.length !== 3 || new Set(asked.map((o) => o.text)).size !== 3 || asked.filter((o) => o.correct).length !== 1) out.push(`${ex.id}:asked`);
            const known = M.knownOptions(ch, ex);
            const kinds = (kind) => known.filter((o) => o.kind === kind).map((o) => o.text);
            const own = [...kinds('known'), ...kinds('optional')].sort().join('|') === [...ex.known].sort().join('|');
            const others = kinds('other');
            if (!own || others.length !== 2 || others.some((t) => ex.known.includes(t) || M.isConversionFact(t)) || !kinds('known').length) out.push(`${ex.id}:known`);
            if (!M.isKnownSelectionCorrect(known, kinds('known')) || M.isKnownSelectionCorrect(known, [...kinds('known'), others[0]]) || M.isKnownSelectionCorrect(known, kinds('known').slice(1))) out.push(`${ex.id}:grade`);
            const models = M.modelOptions(ex);
            if (models.length !== 3 || new Set(models.map((o) => o.model)).size !== 3 || models.filter((o) => o.correct).length !== 1) out.push(`${ex.id}:model`);
          }
        }
      }
      return {
        bad: [...new Set(out)],
        none: M.stepsFor({ model: 'none' }),
        tank: M.stepsFor({ model: 'tank' }),
        conv: ['1 L = 1000 cm³', '6 L = 6000 cm³', 'speed = 72 km/h', 'apples = 1/4 of circle', 'time 3 h at 80 km/h'].map(M.isConversionFact),
      };
    });
    expect(bad.bad).toEqual([]);
    expect(bad.none).toEqual(['asked', 'known', 'answer']); // model `none`: langkah Picture dilewati
    expect(bad.tank).toEqual(['asked', 'known', 'model', 'answer']);
    expect(bad.conv).toEqual([true, true, false, false, false]);
  });
});
