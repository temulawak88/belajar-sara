// Isi bagian kosong: pilih kata/pola yang benar (melatih tata bahasa pelajaran).
// Salah = ramah: salah ke-1 -> arti kalimat sebagai petunjuk + coba lagi; salah ke-2 -> jawaban ditunjukkan.
// Hanya jawaban PERTAMA yang dinilai, dan langsung disimpan.

import { ignoreIfLeaving, leavePage } from './errors.js';
import { initPage, $, el, toast } from './ui.js';
import { loadState, saveState } from './storage.js';
import { todayStr } from './leitner.js';
import { BLANK, fullSentence, pickExercises, recordSentence, shuffle } from './lessons.js';
import { openLesson, showScreen } from './lessonpage.js';
import { initSpeech, speak } from './speech.js';

initPage();
initSpeech();

let state = loadState();
let questions = [];
const q = { i: 0, tries: 0, answered: false, firstRight: 0 };

const current = () => questions[q.i];

function renderQuestion() {
  Object.assign(q, { tries: 0, answered: false });
  const ex = current();
  const [before, after] = ex.sentence.split(BLANK);
  $('#sentence').replaceChildren(before, el('span', { class: 'blank', id: 'blank', text: '＿＿' }), after);
  $('#q-pinyin').textContent = ex.pinyin;
  $('#q-arti').textContent = ex.arti;
  $('#reveal').hidden = true;
  $('#speak-btn').hidden = true;
  $('#feedback').textContent = '';
  $('#next-btn').hidden = true;
  const box = $('#options');
  box.replaceChildren(
    ...shuffle(ex.options).map((opt) =>
      el('button', { class: 'btn big choice', type: 'button', 'data-option': opt, text: opt, onclick: () => answer(opt) }),
    ),
  );
  showScreen('screen-question', `${q.i + 1} / ${questions.length}`);
}

function optionButton(opt) {
  return [...document.querySelectorAll('#options .choice')].find((b) => b.dataset.option === opt);
}

function finish() {
  const ex = current();
  q.answered = true;
  const blank = $('#blank');
  blank.textContent = ex.answer;
  blank.classList.add('filled');
  optionButton(ex.answer).classList.add('right');
  for (const b of document.querySelectorAll('#options .choice')) b.disabled = true;
  $('#reveal').hidden = false;
  $('#speak-btn').hidden = false;
  $('#next-btn').hidden = false;
  speak(fullSentence(ex)); // dipicu dari tap pada pilihan jawaban
}

function answer(opt) {
  if (q.answered) return;
  const ex = current();
  const right = opt === ex.answer;
  q.tries += 1;
  if (q.tries === 1) {
    state.sentences = recordSentence(state.sentences, ex.id, 'fill', right, todayStr());
    if (!saveState(state)) toast('Could not save progress (storage full?)', 3500);
    if (right) q.firstRight += 1;
  }
  if (right) {
    $('#feedback').textContent = 'Yes! ✔';
    finish();
  } else if (q.tries === 1) {
    const btn = optionButton(opt);
    btn.classList.add('tried');
    btn.disabled = true;
    $('#feedback').textContent = `Not quite. It means: “${ex.arti}” Try again. (Coba lagi.)`;
  } else {
    optionButton(opt).classList.add('tried');
    $('#feedback').textContent = `It's ${ex.answer}. We'll practise it again. (Tidak apa-apa!)`;
    finish();
  }
}

function next() {
  if (q.i + 1 < questions.length) {
    q.i += 1;
    renderQuestion();
  } else {
    $('#done-summary').textContent = `You got ${q.firstRight} of ${questions.length} right on the first try.`;
    showScreen('screen-done');
  }
}

$('#next-btn').addEventListener('click', next);
$('#speak-btn').addEventListener('click', () => speak(fullSentence(current())));

async function load() {
  const opened = await openLesson();
  if (!opened) return;
  const fills = opened.lesson.exercises.filter((e) => e.type === 'fill');
  questions = pickExercises(fills, state.sentences, 'fill');
  if (!questions.length) {
    leavePage(`lesson.html?n=${opened.n}`);
    return;
  }
  renderQuestion();
}

load().catch(ignoreIfLeaving);
