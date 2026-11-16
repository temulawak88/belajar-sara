// Petunjuk ketika jawaban soal cerita salah (CLAUDE.md: salah = ramah, petunjuk + coba lagi).
// Sumber: docs/content/math/syllabus.json — `common_mistakes` per bab dan `trap_answer`/`trap_note` per contoh.
// Modul murni (tanpa DOM) supaya mudah dites; dipakai layar soal cerita (math.html).
//
// Urutan petunjuk per soal:
//   salah ke-1: jika jawabannya = jawaban jebakan -> trap_note (paling tepat sasaran);
//               selain itu -> daftar common_mistakes bab ini ("Cek lagi:")
//   salah ke-2: apa yang diketahui (known) -> bantu anak menyusun ulang langkahnya
//   salah ke-3: jawaban benar ditunjukkan, tanpa efek menghukum

const TOLERANCE = 1e-6;

export function sameNumber(a, b) {
  return Math.abs(a - b) <= TOLERANCE * Math.max(1, Math.abs(b));
}

/**
 * Ubah jawaban dari keypad menjadi angka. Menerima "12", "2.5", " 2.50 ", "3/4", "1 1/2" (pecahan campuran).
 * @returns {number|null} null jika tidak bisa dibaca
 */
export function parseAnswer(text) {
  const s = String(text).trim().replace(/\s+/g, ' ');
  if (!s) return null;
  let m = s.match(/^(-?\d+) (\d+)\/(\d+)$/);
  if (m) return Number(m[3]) === 0 ? null : Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = s.match(/^(-?\d+)\/(\d+)$/);
  if (m) return Number(m[2]) === 0 ? null : Number(m[1]) / Number(m[2]);
  return /^-?\d+(\.\d+)?$|^-?\.\d+$/.test(s) ? Number(s) : null;
}

export function isCorrect(example, text) {
  const v = parseAnswer(text);
  return v !== null && sameNumber(v, example.answer);
}

/**
 * Petunjuk untuk percobaan yang salah.
 * @param {object} chapter  bab dari syllabus (punya common_mistakes)
 * @param {object} example  contoh soal (answer, unit, known, trap_answer?, trap_note?)
 * @param {string} text     jawaban anak (teks dari keypad)
 * @param {number} attempt  percobaan ke berapa yang salah (1, 2, 3, ...)
 * @returns {{kind: 'unreadable'|'trap'|'mistakes'|'known'|'reveal', title: string, items: string[]}}
 */
export function hintFor(chapter, example, text, attempt) {
  const value = parseAnswer(text);
  if (value === null) {
    return { kind: 'unreadable', title: "I can't read that number. Try again. (Angkanya belum terbaca.)", items: [] };
  }
  if (attempt <= 1) {
    if (typeof example.trap_answer === 'number' && sameNumber(value, example.trap_answer) && example.trap_note) {
      return { kind: 'trap', title: 'Careful — this is a common trap! (Hati-hati, ini jebakan.)', items: [example.trap_note] };
    }
    const mistakes = Array.isArray(chapter.common_mistakes) ? chapter.common_mistakes : [];
    if (mistakes.length) {
      return { kind: 'mistakes', title: 'Not yet. Check these: (Cek lagi:)', items: mistakes };
    }
  }
  if (attempt <= 2) {
    return { kind: 'known', title: 'Look at what we know: (Yang diketahui:)', items: example.known || [] };
  }
  const unit = example.unit === '$' ? '' : ` ${example.unit}`;
  const amount = example.unit === '$' ? `$${example.answer}` : `${example.answer}${unit}`;
  return { kind: 'reveal', title: `The answer is ${amount}. Let's try another one! (Tidak apa-apa!)`, items: [] };
}
