// Menu satu pelajaran: 4 latihan (kartu kata, isi bagian kosong, susun kalimat, dengar → pilih arti).

import { ignoreIfLeaving } from './errors.js';
import { initPage, $, el } from './ui.js';
import { loadState } from './storage.js';
import { lessonProgress } from './lessons.js';
import { openLesson } from './lessonpage.js';

initPage();

async function load() {
  const opened = await openLesson('list');
  if (!opened) return;
  const { lesson, n } = opened;
  document.title = `Lesson ${n} · Belajar`;
  $('#page-title').textContent = `Lesson ${n}`;
  $('#lesson-zh').textContent = lesson.title_zh;
  $('#lesson-id').textContent = lesson.title_id;

  const p = lessonProgress(lesson, loadState());
  $('#ex-cards').href = `cards.html?n=${n}`;
  $('#ex-fill').href = `fill.html?n=${n}`;
  $('#ex-listen').href = `listen.html?n=${n}`;
  $('#ex-order').href = `order.html?n=${n}`;
  $('#ex-write').href = `write.html?n=${n}`;
  $('#ex-tone').href = `tone.html?n=${n}`;
  $('#ex-order-sub').textContent = `${p.orderDone} / ${p.order} done (Susun kalimat)`;
  $('#ex-cards-sub').textContent = `${p.wordsStarted} / ${p.words} words (Kartu kata)`;
  $('#ex-fill-sub').textContent = `${p.fillDone} / ${p.fill} done (Isi bagian kosong)`;
  $('#ex-listen-sub').textContent = `${p.listenDone} / ${p.listen} done (Dengar → pilih arti)`;

  const list = $('#grammar-list');
  list.replaceChildren(...(lesson.grammar || []).map((g) => el('li', { text: g })));
  $('#grammar').hidden = !(lesson.grammar || []).length;
}

load().catch(ignoreIfLeaving);
