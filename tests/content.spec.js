// Kosakata HSK lengkap (iterasi 4): jumlah, id lama tetap, karakter berbacaan ganda tidak masuk latihan nada.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const vocab = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'hsk2', 'vocab.json'), 'utf8'));
const chars = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'vendor', 'hanzi-writer-data', 'chars.json'), 'utf8'));

// id dari iterasi 1: progres flashcard tersimpan memakai id ini, jadi tidak boleh berubah.
const OLD_IDS = {
  'hsk1-ni': '你', 'hsk1-hao': '好', 'hsk1-xiexie': '谢谢', 'hsk1-zaijian': '再见', 'hsk1-baba': '爸爸',
  'hsk1-mama': '妈妈', 'hsk1-pengyou': '朋友', 'hsk1-laoshi': '老师', 'hsk1-xuesheng': '学生', 'hsk1-mao': '猫',
  'hsk1-gou': '狗', 'hsk1-shui': '水', 'hsk1-mifan': '米饭', 'hsk1-pingguo': '苹果', 'hsk1-chi': '吃',
  'hsk1-he': '喝', 'hsk1-xihuan': '喜欢', 'hsk1-da': '大', 'hsk1-xiao': '小', 'hsk1-zhongguo': '中国',
};

test('vocabulary covers HSK 1 and HSK 2 (300 words, sentence patterns split)', () => {
  const w = vocab.words;
  expect(w.filter((x) => x.hsk === 1)).toHaveLength(152); // 150 + 这儿/那儿 (sub-entri resmi 这/那)
  expect(w.filter((x) => x.hsk === 2)).toHaveLength(151); // 149 + 因为/所以/虽然/但是 sebagai kartu sendiri
  expect(new Set(w.map((x) => x.id)).size).toBe(w.length);
  expect(new Set(w.map((x) => x.hanzi)).size).toBe(w.length);
  // HSK 1 dulu, baru HSK 2 (urutan kartu baru di flashcard).
  const firstL2 = w.findIndex((x) => x.hsk === 2);
  expect(w.slice(firstL2).every((x) => x.hsk === 2)).toBe(true);
});

test('the 20 words from iteration 1 keep their ids and come first', () => {
  const first = vocab.words.slice(0, 20);
  expect(Object.fromEntries(first.map((x) => [x.id, x.hanzi]))).toEqual(OLD_IDS);
});

test('the docs/ copy is identical and every character has stroke data', () => {
  const copy = fs.readFileSync(path.join(ROOT, 'docs', 'content', 'hsk2', 'vocab.json'), 'utf8');
  expect(copy).toBe(fs.readFileSync(path.join(ROOT, 'content', 'hsk2', 'vocab.json'), 'utf8'));
  const missing = [...new Set(vocab.words.flatMap((x) => [...x.hanzi]))].filter((c) => !chars[c]);
  expect(missing).toEqual([]);
});

test('characters with more than one reading are never used in tone practice', async ({ page }) => {
  await page.goto('index.html');
  const r = await page.evaluate(async () => {
    const T = await import('./js/tones.js');
    const { words } = await (await fetch('content/hsk2/vocab.json')).json();
    const skip = new Set(words.flatMap((w) => w.no_tone || []));
    const items = T.toneItems(words);
    // Semua kata dianggap sudah dipelajari -> pemilihan soal juga harus melewati karakter itu.
    const leitner = Object.fromEntries(words.map((w) => [w.id, {}]));
    const picked = T.pickToneQuestions(words, leitner, {}, 1000);
    return {
      skip: [...skip].sort(),
      leaked: items.filter((i) => skip.has(i.char)).map((i) => i.char),
      pickedLeaked: picked.filter((i) => skip.has(i.char)).map((i) => i.char),
      count: items.length,
      neutral: items.filter((i) => i.tone === 0).length,
      yi: items.find((i) => i.char === '一')?.syllable,
      bu: items.find((i) => i.char === '不')?.syllable,
    };
  });
  expect(r.skip).toEqual(['乐', '便', '为', '什', '喂', '场', '教', '漂', '觉', '谁', '还', '都', '长'].sort());
  expect(r.leaked).toEqual([]);
  expect(r.pickedLeaked).toEqual([]);
  expect(r.neutral).toBe(0);
  expect(r.count).toBeGreaterThan(250);
  expect([r.yi, r.bu]).toEqual(['yī', 'bù']);
});

test('flashcards: a fresh start still introduces the first 5 words in order', async ({ page }) => {
  await page.goto('hanzi.html');
  await expect(page.locator('#start-note')).toContainText('5 new (303 words not started yet)');
  await page.locator('#start-btn').tap();
  await expect(page.locator('#card-hanzi')).toHaveText('你');
});
