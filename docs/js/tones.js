// Logika latihan nada (murni, tanpa DOM/storage) supaya mudah dites.
//
// Satu soal = satu karakter yang DIUCAPKAN SENDIRIAN, lalu anak memilih nada 1–4.
// - Suku kata bernada netral dilewati (mis. 谢谢 xièxie -> hanya 谢 xiè yang dipakai).
// - 一 dan 不 memakai nada aslinya: dalam kata seperti 一起 (yìqǐ) nadanya berubah (sandhi),
//   tetapi diucapkan sendirian bunyinya yī / bù.
// - Sandhi nada 3 (你好 diucapkan ní hǎo) tidak berpengaruh karena karakter diucapkan sendirian.
// - Karakter berbacaan ganda yang ditandai `no_tone` di kosakata dilewati.

import { segmentPinyin, toneOf, withTone } from './pinyin.js';

export const QUESTIONS_PER_SESSION = 10;
const CITATION = { 一: 'yī', 不: 'bù' };

/** Semua soal yang mungkin dari daftar kata: satu per karakter (karakter pertama yang ditemukan menang). */
export function toneItems(words, allWords = words) {
  // Karakter berbacaan ganda (mis. 觉 jiào/jué, 还 hái/huán) ditandai `no_tone` di kosakata:
  // diucapkan sendirian, suara iPad bisa memilih bacaan yang lain -> jangan dipakai di latihan nada.
  const skip = new Set(allWords.flatMap((w) => w.no_tone || []));
  const items = new Map();
  for (const w of words) {
    const syls = segmentPinyin(w.pinyin, [...w.hanzi].length);
    if (!syls) continue;
    [...w.hanzi].forEach((char, i) => {
      if (items.has(char) || skip.has(char)) return;
      const syllable = CITATION[char] || syls[i];
      const tone = toneOf(syllable);
      if (tone === 0) return;
      items.set(char, { char, syllable, tone, word: w });
    });
  }
  return [...items.values()];
}

/**
 * Pilih soal sesi ini: dari kata yang sudah mulai dipelajari di flashcard (atau awal daftar
 * jika belum ada). Yang paling sering salah didahulukan, lalu yang belum pernah muncul.
 * Urutan akhir diacak agar nada tidak bisa ditebak dari urutan.
 */
export function pickToneQuestions(words, leitner, tones, n = QUESTIONS_PER_SESSION, rng = Math.random) {
  const started = words.filter((w) => leitner[w.id]);
  // Jika kata yang sudah dipelajari tidak menghasilkan soal sama sekali (mis. hanya partikel
  // bernada netral), pakai awal daftar supaya latihan tidak buntu.
  let all = toneItems(started, words);
  if (!all.length) all = toneItems(words);
  // Skor = proporsi benar. Yang belum pernah muncul diberi 0,5: sesudah yang sering salah,
  // sebelum yang sudah dikuasai.
  const score = (it) => {
    const r = tones[it.char];
    if (!r || !r.seen) return [0.5, 0];
    return [r.right / r.seen, r.seen];
  };
  const chosen = all
    .map((it, order) => ({ it, order, s: score(it) }))
    .sort((a, b) => a.s[0] - b.s[0] || a.s[1] - b.s[1] || a.order - b.order)
    .slice(0, n)
    .map((x) => x.it);
  // Fisher–Yates
  for (let i = chosen.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
  }
  return chosen;
}

/** Empat pilihan jawaban: suku kata yang sama dengan nada 1, 2, 3, 4. */
export function toneOptions(syllable) {
  return [1, 2, 3, 4].map((t) => ({ tone: t, label: withTone(syllable, t) }));
}

/** Catat jawaban PERTAMA untuk satu soal. Mengembalikan objek BARU. */
export function recordTone(tones, char, correct, today) {
  const prev = tones[char] || { seen: 0, right: 0, last: null };
  return { ...tones, [char]: { seen: prev.seen + 1, right: prev.right + (correct ? 1 : 0), last: today } };
}
