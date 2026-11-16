// Latihan menulis hanzi: Watch (animasi urutan goresan) -> Trace (dengan garis bantu) -> Write (dari ingatan).
//
// Hanzi Writer hanya dipakai untuk animasi dan PENILAIAN goresan. Input ditangkap canvas sendiri
// (inkpad.js, Pointer Events + tekanan + palm rejection), lalu goresan yang sudah selesai diputar
// ulang ke Hanzi Writer sebagai mouse event sintetis. Hanzi Writer tidak menggambar tintanya sendiri
// (drawingColor transparan), jadi yang terlihat anak hanyalah tinta dari canvas.

import HanziWriter from '../vendor/hanzi-writer/hanzi-writer.esm.js';
import { initPage, $, el, toast } from './ui.js';
import { loadState, saveState } from './storage.js';
import { todayStr } from './leitner.js';
import { pickCharacters, recordStep, STEPS } from './writing.js';
import { createInkPad } from './inkpad.js';
import { initSpeech, speak } from './speech.js';
import { cardWords, loadVocab } from './lessons.js';
import { openLesson } from './lessonpage.js';

initPage();

const CHARS_URL = 'vendor/hanzi-writer-data/chars.json';

let charData = {};
let state = loadState();
let plan = [];

// Posisi latihan saat ini.
const cur = { i: 0, step: 'watch', completed: 0, mistakes: 0, done: false, ready: false };
const results = [];

let writer = null;
let pad = null;
let builtSize = 0;
let building = false;

/* ---------- Tampilan ---------- */

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  $('#counter').textContent = id === 'screen-write' ? `${cur.i + 1} / ${plan.length}` : '';
}

function setMsg(text) {
  $('#step-msg').textContent = text;
}

function updateVoiceNote(status) {
  const note = $('#voice-note');
  note.hidden = !(status === 'no-voice' || status === 'unsupported');
  note.textContent = 'No Chinese voice on this iPad. (Suara Mandarin belum ada.)';
}

function renderStart() {
  const list = $('#char-list');
  list.replaceChildren();
  for (const { char, word } of plan) {
    list.append(el('li', {}, el('span', { class: 'char', text: char }), el('span', { class: 'char-word', text: `${word.hanzi} · ${word.pinyin}` })));
  }
  if (!plan.length) {
    list.append(el('li', { class: 'all-done', text: 'All done for today! (Selesai untuk hari ini!)' }));
    $('#start-btn').hidden = true;
  }
  show('screen-start');
}

function renderWordInfo() {
  const { char, word } = plan[cur.i];
  const wordEl = $('#word');
  wordEl.replaceChildren(...[...word.hanzi].map((c) => el('span', { class: c === char ? 'hl' : '', text: c })));
  $('#word-pinyin').textContent = word.pinyin;
  $('#word-en').textContent = word.meaning_en;
  $('#word-id').textContent = word.meaning_id;
}

function renderControls() {
  for (const li of document.querySelectorAll('#steps li')) {
    const idx = STEPS.indexOf(li.dataset.step);
    li.className = idx < STEPS.indexOf(cur.step) ? 'done' : li.dataset.step === cur.step ? 'current' : '';
  }
  const quiz = cur.step !== 'watch';
  $('#replay-btn').hidden = quiz;
  $('#undo-btn').hidden = !quiz;
  $('#clear-btn').hidden = !quiz;
  $('#undo-btn').disabled = cur.completed === 0;
  $('#clear-btn').disabled = cur.completed === 0;
  // Watch: boleh lanjut kapan saja. Trace/Write: lanjut setelah karakter selesai.
  $('#next-btn').hidden = quiz && !cur.done;
  const canWrite = quiz && !cur.done && cur.ready;
  pad?.setEnabled(canWrite);
  $('#pad').dataset.ready = canWrite ? '1' : '0'; // juga penanda untuk tes otomatis
  $('#pad').dataset.completed = String(cur.completed);
}

/* ---------- Hanzi Writer ---------- */

function writerOptions(size) {
  const padding = Math.round(size * 0.05);
  $('#pad').dataset.padding = String(padding); // dipakai tes untuk memetakan koordinat goresan
  return {
    width: size,
    height: size,
    padding,
    renderer: 'svg',
    showCharacter: false,
    showOutline: cur.step !== 'write',
    strokeColor: '#1d2433',
    outlineColor: '#d6dcea',
    highlightColor: '#2f6fde',
    drawingColor: 'rgba(0,0,0,0)', // tinta digambar canvas kita sendiri
    drawingFadeDuration: 0,
    strokeAnimationSpeed: 1,
    delayBetweenStrokes: 300,
    charDataLoader: (char, onLoad, onError) => {
      if (charData[char]) onLoad(charData[char]);
      else onError(new Error(`No stroke data for ${char}`));
    },
  };
}

function buildWriter() {
  if (building) return;
  building = true;
  try {
    pad.resize(); // layar baru saja tampil: baca ukuran sekarang, jangan tunggu ResizeObserver
  } finally {
    building = false;
  }
  const { width, height } = pad.size;
  const size = Math.floor(Math.min(width, height));
  if (!size) return;
  builtSize = size;
  const target = $('#hw-target');
  target.replaceChildren();
  writer = HanziWriter.create(target, plan[cur.i].char, writerOptions(size));
  startStep();
}

let stepToken = 0;

