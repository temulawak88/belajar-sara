// Soal cerita matematika (CLAUDE.md › Alur soal cerita). Cerita tetap terlihat; di sampingnya 4 langkah:
//   1 Find    — apa yang ditanya (pilih 1 dari 3)
//   2 Know    — apa yang diketahui (tap semua fakta dari cerita)
//   3 Picture — pilih model yang cocok (bar / journey / tank / pie); dilewati jika model `none`
//   4 Answer  — hitung dan isi jawaban dengan keypad angka sendiri (bukan keyboard iOS)
//
// Salah = ramah: salah pertama di sebuah langkah -> petunjuk + coba lagi; salah kedua -> ditunjukkan.
// Jenis kesalahan dicatat sesuai langkahnya: comprehension (1–2), model (3), calculation (4).
// Soal dicatat begitu hasilnya diketahui (kesalahan pertama, atau jawaban benar tanpa kesalahan).

import { ignoreIfLeaving, leavePage } from './errors.js';
import { initPage, $, el, toast } from './ui.js';
import { loadState, saveState } from './storage.js';
import { todayStr } from './leitner.js';
import { hintFor, isCorrect, parseAnswer } from './mathhints.js';
import { MODEL_LABELS, modelSVG } from './mathmodels.js';
import {
  addMathError,
  askedOptions,
  chapterFromUrl,
  formatAnswer,
  isKnownSelectionCorrect,
  knownOptions,
  loadSyllabus,
  modelOptions,
  pickQuestions,
  pieSectors,
  recordMath,
  sectorPath,
  stepsFor,
  tokenizeStory,
} from './mathlogic.js';

initPage();

const MAX_LEN = 9;
const KEYS = ['7', '8', '9', '⌫', '4', '5', '6', 'C', '1', '2', '3', '/', '0', '.', '␣'];
const KEY_LABELS = { '⌫': 'Delete', C: 'Clear', '/': 'Fraction bar', '␣': 'Space (for 1 1/2)', '.': 'Decimal point' };
const PIE_COLORS = ['#8fb4f5', '#f5c98f', '#a8dcb5', '#f2a5a5', '#cdb8ee', '#f3e08a'];
const ERROR_TYPE = { asked: 'comprehension', known: 'comprehension', model: 'model', answer: 'calculation' };

let state = loadState();
let chapter = null;
let questions = [];
let clean = 0; // soal yang selesai tanpa satu pun kesalahan
// Keadaan soal saat ini.
const q = { i: 0, steps: [], step: 0, wrong: 0, recorded: false, mistakes: new Set(), answered: false, input: '', known: [] };

const current = () => questions[q.i];
const stepName = () => q.steps[q.step];

function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  $('#counter').textContent = id === 'screen-question' ? `${q.i + 1} / ${questions.length}` : '';
}

/* ---------- Pencatatan ---------- */

function save() {
  if (!saveState(state)) toast('Could not save progress (storage full?)', 3500);
}

/** Kesalahan PERTAMA di langkah ini: catat jenisnya (sekali per jenis per soal). */
function noteMistake() {
  const type = ERROR_TYPE[stepName()];
  if (q.mistakes.has(type)) return;
  q.mistakes.add(type);
  if (!q.recorded) {
    state.math = recordMath(state.math, current().id, false, todayStr(), type);
    q.recorded = true;
  } else {
    state.math = addMathError(state.math, current().id, type);
  }
  save();
}

