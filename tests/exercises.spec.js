// Latihan kalimat per pelajaran: isi bagian kosong (fill) dan dengar → pilih arti (listen).
const { test, expect } = require('@playwright/test');
const { KEY, mockSpeech, readProgress, spoken, lesson, fullSentence, failOnPageError } = require('./helpers');

test.beforeEach(async ({ page }) => {
  failOnPageError(page);
});

const FILLS = lesson(1).exercises.filter((e) => e.type === 'fill');

/** Soal fill yang sedang tampil, dicari dari teks kalimat di layar. */
async function currentFill(page) {
  await expect(page.locator('#sentence')).toContainText('＿＿'); // tunggu soal selesai dimuat
  const text = (await page.locator('#sentence').textContent()).trim();
  const ex = FILLS.find((e) => e.sentence.replace('___', '＿＿') === text);
  expect(ex, `soal tidak dikenal: ${text}`).toBeTruthy();
  return ex;
}

test('fill the blank: right answer, wrong-then-reveal, saved after every first answer', async ({ page }) => {
  await mockSpeech(page);
  await page.goto('fill.html?n=1');
  await expect(page.locator('#page-title')).toHaveText('Fill the blank · Lesson 1');
  const seen = new Set();
  let wrongId = null;

  for (let i = 0; i < 5; i++) {
    await expect(page.locator('#counter')).toHaveText(`${i + 1} / 5`);
    const ex = await currentFill(page);
    seen.add(ex.id);
    // Pilihan = persis pilihan di konten (urutan diacak), artinya belum ditampilkan.
    expect((await page.locator('#options .choice').allTextContents()).sort()).toEqual([...ex.options].sort());
    await expect(page.locator('#reveal')).toBeHidden();
    await expect(page.locator('#next-btn')).toBeHidden();
    const wrong = ex.options.filter((o) => o !== ex.answer);

    if (i === 1) {
      wrongId = ex.id;
      // Salah ke-1: petunjuk berisi arti kalimat, pilihan itu dinonaktifkan, belum dibuka.
      await page.locator(`#options [data-option="${wrong[0]}"]`).tap();
      await expect(page.locator('#feedback')).toContainText('Not quite');
      await expect(page.locator('#feedback')).toContainText(ex.arti);
      await expect(page.locator(`#options [data-option="${wrong[0]}"]`)).toBeDisabled();
      await expect(page.locator('#blank')).toHaveText('＿＿');
      let p = await readProgress(page);
      expect(p.sentences[ex.id].fill).toMatchObject({ seen: 1, right: 0 });
      // Salah ke-2: jawaban ditunjukkan dengan ramah; tidak dinilai ulang.
      await page.locator(`#options [data-option="${wrong[1]}"]`).tap();
      await expect(page.locator('#feedback')).toContainText(`It's ${ex.answer}`);
      p = await readProgress(page);
      expect(p.sentences[ex.id].fill).toMatchObject({ seen: 1, right: 0 });
    } else {
      await page.locator(`#options [data-option="${ex.answer}"]`).tap();
      await expect(page.locator('#feedback')).toContainText('Yes!');
      const p = await readProgress(page);
      expect(p.sentences[ex.id].fill).toMatchObject({ seen: 1, right: 1 });
    }
    // Setelah selesai: bagian kosong terisi, pinyin + arti muncul, kalimat utuh dibacakan (dari tap).
    await expect(page.locator('#blank')).toHaveText(ex.answer);
    await expect(page.locator(`#options [data-option="${ex.answer}"]`)).toHaveClass(/right/);
    await expect(page.locator('#q-pinyin')).toHaveText(ex.pinyin);
    await expect(page.locator('#q-arti')).toHaveText(ex.arti);
    expect((await spoken(page)).at(-1)).toMatchObject({ text: fullSentence(ex), lang: 'zh-CN' });
    await page.locator('#next-btn').tap();
  }
  expect(seen.size).toBe(5); // setiap soal muncul sekali

  await expect(page.locator('#screen-done')).toBeVisible();
  await expect(page.locator('#done-summary')).toHaveText('You got 4 of 5 right on the first try.');
  await page.locator('#done-lesson').tap();
  await expect(page).toHaveURL(/lesson\.html\?n=1$/);
  await expect(page.locator('#ex-fill-sub')).toContainText('5 / 5 done');

  // Reload: progres tetap ada.
  await page.reload();
  const p = await readProgress(page);
  expect(p.schemaVersion).toBe(5);
  expect(p.sentences[wrongId].fill.right).toBe(0);
});

