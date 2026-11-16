// Dengar → pilih arti: kalimat pelajaran dibacakan (TTS), anak memilih 1 dari 3 arti.
// Pengecoh = arti kalimat lain di pelajaran yang sama.
// Salah ke-1 -> suara diputar lagi + coba lagi; salah ke-2 -> jawaban ditunjukkan. Jawaban pertama yang dinilai.

import { initPage, $, el, toast } from './ui.js';
import { loadState, saveState } from './storage.js';
import { todayStr } from './leitner.js';
import { lessonSentences, listenOptions, pickExercises, recordSentence } from './lessons.js';
import { openLesson, showScreen } from './lessonpage.js';
import { initSpeech, speak, speechStatus } from './speech.js';

initPage();

let state = loadState();
let lesson = null;
let questions = [];
const q = { i: 0, tries: 0, answered: false, firstRight: 0 };

const current = () => questions[q.i];
const voiceProblem = (status) => status === 'no-voice' || status === 'unsupported';

function updateVoice(status) {
  const note = $('#voice-note');
  if (voiceProblem(status)) {
    // Latihan dengar tidak bisa jalan tanpa suara (pengecualian di CLAUDE.md › Suara).
    note.textContent =
      'This practice needs a Chinese voice. (Butuh suara Mandarin: Settings › Accessibility › Spoken Content › Voices › Chinese.)';
    note.hidden = false;
    $('#start-btn').disabled = true;
  } else {
    note.hidden = true;
    $('#start-btn').disabled = questions.length === 0;
  }
}

function say() {
  // Selalu dipanggil dari handler tap (syarat Safari).
  if (voiceProblem(speak(current().text))) toast('No Chinese voice on this iPad. (Suara Mandarin belum ada.)', 3500);
}

function renderQuestion() {
  Object.assign(q, { tries: 0, answered: false });
  const s = current();
  $('#q-hanzi').textContent = s.text;
  $('#q-pinyin').textContent = s.pinyin;
  $('#reveal').hidden = true;
  $('#feedback').textContent = '';
  $('#next-btn').hidden = true;
  $('#options').replaceChildren(
    ...listenOptions(lesson, s).map((opt) =>
      el('button', {
        class: 'btn choice text-choice',
        type: 'button',
        'data-correct': opt.correct ? '1' : '0',
        text: opt.arti,
        onclick: (e) => answer(e.currentTarget, opt.correct),
      }),
    ),
  );
  showScreen('screen-question', `${q.i + 1} / ${questions.length}`);
  say();
}

function finish() {
  q.answered = true;
  for (const b of document.querySelectorAll('#options .choice')) {
    b.disabled = true;
    if (b.dataset.correct === '1') b.classList.add('right');
  }
  $('#reveal').hidden = false;
  $('#next-btn').hidden = false;
}

function answer(btn, right) {
  if (q.answered) return;
  q.tries += 1;
  if (q.tries === 1) {
    state.sentences = recordSentence(state.sentences, current().id, 'listen', right, todayStr());
    if (!saveState(state)) toast('Could not save progress (storage full?)', 3500);
    if (right) q.firstRight += 1;
  }
  if (right) {
    $('#feedback').textContent = 'Yes! ✔';
    finish();
  } else if (q.tries === 1) {
    btn.classList.add('tried');
    btn.disabled = true;
    $('#feedback').textContent = 'Not quite. Listen again and try once more. (Dengar lagi, coba sekali lagi.)';
    say();
  } else {
    btn.classList.add('tried');
    $('#feedback').textContent = "Here is the sentence. We'll practise it again. (Tidak apa-apa!)";
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

$('#start-btn').addEventListener('click', () => {
  Object.assign(q, { i: 0, firstRight: 0 });
  renderQuestion();
});
$('#listen-btn').addEventListener('click', say);
$('#next-btn').addEventListener('click', next);

async function load() {
  const opened = await openLesson();
  if (!opened) return;
  lesson = opened.lesson;
  questions = pickExercises(lessonSentences(lesson), state.sentences, 'listen');
  $('#start-note').textContent = `Today: ${questions.length} sentence${questions.length === 1 ? '' : 's'}`;
  updateVoice(speechStatus());
}

initSpeech((status) => {
  if (!$('#screen-start').hidden) updateVoice(status);
});
load();
