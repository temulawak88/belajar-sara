// Daftar bab matematika (dari syllabus.json). Bab "current" paling atas; bab tanpa soal tampil nonaktif.

import { initPage, $, el } from './ui.js';
import { loadState } from './storage.js';
import { chapterProgress, loadSyllabus, sortChapters } from './mathlogic.js';

initPage();

async function load() {
  const data = await loadSyllabus();
  const records = loadState().math;
  const list = $('#chapter-list');
  list.replaceChildren();
  for (const ch of sortChapters(data.chapters)) {
    const p = chapterProgress(ch, records);
    const inner = [
      el('span', { class: 'lesson-num', text: `Chapter ${ch.number}` }),
      ch.status === 'current' ? el('span', { class: 'badge', text: 'Now' }) : null,
      el('span', { class: 'lesson-zh', text: ch.title }),
      el('span', { class: 'lesson-id', text: (ch.subtopics || []).join(' · ') }),
      el('span', { class: 'lesson-progress', text: p.total ? `${p.done} / ${p.total} problems` : 'Coming later (menyusul)' }),
    ];
    const card = p.total
      ? el('a', { class: 'lesson-card', href: `mathq.html?c=${ch.id}`, 'data-chapter': ch.id }, ...inner)
      : el('div', { class: 'lesson-card disabled', 'aria-disabled': 'true', 'data-chapter': ch.id }, ...inner);
    list.append(el('li', {}, card));
  }
}

load();
