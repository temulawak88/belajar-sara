// Latihan nada: pemecahan pinyin, pemilihan soal, alur dengar -> pilih nada, umpan balik ramah.
const { test, expect } = require('@playwright/test');

const KEY = 'belajar-sarah:progress';
const TONE_OF = { 千: 1, 送: 4, 真: 1 }; // pelajaran 3

/** Web Speech tiruan: punya suara zh-CN (atau tidak), mencatat setiap ucapan ke window.__spoken. */
async function mockSpeech(page, { withVoice = true } = {}) {
  await page.addInitScript((withVoice) => {
    const voices = withVoice ? [{ lang: 'zh-CN', name: 'Tingting', localService: true }] : [];
    const listeners = [];
    window.__spoken = [];
    class Utterance {
      constructor(text) {
        this.text = text;
      }
    }
    const synth = {
      getVoices: () => voices,
      speak: (u) => window.__spoken.push({ text: u.text, lang: u.lang, voice: u.voice?.name }),
      cancel: () => {},
      addEventListener: (type, fn) => type === 'voiceschanged' && listeners.push(fn),
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utterance, configurable: true });
  }, withVoice);
}

async function seed(page, ids, extra = {}) {
  await page.goto('index.html');
  await page.evaluate(
    ([k, ids, extra]) => {
      const leitner = Object.fromEntries(ids.map((id) => [id, { box: 2, due: '2099-01-01', right: 1, wrong: 0, first: '2026-01-01' }]));
      localStorage.setItem(k, JSON.stringify({ schemaVersion: 3, nickname: '', leitner, writing: {}, tones: {}, ...extra }));
    },
    [KEY, ids, extra],
  );
}

const spoken = (page) => page.evaluate(() => window.__spoken);
const readProgress = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => {
    throw e;
  });
});

test('lesson menu links to tone practice; start screen explains the 4 tones', async ({ page }) => {
  await mockSpeech(page);
  await page.goto('lesson.html?n=3');
  await page.locator('#ex-tone').tap();
  await expect(page).toHaveURL(/\/docs\/tone\.html\?n=3$/);
  await expect(page.locator('#page-title')).toHaveText('Tone · Lesson 3');
  await expect(page.locator('#tone-guide li')).toHaveCount(4);
  await expect(page.locator('#tone-guide')).toContainText('dips down, then up');
  await expect(page.locator('#start-btn')).toBeEnabled();
});

test('full session: right answer, wrong-then-reveal, saved after every answer', async ({ page }) => {
  await mockSpeech(page);
  await seed(page, ['hsk2-qian', 'hsk2-song', 'hsk2-zhen']);
  await page.goto('tone.html?n=3');
  await expect(page.locator('#start-note')).toHaveText('Today: 3 sounds');
  await page.locator('#start-btn').tap();

  const results = {};
  for (let i = 0; i < 3; i++) {
    await expect(page.locator('#counter')).toHaveText(`${i + 1} / 3`);
    const char = await page.locator('#q-hanzi').textContent();
    const tone = TONE_OF[char];
    // Karakter diucapkan otomatis (dari tap), sendirian, dengan suara zh-CN.
    let s = await spoken(page);
    expect(s.at(-1)).toEqual({ text: char, lang: 'zh-CN', voice: 'Tingting' });
    const before = s.length;

    if (i === 1) {
      // Salah dua kali: petunjuk + diputar lagi, lalu jawaban ditunjukkan.
      const wrong = [1, 2, 3, 4].filter((t) => t !== tone);
      await page.locator(`#options [data-tone="${wrong[0]}"]`).tap();
      await expect(page.locator('#feedback')).toContainText('Not quite');
      await expect(page.locator(`#options [data-tone="${wrong[0]}"]`)).toBeDisabled();
      s = await spoken(page);
      expect(s.length).toBe(before + 1);
      let p = await readProgress(page);
      expect(p.tones[char]).toMatchObject({ seen: 1, right: 0 }); // tersimpan setelah jawaban pertama
      await page.locator(`#options [data-tone="${wrong[1]}"]`).tap();
      await expect(page.locator('#feedback')).toContainText("We'll practise it again");
      await expect(page.locator(`#options [data-tone="${tone}"]`)).toHaveClass(/right/);
      p = await readProgress(page);
      expect(p.tones[char]).toMatchObject({ seen: 1, right: 0 }); // jawaban kedua tidak dinilai ulang
      results[char] = false;
    } else {
      await page.locator(`#options [data-tone="${tone}"]`).tap();
      await expect(page.locator('#feedback')).toContainText('Yes!');
      const p = await readProgress(page);
      expect(p.tones[char]).toMatchObject({ seen: 1, right: 1 });
      results[char] = true;
    }
    // Setelah dijawab, pilihan terkunci dan tombol Next muncul.
    await expect(page.locator('#options .tone-btn').first()).toBeDisabled();
    await page.locator('#listen-btn').tap();
    expect((await spoken(page)).at(-1).text).toBe(char);
    await page.locator('#next-btn').tap();
  }

  await expect(page.locator('#screen-done')).toBeVisible();
  await expect(page.locator('#done-summary')).toHaveText('You got 2 of 3 right on the first try.');

  // Reload: progres tetap. Karakter yang salah didahulukan di sesi berikutnya (urutan diacak, jadi cek isinya saja).
  await page.reload();
  const p = await readProgress(page);
  expect(Object.keys(p.tones).sort()).toEqual(['千', '真', '送']);
  const wrongChar = Object.keys(results).find((c) => !results[c]);
  expect(p.tones[wrongChar].right).toBe(0);
});