function noteSolvedCleanly() {
  if (q.recorded) return;
  state.math = recordMath(state.math, current().id, true, todayStr());
  q.recorded = true;
  clean += 1;
  save();
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

/* ---------- Petunjuk ---------- */

function showHint(title, items = [], kind = '') {
  $('#hint-title').textContent = title;
  $('#hint-items').replaceChildren(...items.map((t) => el('li', { text: t })));
  const box = $('#hint-box');
  box.dataset.kind = kind;
  box.hidden = false;
}

/* ---------- Langkah ---------- */

function renderStepBar() {
  for (const li of document.querySelectorAll('#math-steps li')) {
    const idx = q.steps.indexOf(li.dataset.step);
    li.hidden = idx < 0;
    li.className = idx < q.step ? 'done' : idx === q.step ? 'current' : '';
  }
}

function showStep() {
  q.wrong = 0;
  renderStepBar();
  for (const p of document.querySelectorAll('.step-panel')) p.hidden = p.id !== `step-${stepName()}`;
  $('#continue-btn').hidden = true;
  $('#next-btn').hidden = true;
  ({ asked: renderAsked, known: renderKnown, model: renderModel, answer: renderAnswer })[stepName()]();
}

/** Langkah selesai dengan benar: lanjut langsung ke langkah berikutnya. */
function advance() {
  q.step += 1;
  showStep();
}

/** Jawaban langkah ditunjukkan setelah dua kali salah: anak menekan Continue untuk lanjut. */
function waitForContinue() {
  $('#continue-btn').hidden = false;
}

// --- 1 Find ---
function renderAsked() {
  const ex = current();
  $('#asked-options').replaceChildren(
    ...askedOptions(chapter, ex).map((opt) =>
      el('button', {
        class: 'btn choice text-choice',
        type: 'button',
        'data-correct': opt.correct ? '1' : '0',
        text: opt.text,
        onclick: (e) => pickOne(e.currentTarget, opt.correct, '#asked-options', 'Yes! That is what we need to find. ✔', [
          'Not quite. Read the question sentence again. (Baca lagi kalimat tanyanya.)',
          `We need to find: ${ex.asked}. (Ini yang ditanya.)`,
        ]),
      }),
    ),
  );
}

// --- 3 Picture ---
function renderModel() {
  const ex = current();
  $('#model-options').replaceChildren(
    ...modelOptions(ex).map((opt) =>
      el(
        'button',
        {
          class: 'btn choice model-choice',
          type: 'button',
          'data-model': opt.model,
          'data-correct': opt.correct ? '1' : '0',
          onclick: (e) =>
            pickOne(e.currentTarget, opt.correct, '#model-options', `Yes! A ${MODEL_LABELS[ex.model].en.toLowerCase()} fits. ✔`, [
              'Not quite. What is the story about: parts of a whole, a trip, a container, or a chart? (Ceritanya tentang apa?)',
              `A ${MODEL_LABELS[ex.model].en.toLowerCase()} fits this problem. (${MODEL_LABELS[ex.model].id})`,
            ]),
        },
        modelSVG(opt.model),
        el('span', { class: 'model-name', text: MODEL_LABELS[opt.model].en }),
        el('span', { class: 'model-id', lang: 'id', text: MODEL_LABELS[opt.model].id }),
      ),
    ),
  );
}

/** Pilihan tunggal (langkah 1 dan 3). */
function pickOne(btn, right, groupSel, yes, [hint1, reveal]) {
  if (btn.disabled) return;
  const buttons = [...document.querySelectorAll(`${groupSel} .choice`)];
  if (right) {
    btn.classList.add('right');
    showHint(yes, [], 'right');
    advance();
    return;
  }
  q.wrong += 1;
  if (q.wrong === 1) {
    noteMistake();
    btn.classList.add('tried');
    btn.disabled = true;
    showHint(hint1, [], 'retry');
  } else {
    for (const b of buttons) {
      b.disabled = true;
      if (b.dataset.correct === '1') b.classList.add('right');
      else if (b === btn) b.classList.add('tried');
    }
    showHint(reveal, [], 'reveal');
    waitForContinue();
  }
}

// --- 2 Know ---
function renderKnown() {
  q.known = knownOptions(chapter, current());
  $('#known-check').hidden = false;
  $('#known-options').replaceChildren(
    ...q.known.map((opt) =>
      el('button', {
        class: 'btn choice text-choice fact',
        type: 'button',
        'data-kind': opt.kind,
        'aria-pressed': 'false',
        text: opt.text,
        onclick: (e) => {
          const b = e.currentTarget;
          b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
        },
      }),
    ),
  );
}

function checkKnown() {
  const buttons = [...document.querySelectorAll('#known-options .fact')];
  const selected = buttons.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent);
  if (isKnownSelectionCorrect(q.known, selected)) {
    showHint('Yes! Those are the facts we know. ✔', [], 'right');
    advance();
    return;
  }
  q.wrong += 1;
  if (q.wrong === 1) {
    noteMistake();
    showHint('Not quite. Tap every fact the story gives, and nothing else. (Ketuk semua yang ada di cerita, jangan yang lain.)', [], 'retry');
  } else {
    for (const b of buttons) {
      b.disabled = true;
      b.setAttribute('aria-pressed', b.dataset.kind === 'other' ? 'false' : 'true');
      if (b.dataset.kind !== 'other') b.classList.add('right');
      else b.classList.add('tried');
    }
    $('#known-check').hidden = true;
    showHint('These are the facts from the story. (Ini yang diketahui.)', [], 'reveal');
    waitForContinue();
  }
}

