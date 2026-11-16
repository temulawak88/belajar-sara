// Latihan nada: dengar satu karakter -> pilih nada 1/2/3/4.
// Salah = ramah: petunjuk + dengar lagi + coba sekali lagi; setelah itu jawaban ditunjukkan.

import { initPage, $, el, toast } from './ui.js';
import { loadState, saveState } from './storage.js';
import { todayStr } from './leitner.js';
import { pickToneQuestions, toneOptions, recordTone } from './tones.js';
import { initSpeech, speak, speechStatus } from './speech.js';

initPage();

const VOCAB_URL = 'content/hsk2/vocab.json';

const TONES = {
  1: { name: '1st tone', hint: 'high and flat', id: 'tinggi datar', points: '6,6 34,6' },
  2: { name: '2nd tone', hint: 'goes up', id: 'naik', points: '6,22 34,6' },
  3: { name: '3rd tone', hint: 'dips down, then up', id: 'turun lalu naik', points: '6,16 11,26 16,32 21,33 26,29 30,20 34,9' },
  4: { name: '4th tone', hint: 'falls down', id: 'turun tajam', points: '6,6 34,34' },
};

let state = loadState();
let questions = [];
const q = { i: 0, tries: 0, firstRight: 0, answered: false };

function contour(tone) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 40 40');
  svg.setAttribute('class', 'contour');
  svg.setAttribute('aria-hidden', 'true');
  const line = document.createElementNS(ns, 'polyline');
  line.setAttribute('points', TONES[tone].points);
  svg.append(line);
  return svg;
}

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  $('#counter').textContent = id === 'screen-question' ? `${q.i + 1} / ${questions.length}` : '';
}

function voiceProblem(status) {
  return status === 'no-voice' || status === 'unsupported';
}

function updateVoice(status) {
  const note = $('#voice-note');
  if (voiceProblem(status)) {
    // Latihan ini tidak bisa jalan tanpa suara: jelaskan dengan ramah, jangan biarkan layar buntu.
    note.textContent =
      'This practice needs a Chinese voice. (Butuh suara Mandarin: Settings › Accessibility › Spoken Content › Voices › Chinese.)';
    note.hidden = false;
    $('#start-btn').disabled = true;
  } else {
    note.hidden = true;
    $('#start-btn').disabled = questions.length === 0;
  }
}

function renderStart() {
  const guide = $('#tone-guide');
  guide.replaceChildren();
  for (const t of [1, 2, 3, 4]) {
    guide.append(
      el('li', { class: `tone-${t}` }, contour(t), el('strong', { text: TONES[t].name }), el('span', { text: `${TONES[t].hint} (${TONES[t].id})` })),
    );
  }
  $('#start-note').textContent = questions.length
    ? `Today: ${questions.length} sound${questions.length === 1 ? '' : 's'}`
    : 'Learn some flashcards first! (Belajar flashcard dulu.)';
  updateVoice(speechStatus());
  show('screen-start');
}

function current() {
  return questions[q.i];
}

function say() {
  // Selalu dipanggil dari handler tap (syarat Safari).
  const status = speak(current().char);
  if (voiceProblem(status)) toast('No Chinese voice on this iPad. (Suara Mandarin belum ada.)', 3500);
}

function renderQuestion() {
  Object.assign(q, { tries: 0, answered: false });
  const it = current();
  $('#q-hanzi').textContent = it.char;
  $('#q-word').textContent = it.word.hanzi.length > 1 ? `${it.word.hanzi} · ${it.word.meaning_en}` : it.word.meaning_en;
  const box = $('#options');
  box.replaceChildren();
  for (const opt of toneOptions(it.syllable)) {
    box.append(
      el(
        'button',
        { class: `btn tone-btn tone-${opt.tone}`, type: 'button', 'data-tone': opt.tone, onclick: () => answer(opt.tone) },
        contour(opt.tone),
        el('span', { class: 'tone-label', text: opt.label }),
        el('span', { class: 'tone-num', text: String(opt.tone) }),
      ),
    );
  }
  $('#feedback').textContent = '';
  $('#next-btn').hidden = true;
  show('screen-question');
  say();
}

function answer(tone) {
  if (q.answered) return;
  const it = current();
  const btn = $(`#options [data-tone="${tone}"]`);
  const right = tone === it.tone;
  q.tries += 1;

  if (q.tries === 1) {
    // Hanya jawaban pertama yang dinilai; disimpan langsung.
    state.tones = recordTone(state.tones, it.char, right, todayStr());
    if (!saveState(state)) toast('Could not save progress (storage full?)', 3500);
    if (right) q.firstRight += 1;
  }

  if (right) {
    btn.classList.add('right');
    $('#feedback').textContent = `Yes! ${it.syllable} — ${TONES[it.tone].name} ✔`;
    finish();
  } else if (q.tries === 1) {
    btn.classList.add('tried');
    btn.disabled = true;
    $('#feedback').textContent =
      'Not quite. Listen again — is it flat, rising, dipping or falling? (Dengar lagi, coba sekali lagi.)';
    say();
  } else {
    btn.classList.add('tried');
    $(`#options [data-tone="${it.tone}"]`).classList.add('right');
    $('#feedback').textContent = `It's ${it.syllable} — ${TONES[it.tone].name}, ${TONES[it.tone].hint}. We'll practise it again. (Tidak apa-apa!)`;
    finish();
  }
}

function finish() {
  q.answered = true;
  for (const b of document.querySelectorAll('#options .tone-btn')) b.disabled = true;
  $('#next-btn').hidden = false;
}

function next() {
  if (q.i + 1 < questions.length) {
    q.i += 1;
    renderQuestion();
  } else {
    $('#done-summary').textContent = `You got ${q.firstRight} of ${questions.length} right on the first try.`;
    show('screen-done');
  }
}

$('#start-btn').addEventListener('click', () => {
  Object.assign(q, { i: 0, firstRight: 0 });
  renderQuestion();
});
$('#listen-btn').addEventListener('click', say);
$('#next-btn').addEventListener('click', next);

async function load() {
  const res = await fetch(VOCAB_URL);
  if (!res.ok) throw new Error(`Vocab load failed: ${res.status}`);
  const { words } = await res.json();
  questions = pickToneQuestions(words, state.leitner, state.tones);
  renderStart();
}

initSpeech((status) => {
  if (!$('#screen-start').hidden) updateVoice(status);
});
load();
