// Daftar pelajaran Mandarin (HSK Standard Course 2). Pelajaran "current" ditampilkan paling atas.

import { initPage, $, el } from './ui.js';
import { loadState } from './storage.js';
import { loadLessons, lessonProgress, sortLessons } from './lessons.js';

initPage();

async function load() {
  const data = await loadLessons();
  const state = loadState();
  const list = $('#lesson-list');
  list.replaceChildren();
  for (const lesson of sortLessons(data.lessons)) {
    const p = lessonProgress(lesson, state);
    list.append(
      el(
        'li',
        {},
        el(
          'a',
          { class: 'lesson-card', href: `lesson.html?n=${lesson.number}`, 'data-lesson': lesson.number },
          el('span', { class: 'lesson-num', text: `Lesson ${lesson.number}` }),
          lesson.status === 'current' ? el('span', { class: 'badge', text: 'Now' }) : null,
          el('span', { class: 'lesson-zh', lang: 'zh-CN', text: lesson.title_zh }),
          el('span', { class: 'lesson-id', lang: 'id', text: lesson.title_id }),
          el('span', { class: 'lesson-progress', text: `${p.wordsStarted} / ${p.words} words` }),
        ),
      ),
    );
  }
}

load();
