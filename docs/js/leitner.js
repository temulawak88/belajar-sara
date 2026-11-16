// Spaced repetition sederhana: sistem Leitner 5 kotak.
// Modul murni (tanpa DOM/storage) supaya mudah dites. Tanggal = string lokal 'YYYY-MM-DD'.
//
// Kotak 1: tiap hari, 2: tiap 2 hari, 3: tiap 4 hari, 4: tiap 8 hari, 5: tiap 16 hari.
// Benar -> naik satu kotak. Salah -> kembali ke kotak 1 (muncul lagi besok).
// Di dalam sesi, kartu yang salah diulang sekali sebagai latihan (tidak dinilai ulang;
// diatur di hanzi.js) supaya tidak "naik kotak" di hari yang sama.

export const BOXES = 5;
export const INTERVAL_DAYS = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 16 };
export const SESSION_SIZE = 12; // sesi pendek (CLAUDE.md: 10–15 menit)
export const NEW_PER_DAY = 5; // kata baru per hari; sesi kedua di hari yang sama hanya berisi ulangan

export function todayStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(dayStr, n) {
  const [y, m, d] = dayStr.split('-').map(Number);
  // Jam 12 siang agar aman dari pergeseran DST.
  return todayStr(new Date(y, m - 1, d + n, 12));
}

/** Status kartu; kartu yang belum pernah dilihat = null. */
export function cardState(progress, id) {
  return progress[id] || null;
}

/** Jumlah kartu per kotak (kotak 0 = belum pernah dipelajari). */
export function boxCounts(words, progress) {
  const counts = [0, 0, 0, 0, 0, 0];
  for (const w of words) {
    const s = progress[w.id];
    counts[s ? s.box : 0] += 1;
  }
  return counts;
}

/** Berapa kata baru yang sudah diperkenalkan pada hari `today`. */
export function introducedOn(progress, today) {
  return Object.values(progress).filter((c) => c.first === today).length;
}

export function dueCount(words, progress, today) {
  return words.filter((w) => progress[w.id] && progress[w.id].due <= today).length;
}

/**
 * Susun antrean sesi: kartu jatuh tempo dulu (kotak terendah dulu, yang paling
 * lama terlambat dulu), lalu kartu baru (urutan sesuai daftar) hingga SESSION_SIZE,
 * dengan kuota kata baru NEW_PER_DAY per hari.
 */
export function buildSession(words, progress, today, opts = {}) {
  const size = opts.size ?? SESSION_SIZE;
  const maxNew = opts.maxNew ?? Math.max(0, NEW_PER_DAY - introducedOn(progress, today));
  const due = words
    .filter((w) => progress[w.id] && progress[w.id].due <= today)
    .sort((a, b) => {
      const sa = progress[a.id];
      const sb = progress[b.id];
      return sa.box - sb.box || sa.due.localeCompare(sb.due);
    });
  const fresh = words.filter((w) => !progress[w.id]);
  const queue = due.slice(0, size);
  const room = Math.min(maxNew, size - queue.length);
  if (room > 0) queue.push(...fresh.slice(0, room));
  return queue.map((w) => w.id);
}

/**
 * Catat jawaban. Mengembalikan objek progress BARU (tidak mengubah input).
 * @param {boolean} knew  true = "I knew it", false = "Not yet"
 * @param {number} intervalFactor  pengali jarak ulangan (2 untuk kata tambahan: muncul lebih jarang)
 */
export function grade(progress, id, knew, today, intervalFactor = 1) {
  const prev = progress[id] || { box: 1, due: today, right: 0, wrong: 0, first: today };
  const box = knew ? Math.min(BOXES, prev.box + 1) : 1;
  const due = addDays(today, INTERVAL_DAYS[box] * intervalFactor);
  const next = {
    box,
    due,
    right: prev.right + (knew ? 1 : 0),
    wrong: prev.wrong + (knew ? 0 : 1),
    first: prev.first,
    last: today,
  };
  return { ...progress, [id]: next };
}
