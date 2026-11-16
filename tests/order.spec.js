// Susun kalimat: potongan bisa di-tap berurutan atau di-drag (Pointer Events), Undo/Clear, penilaian ramah.
const { test, expect } = require('@playwright/test');
const { KEY, mockSpeech, readProgress, spoken, lesson, failOnPageError } = require('./helpers');

const ORDERS = lesson(1).exercises.filter((e) => e.type === 'order');

test.beforeEach(async ({ page }) => {
  failOnPageError(page);
  await mockSpeech(page);
});

/** Soal yang sedang tampil, dikenali dari kumpulan potongannya. */
async function currentOrder(page, list = ORDERS) {
  await expect(page.locator('#bank .chunk, #answer-line .chunk').first()).toBeVisible(); // tunggu soal selesai dimuat
  const texts = await page.locator('#bank .chunk, #answer-line .chunk').allTextContents();
  const key = [...texts].sort().join('|');
  const ex = list.find((e) => [...e.chunks].sort().join('|') === key);
  expect(ex, `soal tidak dikenal: ${key}`).toBeTruthy();
  return ex;
}

const lineOrder = (page) => page.locator('#answer-line .chunk').evaluateAll((els) => els.map((e) => Number(e.dataset.chunk)));
const bankOrder = (page) => page.locator('#bank .chunk').evaluateAll((els) => els.map((e) => Number(e.dataset.chunk)));

async function tapInOrder(page, indexes) {
  for (const i of indexes) await page.locator(`#bank .chunk[data-chunk="${i}"]`).tap();
}

async function center(locator) {
  const b = await locator.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b };
}

async function mouseDrag(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let t = 1; t <= 6; t++) await page.mouse.move(from.x + ((to.x - from.x) * t) / 6, from.y + ((to.y - from.y) * t) / 6);
  await page.mouse.up();
}

