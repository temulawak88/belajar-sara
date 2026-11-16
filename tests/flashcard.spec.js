// Alur utama: buka app -> Mandarin -> latihan -> jawab benar/salah -> progres tersimpan -> reload -> masih ada.
const { test, expect } = require('@playwright/test');

const KEY = 'belajar-sarah:progress';

async function readProgress(page) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
}

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

test('home menu opens Mandarin; Math and Daily Mission are not clickable yet', async ({ page }) => {
  await page.goto('index.html');
  await expect(page.locator('h1')).toContainText('What shall we learn');
  await expect(page.locator('#mandarin-status')).toHaveText('Flashcards · start here!');
  await expect(page.locator('.menu-card.disabled')).toHaveCount(2);
  await page.locator('#go-mandarin').tap();
  await expect(page).toHaveURL(/\/docs\/hanzi\.html$/);
  await expect(page.locator('#boxes .box')).toHaveCount(5);
  // Ada jalan pulang dari setiap layar.
  await page.locator('#home-btn').tap();
  await expect(page).toHaveURL(/\/docs\/index\.html$/);
});

test('flashcard session: right/wrong answers move cards between Leitner boxes and survive reload', async ({ page }) => {
  await page.goto('hanzi.html');
  await expectBoxes(page, [0, 0, 0, 0, 0]);
  await expect(page.locator('#start-note')).toContainText('5 new');

  await page.locator('#start-btn').tap();
  await expect(page.locator('#counter')).toHaveText('1 / 5');
  await expect(page.locator('#card-hanzi')).toHaveText('你');
  await expect(page.locator('#card-answer')).toBeHidden();

  // Kartu 1: tunjukkan jawaban -> pinyin + arti Inggris + Indonesia, lalu "I knew it!"
  await page.locator('#reveal-btn').tap();
  await expect(page.locator('#card-pinyin')).toHaveText('nǐ');
  await expect(page.locator('#card-en')).toHaveText('you');
  await expect(page.locator('#card-id')).toHaveText('kamu');
  await page.locator('#knew-btn').tap();

  // Progres langsung tersimpan setelah SATU jawaban.
  let p = await readProgress(page);
  expect(p.schemaVersion).toBe(3); // selalu dimigrasi ke versi terbaru
  expect(p.leitner['hsk1-ni'].box).toBe(2);

  // Kartu 2: "Not yet" -> tetap kotak 1 dan diulang di akhir sesi.
  await expect(page.locator('#card-hanzi')).toHaveText('好');
  await page.locator('#reveal-btn').tap();
  await page.locator('#notyet-btn').tap();
  await expect(page.locator('#toast')).toContainText("That's OK");
  p = await readProgress(page);
  expect(p.leitner['hsk1-hao'].box).toBe(1);
  expect(p.leitner['hsk1-hao'].wrong).toBe(1);

  // Kartu 3–5 benar.
  for (let i = 3; i <= 5; i++) {
    await expect(page.locator('#counter')).toHaveText(`${i} / 6`);
    await page.locator('#reveal-btn').tap();
    await page.locator('#knew-btn').tap();
  }

  // Kartu 6 = latihan ulang 好, tidak dinilai ulang (tidak naik kotak hari ini).
  await expect(page.locator('#counter')).toHaveText('6 / 6');
  await expect(page.locator('#card-tag')).toBeVisible();
  await expect(page.locator('#card-hanzi')).toHaveText('好');
  await page.locator('#reveal-btn').tap();
  await page.locator('#knew-btn').tap();

  await expect(page.locator('#screen-done')).toBeVisible();
  await expect(page.locator('#done-summary')).toContainText('You knew 4 cards. 1 to practise again tomorrow.');
  p = await readProgress(page);
  expect(p.leitner['hsk1-hao'].box).toBe(1);

  // Reload -> progres masih ada, dan kuota kata baru hari ini sudah habis.
  await page.reload();
  await expectBoxes(page, [1, 4, 0, 0, 0]);
  await expect(page.locator('#start-note')).toContainText('All done for today');
  await expect(page.locator('#start-btn')).toBeHidden();

  await page.goto('index.html');
  await expect(page.locator('#mandarin-status')).toHaveText('All done today · 5 words started');
});

