// Matematika: syllabus tayang di docs/ dan petunjuk saat salah memakai common_mistakes.
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => page.goto('index.html'));

async function withHints(page, fn) {
  return page.evaluate(
    `(async () => {
      const H = await import('./js/mathhints.js');
      const syl = await (await fetch('content/math/syllabus.json')).json();
      const ch = (id) => syl.chapters.find((c) => c.id === id);
      const ex = (id) => syl.chapters.flatMap((c) => c.examples).find((e) => e.id === id);
      return (${fn})(H, ch, ex);
    })()`,
  );
}

test('syllabus.json is served from docs/content/math (relative path)', async ({ page }) => {
  const res = await page.request.get('content/math/syllabus.json');
  expect(res.ok()).toBe(true);
  const s = await res.json();
  expect(s.chapters.map((c) => c.id)).toEqual(['6B-07', '6B-08', '6B-09', '6B-10']);
  expect(Object.keys(s.model_types)).toEqual(['bar', 'journey', 'tank', 'pie', 'none']);
});

test('answers from the keypad are parsed: whole, decimal, fraction, mixed number', async ({ page }) => {
  const r = await withHints(page, (H) => ['12', ' 2.50 ', '3/4', '1 1/2', '.5', '', 'abc', '1/0', '2..5'].map(H.parseAnswer));
  expect(r).toEqual([12, 2.5, 0.75, 1.5, 0.5, null, null, null, null]);
});

test('correct answers are accepted in any equivalent form', async ({ page }) => {
  const r = await withHints(page, (H, ch, ex) => [
    H.isCorrect(ex('7-6'), '2.5'),
    H.isCorrect(ex('7-6'), '2 1/2'),
    H.isCorrect(ex('7-6'), '5/2'),
    H.isCorrect(ex('7-2'), '12'),
    H.isCorrect(ex('7-2'), '12.5'),
  ]);
  expect(r).toEqual([true, true, true, true, false]);
});

test('first wrong answer: the trap answer gets its trap_note', async ({ page }) => {
  const r = await withHints(page, (H, ch, ex) => H.hintFor(ch('6B-07'), ex('7-3'), '45', 1));
  expect(r.kind).toBe('trap');
  expect(r.items).toEqual(['(60 + 30) / 2 = 45 adalah jawaban jebakan']);
});

test('first wrong answer otherwise shows the chapter common_mistakes', async ({ page }) => {
  const r = await withHints(page, (H, ch, ex) => ({
    speed: H.hintFor(ch('6B-07'), ex('7-2'), '20', 1),
    volume: H.hintFor(ch('6B-08'), ex('8-4'), '60', 1),
    expected: ch('6B-08').common_mistakes,
  }));
  expect(r.speed.kind).toBe('mistakes');
  expect(r.speed.items[0]).toContain('Lupa mengubah menit ke jam');
  expect(r.volume.items).toEqual(r.expected);
});

test('second wrong answer shows what is known; third reveals the answer kindly', async ({ page }) => {
  const r = await withHints(page, (H, ch, ex) => ({
    second: H.hintFor(ch('6B-08'), ex('8-5'), '60', 2),
    third: H.hintFor(ch('6B-08'), ex('8-5'), '60', 3),
    money: H.hintFor(ch('6B-09'), ex('9-2'), '100', 3).title,
    unreadable: H.hintFor(ch('6B-08'), ex('8-5'), '', 1).kind,
  }));
  expect(r.second).toEqual({ kind: 'known', title: expect.any(String), items: ['6 L = 6000 cm³', 'base 40 cm × 25 cm'] });
  expect(r.third.kind).toBe('reveal');
  expect(r.third.title).toContain('6 cm');
  expect(r.money).toContain('$1080');
  expect(r.unreadable).toBe('unreadable');
});

test('every chapter with examples has common_mistakes, so a hint always exists', async ({ page }) => {
  const r = await withHints(page, (H, ch, ex) => {
    return fetch('content/math/syllabus.json')
      .then((x) => x.json())
      .then((s) =>
        s.chapters
          .filter((c) => c.examples.length)
          .flatMap((c) => c.examples.map((e) => H.hintFor(c, e, '999999', 1).kind)),
      );
  });
  expect(r.length).toBe(15);
  expect(r.every((k) => k === 'mistakes' || k === 'trap')).toBe(true);
});
