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

const readProgress = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
const spoken = (page) => page.evaluate(() => window.__spoken);
const lesson = (n) => LESSONS.lessons[n - 1];
const fullSentence = (ex) => (ex.type === 'fill' ? ex.sentence.replace('___', ex.answer) : ex.answer);

module.exports = { KEY, LESSONS, mockSpeech, readProgress, spoken, lesson, fullSentence };