test('fill the blank still works without a Chinese voice', async ({ page }) => {
  await mockSpeech(page, { withVoice: false });
  await page.goto('fill.html?n=4');
  const text = (await page.locator('#sentence').textContent()).trim();
  const ex = lesson(4).exercises.find((e) => e.type === 'fill' && e.sentence.replace('___', '＿＿') === text);
  await page.locator(`#options [data-option="${ex.answer}"]`).tap();
  await expect(page.locator('#feedback')).toContainText('Yes!');
  await expect(page.locator('#next-btn')).toBeVisible();
  await expect(page.locator('#oops')).toBeHidden();
});

test('listen → pick the meaning: distractors come from the same lesson; wrong answer replays', async ({ page }) => {
  await mockSpeech(page);
  await page.goto('listen.html?n=1');
  await expect(page.locator('#start-note')).toHaveText('Today: 6 sentences');
  await page.locator('#start-btn').tap();

  const sentences = lesson(1).exercises.map((e) => ({ id: e.id, text: fullSentence(e), pinyin: e.pinyin, arti: e.arti }));
  const artis = new Set(sentences.map((s) => s.arti));
  const heard = new Set();

  for (let i = 0; i < 6; i++) {
    await expect(page.locator('#counter')).toHaveText(`${i + 1} / 6`);
    // Kalimat dibacakan otomatis (dari tap Start/Next) dengan suara zh-CN.
    let s = await spoken(page);
    const cur = sentences.find((x) => x.text === s.at(-1).text);
    expect(cur, `kalimat tidak dikenal: ${s.at(-1).text}`).toBeTruthy();
    expect(s.at(-1)).toMatchObject({ lang: 'zh-CN', voice: 'Tingting' });
    heard.add(cur.id);
    const before = s.length;

    // 3 pilihan arti yang berbeda, semuanya dari pelajaran ini, tepat satu yang benar.
    const options = await page.locator('#options .choice').allTextContents();
    expect(options).toHaveLength(3);
    expect(new Set(options).size).toBe(3);
    expect(options.every((o) => artis.has(o))).toBe(true);
    await expect(page.locator('#options [data-correct="1"]')).toHaveCount(1);
    await expect(page.locator('#options [data-correct="1"]')).toHaveText(cur.arti);
    await expect(page.locator('#reveal')).toBeHidden(); // hanzi belum ditampilkan

    if (i === 0) {
      const wrong = page.locator('#options [data-correct="0"]');
      await wrong.first().tap();
      await expect(page.locator('#feedback')).toContainText('Not quite');
      expect((await spoken(page)).length).toBe(before + 1); // diputar lagi
      let p = await readProgress(page);
      expect(p.sentences[cur.id].listen).toMatchObject({ seen: 1, right: 0 });
      await wrong.nth(1).tap();
      await expect(page.locator('#feedback')).toContainText("We'll practise it again");
      p = await readProgress(page);
      expect(p.sentences[cur.id].listen).toMatchObject({ seen: 1, right: 0 });
    } else {
      await page.locator('#options [data-correct="1"]').tap();
      await expect(page.locator('#feedback')).toContainText('Yes!');
      const p = await readProgress(page);
      expect(p.sentences[cur.id].listen).toMatchObject({ seen: 1, right: 1 });
    }
    await expect(page.locator('#q-hanzi')).toHaveText(cur.text);
    await expect(page.locator('#q-pinyin')).toHaveText(cur.pinyin);
    await expect(page.locator('#options [data-correct="1"]')).toHaveClass(/right/);
    await page.locator('#listen-btn').tap();
    expect((await spoken(page)).at(-1).text).toBe(cur.text);
    await page.locator('#next-btn').tap();
  }
  expect(heard.size).toBe(6);
  await expect(page.locator('#done-summary')).toHaveText('You got 5 of 6 right on the first try.');
  await page.locator('#done-lesson').tap();
  await expect(page.locator('#ex-listen-sub')).toContainText('6 / 10 done');
});

test('listen: the next session includes all sentences not heard yet', async ({ page }) => {
  await mockSpeech(page);
  await page.goto('index.html');
  const all = lesson(1).exercises.map((e) => e.id);
  await page.evaluate(
    ([k, ids]) => {
      const sentences = Object.fromEntries(ids.map((id) => [id, { listen: { seen: 1, right: 1, last: '2026-11-01' } }]));
      localStorage.setItem(k, JSON.stringify({ schemaVersion: 4, leitner: {}, sentences }));
    },
    [KEY, all.slice(0, 6)],
  );
  await page.goto('listen.html?n=1');
  await page.locator('#start-btn').tap();
  // Sesi = 4 kalimat yang belum pernah didengar + 2 yang sudah (urutan diacak).
  const heard = new Set();
  for (let i = 0; i < 6; i++) {
    await expect(page.locator('#counter')).toHaveText(`${i + 1} / 6`);
    heard.add((await spoken(page)).at(-1).text);
    await page.locator('#options [data-correct="1"]').tap();
    await page.locator('#next-btn').tap();
  }
  expect(heard.size).toBe(6);
  for (const ex of lesson(1).exercises.slice(6)) expect(heard.has(fullSentence(ex)), ex.id).toBe(true);
});

