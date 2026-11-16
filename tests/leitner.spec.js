// Tes unit logika Leitner, dijalankan di dalam browser (modul ES yang sama dengan app).
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('index.html');
});

async function run(page, fn) {
  return page.evaluate(`(async () => { const L = await import('./js/leitner.js'); return (${fn})(L); })()`);
}

test('intervals: 1, 2, 4, 8, 16 days; correct moves up, max box 5', async ({ page }) => {
  const r = await run(page, (L) => {
    let p = {};
    const out = [];
    let day = '2026-11-16';
    for (let i = 0; i < 6; i++) {
      p = L.grade(p, 'a', true, day);
      out.push([p.a.box, p.a.due]);
      day = p.a.due;
    }
    return out;
  });
  expect(r).toEqual([
    [2, '2026-11-18'],
    [3, '2026-11-22'],
    [4, '2026-11-30'],
    [5, '2026-12-16'],
    [5, '2027-01-01'],
    [5, '2027-01-17'],
  ]);
});

test('wrong answer sends a card back to box 1, due tomorrow; counts right/wrong', async ({ page }) => {
  const r = await run(page, (L) => {
    let p = {};
    p = L.grade(p, 'a', true, '2026-11-16');
    p = L.grade(p, 'a', true, '2026-11-18');
    p = L.grade(p, 'a', false, '2026-11-22');
    return p.a;
  });
  expect(r).toEqual({ box: 1, due: '2026-11-23', right: 2, wrong: 1, first: '2026-11-16', last: '2026-11-22' });
});

test('grade does not mutate the input object', async ({ page }) => {
  const r = await run(page, (L) => {
    const p = {};
    L.grade(p, 'a', true, '2026-11-16');
    return Object.keys(p).length;
  });
  expect(r).toBe(0);
});

test('session: due cards first (lowest box first), then new cards within daily quota', async ({ page }) => {
  const r = await run(page, (L) => {
    const words = Array.from({ length: 20 }, (_, i) => ({ id: `w${i}` }));
    const today = '2026-11-20';
    const progress = {
      w3: { box: 3, due: '2026-11-19', first: '2026-11-01' },
      w1: { box: 1, due: '2026-11-20', first: '2026-11-01' },
      w2: { box: 2, due: '2026-11-25', first: '2026-11-01' }, // belum jatuh tempo
      w5: { box: 1, due: '2026-11-18', first: '2026-11-01' },
      w9: { box: 2, due: '2026-11-21', first: today }, // kata baru hari ini (kuota terpakai 1)
    };
    return {
      queue: L.buildSession(words, progress, today),
      counts: L.boxCounts(words, progress),
      due: L.dueCount(words, progress, today),
    };
  });
  expect(r.queue).toEqual(['w5', 'w1', 'w3', 'w0', 'w4', 'w6', 'w7']); // 3 ulangan + 4 baru (5 - 1)
  expect(r.counts).toEqual([15, 2, 2, 1, 0, 0]);
  expect(r.due).toBe(3);
});

test('session size is capped so sessions stay short', async ({ page }) => {
  const r = await run(page, (L) => {
    const words = Array.from({ length: 40 }, (_, i) => ({ id: `w${i}` }));
    const progress = Object.fromEntries(words.map((w) => [w.id, { box: 1, due: '2026-01-01', first: '2026-01-01' }]));
    return L.buildSession(words, progress, '2026-11-16').length;
  });
  expect(r).toBe(12);
});

test('addDays crosses month/year boundaries', async ({ page }) => {
  const r = await run(page, (L) => [L.addDays('2026-12-30', 4), L.addDays('2028-02-28', 1), L.addDays('2026-03-28', 2)]);
  expect(r).toEqual(['2027-01-03', '2028-02-29', '2026-03-30']);
});
