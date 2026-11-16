// Suara Mandarin lewat Web Speech API.
// Safari iPad: speak() HARUS dipanggil langsung dari handler tap (user gesture).
// Daftar suara dimuat asinkron -> tunggu event 'voiceschanged'.

const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
let voice = null;
let voicesLoaded = false;
let onStatus = () => {};
// Jika perangkat tidak punya suara sama sekali, 'voiceschanged' bisa tidak pernah datang.
const VOICE_WAIT_MS = 1500;

function pickVoice(voices) {
  const norm = (l) => (l || '').replace('_', '-').toLowerCase();
  const zhCN = voices.filter((v) => norm(v.lang) === 'zh-cn');
  // Suara Mandarin bawaan iPad bernama "Tingting" / "Ting-Ting"; utamakan itu.
  return (
    zhCN.find((v) => /ting/i.test(v.name)) ||
    zhCN.find((v) => v.localService) ||
    zhCN[0] ||
    null
  );
}

function refresh() {
  if (!synth) return;
  const voices = synth.getVoices();
  if (voices.length) {
    voicesLoaded = true;
    voice = pickVoice(voices);
  }
  onStatus(speechStatus());
}

/** @param {(status:string)=>void} [callback] dipanggil setiap status suara berubah/diketahui */
export function initSpeech(callback) {
  if (callback) onStatus = callback;
  if (!synth) {
    onStatus(speechStatus());
    return;
  }
  refresh();
  synth.addEventListener?.('voiceschanged', refresh);
  setTimeout(() => {
    voicesLoaded = true;
    refresh();
  }, VOICE_WAIT_MS);
}

/**
 * 'ok'       : ada suara zh-CN
 * 'loading'  : daftar suara belum dimuat (masih dicoba bicara dengan lang zh-CN)
 * 'no-voice' : perangkat tidak punya suara zh-CN
 * 'unsupported': browser tidak punya Web Speech
 */
export function speechStatus() {
  if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') return 'unsupported';
  if (voice) return 'ok';
  return voicesLoaded ? 'no-voice' : 'loading';
}

/** Ucapkan teks. Mengembalikan status (lihat speechStatus). Tidak pernah melempar. */
export function speak(text) {
  const status = speechStatus();
  if (status === 'unsupported' || status === 'no-voice') return status;
  try {
    synth.cancel(); // hentikan suara sebelumnya; juga mencegah antrean macet di Safari
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    if (voice) u.voice = voice;
    u.rate = 0.8; // sedikit lebih lambat untuk belajar
    synth.speak(u);
  } catch (e) {
    console.warn('speak failed', e);
    return 'unsupported';
  }
  return status;
}