test('listen needs a Chinese voice: explains why, Start disabled, Back/Home still there', async ({ page }) => {
  await mockSpeech(page, { withVoice: false });
  await page.goto('listen.html?n=2');
  await expect(page.locator('#voice-note')).toBeVisible();
  await expect(page.locator('#voice-note')).toContainText('needs a Chinese voice');
  await expect(page.locator('#start-btn')).toBeDisabled();
  await expect(page.locator('#back-btn')).toHaveAttribute('href', 'lesson.html?n=2');
  await expect(page.locator('#home-btn')).toBeVisible();
});

test('progress from before lessons (schema v3) is migrated to v4 and kept', async ({ page }) => {
  await mockSpeech(page);
  await page.goto('index.html');
  await page.evaluate((k) => {
    localStorage.setItem(
      k,
      JSON.stringify({
        schemaVersion: 3,
        leitner: { 'hsk2-lvyou': { box: 4, due: '2099-01-01', right: 3, wrong: 0, first: '2026-01-01' }, 'hsk1-ni': { box: 2, due: '2099-01-01' } },
        writing: { 大: { trace: 1, write: 1, last: '2026-11-01' } },
        tones: { 好: { seen: 2, right: 1, last: '2026-11-01' } },
      }),
    );
  }, KEY);
  await page.goto('fill.html?n=1');
  const ex = await currentFill(page);
  await page.locator(`#options [data-option="${ex.answer}"]`).tap();
  const p = await readProgress(page);
  expect(p.schemaVersion).toBe(5);
  expect(p.leitner['hsk2-lvyou'].box).toBe(4);
  expect(p.leitner['hsk1-ni'].box).toBe(2);
  expect(p.writing['大'].write).toBe(1);
  expect(p.tones['好'].seen).toBe(2);
  expect(p.sentences[ex.id].fill.right).toBe(1);
  await page.goto('lesson.html?n=1');
  await expect(page.locator('#ex-cards-sub')).toContainText('1 / 13 words');
});

test('lesson screens fit an iPhone-sized screen without sideways scrolling', async ({ page }) => {
  await mockSpeech(page);
  await page.setViewportSize({ width: 393, height: 852 });
  for (const url of ['hanzi.html', 'lesson.html?n=7', 'fill.html?n=7', 'listen.html?n=7']) {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), url).toBe(0);
  }
});

test.describe('lessons.js logic', () => {
  test.beforeEach(async ({ page }) => page.goto('index.html'));

  test('pickExercises: most-missed first, then never seen, then longest ago; capped', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const L = await import('./js/lessons.js');
      const items = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
      const rec = {
        a: { fill: { seen: 2, right: 2, last: '2026-11-10' } },
        b: { fill: { seen: 2, right: 0, last: '2026-11-12' } },
        c: { listen: { seen: 5, right: 0, last: '2026-11-12' } }, // jenis lain: tidak dihitung untuk fill
        d: { fill: { seen: 1, right: 1, last: '2026-11-01' } },
      };
      const keep = () => 0.999999;
      return { top3: L.pickExercises(items, rec, 'fill', 3, keep).map((x) => x.id), all: L.pickExercises(items, rec, 'fill', 9, keep).map((x) => x.id) };
    });
    expect(r.top3).toEqual(['b', 'c', 'e']);
    expect(r.all).toEqual(['b', 'c', 'e', 'd', 'a']);
  });

  test('recordSentence keeps the other exercise kinds of the same sentence', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const L = await import('./js/lessons.js');
      let s = {};
      s = L.recordSentence(s, 'L1-f1', 'fill', true, '2026-11-16');
      s = L.recordSentence(s, 'L1-f1', 'listen', false, '2026-11-17');
      s = L.recordSentence(s, 'L1-f1', 'fill', false, '2026-11-18');
      return s['L1-f1'];
    });
    expect(r).toEqual({ fill: { seen: 2, right: 1, last: '2026-11-18' }, listen: { seen: 1, right: 0, last: '2026-11-17' } });
  });

  test('every lesson can build a listening question for each of its sentences', async ({ page }) => {
    const bad = await page.evaluate(async () => {
      const L = await import('./js/lessons.js');
      const data = await L.loadLessons();
      const out = [];
      for (const lesson of data.lessons) {
        for (const s of L.lessonSentences(lesson)) {
          const opts = L.listenOptions(lesson, s);
          const ok = opts.length === 3 && opts.filter((o) => o.correct).length === 1 && new Set(opts.map((o) => o.arti)).size === 3;
          if (!ok) out.push(s.id);
        }
      }
      return out;
    });
    expect(bad).toEqual([]);
  });
});
