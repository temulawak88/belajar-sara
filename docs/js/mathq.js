// Soal cerita matematika: baca cerita (kata sulit bisa di-tap -> arti), hitung, isi jawaban dengan
// keypad angka sendiri (bukan keyboard iOS). Salah = ramah: petunjuk dari common_mistakes (mathhints.js).
//
// Iterasi ini belum punya langkah "tap yang diketahui/ditanya" dan "pilih model", jadi jenis
// kesalahan yang dicatat untuk jawaban pertama yang salah selalu `calculation`.

import { initPage, $, el, toast } from './ui.js';
import { loadState, saveState } from './storage.js';
import { todayStr } from './leitner.js';
import { hintFor, isCorrect, parseAnswer } from './mathhints.js';
import {
  chapterFromUrl,
  formatAnswer,
  loadSyllabus,
  pickQuestions,
  pieSectors,
  recordMath,
  sectorPath,
  tokenizeStory,
} from './mathlogic.js';

initPage();

const MAX_LEN = 9;
const KEYS = ['7', '8', '9', '⌫', '4', '5', '6', 'C', '1', '2', '3', '/', '0', '.', '␣'];
const KEY_LABELS = { '⌫': 'Delete', C: 'Clear', '/': 'Fraction bar', '␣': 'Space (for 1 1/2)', '.': 'Decimal point' };
const PIE_COLORS = ['#8fb4f5', '#f5c98f', '#a8dcb5', '#f2a5a5', '#cdb8ee', '#f3e08a'];

let state = loadState();
let chapter = null;
let questions = [];
const q = { i: 0, wrong: 0, answered: false, firstRight: 0, input: '' };

const current = () => questions[q.i];

function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  $('#counter').textContent = id === 'screen-question' ? `${q.i + 1} / ${questions.length}` : '';
}

/* ---------- Cerita + glosarium ---------- */

function renderStory(ex) {
  const story = $('#story');
  const note = $('#glossary-note');
  const tokens = tokenizeStory(ex.story, chapter.glossary);
  story.replaceChildren(
    ...tokens.map((t) =>
      t.meaning
        ? el('button', {
            class: 'term',
            type: 'button',
            text: t.text,
            onclick: (e) => {
              for (const b of story.querySelectorAll('.term.active')) b.classList.remove('active');
              e.currentTarget.classList.add('active');
              note.textContent = `${t.text} = ${t.meaning}`;
              note.classList.add('shown');
            },
          })
        : t.text,
    ),
  );
  note.classList.remove('shown');
  note.textContent = tokens.some((t) => t.meaning)
    ? 'Tap a blue word to see its meaning. (Ketuk kata biru untuk melihat artinya.)'
    : '';
}

/* ---------- Pie chart (digambar dari pie_data) ---------- */

function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

function renderPie(ex) {
  const box = $('#pie-box');
  box.hidden = !ex.pie_data;
  box.replaceChildren();
  if (!ex.pie_data) return;
  const sectors = pieSectors(ex.pie_data);
  const [cx, cy, r] = [130, 130, 120];
  const root = svg('svg', {
    viewBox: '0 0 260 260',
    class: 'pie',
    role: 'img',
    'aria-label': `Pie chart: ${sectors.map((s) => `${s.label} ${s.valueText}`).join(', ')}`,
  });
  sectors.forEach((s, i) => {
    root.append(svg('path', { d: sectorPath(s, cx, cy, r), fill: PIE_COLORS[i % PIE_COLORS.length], class: 'pie-sector' }));
  });
  sectors.forEach((s) => {
    const mid = (s.start + s.end) / 2;
    const a = 2 * Math.PI * mid - Math.PI / 2;
    const x = cx + r * 0.6 * Math.cos(a);
    const y = cy + r * 0.6 * Math.sin(a);
    root.append(
      svg(
        'text',
        { x: x.toFixed(1), y: y.toFixed(1), class: 'pie-label', 'text-anchor': 'middle' },
        svg('tspan', { x: x.toFixed(1), dy: '-0.2em' }, s.label),
        svg('tspan', { x: x.toFixed(1), dy: '1.25em', class: 'pie-value' }, s.valueText),
      ),
    );
  });
  box.append(root);
}

/* ---------- Keypad ---------- */

