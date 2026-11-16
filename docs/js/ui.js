// Bagian UI bersama semua halaman: dialog, catatan kecil, service worker + banner update, Mode Papi.

import { APP_VERSION } from './version.js';
import { readLog, clearLog } from './errors.js';
import { exportJSON, resetState } from './storage.js';

export const $ = (sel, root = document) => root.querySelector(sel);

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}

/* ---------- Dialog buatan sendiri (pengganti alert/confirm) ---------- */

/**
 * @param {{title:string, body?:Node|string, buttons:{label:string, value:any, kind?:string}[]}} opts
 * @returns {Promise<any>} value tombol yang ditekan (null jika ditutup)
 */
export function showDialog({ title, body, buttons }) {
  return new Promise((resolve) => {
    const dlg = el('dialog', { class: 'dialog', 'aria-labelledby': 'dlg-title' });
    const actions = el('div', { class: 'dialog-actions' });
    for (const b of buttons) {
      actions.append(
        el('button', {
          class: `btn ${b.kind || ''}`,
          type: 'button',
          text: b.label,
          onclick: () => {
            dlg.close();
            resolve(b.value);
          },
        }),
      );
    }
    dlg.append(
      el('h2', { id: 'dlg-title', text: title }),
      typeof body === 'string' ? el('p', { text: body }) : body || '',
      actions,
    );
    dlg.addEventListener('cancel', () => resolve(null));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  });
}

/** Pesan kecil sementara di bawah layar. */
export function toast(message, ms = 2200) {
  let box = $('#toast');
  if (!box) {
    box = el('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(box);
  }
  box.textContent = message;
  box.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => box.classList.remove('show'), ms);
}

/* ---------- Service worker + banner "Update tersedia" ---------- */

function showUpdateBanner(worker) {
  if ($('#update-banner')) return;
  const banner = el('button', {
    id: 'update-banner',
    class: 'update-banner',
    type: 'button',
    text: 'Update ready — tap to reload (Update tersedia — ketuk untuk memuat ulang)',
    onclick: () => {
      reloadOnChange = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    },
  });
  document.body.append(banner);
}

let reloadOnChange = false;

export function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Reload hanya jika anak sendiri mengetuk banner, tidak pernah paksa di tengah latihan.
    if (reloadOnChange) location.reload();
  });
  navigator.serviceWorker
    .register('./sw.js', { scope: './' })
    .then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(nw);
        });
      });
    })
    .catch((e) => console.warn('SW registration failed', e));
}

/* ---------- Mode Papi: tekan lama logo 3 detik ---------- */

const HOLD_MS = 3000;

function attachLongPress(target, onHold) {
  let timer = null;
  const cancel = () => {
    clearTimeout(timer);
    timer = null;
    target.classList.remove('holding');
  };
  target.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    target.classList.add('holding');
    timer = setTimeout(() => {
      cancel();
      onHold();
    }, HOLD_MS);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) target.addEventListener(ev, cancel);
  target.addEventListener('contextmenu', (e) => e.preventDefault());
}

async function exportProgress() {
  const json = exportJSON({ appVersion: APP_VERSION, errorLog: readLog() });
  const name = `belajar-progress-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([json], { type: 'application/json' });
  // iPad: lembar Share (Save to Files, AirDrop) lebih andal daripada download di mode Home Screen.
  try {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return; // dibatalkan pengguna
  }
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function openPapiMode() {
  const log = readLog();
  const logBox = el('div', { class: 'papi-log' });
  if (!log.length) logBox.append(el('p', { text: 'No errors logged. (Tidak ada error.)' }));
  for (const item of log.slice().reverse()) {
    logBox.append(
      el('details', {}, el('summary', { text: `${item.at.slice(0, 16).replace('T', ' ')} · ${item.page} · ${item.message}` }), el('pre', { text: item.detail })),
    );
  }
  const body = el('div', {}, el('p', { class: 'muted', text: `Version ${APP_VERSION}` }), el('h3', { text: `Error log (${log.length})` }), logBox);

  const choice = await showDialog({
    title: 'Mode Papi',
    body,
    buttons: [
      { label: 'Export progress', value: 'export', kind: 'primary' },
      { label: 'Clear log', value: 'clearlog' },
      { label: 'Reset data…', value: 'reset', kind: 'danger' },
      { label: 'Close', value: null },
    ],
  });
  if (choice === 'export') await exportProgress();
  if (choice === 'clearlog') {
    clearLog();
    toast('Log cleared');
  }
  if (choice === 'reset') {
    const sure = await showDialog({
      title: 'Reset all progress?',
      body: 'Semua progres flashcard di iPad ini akan dihapus. Export dulu jika perlu.',
      buttons: [
        { label: 'Cancel', value: false, kind: 'primary' },
        { label: 'Yes, reset', value: true, kind: 'danger' },
      ],
    });
    if (sure) {
      resetState();
      location.reload();
    }
  }
}

/* ---------- Inisialisasi halaman ---------- */

export function initPage() {
  const logo = $('#logo');
  if (logo) attachLongPress(logo, openPapiMode);
  registerSW();
}
