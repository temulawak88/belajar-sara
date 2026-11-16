// Pelajaran Mandarin (HSK Standard Course 2): pemuat data + logika murni (tanpa DOM/storage).
// Sumber resmi: docs/content/hsk2/lessons.json (lihat CLAUDE.md › Mandarin).

export const LESSONS_URL = 'content/hsk2/lessons.json'; // relatif: jalan di sub-path GitHub Pages
export const VOCAB_URL = 'content/hsk2/vocab.json';
export const SENTENCES_PER_SESSION = 6; // sesi pendek
export const BLANK = '___';

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Load failed: ${url} ${res.status}`);
  return res.json();
}

export const loadLessons = () => getJSON(LESSONS_URL);
export const loadVocab = () => getJSON(VOCAB_URL);

/** Nomor pelajaran dari "?n=3"; null jika tidak valid. */
export function lessonNumberFromUrl(search) {
  const n = Number(new URLSearchParams(search).get('n'));
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function findLesson(data, n) {
  return data.lessons.find((l) => l.number === n) || null;
}

/** Pelajaran yang sedang dipelajari (status "current") di atas; sisanya urut nomor. */
export function sortLessons(lessons) {
  return [...lessons].sort((a, b) => (b.status === 'current') - (a.status === 'current') || a.number - b.number);
}

/**
 * Kata pelajaran sebagai kartu: kata inti dulu, kata tambahan (supplementary, bertanda * di buku) di akhir.
 * Arti Inggris diambil dari vocab.json bila katanya sama (id sama).
 */
export function cardWords(lesson, vocabWords = []) {
  const en = new Map(vocabWords.map((w) => [w.id, w.meaning_en]));
  const cards = lesson.vocab.map((v) => ({
    id: v.id,
    hanzi: v.hanzi,
    pinyin: v.pinyin,
    meaning_id: v.arti,
    meaning_en: en.get(v.id) || '',
    supplementary: v.supplementary === true,
  }));
  return [...cards.filter((c) => !c.supplementary), ...cards.filter((c) => c.supplementary)];
}

/** Kalimat utuh sebuah latihan (bagian kosong diisi jawabannya). */
export function fullSentence(ex) {
  return ex.type === 'fill' ? ex.sentence.replace(BLANK, ex.answer) : ex.answer;
}

/** Semua kalimat pelajaran, untuk dengar → pilih arti. */
export function lessonSentences(lesson) {
  return lesson.exercises.map((ex) => ({ id: ex.id, text: fullSentence(ex), pinyin: ex.pinyin, arti: ex.arti }));
}

export function shuffle(items, rng = Math.random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Pilih soal untuk satu sesi: yang paling sering salah dulu, lalu yang belum pernah, lalu yang
 * paling lama tidak dilatih. Urutan akhir diacak.
 * @param {{id:string}[]} items
 * @param {object} records  state.sentences
 * @param {'fill'|'order'|'listen'} kind
 */
export function pickExercises(items, records, kind, n = SENTENCES_PER_SESSION, rng = Math.random) {
  const score = (it) => {
    const r = records[it.id]?.[kind];
    if (!r || !r.seen) return [0.5, ''];
    return [r.right / r.seen, r.last || ''];
  };
  const chosen = items
    .map((it, order) => ({ it, order, s: score(it) }))
    .sort((a, b) => a.s[0] - b.s[0] || a.s[1].localeCompare(b.s[1]) || a.order - b.order)
    .slice(0, n)
    .map((x) => x.it);
  return shuffle(chosen, rng);
}

/** Tiga pilihan arti: yang benar + 2 arti kalimat lain di pelajaran yang sama, diacak. */
export function listenOptions(lesson, sentence, rng = Math.random) {
  const others = shuffle(
    lessonSentences(lesson).filter((s) => s.id !== sentence.id && s.arti !== sentence.arti),
    rng,
  ).slice(0, 2);
  return shuffle([sentence, ...others], rng).map((s) => ({ id: s.id, arti: s.arti, correct: s.id === sentence.id }));
}

/** Catat jawaban PERTAMA sebuah soal. Mengembalikan objek BARU. */
export function recordSentence(records, id, kind, correct, today) {
  const prevAll = records[id] || {};
  const prev = prevAll[kind] || { seen: 0, right: 0, last: null };
  return {
    ...records,
    [id]: { ...prevAll, [kind]: { seen: prev.seen + 1, right: prev.right + (correct ? 1 : 0), last: today } },
  };
}

/** Ringkasan progres satu pelajaran untuk daftar/menu pelajaran. */
export function lessonProgress(lesson, state) {
  const started = lesson.vocab.filter((v) => state.leitner[v.id]).length;
  const done = (kind, list) => list.filter((e) => state.sentences?.[e.id]?.[kind]?.seen).length;
  const fill = lesson.exercises.filter((e) => e.type === 'fill');
  return {
    words: lesson.vocab.length,
    wordsStarted: started,
    fill: fill.length,
    fillDone: done('fill', fill),
    listen: lesson.exercises.length,
    listenDone: done('listen', lesson.exercises),
  };
}