test('tap in order: right first time, wrong-then-fix, wrong twice → shown; saved after first check', async ({ page }) => {
  await page.goto('lesson.html?n=1');
  await page.locator('#ex-order').tap();
  await expect(page).toHaveURL(/order\.html\?n=1$/);
  await expect(page.locator('#page-title')).toHaveText('Build the sentence · Lesson 1');
  const seen = new Set();

  for (let i = 0; i < 5; i++) {
    await expect(page.locator('#counter')).toHaveText(`${i + 1} / 5`);
    const ex = await currentOrder(page);
    seen.add(ex.id);
    const n = ex.chunks.length;
    const correct = ex.chunks.map((_, k) => k);
    const reversed = [...correct].reverse();

    // Awal: semua potongan di bawah, diacak (tidak langsung membentuk jawaban), Check belum aktif.
    await expect(page.locator('#answer-line .chunk')).toHaveCount(0);
    expect(await bankOrder(page)).not.toEqual(correct);
    await expect(page.locator('#check-btn')).toBeDisabled();
    await expect(page.locator('#reveal')).toBeHidden();

    if (i === 0) {
      // Tap potongan di kalimat mengembalikannya; Undo membatalkan langkah terakhir.
      await tapInOrder(page, [1, 0]);
      expect(await lineOrder(page)).toEqual([1, 0]);
      await page.locator('#answer-line .chunk[data-chunk="1"]').tap();
      expect(await lineOrder(page)).toEqual([0]);
      await page.locator('#undo-btn').tap();
      expect(await lineOrder(page)).toEqual([1, 0]);
      await page.locator('#clear-btn').tap();
      await expect(page.locator('#answer-line .chunk')).toHaveCount(0);
      await expect(page.locator('#bank .chunk')).toHaveCount(n);

      await tapInOrder(page, correct);
      await expect(page.locator('#check-btn')).toBeEnabled();
      await page.locator('#check-btn').tap();
      await expect(page.locator('#feedback')).toContainText('Yes!');
      await expect(page.locator('#answer-line')).toHaveClass(/right/);
      const p = await readProgress(page);
      expect(p.sentences[ex.id].order).toMatchObject({ seen: 1, right: 1 });
    } else if (i === 1) {
      // Salah ke-1: arti muncul sebagai petunjuk, potongan yang sudah di tempatnya ditandai; lalu diperbaiki.
      await tapInOrder(page, reversed);
      await page.locator('#check-btn').tap();
      await expect(page.locator('#feedback')).toContainText('Not quite');
      await expect(page.locator('#q-arti-hint')).toContainText(ex.arti);
      await expect(page.locator('#reveal')).toBeHidden();
      await expect(page.locator('#answer-line .chunk.in-place')).toHaveCount(n % 2); // hanya potongan tengah (jika ganjil)
      let p = await readProgress(page);
      expect(p.sentences[ex.id].order).toMatchObject({ seen: 1, right: 0 });
      await page.locator('#clear-btn').tap();
      await tapInOrder(page, correct);
      await page.locator('#check-btn').tap();
      await expect(page.locator('#feedback')).toContainText('Yes!');
      p = await readProgress(page);
      expect(p.sentences[ex.id].order).toMatchObject({ seen: 1, right: 0 }); // percobaan kedua tidak dinilai ulang
    } else if (i === 2) {
      // Salah dua kali: susunan yang benar ditunjukkan.
      await tapInOrder(page, reversed);
      await page.locator('#check-btn').tap();
      await page.locator('#check-btn').tap();
      await expect(page.locator('#feedback')).toContainText("We'll practise it again");
      expect(await lineOrder(page)).toEqual(correct);
      await expect(page.locator('#answer-line')).toHaveClass(/shown/);
    } else {
      await tapInOrder(page, correct);
      await page.locator('#check-btn').tap();
      await expect(page.locator('#feedback')).toContainText('Yes!');
    }

    // Setelah selesai: kalimat utuh + pinyin + arti, dibacakan, potongan terkunci, Next muncul.
    await expect(page.locator('#q-hanzi')).toHaveText(ex.answer);
    await expect(page.locator('#q-pinyin')).toHaveText(ex.pinyin);
    await expect(page.locator('#q-arti')).toHaveText(ex.arti);
    expect((await spoken(page)).at(-1)).toMatchObject({ text: ex.answer, lang: 'zh-CN' });
    await expect(page.locator('#answer-line .chunk').first()).toBeDisabled();
    await expect(page.locator('#check-btn')).toBeHidden();
    await page.locator('#next-btn').tap();
  }
  expect(seen.size).toBe(5);
  await expect(page.locator('#done-summary')).toHaveText('You got 3 of 5 right on the first try.');
  await page.locator('#done-lesson').tap();
  await expect(page.locator('#ex-order-sub')).toContainText('5 / 5 done');
});

