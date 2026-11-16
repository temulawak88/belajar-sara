// Susun kalimat: potongan kata diacak; anak menyusunnya dengan TAP berurutan atau DRAG.
//
// - Tap potongan di bawah  -> pindah ke akhir kalimat. Tap potongan di kalimat -> kembali ke bawah.
// - Drag (jari, Pencil, mouse) -> taruh di posisi mana pun dalam kalimat, atau tarik keluar untuk mengembalikan.
// - Semua lewat Pointer Events (pointerdown/move/up/cancel) + setPointerCapture; potongan `touch-action: none`.
// - Undo / Clear selalu ada. "Check" menilai; hanya percobaan PERTAMA yang dicatat.
// - Salah ke-1: arti kalimat + potongan yang posisinya sudah benar ditandai. Salah ke-2: jawaban ditunjukkan.

import { ignoreIfLeaving, leavePage } from './errors.js';
import { initPage, $, el, toast } from './ui.js';
import { loadState, saveState } from './storage.js';
import { todayStr } from './leitner.js';
import { isCorrectOrder, pickExercises, recordSentence, shuffledChunkOrder } from './lessons.js';
import { openLesson, showScreen } from './lessonpage.js';
import { initSpeech, speak } from './speech.js';

initPage();
initSpeech();

const DRAG_THRESHOLD = 8; // px: di bawah ini dianggap tap

let state = loadState();
let questions = [];
const q = { i: 0, tries: 0, answered: false, firstRight: 0 };
// Susunan saat ini: indeks potongan (ke ex.chunks) di kalimat dan di bank, plus riwayat untuk Undo.
const board = { answer: [], bank: [], history: [], hint: false };
let drag = null;

const current = () => questions[q.i];
const answerLine = () => $('#answer-line');

/* ---------- Susunan ---------- */

function snapshot() {
  board.history.push({ answer: [...board.answer], bank: [...board.bank] });
}

function place(chunk, index = board.answer.length) {
  snapshot();
  board.answer = board.answer.filter((c) => c !== chunk);
  board.bank = board.bank.filter((c) => c !== chunk);
  board.answer.splice(Math.min(index, board.answer.length), 0, chunk);
  render();
}

function unplace(chunk) {
  if (!board.answer.includes(chunk)) return;
  snapshot();
  board.answer = board.answer.filter((c) => c !== chunk);
  board.bank.push(chunk);
  render();
}

function undo() {
  const prev = board.history.pop();
  if (!prev) return;
  Object.assign(board, prev);
  render();
}

function clearAll() {
  if (!board.answer.length) return;
  snapshot();
  board.bank = [...board.bank, ...board.answer];
  board.answer = [];
  render();
}

/* ---------- Tampilan ---------- */

function chunkButton(chunk, where) {
  const ex = current();
  const btn = el('button', { class: 'btn chunk', type: 'button', 'data-chunk': chunk, 'data-where': where, text: ex.chunks[chunk] });
  // Petunjuk setelah salah pertama: potongan yang sudah di posisi benar ditandai.
  if (board.hint && where === 'answer' && board.answer.indexOf(chunk) === chunk) btn.classList.add('in-place');
  if (q.answered) btn.disabled = true;
  else {
    btn.addEventListener('pointerdown', onPointerDown);
    btn.addEventListener('pointermove', onPointerMove);
    btn.addEventListener('pointerup', onPointerUp);
    btn.addEventListener('pointercancel', onPointerCancel);
    // Keyboard (Enter/Spasi) menghasilkan click tanpa pointer: perlakukan sebagai tap.
    btn.addEventListener('click', (e) => {
      if (e.detail === 0) toggle(chunk);
    });
  }
  return btn;
}

function render() {
  const line = answerLine();
  line.replaceChildren(...board.answer.map((c) => chunkButton(c, 'answer')));
  line.classList.toggle('empty', board.answer.length === 0);
  $('#bank').replaceChildren(...board.bank.map((c) => chunkButton(c, 'bank')));
  $('#undo-btn').disabled = q.answered || board.history.length === 0;
  $('#clear-btn').disabled = q.answered || board.answer.length === 0;
  // "Check" baru aktif setelah semua potongan dipakai.
  $('#check-btn').disabled = board.bank.length > 0;
  $('#check-btn').hidden = q.answered;
  $('#next-btn').hidden = !q.answered;
}

function toggle(chunk) {
  if (q.answered) return;
  if (board.answer.includes(chunk)) unplace(chunk);
  else place(chunk);
}

/* ---------- Tap & drag (Pointer Events) ---------- */

function insertionIndex(x, y, skip) {
  // Posisi sisip di kalimat (mendukung baris yang melipat): sebelum potongan pertama yang
  // berada di baris bawah pointer, atau di baris yang sama dengan titik tengah di kanan pointer.
  const items = [...answerLine().querySelectorAll('.chunk')].filter((b) => b !== skip);
  for (let i = 0; i < items.length; i++) {
    const r = items[i].getBoundingClientRect();
    if (y < r.top || (y <= r.bottom && x < r.left + r.width / 2)) return i;
  }
  return items.length;
}

function overAnswer(x, y) {
  const r = answerLine().getBoundingClientRect();
  const pad = 24; // toleransi agar mudah dijatuhkan dengan jari
  return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
}

