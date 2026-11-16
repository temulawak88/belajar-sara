// Bagian bersama halaman latihan per pelajaran (cards / fill / listen / lesson):
// baca "?n=", muat pelajaran, pasang tombol Back ke menu pelajaran.

import { $ } from './ui.js';
import { findLesson, lessonNumberFromUrl, loadLessons } from './lessons.js';

/**
 * @returns {Promise<{lesson: object, n: number, data: object} | null>}
 *   null jika "?n=" tidak valid — halaman sudah dialihkan ke daftar pelajaran (tidak ada layar buntu).
 */
export async function openLesson(backTo = 'lesson') {
  const n = lessonNumberFromUrl(location.search);
  const data = await loadLessons();
  const lesson = n ? findLesson(data, n) : null;
  if (!lesson) {
    location.replace('hanzi.html');
    return null;
  }
  const lessonUrl = `lesson.html?n=${n}`;
  const back = $('#back-btn');
  if (back && backTo === 'lesson') back.href = lessonUrl;
  const done = $('#done-lesson');
  if (done) done.href = lessonUrl;
  const title = $('#page-title');
  if (title && backTo === 'lesson') title.textContent = `${title.textContent} · Lesson ${n}`;
  return { lesson, n, data };
}

export function showScreen(id, counterText = '') {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  $('#counter').textContent = counterText;
}
