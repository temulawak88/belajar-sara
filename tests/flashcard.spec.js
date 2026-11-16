// Alur utama: buka app -> Mandarin -> pelajaran -> kartu kata -> jawab benar/salah -> progres tersimpan -> reload -> masih ada.
const { test, expect } = require('@playwright/test');
const { KEY, readProgress, lesson } = require('./helpers');

const CARDS = 'cards.html?n=1'; // Pelajaran 1: 旅游, 觉得, 最, 为什么, 也, ...

async function expectBoxes(page, counts) {
  for (let b = 1; b <= 5; b++) {
    await expect(page.locator(`.box[data-box="${b}"] .box-count`)).toHaveText(String(counts[b - 1]));
  }
}

test.beforeEach(async ({ page }) => {
  // Tangkap error JS apa pun: app tidak boleh melempar error di alur normal.
  page.on('pageerror', (e) => {
    throw e;
  });
});

test('home → lesson list → lesson menu; Daily Mission is not clickable yet', async ({ page }) => {
  await page.goto('index.html');
  await expect(page.locator('h1')).toContainText('What shall we learn');
  await expect(page.locator('#mandarin-status')).toHaveText('Lessons 1–11 · start here!');
  await expect(page.locator('.menu-card.disabled')).toHaveCount(1);
  await page.locator('#go-mandarin').tap();
  await expect(page).toHaveURL(/\/docs\/hanzi\.html$/);
  await expect(page.locator('.lesson-card')).toHaveCount(11);
  await expect(page.locator('.lesson-card').first()).toContainText('Lesson 1');
  await expect(page.locator('.lesson-card').first()).toContainText('九月去北京旅游最好');
  await expect(page.locator('.lesson-card').first()).toContainText('0 / 13 words');

  await page.locator('.lesson-card[data-lesson="3"]').tap();
  await expect(page).toHaveURL(/\/docs\/lesson\.html\?n=3$/);
  await expect(page.locator('#page-title')).toHaveText('Lesson 3');
  await expect(page.locator('#lesson-zh')).toHaveText('左边那个红色的是我的');
  await expect(page.locator('#ex-cards')).toHaveAttribute('href', 'cards.html?n=3');
  await expect(page.locator('#ex-fill')).toHaveAttribute('href', 'fill.html?n=3');
  await expect(page.locator('#ex-listen')).toHaveAttribute('href', 'listen.html?n=3');
  await expect(page.locator('#ex-order')).toHaveAttribute('href', 'order.html?n=3');
  await expect(page.locator('#ex-write')).toHaveAttribute('href', 'write.html?n=3');
  await expect(page.locator('#ex-tone')).toHaveAttribute('href', 'tone.html?n=3');
  await expect(page.locator('#screen-lesson .disabled')).toHaveCount(0);
  await page.locator('#grammar summary').tap();
  await expect(page.locator('#grammar-list li')).toHaveCount(3);

  // Ada jalan pulang dari setiap layar.
  await page.locator('#back-btn').tap();
  await expect(page).toHaveURL(/\/docs\/hanzi\.html$/);
  await page.locator('#home-btn').tap();
  await expect(page).toHaveURL(/\/docs\/index\.html$/);
});

test('an invalid lesson number goes back to the lesson list (no dead end)', async ({ page }) => {
  for (const url of ['lesson.html?n=99', 'cards.html', 'fill.html?n=abc', 'listen.html?n=0', 'order.html?n=12', 'write.html', 'tone.html']) {
    await page.goto(url);
    await expect(page).toHaveURL(/\/docs\/hanzi\.html$/);
    await expect(page.locator('.lesson-card')).toHaveCount(11);
  }
});

