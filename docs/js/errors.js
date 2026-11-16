// Penangkap error global: catat ke log lokal (maks 50) dan tampilkan layar ramah.

const LOG_KEY = 'belajar-sarah:errors';
const MAX = 50;

export function readLog() {
  try {
    const arr = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function clearLog() {
  try {
    localStorage.removeItem(LOG_KEY);
  } catch {
    /* abaikan */
  }
}

export function logError(message, detail = '') {
  try {
    const log = readLog();
    log.push({
      at: new Date().toISOString(),
      page: location.pathname.split('/').pop() || 'index.html',
      message: String(message).slice(0, 500),
      detail: String(detail).slice(0, 2000),
    });
    localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-MAX)));
  } catch {
    /* storage penuh / diblokir: tidak ada yang bisa dilakukan */
  }
}

// Saat halaman sedang ditinggalkan (link diketuk, atau dialihkan dengan leavePage), Safari/WebKit
// membatalkan fetch yang belum selesai dengan "TypeError: Load failed". Itu bukan error app:
// jangan dicatat dan jangan tampilkan layar Oops.
let leaving = false;

/** Pindah halaman dari kode (pengganti location.replace) tanpa memicu error palsu. */
export function leavePage(url) {
  leaving = true;
  location.replace(url);
}

/**
 * Untuk `.catch()` pemuatan halaman: abaikan error HANYA jika halaman sedang ditinggalkan
 * (fetch dibatalkan browser). Error lain dilempar lagi -> tetap dicatat dan layar Oops muncul.
 */
export function ignoreIfLeaving(err) {
  if (!leaving) throw err;
}

function showOops() {
  const el = document.getElementById('oops');
  if (el) el.hidden = false;
}

export function installErrorHandlers() {
  window.addEventListener('beforeunload', () => {
    leaving = true;
  });
  window.addEventListener('pagehide', () => {
    leaving = true;
  });
  // Kembali lewat tombol Back (bfcache): halaman hidup lagi, error kembali dicatat.
  window.addEventListener('pageshow', () => {
    leaving = false;
  });
  window.addEventListener('error', (e) => {
    if (leaving) return;
    // Error muat resource (gambar dll.) tidak punya e.error; tetap dicatat tapi tanpa layar Oops.
    logError(e.message || 'Resource error', e.error?.stack || e.filename || '');
    if (e.error) showOops();
  });
  window.addEventListener('unhandledrejection', (e) => {
    if (leaving) return;
    const r = e.reason;
    logError(r?.message || String(r), r?.stack || '');
    showOops();
  });
}