function startStep() {
  const token = ++stepToken; // abaikan kuis lama jika writer sudah dibangun ulang (rotasi, undo)
  cur.ready = false;
  renderControls();
  if (cur.step === 'watch') {
    setMsg('Watch the stroke order. (Perhatikan urutan goresan.)');
    writer.animateCharacter();
    return;
  }
  if (cur.done) {
    writer.showCharacter();
    return;
  }
  setMsg(
    cur.step === 'trace'
      ? 'Trace over the grey character. (Jiplak huruf abu-abu.)'
      : 'Now write it from memory! (Sekarang tulis sendiri!)',
  );
  writer.quiz({
    quizStartStrokeNum: cur.completed,
    showHintAfterMisses: 2,
    markStrokeCorrectAfterMisses: 4, // anak tidak pernah terjebak di satu goresan
    leniency: 1.2,
    onCorrectStroke: (d) => {
      cur.completed = d.strokeNum + 1;
      renderControls();
    },
    onMistake: (d) => {
      cur.mistakes += 1;
      if (d.mistakesOnStroke === 2) setMsg('Look at the blue hint, then try again. (Lihat petunjuk biru.)');
      else if (d.mistakesOnStroke === 1) setMsg('Almost! Try that stroke again. (Hampir! Coba lagi.)');
    },
    onComplete: () => stepComplete(),
  }).then(() => {
    if (token !== stepToken) return;
    cur.ready = true;
    renderControls();
  });
}

function stepComplete() {
  cur.done = true;
  const { char } = plan[cur.i];
  // Simpan setiap langkah yang selesai (bukan di akhir sesi).
  state.writing = recordStep(state.writing, char, cur.step, cur.mistakes, todayStr());
  if (!saveState(state)) toast('Could not save progress (storage full?)', 3500);
  if (cur.step === 'write') {
    results.push({ char, mistakes: cur.mistakes });
    setMsg(cur.mistakes === 0 ? 'Perfect! 🌟' : 'Well done! ✔️');
  } else {
    setMsg('Great! Now without the grey lines. (Bagus!)');
  }
  renderControls();
}

/** Putar ulang goresan dari canvas ke Hanzi Writer (mouse event sintetis = API publik library). */
function replayStroke(points) {
  const svg = $('#hw-target svg');
  if (!svg || points.length < 2) return;
  const fire = (target, type, p) =>
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: p.clientX, clientY: p.clientY }));
  fire(svg, 'mousedown', points[0]);
  for (let i = 1; i < points.length; i++) fire(svg, 'mousemove', points[i]);
  fire(document, 'mouseup', points[points.length - 1]);
}

/* ---------- Alur ---------- */

function startChar(i) {
  Object.assign(cur, { i, step: 'watch', completed: 0, mistakes: 0, done: false });
  renderWordInfo();
  show('screen-write');
  buildWriter();
}

function next() {
  const idx = STEPS.indexOf(cur.step);
  if (idx < STEPS.length - 1) {
    Object.assign(cur, { step: STEPS[idx + 1], completed: 0, mistakes: 0, done: false });
    buildWriter();
  } else if (cur.i + 1 < plan.length) {
    startChar(cur.i + 1);
  } else {
    const perfect = results.filter((r) => r.mistakes === 0).length;
    $('#done-summary').textContent = `You wrote ${results.length} character${results.length === 1 ? '' : 's'}: ${results
      .map((r) => r.char)
      .join(' ')}${perfect ? ` (${perfect} perfect!)` : ''}`;
    show('screen-done');
  }
}

function restartQuizAt(n) {
  cur.completed = Math.max(0, n);
  cur.done = false;
  buildWriter();
}

$('#start-btn').addEventListener('click', () => startChar(0));
$('#next-btn').addEventListener('click', next);
$('#replay-btn').addEventListener('click', () => {
  writer?.hideCharacter();
  writer?.animateCharacter();
});
// Undo: buang goresan benar terakhir. Clear: mulai karakter ini dari awal.
$('#undo-btn').addEventListener('click', () => restartQuizAt(cur.completed - 1));
$('#clear-btn').addEventListener('click', () => restartQuizAt(0));
$('#speak-btn').addEventListener('click', () => updateVoiceNote(speak(plan[cur.i].word.hanzi)));

async function load() {
  const [opened, vocab, chars] = await Promise.all([
    openLesson(),
    loadVocab(),
    fetch(CHARS_URL).then((r) => {
      if (!r.ok) throw new Error(`Load failed: ${CHARS_URL} ${r.status}`);
      return r.json();
    }),
  ]);
  if (!opened) return;
  charData = chars;
  // Karakter dari kata pelajaran ini (yang sudah mulai dipelajari di kartu kata didahulukan).
  const words = cardWords(opened.lesson, vocab.words);
  plan = pickCharacters(words, state.leitner, state.writing, todayStr()).filter((p) => charData[p.char]);

  pad = createInkPad($('#pad'), {
    onStroke: (points) => replayStroke(points),
    // Rotasi / ukuran berubah: bangun ulang Hanzi Writer dengan ukuran baru, posisi latihan tetap.
    onResize: ({ width, height }) => {
      if (!building && writer && Math.floor(Math.min(width, height)) !== builtSize && !$('#screen-write').hidden) buildWriter();
    },
  });
  pad.setEnabled(false);
  renderStart();
}

initSpeech(updateVoiceNote);
load();
