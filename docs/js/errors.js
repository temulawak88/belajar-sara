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

function showOops() {
  const el = document.getElementById('oops');
  if (el) el.hidden = false;
}

export function installErrorHandlers() {
  window.addEventListener('error', (e) => {
    // Error muat resource (gambar dll.) tidak punya e.error; tetap dicatat tapi tanpa layar Oops.
    logError(e.message || 'Resource error', e.error?.stack || e.filename || '');
    if (e.error) showOops();
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    logError(r?.message || String(r), r?.stack || '');
    showOops();
  });
}
