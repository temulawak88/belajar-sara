// Utilitas pinyin: pecah kata menjadi suku kata, baca nada, ganti nada.
// Versi Python yang setara ada di tools/validate_vocab.py (harus tetap sejalan).

const MARKS = {
  ā: ['a', 1], á: ['a', 2], ǎ: ['a', 3], à: ['a', 4],
  ē: ['e', 1], é: ['e', 2], ě: ['e', 3], è: ['e', 4],
  ī: ['i', 1], í: ['i', 2], ǐ: ['i', 3], ì: ['i', 4],
  ō: ['o', 1], ó: ['o', 2], ǒ: ['o', 3], ò: ['o', 4],
  ū: ['u', 1], ú: ['u', 2], ǔ: ['u', 3], ù: ['u', 4],
  ǖ: ['ü', 1], ǘ: ['ü', 2], ǚ: ['ü', 3], ǜ: ['ü', 4],
  Ā: ['A', 1], Á: ['A', 2], Ǎ: ['A', 3], À: ['A', 4],
  Ē: ['E', 1], É: ['E', 2], Ě: ['E', 3], È: ['E', 4],
  Ō: ['O', 1], Ó: ['O', 2], Ǒ: ['O', 3], Ò: ['O', 4],
};
const WITH_MARK = {};
for (const [marked, [base, tone]] of Object.entries(MARKS)) WITH_MARK[base + tone] = marked;

const INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w', ''];
// Final (ü ditulis 'v'). Diurutkan dari yang terpanjang agar pencocokan rakus dicoba dulu.
const FINALS = [
  'iang', 'iong', 'uang', 'ueng', 'van',
  'ang', 'eng', 'ong', 'iao', 'ian', 'ing', 'uai', 'uan', 've', 'vn',
  'ai', 'ei', 'ao', 'ou', 'an', 'en', 'er', 'ia', 'ie', 'iu', 'in', 'ua', 'uo', 'ui', 'un', 'ue',
  'a', 'o', 'e', 'i', 'u', 'v',
].sort((a, b) => b.length - a.length);

/** Huruf dasar tanpa tanda nada, huruf kecil, ü -> v. Panjang string tetap sama. */
export function plain(s) {
  return [...s]
    .map((ch) => {
      const base = MARKS[ch] ? MARKS[ch][0] : ch;
      return base.toLowerCase().replace('ü', 'v');
    })
    .join('');
}

/**
 * Pecah pinyin satu kata menjadi `count` suku kata (count = jumlah hanzi).
 * Jumlah hanzi dipakai untuk memilih pemecahan yang benar (mis. "xian" vs "xi'an").
 * @returns {string[] | null} suku kata (ejaan asli, dengan tanda nada), atau null jika gagal
 */
export function segmentPinyin(pinyin, count) {
  const chars = [...pinyin];
  const p = plain(pinyin);
  const pc = [...p];

  function dfs(pos, left) {
    const start = pos;
    while (pos < pc.length && (pc[pos] === "'" || pc[pos] === ' ' || pc[pos] === '’' || pc[pos] === '-')) pos++;
    // Sesudah apostrof/spasi (atau di awal kata)?
    const separated = pos === 0 || pos > start;
    if (pos === pc.length) return left === 0 ? [] : null;
    if (left === 0) return null;
    const rest = pc.slice(pos).join('');
    // Erhua: "r" di akhir untuk 儿 (mis. yìdiǎnr).
    if (left === 1 && rest === 'r') return [[pos, pos + 1]];
    const lens = new Set();
    for (const ini of INITIALS) {
      if (!rest.startsWith(ini)) continue;
      // Tanpa konsonan awal hanya final yang dimulai a/o/e (an, ou, er, ...): suku kata i/u/ü
      // ditulis dengan y/w (yan, wan), jadi "ian"/"uan" tidak pernah berdiri sendiri.
      // Di tengah kata pun wajib didahului apostrof. Ini mencegah "hǎo" -> "hǎ"+"o" dan "qùnián" -> "qùn"+"ián".
      if (ini === '' && (!'aoe'.includes(rest[0]) || !separated)) continue;
      for (const fin of FINALS) if (rest.startsWith(fin, ini.length)) lens.add(ini.length + fin.length);
    }
    for (const len of [...lens].sort((a, b) => b - a)) {
      const tail = dfs(pos + len, left - 1);
      if (tail) return [[pos, pos + len], ...tail];
    }
    return null;
  }

  const spans = dfs(0, count);
  return spans ? spans.map(([a, b]) => chars.slice(a, b).join('')) : null;
}

/** Nada suku kata: 1–4, atau 0 untuk nada netral (tanpa tanda). */
export function toneOf(syllable) {
  for (const ch of syllable) if (MARKS[ch]) return MARKS[ch][1];
  return 0;
}

/** Suku kata yang sama dengan nada lain (0 = tanpa tanda). Posisi tanda mengikuti aturan baku. */
export function withTone(syllable, tone) {
  const chars = [...syllable];
  // Hapus tanda lama.
  const bare = chars.map((ch) => (MARKS[ch] ? MARKS[ch][0] : ch));
  if (!tone) return bare.join('');
  const low = bare.map((c) => c.toLowerCase());
  let idx = low.findIndex((c) => c === 'a' || c === 'e');
  if (idx < 0) idx = low.join('').indexOf('ou');
  if (idx < 0) {
    for (let i = low.length - 1; i >= 0; i--) {
      if ('iouü'.includes(low[i])) {
        idx = i;
        break;
      }
    }
  }
  if (idx < 0) return bare.join('');
  const marked = WITH_MARK[bare[idx] + tone];
  if (!marked) return bare.join('');
  bare[idx] = marked;
  return bare.join('');
}
