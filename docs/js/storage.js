// Penyimpanan progres di iPad (localStorage).
// Semua akses dibungkus try/catch: Safari bisa melempar error (mode privat, kuota penuh).

const KEY = 'belajar-sarah:progress';
export const SCHEMA_VERSION = 5;

function emptyState() {
  return { schemaVersion: SCHEMA_VERSION, nickname: '', leitner: {}, writing: {}, tones: {}, sentences: {}, math: {}, updatedAt: null };
}

// Migrasi dari versi lama ke versi sekarang. Tambah langkah baru di sini setiap
// kali struktur data berubah, lalu naikkan SCHEMA_VERSION.
const MIGRATIONS = {
  // 0 = data tanpa schemaVersion (belum pernah ada, disiapkan untuk jaga-jaga).
  0: (s) => ({ nickname: '', leitner: {}, updatedAt: null, ...s, schemaVersion: 1 }),
  // v2 (iterasi 2): progres latihan menulis per karakter.
  1: (s) => ({ ...s, writing: {}, schemaVersion: 2 }),
  // v3 (iterasi 3): hasil latihan nada per karakter.
  2: (s) => ({ ...s, tones: {}, schemaVersion: 3 }),
  // v4 (pelajaran): hasil latihan kalimat per id (fill / order / listen). Progres flashcard lama
  // (termasuk kata HSK 1 yang tidak lagi ditampilkan) dibiarkan apa adanya.
  3: (s) => ({ ...s, sentences: {}, schemaVersion: 4 }),
  // v5 (matematika): hasil soal cerita per id, termasuk jumlah kesalahan per jenis.
  4: (s) => ({ ...s, math: {}, schemaVersion: 5 }),
};

export function migrate(data) {
  if (!data || typeof data !== 'object') return emptyState();
  let s = { ...data };
  let v = Number.isInteger(s.schemaVersion) ? s.schemaVersion : 0;
  if (v > SCHEMA_VERSION) {
    // Data dari versi app yang lebih baru: jangan dirusak, pakai apa adanya.
    return s;
  }
  while (v < SCHEMA_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`No migration from schemaVersion ${v}`);
    s = step(s);
    v = s.schemaVersion;
  }
  if (!s.leitner || typeof s.leitner !== 'object') s.leitner = {};
  if (!s.writing || typeof s.writing !== 'object') s.writing = {};
  if (!s.tones || typeof s.tones !== 'object') s.tones = {};
  if (!s.sentences || typeof s.sentences !== 'object') s.sentences = {};
  if (!s.math || typeof s.math !== 'object') s.math = {};
  return s;
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    return migrate(JSON.parse(raw));
  } catch (e) {
    console.warn('loadState failed', e);
    return emptyState();
  }
}

/** @returns {boolean} true jika berhasil disimpan */
export function saveState(state) {
  try {
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.warn('saveState failed', e);
    return false;
  }
}

export function resetState() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) {
    console.warn('resetState failed', e);
  }
  return emptyState();
}

export function exportJSON(extra = {}) {
  return JSON.stringify(
    { app: 'belajar-sarah', exportedAt: new Date().toISOString(), progress: loadState(), ...extra },
    null,
    2,
  );
}