test('the old HSK 1 flashcards are gone; lessons marked "current" come first', async ({ page }) => {
  await page.route('**/content/hsk2/lessons.json', async (route) => {
    const res = await route.fetch();
    const data = await res.json();
    data.lessons[4].status = 'current';
    await route.fulfill({ response: res, json: data });
  });
  await page.goto('hanzi.html');
  await expect(page.locator('#boxes')).toHaveCount(0);
  await expect(page.locator('.lesson-card').first()).toContainText('Lesson 5');
  await expect(page.locator('.lesson-card').first().locator('.badge')).toHaveText('Now');
  await expect(page.locator('.lesson-card').nth(1)).toContainText('Lesson 1');
});

test('word cards: right/wrong answers move cards between Leitner boxes and survive reload', async ({ page }) => {
  await page.goto(CARDS);
  await expect(page.locator('#page-title')).toHaveText('Word cards · Lesson 1');
  await expectBoxes(page, [0, 0, 0, 0, 0]);
  await expect(page.locator('#start-note')).toContainText('5 new (13 words not started yet)');

  await page.locator('#start-btn').tap();
  await expect(page.locator('#counter')).toHaveText('1 / 5');
  await expect(page.locator('#card-hanzi')).toHaveText('旅游');
  await expect(page.locator('#card-answer')).toBeHidden();

  // Kartu 1: tunjukkan jawaban -> pinyin + arti Inggris + Indonesia, lalu "I knew it!"
  await page.locator('#reveal-btn').tap();
  await expect(page.locator('#card-pinyin')).toHaveText('lǚyóu');
  await expect(page.locator('#card-en')).toHaveText('to travel');
  await expect(page.locator('#card-id')).toHaveText('berwisata');
  await page.locator('#knew-btn').tap();

  // Progres langsung tersimpan setelah SATU jawaban.
  let p = await readProgress(page);
  expect(p.schemaVersion).toBe(5);
  expect(p.leitner['hsk2-lvyou'].box).toBe(2);

  // Kartu 2: "Not yet" -> tetap kotak 1 dan diulang di akhir sesi.
  await expect(page.locator('#card-hanzi')).toHaveText('觉得');
  await page.locator('#reveal-btn').tap();
  await page.locator('#notyet-btn').tap();
  await expect(page.locator('#toast')).toContainText("That's OK");
  p = await readProgress(page);
  expect(p.leitner['hsk2-juede'].box).toBe(1);
  expect(p.leitner['hsk2-juede'].wrong).toBe(1);

  // Kartu 3–5 benar.
  for (let i = 3; i <= 5; i++) {
    await expect(page.locator('#counter')).toHaveText(`${i} / 6`);
    await page.locator('#reveal-btn').tap();
    await page.locator('#knew-btn').tap();
  }

  // Kartu 6 = latihan ulang 觉得, tidak dinilai ulang (tidak naik kotak hari ini).
  await expect(page.locator('#counter')).toHaveText('6 / 6');
  await expect(page.locator('#card-tag')).toBeVisible();
  await expect(page.locator('#card-hanzi')).toHaveText('觉得');
  await page.locator('#reveal-btn').tap();
  await page.locator('#knew-btn').tap();

  await expect(page.locator('#screen-done')).toBeVisible();
  await expect(page.locator('#done-summary')).toContainText('You knew 4 cards. 1 to practise again tomorrow.');
  p = await readProgress(page);
  expect(p.leitner['hsk2-juede'].box).toBe(1);

  // Tombol "Lesson" kembali ke menu pelajaran, yang menampilkan progres.
  await page.locator('#done-lesson').tap();
  await expect(page).toHaveURL(/lesson\.html\?n=1$/);
  await expect(page.locator('#ex-cards-sub')).toContainText('5 / 13 words');

  // Reload -> progres masih ada, dan kuota kata baru hari ini sudah habis (juga untuk pelajaran lain).
  await page.goto(CARDS);
  await expectBoxes(page, [1, 4, 0, 0, 0]);
  await expect(page.locator('#start-note')).toContainText('All done for today');
  await expect(page.locator('#start-btn')).toBeHidden();
  await page.goto('cards.html?n=2');
  await expect(page.locator('#start-note')).toContainText('All done for today');

  await page.goto('index.html');
  await expect(page.locator('#mandarin-status')).toHaveText('All done today · 5 words started');
});

