// Bantuan bersama untuk tes.
const fs = require('fs');
const path = require('path');

const KEY = 'belajar-sarah:progress';
const LESSONS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'content', 'hsk2', 'lessons.json'), 'utf8'));

/** Web Speech tiruan: punya suara zh-CN (atau tidak), mencatat setiap ucapan ke window.__spoken. */
async function mockSpeech(page, { withVoice = true } = {}) {
  await page.addInitScript((withVoice) => {
    const voices = withVoice ? [{ lang: 'zh-CN', name: 'Tingting', localService: true }] : [];
    window.__spoken = [];
    class Utterance {
      constructor(text) {
        this.text = text;
      }
    }
    const synth = {
      getVoices: () => voices,
      speak: (u) => window.__spoken.push({ text: u.text, lang: u.lang, voice: u.voice?.name }),
      cancel: () => {},
      addEventListener: () => {},
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utterance, configurable: true });
  }, withVoice);
}

/**
 * Error JavaScript di halaman menggagalkan tes. Satu pengecualian: bila tes pindah halaman saat
 * service worker masih didaftarkan, WebKit membatalkan unduhan sw.js dan melaporkannya sebagai
 * "Cannot load …/sw.js due to access control checks". App sudah menangani penolakan register()
 * (ui.js › registerSW), jadi itu bukan error app — hanya tes yang sesekali gagal acak.
 */
function failOnPageError(page) {
  page.on('pageerror', (e) => {
    if (/Cannot load .*sw\.js due to access control checks/.test(e.message)) return;
    throw e;
  });
}

const readProgress = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
const spoken = (page) => page.evaluate(() => window.__spoken);
const lesson = (n) => LESSONS.lessons[n - 1];
const fullSentence = (ex) => (ex.type === 'fill' ? ex.sentence.replace('___', ex.answer) : ex.answer);

/**
 * Semua file di daftar ASSETS sw.js harus ada di cache service worker yang aktif.
 * Dipakai untuk WebKit: Playwright tidak bisa bernavigasi offline lewat service worker di WebKit
 * ("WebKit encountered an internal error"), jadi di sana yang dicek adalah isi cache-nya.
 */
async function expectAllAssetsCached(page) {
  const missing = await page.evaluate(async () => {
    const src = await (await fetch('sw.js')).text();
    const cacheName = src.match(/CACHE_NAME = '([^']+)'/)[1];
    const assets = [...src.matchAll(/^\s*'([^']+)',$/gm)].map((m) => m[1]);
    const cache = await caches.open(cacheName);
    const out = [];
    for (const a of assets) if (!(await cache.match(new URL(a, location.href).href, { ignoreSearch: true }))) out.push(a);
    return { missing: out, count: assets.length, keys: (await caches.keys()).filter((k) => k.startsWith('belajar-')) };
  });
  if (missing.count < 30) throw new Error(`daftar ASSETS terlalu pendek: ${missing.count}`);
  return missing;
}

module.exports = { failOnPageError, expectAllAssetsCached, KEY, LESSONS, mockSpeech, readProgress, spoken, lesson, fullSentence };