test('answer options show the same syllable with the 4 tone marks', async ({ page }) => {
  await mockSpeech(page);
  await seed(page, ['hsk2-song']);
  await page.goto('tone.html?n=3');
  await page.locator('#start-btn').tap();
  await expect(page.locator('#q-hanzi')).toHaveText('送');
  await expect(page.locator('#options .tone-label')).toHaveText(['sōng', 'sóng', 'sǒng', 'sòng']);
});

test('one question says "1 sound"; header fits on an iPhone-sized screen', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 }); // iPhone 15
  await mockSpeech(page);
  await seed(page, ['hsk2-qian']);
  await page.goto('tone.html?n=3');
  await expect(page.locator('#start-note')).toHaveText('Today: 1 sound');
  await page.locator('#start-btn').tap();
  await expect(page.locator('#counter')).toHaveText('1 / 1');
  expect((await page.locator('#counter').boundingBox()).height).toBeLessThan(40);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
});

test('without a Chinese voice the practice explains why and Start is disabled (no dead end)', async ({ page }) => {
  await mockSpeech(page, { withVoice: false });
  await page.goto('tone.html?n=3');
  await expect(page.locator('#voice-note')).toBeVisible();
  await expect(page.locator('#voice-note')).toContainText('needs a Chinese voice');
  await expect(page.locator('#start-btn')).toBeDisabled();
  await expect(page.locator('#back-btn')).toBeVisible();
  await expect(page.locator('#home-btn')).toBeVisible();
});

test('schema v2 progress (iteration 2) is migrated to v3', async ({ page }) => {
  await mockSpeech(page);
  await page.goto('index.html');
  await page.evaluate((k) => {
    localStorage.setItem(
      k,
      JSON.stringify({ schemaVersion: 2, nickname: '', leitner: { 'hsk2-song': { box: 3, due: '2099-01-01', first: '2026-01-01' } }, writing: { 大: { trace: 1, write: 1, last: '2026-11-01' } } }),
    );
  }, KEY);
  await page.goto('tone.html?n=3');
  await page.locator('#start-btn').tap();
  await page.locator('#options [data-tone="4"]').tap();
  const p = await readProgress(page);
  expect(p.schemaVersion).toBe(4);
  expect(p.leitner['hsk2-song'].box).toBe(3);
  expect(p.writing['大'].write).toBe(1);
  expect(p.tones['送']).toMatchObject({ seen: 1, right: 1 });
});

