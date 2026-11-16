import { initPage, $ } from './ui.js';
import { loadState } from './storage.js';
import { todayStr, SESSION_SIZE } from './leitner.js';
import { loadLessons } from './lessons.js';

initPage();

// Ringkasan kecil di kartu Mandarin. Hanya kata pelajaran yang dihitung: progres lama untuk kata
// HSK 1 (yang tidak lagi punya flashcard) tidak boleh muncul sebagai "kartu untuk diulang".
async function load() {
  const data = await loadLessons();
  const ids = new Set(data.lessons.flatMap((l) => l.vocab.map((v) => v.id)));
  const progress = Object.entries(loadState().leitner).filter(([id]) => ids.has(id));
  const today = todayStr();
  // Satu sesi berisi maksimal SESSION_SIZE kartu ulangan.
  const due = Math.min(SESSION_SIZE, progress.filter(([, c]) => c.due <= today).length);
  const status = $('#mandarin-status');
  if (progress.length === 0) status.textContent = `Lessons 1–${data.lessons.length} · start here!`;
  else if (due > 0) status.textContent = `${due} card${due === 1 ? '' : 's'} to review today`;
  else status.textContent = `All done today · ${progress.length} words started`;
}

load();
