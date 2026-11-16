// Logika murni layar soal cerita (tanpa DOM/storage). Sumber: docs/content/math/syllabus.json.

export const SYLLABUS_URL = 'content/math/syllabus.json'; // relatif: jalan di sub-path GitHub Pages
export const QUESTIONS_PER_SESSION = 5; // sesi pendek

export async function loadSyllabus() {
  const res = await fetch(SYLLABUS_URL);
  if (!res.ok) throw new Error(`Load failed: ${SYLLABUS_URL} ${res.status}`);
  return res.json();
}

export function chapterFromUrl(data, search) {
  const id = new URLSearchParams(search).get('c');
  const ch = data.chapters.find((c) => c.id === id);
  return ch && ch.examples.length ? ch : null;
}

/** Bab yang sedang dipelajari ("current") di atas; sisanya urut nomor. */
export function sortChapters(chapters) {
  return [...chapters].sort((a, b) => (b.status === 'current') - (a.status === 'current') || a.number - b.number);
}

const isLetter = (ch) => !!ch && /[A-Za-z]/.test(ch);

/**
 * Pecah cerita menjadi potongan teks biasa dan istilah glosarium (bisa di-tap -> arti Indonesia).
 * Pencocokan tidak peka huruf besar/kecil, frasa terpanjang dulu, hanya pada batas kata.
 * @returns {{text: string, meaning?: string}[]}
 */
export function tokenizeStory(story, glossary = {}) {
  const keys = Object.keys(glossary)
    .map((k) => ({ key: k, low: k.toLowerCase() }))
    .sort((a, b) => b.low.length - a.low.length);
  const low = story.toLowerCase();
  const out = [];
  let plain = '';
  let i = 0;
  while (i < story.length) {
    let hit = null;
    if (!isLetter(story[i - 1])) {
      hit = keys.find((k) => low.startsWith(k.low, i) && !isLetter(story[i + k.low.length]));
    }
    if (hit) {
      if (plain) out.push({ text: plain });
      plain = '';
      out.push({ text: story.slice(i, i + hit.low.length), meaning: glossary[hit.key] });
      i += hit.low.length;
    } else {
      plain += story[i];
      i += 1;
    }
  }
  if (plain) out.push({ text: plain });
  return out;
}

/**
 * Pilih soal sesi: yang paling sering salah dulu, lalu yang belum pernah, lalu level rendah dulu.
 * Urutan akhir = level naik (mulai dari yang mudah), tidak diacak.
 */
export function pickQuestions(examples, records, n = QUESTIONS_PER_SESSION) {
  const score = (ex) => {
    const r = records[ex.id];
    return !r || !r.seen ? 0.5 : r.right / r.seen;
  };
  return examples
    .map((ex, order) => ({ ex, order, s: score(ex) }))
    .sort((a, b) => a.s - b.s || a.ex.level - b.ex.level || a.order - b.order)
    .slice(0, n)
    .sort((a, b) => a.ex.level - b.ex.level || a.order - b.order)
    .map((x) => x.ex);
}

/**
 * Catat jawaban PERTAMA sebuah soal. Mengembalikan objek BARU.
 * @param {'comprehension'|'model'|'calculation'|null} errorType  jenis kesalahan jika salah
 */
export function recordMath(records, id, correct, today, errorType = null) {
  const prev = records[id] || { seen: 0, right: 0, last: null, errors: {} };
  const errors = { ...prev.errors };
  if (!correct && errorType) errors[errorType] = (errors[errorType] || 0) + 1;
  return { ...records, [id]: { seen: prev.seen + 1, right: prev.right + (correct ? 1 : 0), last: today, errors } };
}

export function chapterProgress(chapter, records) {
  return { total: chapter.examples.length, done: chapter.examples.filter((e) => records[e.id]?.seen).length };
}

/** Jawaban dengan satuannya, untuk ditampilkan ("180 km", "$1080"). */
export function formatAnswer(example) {
  return example.unit === '$' ? `$${example.answer}` : `${example.answer} ${example.unit}`;
}

/* ---------- Pie chart ---------- */

function fractionValue(sector) {
  if (typeof sector.fraction === 'string') {
    const [a, b] = sector.fraction.split('/').map(Number);
    return a / b;
  }
  return typeof sector.percent === 'number' ? sector.percent / 100 : null;
}

/**
 * Sektor pie siap gambar: awal/akhir sebagai bagian lingkaran (0–1) searah jarum jam dari atas.
 * Sektor "sisanya" (percent: null) mengisi sisa lingkaran dan diberi label "?".
 */
export function pieSectors(pieData) {
  const known = pieData.reduce((sum, s) => sum + (fractionValue(s) ?? 0), 0);
  let at = 0;
  return pieData.map((s) => {
    const v = fractionValue(s);
    const size = v ?? Math.max(0, 1 - known);
    const sector = {
      label: s.label,
      valueText: v === null ? '?' : s.fraction ?? `${s.percent}%`,
      start: at,
      end: at + size,
      isRest: v === null,
    };
    at += size;
    return sector;
  });
}

/** Path SVG satu sektor (pusat cx,cy; jari-jari r). */
export function sectorPath(sector, cx, cy, r) {
  const point = (t) => {
    const a = 2 * Math.PI * t - Math.PI / 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const [x1, y1] = point(sector.start);
  const [x2, y2] = point(sector.end);
  const large = sector.end - sector.start > 0.5 ? 1 : 0;
  const f = (n) => Number(n.toFixed(2));
  return `M ${cx} ${cy} L ${f(x1)} ${f(y1)} A ${r} ${r} 0 ${large} 1 ${f(x2)} ${f(y2)} Z`;
}