test.describe('pinyin.js and tones.js logic', () => {
  test.beforeEach(async ({ page }) => page.goto('index.html'));

  test('segmentPinyin uses the number of hanzi to split syllables', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const P = await import('./js/pinyin.js');
      const cases = [
        ['péngyou', 2], ['Zhōngguó', 2], ['xièxie', 2], ["xi'an", 2], ['xian', 1], ['yìdiǎnr', 3],
        ["nǚ'ér", 2], ['lǜsè', 2], ['shénme', 2], ['zhǔnbèi', 2], ['tiānqì', 2], ['hǎo', 2], ['xian', 2],
        ['qùnián', 2], ['bīnguǎn', 2], ["Tiān'ānmén", 3], ['yīfu', 2], ['wǎnshang', 2], ['ǎi', 1],
      ];
      return cases.map(([p, n]) => P.segmentPinyin(p, n));
    });
    expect(r).toEqual([
      ['péng', 'you'], ['Zhōng', 'guó'], ['xiè', 'xie'], ['xi', 'an'], ['xian'], ['yì', 'diǎn', 'r'],
      ['nǚ', 'ér'], ['lǜ', 'sè'], ['shén', 'me'], ['zhǔn', 'bèi'], ['tiān', 'qì'],
      null, // "hǎ" + "o" tidak sah: o di tengah kata wajib didahului apostrof
      null, // xi + an juga wajib pakai apostrof (xi'an)
      ['qù', 'nián'], ['bīn', 'guǎn'], // bukan "qùn"+"ián" / "bīng"+"uǎn": i/u tidak berdiri sendiri
      ['Tiān', 'ān', 'mén'], ['yī', 'fu'], ['wǎn', 'shang'], ['ǎi'],
    ]);
  });

  test('every word in the vocabulary splits into one syllable per hanzi', async ({ page }) => {
    const bad = await page.evaluate(async () => {
      const P = await import('./js/pinyin.js');
      const { words } = await (await fetch('content/hsk2/vocab.json')).json();
      return words.filter((w) => P.segmentPinyin(w.pinyin, [...w.hanzi].length) === null).map((w) => w.hanzi);
    });
    expect(bad).toEqual([]);
  });

  test('toneOf and withTone follow the standard tone-mark rules', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const P = await import('./js/pinyin.js');
      return {
        tones: ['mā', 'má', 'mǎ', 'mà', 'ma', 'lǜ', 'Ōu'].map(P.toneOf),
        marks: ['hǎo', 'shuǐ', 'liù', 'yǒu', 'lǜ', 'xué', 'Zhōng'].map((s) => [1, 2, 3, 4].map((t) => P.withTone(s, t)).join('/')),
        bare: P.withTone('xiè', 0),
      };
    });
    expect(r.tones).toEqual([1, 2, 3, 4, 0, 4, 1]);
    expect(r.marks).toEqual([
      'hāo/háo/hǎo/hào', 'shuī/shuí/shuǐ/shuì', 'liū/liú/liǔ/liù', 'yōu/yóu/yǒu/yòu',
      'lǖ/lǘ/lǚ/lǜ', 'xuē/xué/xuě/xuè', 'Zhōng/Zhóng/Zhǒng/Zhòng',
    ]);
    expect(r.bare).toBe('xie');
  });

  test('toneItems skips neutral tones and uses citation tones for 一 and 不', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const T = await import('./js/tones.js');
      const words = [
        { id: 'a', hanzi: '谢谢', pinyin: 'xièxie' },
        { id: 'b', hanzi: '朋友', pinyin: 'péngyou' },
        { id: 'c', hanzi: '一起', pinyin: 'yìqǐ' },
        { id: 'd', hanzi: '不客气', pinyin: 'búkèqi' },
        { id: 'e', hanzi: '你好', pinyin: 'nǐhǎo' },
      ];
      return T.toneItems(words).map((i) => `${i.char}${i.syllable}${i.tone}`);
    });
    expect(r).toEqual(['谢xiè4', '朋péng2', '一yī1', '起qǐ3', '不bù4', '客kè4', '你nǐ3', '好hǎo3']);
  });

  test('pickToneQuestions: started words only, weakest first, capped, shuffled', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const T = await import('./js/tones.js');
      const { words } = await (await fetch('content/hsk2/vocab.json')).json();
      const leitner = { 'hsk1-ni': {}, 'hsk1-hao': {}, 'hsk1-da': {}, 'hsk1-xiao': {} };
      const tones = {
        你: { seen: 4, right: 4 }, // sudah dikuasai
        好: { seen: 2, right: 0 }, // paling lemah
        大: { seen: 1, right: 1 },
      };
      const noShuffle = () => 0.999999; // Fisher–Yates dengan j = i -> urutan tetap
      return {
        top2: T.pickToneQuestions(words, leitner, tones, 2, noShuffle).map((q) => q.char),
        all: T.pickToneQuestions(words, leitner, tones, 10, noShuffle).map((q) => q.char),
        fallback: T.pickToneQuestions(words, {}, {}, 10).length,
      };
    });
    expect(r.top2).toEqual(['好', '小']); // 0/2 benar dulu, lalu yang belum pernah muncul
    expect(r.all).toEqual(['好', '小', '大', '你']);
    expect(r.fallback).toBe(10);
  });

  test('pickToneQuestions falls back to the word list when started words give no questions', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const T = await import('./js/tones.js');
      const words = [
        { id: 'a', hanzi: '谢谢', pinyin: 'xièxie' },
        { id: 'p', hanzi: '吗', pinyin: 'ma' }, // hanya nada netral
        { id: 'b', hanzi: '大', pinyin: 'dà' },
      ];
      return T.pickToneQuestions(words, { p: {} }, {}, 10, () => 0.999999).map((q) => q.char);
    });
    expect(r).toEqual(['谢', '大']);
  });

  test('recordTone counts first answers only', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const T = await import('./js/tones.js');
      let t = {};
      t = T.recordTone(t, '好', false, '2026-11-16');
      t = T.recordTone(t, '好', true, '2026-11-17');
      return t['好'];
    });
    expect(r).toEqual({ seen: 2, right: 1, last: '2026-11-17' });
  });
});
