// Logika latihan menulis (murni, tanpa DOM/storage) supaya mudah dites.

export const CHARS_PER_SESSION = 3;
export const STEPS = ['watch', 'trace', 'write'];

/**
 * Pilih karakter untuk sesi hari ini.
 * - Sumber: kata yang sudah mulai dipelajari di flashcard (urutan kosakata);
 *   jika belum ada sama sekali, pakai urutan kosakata dari awal.
 * - Karakter yang sudah ditulis hari ini dilewati.
 * - Yang paling jarang ditulis (lalu yang paling lama tidak ditulis) didahulukan.
 * @returns {{char: string, word: object}[]}
 */
export function pickCharacters(words, leitner, writing, today, n = CHARS_PER_SESSION) {
  const started = words.filter((w) => leitner[w.id]);
  const source = started.length ? started : words;
  const seen = new Map();
  for (const w of source) for (const c of w.hanzi) if (!seen.has(c)) seen.set(c, w);
  const items = [...seen].map(([char, word], order) => ({ char, word, order, rec: writing[char] }));
  return items
    .filter((it) => !it.rec || it.rec.last !== today)
    .sort((a, b) => {
      const wa = a.rec?.write || 0;
      const wb = b.rec?.write || 0;
      if (wa !== wb) return wa - wb;
      const la = a.rec?.last || '';
      const lb = b.rec?.last || '';
      return la.localeCompare(lb) || a.order - b.order;
    })
    .slice(0, n)
    .map(({ char, word }) => ({ char, word }));
}

/**
 * Catat satu langkah yang selesai ('trace' atau 'write'). Mengembalikan objek BARU.
 * Untuk 'write', `mistakes` = jumlah goresan salah saat menulis dari ingatan.
 */
export function recordStep(writing, char, step, mistakes, today) {
  const prev = writing[char] || { trace: 0, write: 0, lastMistakes: null, best: null, last: null };
  const next = { ...prev, last: today };
  if (step === 'trace') next.trace = prev.trace + 1;
  if (step === 'write') {
    next.write = prev.write + 1;
    next.lastMistakes = mistakes;
    next.best = prev.best == null ? mistakes : Math.min(prev.best, mistakes);
  }
  return { ...writing, [char]: next };
}