test('a word that is not in the HSK list shows only its Indonesian meaning', async ({ page }) => {
  await page.goto('index.html');
  await page.evaluate(
    ([k, ids]) => {
      const leitner = Object.fromEntries(ids.map((id) => [id, { box: 5, due: '2099-01-01', right: 4, wrong: 0, first: '2026-01-01' }]));
      localStorage.setItem(k, JSON.stringify({ schemaVersion: 4, leitner }));
    },
    [KEY, lesson(1).vocab.filter((v) => v.id !== 'l1-huahua').map((v) => v.id)],
  );
  await page.goto(CARDS);
  await page.locator('#start-btn').tap();
  await expect(page.locator('#card-hanzi')).toHaveText('花花');
  await page.locator('#reveal-btn').tap();
  await expect(page.locator('#card-id')).toContainText('Huahua');
  await expect(page.locator('#card-en')).toBeHidden();
});

test('cards come back on the right day (Leitner intervals)', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-16T10:00:00') });
  await page.goto(CARDS);
  await page.locator('#start-btn').tap();
  // 旅游 benar (-> kotak 2, kembali 2 hari lagi), 觉得 salah (-> kotak 1, besok), sisanya benar.
  const answers = [true, false, true, true, true, true];
  for (const knew of answers) {
    await page.locator('#reveal-btn').tap();
    await page.locator(knew ? '#knew-btn' : '#notyet-btn').tap();
  }
  await expect(page.locator('#screen-done')).toBeVisible();

  // Besok: 觉得 jatuh tempo + 5 kata baru.
  await page.clock.setSystemTime(new Date('2026-11-17T10:00:00'));
  await page.goto(CARDS);
  await expect(page.locator('#start-note')).toHaveText(/Today: 1 to review \+ 5 new/);
  await page.locator('#start-btn').tap();
  await expect(page.locator('#card-hanzi')).toHaveText('觉得'); // ulangan didahulukan

  // Lusa (tanpa menjawab sesi tadi): 4 kartu kotak 2 + 觉得 dari kotak 1 jatuh tempo.
  await page.clock.setSystemTime(new Date('2026-11-18T10:00:00'));
  await page.goto(CARDS);
  await expect(page.locator('#start-note')).toHaveText(/Today: 5 to review \+ 5 new/);
});

test('supplementary words come last and are reviewed half as often', async ({ page }) => {
  await page.goto('index.html');
  const r = await page.evaluate(async () => {
    const L = await import('./js/lessons.js');
    const G = await import('./js/leitner.js');
    const data = await L.loadLessons();
    const cards = L.cardWords(L.findLesson(data, 2));
    return {
      last: cards.at(-1).hanzi,
      lastSupp: cards.at(-1).supplementary,
      coreFirst: cards.slice(0, -1).every((c) => !c.supplementary),
      normal: G.grade({}, 'a', true, '2026-11-16').a.due,
      supp: G.grade({}, 'a', true, '2026-11-16', 2).a.due,
    };
  });
  expect(r).toEqual({ last: '米', lastSupp: true, coreFirst: true, normal: '2026-11-18', supp: '2026-11-20' });
});

test('speaker button never breaks the app, with or without a zh-CN voice', async ({ page }) => {
  await page.goto(CARDS);
  await page.locator('#start-btn').tap();
  await page.locator('#speak-btn').tap();
  await page.locator('#reveal-btn').tap(); // reveal juga memicu suara
  await expect(page.locator('#oops')).toBeHidden();
  const hasZh = await page.evaluate(
    () => !!window.speechSynthesis && speechSynthesis.getVoices().some((v) => /zh[-_]CN/i.test(v.lang)),
  );
  if (!hasZh) {
    // Browser tes tanpa suara Mandarin: pesan kecil muncul, latihan tetap jalan.
    await expect(page.locator('#voice-note')).toBeVisible();
  }
  await page.locator('#knew-btn').tap();
  await expect(page.locator('#counter')).toHaveText('2 / 5');
});

