import { initPage, $ } from './ui.js';
import { loadState } from './storage.js';
import { todayStr, SESSION_SIZE } from './leitner.js';

initPage();

// Ringkasan kecil di kartu Mandarin (tanpa fetch vocab: cukup dari progres).
const progress = loadState().leitner;
const today = todayStr();
// Sama dengan halaman flashcard: satu sesi berisi maksimal SESSION_SIZE kartu ulangan.
const due = Math.min(SESSION_SIZE, Object.values(progress).filter((c) => c.due <= today).length);
const learned = Object.keys(progress).length;
const status = $('#mandarin-status');
if (learned === 0) status.textContent = 'Flashcards · start here!';
else if (due > 0) status.textContent = `${due} card${due === 1 ? '' : 's'} to review today`;
else status.textContent = `All done today · ${learned} words started`;
