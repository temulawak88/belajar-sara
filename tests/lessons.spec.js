// Pelajaran Mandarin (HSK Standard Course 2): konten tayang di docs/ dan siap dipakai layar latihan.
const { test, expect } = require('@playwright/test');

test('lessons.json is served from docs/content/hsk2 (relative path) and is complete', async ({ page }) => {
  const res = await page.request.get('content/hsk2/lessons.json');
  expect(res.ok()).toBe(true);
  const data = await res.json();
  expect(data.lessons.map((l) => l.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  for (const l of data.lessons) {
    expect(l.exercises.filter((e) => e.type === 'fill').length).toBeGreaterThanOrEqual(5);
    expect(l.exercises.filter((e) => e.type === 'order').length).toBeGreaterThanOrEqual(5);
    // dengar → pilih arti: cukup kalimat dengan arti berbeda untuk 1 jawaban + 2 pengecoh
    expect(new Set(l.exercises.map((e) => e.arti)).size).toBe(l.exercises.length);
  }
  expect(data.lessons.flatMap((l) => l.exercises).filter((e) => e.origin === 'claude')).toHaveLength(88);
});

test('lesson words reuse vocab.json ids so existing flashcard progress carries over', async ({ page }) => {
  const [lessons, vocab] = await Promise.all(
    ['content/hsk2/lessons.json', 'content/hsk2/vocab.json'].map(async (u) => (await page.request.get(u)).json()),
  );
  const ids = new Set(vocab.words.map((w) => w.id));
  const l1 = Object.fromEntries(lessons.lessons[0].vocab.map((v) => [v.hanzi, v.id]));
  expect(l1['旅游']).toBe('hsk2-lvyou');
  expect(ids.has(l1['旅游'])).toBe(true);
  expect(l1['花花']).toBe('l1-huahua'); // bukan kata HSK: id per pelajaran
  // 过 di pelajaran 7 = guò (melewati), bukan partikel guo di vocab.json -> id sendiri
  expect(lessons.lessons[6].vocab.find((v) => v.hanzi === '过').id).toBe('l7-guo');
});