test('a stored progress survives schema migration from data without schemaVersion', async ({ page }) => {
  await page.goto('index.html');
  await page.evaluate((k) => {
    localStorage.setItem(k, JSON.stringify({ leitner: { 'hsk2-lvyou': { box: 3, due: '2000-01-01', right: 2, wrong: 0 } } }));
  }, KEY);
  await page.goto(CARDS);
  await expectBoxes(page, [0, 0, 1, 0, 0]);
  await expect(page.locator('#start-note')).toContainText('1 to review');
});

test('corrupt storage does not freeze the app', async ({ page }) => {
  await page.goto('index.html');
  await page.evaluate((k) => localStorage.setItem(k, '{not json'), KEY);
  await page.goto(CARDS);
  await expectBoxes(page, [0, 0, 0, 0, 0]);
  await expect(page.locator('#oops')).toBeHidden();
});

test('home counts only lesson words, capped at one short session; old HSK 1 progress is ignored', async ({ page }) => {
  await page.goto('index.html');
  const due = { box: 1, due: '2000-01-01', right: 0, wrong: 1, first: '2000-01-01' };
  // Hanya progres HSK 1 lama (flashcard-nya sudah tidak ada): tidak boleh muncul sebagai ulangan.
  await page.evaluate(([k, due]) => localStorage.setItem(k, JSON.stringify({ schemaVersion: 3, leitner: { 'hsk1-ni': due, 'hsk1-hao': due } })), [KEY, due]);
  await page.reload();
  await expect(page.locator('#mandarin-status')).toHaveText('Lessons 1–11 · start here!');

  const ids = [...lesson(1).vocab, ...lesson(2).vocab].map((v) => v.id); // 28 kata
  await page.evaluate(
    ([k, due, ids]) => localStorage.setItem(k, JSON.stringify({ schemaVersion: 3, leitner: Object.fromEntries([['hsk1-ni', due], ...ids.map((id) => [id, due])]) })),
    [KEY, due, ids],
  );
  await page.reload();
  await expect(page.locator('#mandarin-status')).toHaveText('12 cards to review today'); // bukan 28 atau 29
  await page.goto('cards.html?n=2');
  await expect(page.locator('#start-note')).toContainText('Today: 12 to review');
  const p = await readProgress(page);
  expect(p === null || p.leitner['hsk1-ni']).toBeTruthy(); // progres lama tidak dihapus
});

test('the "1 / 5" counter stays on one line on a narrow (iPhone) screen; header does not overflow', async ({ page }) => {
  // 300 px = sedikit lebih sempit dari iPhone SE (320), sebagai cadangan karena huruf di WebKit lebih lebar.
  for (const width of [320, 300]) {
    await page.setViewportSize({ width, height: 640 });
    await page.goto(CARDS);
    await page.locator('#start-btn').tap();
    const box = await page.locator('#counter').boundingBox();
    const lineHeight = await page.locator('#counter').evaluate((el) => parseFloat(getComputedStyle(el).lineHeight) || 30);
    expect(box.height, `${width}px`).toBeLessThan(lineHeight * 1.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${width}px`).toBe(0);
    // Judul tidak terhimpit sampai hampir hilang (sebelumnya hanya ±12 px di 320 px).
    expect((await page.locator('#page-title').boundingBox()).width, `${width}px`).toBeGreaterThanOrEqual(50);
    // Tombol header tetap target sentuh ≥ 48 px.
    for (const id of ['#back-btn', '#home-btn']) {
      const b = await page.locator(id).boundingBox();
      expect(Math.min(b.width, b.height), `${width}px ${id}`).toBeGreaterThanOrEqual(48);
    }
  }
});