function clearMarker() {
  answerLine().querySelector('.drop-marker')?.remove();
  answerLine().classList.remove('drop-target');
}

function onPointerDown(e) {
  if (q.answered || drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const btn = e.currentTarget;
  drag = { btn, id: e.pointerId, chunk: Number(btn.dataset.chunk), x0: e.clientX, y0: e.clientY, moving: false };
  try {
    btn.setPointerCapture(e.pointerId);
  } catch {
    /* event sintetis di tes tidak punya pointer aktif */
  }
}

function onPointerMove(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x0;
  const dy = e.clientY - drag.y0;
  if (!drag.moving && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
  drag.moving = true;
  e.preventDefault();
  drag.btn.classList.add('dragging');
  drag.btn.style.transform = `translate(${dx}px, ${dy}px) scale(1.05)`;
  clearMarker();
  if (overAnswer(e.clientX, e.clientY)) {
    const line = answerLine();
    line.classList.add('drop-target');
    const items = [...line.querySelectorAll('.chunk')].filter((b) => b !== drag.btn);
    const idx = insertionIndex(e.clientX, e.clientY, drag.btn);
    line.insertBefore(el('span', { class: 'drop-marker', 'aria-hidden': 'true' }), items[idx] || null);
  }
}

function endDrag() {
  if (!drag) return null;
  const d = drag;
  drag = null;
  clearMarker();
  d.btn.classList.remove('dragging');
  d.btn.style.transform = '';
  try {
    d.btn.releasePointerCapture(d.id);
  } catch {
    /* sudah dilepas */
  }
  return d;
}

function onPointerUp(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const wasOver = overAnswer(e.clientX, e.clientY);
  const index = wasOver ? insertionIndex(e.clientX, e.clientY, drag.btn) : -1;
  const d = endDrag();
  if (!d.moving) toggle(d.chunk); // tap
  else if (wasOver) place(d.chunk, index);
  else unplace(d.chunk); // dijatuhkan di luar kalimat -> kembali ke bank
}

function onPointerCancel(e) {
  if (drag && e.pointerId === drag.id) endDrag(); // dibatalkan sistem: susunan tidak berubah
}

/* ---------- Soal ---------- */

function renderQuestion() {
  Object.assign(q, { tries: 0, answered: false });
  const ex = current();
  Object.assign(board, { answer: [], bank: shuffledChunkOrder(ex), history: [], hint: false });
  $('#q-hanzi').textContent = ex.answer;
  $('#q-pinyin').textContent = ex.pinyin;
  $('#q-arti').textContent = ex.arti;
  $('#q-arti-hint').hidden = true;
  $('#reveal').hidden = true;
  $('#speak-btn').hidden = true;
  $('#feedback').textContent = 'Tap or drag the pieces to build the sentence. (Ketuk atau geser potongannya.)';
  showScreen('screen-question', `${q.i + 1} / ${questions.length}`);
  render();
}

function finish(right) {
  const ex = current();
  q.answered = true;
  if (!right) {
    // Tunjukkan susunan yang benar.
    board.answer = ex.chunks.map((_, i) => i);
    board.bank = [];
  }
  board.hint = false;
  render();
  answerLine().classList.add(right ? 'right' : 'shown');
  $('#q-arti-hint').hidden = true;
  $('#reveal').hidden = false;
  $('#speak-btn').hidden = false;
  speak(ex.answer); // dipicu dari tap "Check"
}

function check() {
  if (q.answered || board.bank.length) return;
  const ex = current();
  const right = isCorrectOrder(ex, board.answer.map((c) => ex.chunks[c]));
  q.tries += 1;
  if (q.tries === 1) {
    state.sentences = recordSentence(state.sentences, ex.id, 'order', right, todayStr());
    if (!saveState(state)) toast('Could not save progress (storage full?)', 3500);
    if (right) q.firstRight += 1;
  }
  if (right) {
    $('#feedback').textContent = 'Yes! ✔';
    finish(true);
  } else if (q.tries === 1) {
    board.hint = true;
    board.history = [];
    $('#q-arti-hint').textContent = `It means: “${ex.arti}”`;
    $('#q-arti-hint').hidden = false;
    $('#feedback').textContent = 'Not quite. The green pieces are in the right place. Try again. (Yang hijau sudah benar, coba lagi.)';
    render();
  } else {
    $('#feedback').textContent = "Here is the sentence. We'll practise it again. (Tidak apa-apa!)";
    finish(false);
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

$('#undo-btn').addEventListener('click', undo);
$('#clear-btn').addEventListener('click', clearAll);
$('#check-btn').addEventListener('click', check);
$('#next-btn').addEventListener('click', next);
$('#speak-btn').addEventListener('click', () => speak(current().answer));

async function load() {
  const opened = await openLesson();
  if (!opened) return;
  const orders = opened.lesson.exercises.filter((e) => e.type === 'order');
  questions = pickExercises(orders, state.sentences, 'order');
  if (!questions.length) {
    leavePage(`lesson.html?n=${opened.n}`);
    return;
  }
  renderQuestion();
}

load().catch(ignoreIfLeaving);