test('drag with the mouse: drop into the sentence, insert before another piece, drag out to remove', async ({ page }) => {
  await page.goto('order.html?n=1');
  const ex = await currentOrder(page);
  const line = page.locator('#answer-line');

  // 1) Drag potongan 2 dari bawah ke kalimat (masih kosong).
  await mouseDrag(page, await center(page.locator('#bank .chunk[data-chunk="2"]')), await center(line));
  expect(await lineOrder(page)).toEqual([2]);

  // 2) Drag potongan 0 ke KIRI potongan 2 -> disisipkan di depan.
  let c2 = await center(page.locator('#answer-line .chunk[data-chunk="2"]'));
  await mouseDrag(page, await center(page.locator('#bank .chunk[data-chunk="0"]')), { x: c2.box.x + 4, y: c2.y });
  expect(await lineOrder(page)).toEqual([0, 2]);

  // 3) Drag potongan 1 ke antara 0 dan 2 (kanan dari tengah potongan 0).
  const c0 = await center(page.locator('#answer-line .chunk[data-chunk="0"]'));
  await mouseDrag(page, await center(page.locator('#bank .chunk[data-chunk="1"]')), { x: c0.box.x + c0.box.width - 2, y: c0.y });
  expect(await lineOrder(page)).toEqual([0, 1, 2]);

  // 4) Susun ulang di dalam kalimat: tarik potongan 0 ke ujung kanan.
  c2 = await center(page.locator('#answer-line .chunk[data-chunk="2"]'));
  await mouseDrag(page, await center(page.locator('#answer-line .chunk[data-chunk="0"]')), { x: c2.box.x + c2.box.width + 10, y: c2.y });
  expect(await lineOrder(page)).toEqual([1, 2, 0]);

  // 5) Tarik keluar dari kalimat (jauh ke bawah) -> kembali ke bawah. Undo mengembalikannya.
  const bank = await center(page.locator('#bank'));
  await mouseDrag(page, await center(page.locator('#answer-line .chunk[data-chunk="0"]')), { x: bank.x, y: bank.y + 60 });
  expect(await lineOrder(page)).toEqual([1, 2]);
  expect(await bankOrder(page)).toContain(0);
  await page.locator('#undo-btn').tap();
  expect(await lineOrder(page)).toEqual([1, 2, 0]);

  // Tidak ada sisa penanda drag.
  await expect(page.locator('.drop-marker')).toHaveCount(0);
  await expect(page.locator('.chunk.dragging')).toHaveCount(0);
  expect(ex.chunks.length).toBeGreaterThanOrEqual(3);
});

test('drag with the Pencil (pen pointer events); a cancelled drag changes nothing; small moves count as a tap', async ({ page }) => {
  await page.goto('order.html?n=1');
  await currentOrder(page);
  const target = await center(page.locator('#answer-line'));
  const from = await center(page.locator('#bank .chunk[data-chunk="1"]'));

  const fire = (sel, type, pt, pointerType, id) =>
    page.locator(sel).evaluate(
      (el, [type, pt, pointerType, id]) =>
        el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType, isPrimary: true, clientX: pt.x, clientY: pt.y, button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure: 0.6 })),
      [type, pt, pointerType, id],
    );
  const chunk1 = '.chunk[data-chunk="1"]';

  // Drag dengan pena, lalu dibatalkan sistem (pointercancel): susunan tidak berubah.
  await fire(chunk1, 'pointerdown', from, 'pen', 11);
  await fire(chunk1, 'pointermove', { x: (from.x + target.x) / 2, y: (from.y + target.y) / 2 }, 'pen', 11);
  await fire(chunk1, 'pointermove', target, 'pen', 11);
  await expect(page.locator('.chunk.dragging')).toHaveCount(1);
  await expect(page.locator('.drop-marker')).toHaveCount(1);
  await fire(chunk1, 'pointercancel', target, 'pen', 11);
  expect(await lineOrder(page)).toEqual([]);
  await expect(page.locator('.chunk.dragging')).toHaveCount(0);
  await expect(page.locator('.drop-marker')).toHaveCount(0);

  // Drag dengan pena sampai dilepas di kalimat.
  await fire(chunk1, 'pointerdown', from, 'pen', 12);
  await fire(chunk1, 'pointermove', target, 'pen', 12);
  await fire(chunk1, 'pointerup', target, 'pen', 12);
  expect(await lineOrder(page)).toEqual([1]);

  // Gerakan kecil (< 8 px) dengan jari = tap, bukan drag: potongan pindah ke akhir kalimat.
  const f0 = await center(page.locator('#bank .chunk[data-chunk="0"]'));
  const chunk0 = '.chunk[data-chunk="0"]';
  await fire(chunk0, 'pointerdown', f0, 'touch', 13);
  await fire(chunk0, 'pointermove', { x: f0.x + 3, y: f0.y + 2 }, 'touch', 13);
  await fire(chunk0, 'pointerup', { x: f0.x + 3, y: f0.y + 2 }, 'touch', 13);
  expect(await lineOrder(page)).toEqual([1, 0]);
});