function canAppend(key) {
  const s = q.input;
  if (s.length >= MAX_LEN) return false;
  if (key === '.') return !s.includes('.') && !s.includes('/') && !s.includes(' '); // desimal: satu titik, bukan di pecahan
  if (key === '/') return /\d$/.test(s) && !s.includes('/') && !s.includes('.');
  if (key === '␣') return /^\d+$/.test(s); // spasi hanya untuk pecahan campuran: "1 1/2"
  return true;
}

function press(key) {
  if (q.answered) return;
  if (key === '⌫') q.input = q.input.slice(0, -1);
  else if (key === 'C') q.input = '';
  else if (canAppend(key)) q.input += key === '␣' ? ' ' : key;
  renderInput();
}

function renderInput() {
  const out = $('#answer-display');
  out.textContent = q.input;
  out.classList.toggle('empty', q.input === '');
}

function buildKeypad() {
  $('#keypad').replaceChildren(
    ...KEYS.map((k) =>
      el('button', {
        class: `btn key${k === '0' ? ' wide' : ''}${/\d/.test(k) ? '' : ' key-fn'}`,
        type: 'button',
        'data-key': k,
        'aria-label': KEY_LABELS[k] || k,
        text: k,
        onclick: () => press(k),
      }),
    ),
  );
}

/* ---------- Soal ---------- */

function showHint(title, items = [], kind = '') {
  $('#hint-title').textContent = title;
  $('#hint-items').replaceChildren(...items.map((t) => el('li', { text: t })));
  const box = $('#hint-box');
  box.dataset.kind = kind;
  box.hidden = false;
}

function renderQuestion() {
  Object.assign(q, { wrong: 0, answered: false, input: '' });
  const ex = current();
  $('#level-tag').textContent = `Level ${ex.level}`;
  renderStory(ex);
  renderPie(ex);
  $('#answer-prefix').textContent = ex.unit === '$' ? '$' : '';
  $('#answer-unit').textContent = ex.unit === '$' ? '' : ex.unit;
  $('#hint-box').hidden = true;
  $('#check-btn').hidden = false;
  $('#next-btn').hidden = true;
  for (const b of document.querySelectorAll('#keypad .key')) b.disabled = false;
  renderInput();
  showScreen('screen-question');
}

function finish() {
  q.answered = true;
  for (const b of document.querySelectorAll('#keypad .key')) b.disabled = true;
  $('#check-btn').hidden = true;
  $('#next-btn').hidden = false;
}

function record(correct) {
  // Simpan jawaban PERTAMA, langsung (bukan di akhir sesi).
  state.math = recordMath(state.math, current().id, correct, todayStr(), 'calculation');
  if (!saveState(state)) toast('Could not save progress (storage full?)', 3500);
}

function check() {
  if (q.answered) return;
  const ex = current();
  if (parseAnswer(q.input) === null) {
    // Belum ada angka yang bisa dibaca: bukan percobaan, tidak dicatat.
    const h = hintFor(chapter, ex, q.input, 1);
    showHint(q.input === '' ? 'Type your answer with the keypad. (Isi jawabanmu dulu.)' : h.title, [], 'unreadable');
    return;
  }
  if (isCorrect(ex, q.input)) {
    if (q.wrong === 0) {
      record(true);
      q.firstRight += 1;
    }
    showHint(`Yes! ${formatAnswer(ex)} ✔`, [], 'right');
    finish();
    return;
  }
  q.wrong += 1;
  if (q.wrong === 1) record(false);
  const h = hintFor(chapter, ex, q.input, q.wrong);
  showHint(h.title, h.items, h.kind);
  if (h.kind === 'reveal') {
    q.input = String(ex.answer);
    renderInput();
    finish();
  } else {
    q.input = ''; // kosongkan untuk percobaan berikutnya
    renderInput();
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

$('#check-btn').addEventListener('click', check);
$('#next-btn').addEventListener('click', next);

async function load() {
  const data = await loadSyllabus();
  chapter = chapterFromUrl(data, location.search);
  if (!chapter) {
    location.replace('math.html'); // bab tidak dikenal / belum punya soal: tidak ada layar buntu
    return;
  }
  $('#page-title').textContent = `${chapter.title}`;
  document.title = `${chapter.title} · Belajar`;
  questions = pickQuestions(chapter.examples, state.math);
  buildKeypad();
  renderQuestion();
}

load();