// --- 4 Answer (keypad) ---
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

function renderAnswer() {
  const ex = current();
  q.input = '';
  $('#answer-prefix').textContent = ex.unit === '$' ? '$' : '';
  $('#answer-unit').textContent = ex.unit === '$' ? '' : ex.unit;
  $('#check-btn').hidden = false;
  for (const b of document.querySelectorAll('#keypad .key')) b.disabled = false;
  renderInput();
}

function finishProblem() {
  q.answered = true;
  for (const b of document.querySelectorAll('#keypad .key')) b.disabled = true;
  $('#check-btn').hidden = true;
  $('#next-btn').hidden = false;
}

function checkAnswer() {
  if (q.answered) return;
  const ex = current();
  if (parseAnswer(q.input) === null) {
    // Belum ada angka yang bisa dibaca: bukan percobaan, tidak dicatat.
    const h = hintFor(chapter, ex, q.input, 1);
    showHint(q.input === '' ? 'Type your answer with the keypad. (Isi jawabanmu dulu.)' : h.title, [], 'unreadable');
    return;
  }
  if (isCorrect(ex, q.input)) {
    noteSolvedCleanly();
    showHint(`Yes! ${formatAnswer(ex)} ✔`, [], 'right');
    finishProblem();
    return;
  }
  q.wrong += 1;
  if (q.wrong === 1) noteMistake();
  const h = hintFor(chapter, ex, q.input, q.wrong);
  showHint(h.title, h.items, h.kind);
  if (h.kind === 'reveal') {
    q.input = String(ex.answer);
    renderInput();
    finishProblem();
  } else {
    q.input = ''; // kosongkan untuk percobaan berikutnya
    renderInput();
  }
}

/* ---------- Soal ---------- */

function renderQuestion() {
  const ex = current();
  Object.assign(q, { steps: stepsFor(ex), step: 0, wrong: 0, recorded: false, mistakes: new Set(), answered: false, input: '' });
  $('#level-tag').textContent = `Level ${ex.level}`;
  renderStory(ex);
  renderPie(ex);
  $('#hint-box').hidden = true;
  showScreen('screen-question');
  showStep();
}

function next() {
  if (q.i + 1 < questions.length) {
    q.i += 1;
    renderQuestion();
  } else {
    $('#done-summary').textContent = `You solved ${clean} of ${questions.length} without a mistake.`;
    showScreen('screen-done');
  }
}

$('#known-check').addEventListener('click', checkKnown);
$('#check-btn').addEventListener('click', checkAnswer);
$('#continue-btn').addEventListener('click', advance);
$('#next-btn').addEventListener('click', next);

async function load() {
  const data = await loadSyllabus();
  chapter = chapterFromUrl(data, location.search);
  if (!chapter) {
    leavePage('math.html'); // bab tidak dikenal / belum punya soal: tidak ada layar buntu
    return;
  }
  $('#page-title').textContent = `${chapter.title}`;
  document.title = `${chapter.title} · Belajar`;
  questions = pickQuestions(chapter.examples, state.math);
  buildKeypad();
  renderQuestion();
}

load().catch(ignoreIfLeaving);