test('pieces are real touch targets: ≥ 48 px, touch-action none, and fit an iPhone-sized screen', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('order.html?n=6'); // pelajaran 6 punya kalimat 5 potongan
  await currentOrder(page, lesson(6).exercises.filter((e) => e.type === 'order'));
  const info = await page.locator('#bank .chunk').evaluateAll((els) =>
    els.map((e) => ({ h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width, ta: getComputedStyle(e).touchAction })),
  );
  expect(info.every((i) => i.h >= 48 && i.w >= 48 && i.ta === 'none')).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  await expect(page.locator('#undo-btn')).toBeVisible();
  await expect(page.locator('#clear-btn')).toBeVisible();
});

test('a different word order listed in also_accept is correct too', async ({ page }) => {
  const ex = ORDERS.find((e) => e.id === 'L1-o1'); // 明天我要… / 我明天要…
  await page.goto('index.html');
  // Buat L1-o1 menjadi soal pertama: tandai soal lain sudah dikuasai.
  await page.evaluate(
    ([k, ids]) => {
      const sentences = Object.fromEntries(ids.map((id) => [id, { order: { seen: 3, right: 3, last: '2026-11-01' } }]));
      localStorage.setItem(k, JSON.stringify({ schemaVersion: 4, leitner: {}, sentences }));
    },
    [KEY, ORDERS.filter((e) => e.id !== 'L1-o1').map((e) => e.id)],
  );
  await page.goto('order.html?n=1');
  // L1-o1 belum pernah dilatih -> pasti masuk sesi; cari sampai ketemu.
  for (let i = 0; i < 5; i++) {
    const cur = await currentOrder(page);
    if (cur.id === 'L1-o1') break;
    await tapInOrder(page, cur.chunks.map((_, k) => k));
    await page.locator('#check-btn').tap();
    await page.locator('#next-btn').tap();
  }
  expect((await currentOrder(page)).id).toBe('L1-o1');
  expect(ex.chunks.slice(0, 2)).toEqual(['明天', '我']);
  await tapInOrder(page, [1, 0, 2, 3, 4, 5]); // 我 明天 要 …
  await page.locator('#check-btn').tap();
  await expect(page.locator('#feedback')).toContainText('Yes!');
  await expect(page.locator('#q-hanzi')).toHaveText(ex.answer);
});

test.describe('order logic', () => {
  test.beforeEach(async ({ page }) => page.goto('index.html'));

  test('isCorrectOrder ignores punctuation and accepts also_accept; shuffles never start solved', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const L = await import('./js/lessons.js');
      const data = await L.loadLessons();
      const ex = data.lessons[7].exercises.find((e) => e.id === 'L8-o2'); // 服务员，请给我一杯茶。
      const solved = [];
      for (const lesson of data.lessons) {
        for (const e of lesson.exercises.filter((x) => x.type === 'order')) {
          for (let k = 0; k < 30; k++) {
            const order = L.shuffledChunkOrder(e);
            const sameSet = [...order].sort((a, b) => a - b).every((v, i) => v === i) && order.length === e.chunks.length;
            if (!sameSet || L.isCorrectOrder(e, order.map((i) => e.chunks[i]))) solved.push(e.id);
          }
          if (!L.isCorrectOrder(e, e.chunks)) solved.push(`${e.id}:answer`);
        }
      }
      return {
        punct: L.isCorrectOrder(ex, ex.chunks),
        wrong: L.isCorrectOrder(ex, [...ex.chunks].reverse()),
        alt: L.isCorrectOrder({ chunks: ['a'], answer: '我妈妈明天出院。', also_accept: ['明天我妈妈出院。'] }, ['明天', '我妈妈', '出院']),
        solved,
      };
    });
    expect(r).toEqual({ punct: true, wrong: false, alt: true, solved: [] });
  });
});
