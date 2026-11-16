// Modul flashcard Mandarin: hanzi -> (tap) pinyin + arti -> "Not yet" / "I knew it!".

import { initPage, $, el, toast } from './ui.js';
import { loadState, saveState } from './storage.js';
import { BOXES, INTERVAL_DAYS, boxCounts, buildSession, dueCount, grade, todayStr } from './leitner.js';
import { initSpeech, speak } from './speech.js';

initPage();

const VOCAB_URL = 'content/hsk2/vocab.json'; // relatif: jalan di sub-path GitHub Pages

let words = [];
let byId = new Map();
let state = loadState();

const session = { queue: [], index: 0, practiced: new Set(), knew: 0, notYet: 0 };

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  $('#counter').textContent = '';
}

/* ---------- Layar kotak ---------- */

function renderStart() {
  const today = todayStr();
  const counts = boxCounts(words, state.leitner);
  const list = $('#boxes');
  list.replaceChildren();
  for (let b = 1; b <= BOXES; b++) {
    const every = INTERVAL_DAYS[b] === 1 ? 'every day' : `every ${INTERVAL_DAYS[b]} days`;
    list.append(
      el(
        'li',
        { class: `box box-${b}`, 'data-box': b },
        el('span', { class: 'box-num', text: `Box ${b}` }),
        el('span', { class: 'box-count', text: String(counts[b]) }),
        el('span', { class: 'box-every', text: every }),
      ),
    );
  }
  const due = dueCount(words, state.leitner, today);
  const queue = buildSession(words, state.leitner, today);
  const fresh = queue.length - Math.min(due, queue.length);
  const note = $('#start-note');
  const btn = $('#start-btn');
  if (queue.length === 0) {
    note.textContent = 'All done for today! Come back tomorrow. (Selesai untuk hari ini!)';
    btn.hidden = true;
  } else {
    const parts = [];
    if (due) parts.push(`${Math.min(due, queue.length)} to review`);
    if (fresh) parts.push(`${fresh} new`);
    note.textContent = `Today: ${parts.join(' + ')} (${counts[0]} words not started yet)`;
    btn.hidden = false;
  }
  show('screen-start');
}

/* ---------- Layar kartu ---------- */

function currentWord() {
  return byId.get(session.queue[session.index]);
}

function renderCard() {
  const w = currentWord();
  const isPractice = session.index >= session.base;
  $('#card-tag').hidden = !isPractice;
  $('#card-hanzi').textContent = w.hanzi;
  $('#card-pinyin').textContent = w.pinyin;
  $('#card-en').textContent = w.meaning_en;
  $('#card-id').textContent = w.meaning_id;
  $('#card-answer').hidden = true;
  $('#reveal-row').hidden = false;
  $('#grade-row').hidden = true;
  show('screen-card');
  $('#counter').textContent = `${session.index + 1} / ${session.queue.length}`;
  const card = $('#card');
  card.classList.remove('enter');
  void card.offsetWidth; // mulai ulang animasi
  card.classList.add('enter');
}

function updateVoiceNote(status) {
  const note = $('#voice-note');
  if (status === 'no-voice' || status === 'unsupported') {
    note.textContent =
      'No Chinese voice on this iPad. (Suara Mandarin belum ada: Settings › Accessibility › Spoken Content › Voices › Chinese.)';
    note.hidden = false;
  } else {
    note.hidden = true;
  }
}

function sayCurrent() {
  // Dipanggil langsung dari handler tap -> memenuhi syarat user gesture Safari.
  updateVoiceNote(speak(currentWord().hanzi));
}

function reveal() {
  $('#card-answer').hidden = false;
  $('#reveal-row').hidden = true;
  $('#grade-row').hidden = false;
  sayCurrent();
}

function answer(knew) {
  const w = currentWord();
  const isPractice = session.index >= session.base;
  if (!isPractice) {
    // Simpan SETIAP jawaban (bukan di akhir sesi).
    state.leitner = grade(state.leitner, w.id, knew, todayStr());
    if (!saveState(state)) toast('Could not save progress (storage full?)', 3500);
    if (knew) session.knew += 1;
    else session.notYet += 1;
  }
  if (!knew && !session.practiced.has(w.id)) {
    session.practiced.add(w.id);
    session.queue.push(w.id); // ulang sekali di akhir sesi sebagai latihan
    toast("That's OK! We'll practise it again. (Tidak apa-apa!)");
  }
  session.index += 1;
  if (session.index >= session.queue.length) renderDone();
  else renderCard();
}

/* ---------- Layar selesai ---------- */

function renderDone() {
  $('#done-summary').textContent = `You knew ${session.knew} card${session.knew === 1 ? '' : 's'}. ${
    session.notYet ? `${session.notYet} to practise again tomorrow.` : 'Perfect!'
  }`;
  show('screen-done');
}

function startSession() {
  const queue = buildSession(words, state.leitner, todayStr());
  Object.assign(session, { queue, index: 0, base: queue.length, practiced: new Set(), knew: 0, notYet: 0 });
  if (queue.length) renderCard();
  else renderStart();
}

/* ---------- Mulai ---------- */

$('#start-btn').addEventListener('click', startSession);
$('#reveal-btn').addEventListener('click', reveal);
$('#speak-btn').addEventListener('click', sayCurrent);
$('#knew-btn').addEventListener('click', () => answer(true));
$('#notyet-btn').addEventListener('click', () => answer(false));

async function load() {
  const res = await fetch(VOCAB_URL);
  if (!res.ok) throw new Error(`Vocab load failed: ${res.status}`);
  const data = await res.json();
  words = data.words;
  byId = new Map(words.map((w) => [w.id, w]));
  renderStart();
}

initSpeech(updateVoiceNote);

load();