test('cards come back on the right day (Leitner intervals)', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-16T10:00:00') });
  await page.goto('hanzi.html');
  await page.locator('#start-btn').tap();
  // 你 benar (-> kotak 2, kembali 2 hari lagi), 好 salah (-> kotak 1, besok), sisanya benar.
  const answers = [true, false, true, true, true, true];
  for (const knew of answers) {
    await page.locator('#reveal-btn').tap();
    await page.locator(knew ? '#knew-btn' : '#notyet-btn').tap();
  }
  await expect(page.locator('#screen-done')).toBeVisible();

  // Besok: 好 jatuh tempo + 5 kata baru.
  await page.clock.setSystemTime(new Date('2026-11-17T10:00:00'));
  await page.reload();
  await expect(page.locator('#start-note')).toHaveText(/Today: 1 to review \+ 5 new/);
  await page.locator('#start-btn').tap();
  await expect(page.locator('#card-hanzi')).toHaveText('好'); // ulangan didahulukan

  // Lusa (tanpa menjawab sesi tadi): 4 kartu kotak 2 + 好 dari kotak 1 jatuh tempo.
  await page.clock.setSystemTime(new Date('2026-11-18T10:00:00'));
  await page.reload();
  await expect(page.locator('#start-note')).toHaveText(/Today: 5 to review \+ 5 new/);
});

test('speaker button never breaks the app, with or without a zh-CN voice', async ({ page }) => {
  await page.goto('hanzi.html');
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
    localStorage.setItem(k, JSON.stringify({ leitner: { 'hsk1-ni': { box: 3, due: '2000-01-01', right: 2, wrong: 0 } } }));
  }, KEY);
  await page.goto('hanzi.html');
  await expectBoxes(page, [0, 0, 1, 0, 0]);
  await expect(page.locator('#start-note')).toContainText('1 to review');
});

test('corrupt storage does not freeze the app', async ({ page }) => {
  await page.goto('index.html');
  await page.evaluate((k) => localStorage.setItem(k, '{not json'), KEY);
  await page.goto('hanzi.html');
  await expectBoxes(page, [0, 0, 0, 0, 0]);
  await expect(page.locator('#oops')).toBeHidden();
});

test('home and flashcard page agree on the number of reviews (capped at one short session)', async ({ page }) => {
  await page.goto('index.html');
  await page.evaluate((k) => {
    const leitner = {};
    const ids = ['ni', 'hao', 'xiexie', 'zaijian', 'baba', 'mama', 'pengyou', 'laoshi', 'xuesheng', 'mao', 'gou', 'shui', 'mifan', 'pingguo', 'chi', 'he', 'xihuan', 'da'];
    for (const id of ids) leitner[`hsk1-${id}`] = { box: 1, due: '2000-01-01', right: 0, wrong: 1, first: '2000-01-01' };
    localStorage.setItem(k, JSON.stringify({ schemaVersion: 1, nickname: '', leitner }));
  }, KEY);
  await page.reload();
  await expect(page.locator('#mandarin-status')).toHaveText('12 cards to review today'); // bukan 18
  await page.goto('hanzi.html');
  await expect(page.locator('#start-note')).toContainText('Today: 12 to review');
});

test('the "1 / 5" counter stays on one line on a narrow (iPhone) screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 }) // iPhone SE (layar terkecil);
  await page.goto('hanzi.html');
  await page.locator('#start-btn').tap();
  const box = await page.locator('#counter').boundingBox();
  const lineHeight = await page.locator('#counter').evaluate((el) => parseFloat(getComputedStyle(el).lineHeight) || 30);
  expect(box.height).toBeLessThan(lineHeight * 1.5);
});
