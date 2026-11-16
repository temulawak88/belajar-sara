# belajar-sara

Web app belajar untuk iPad (PWA statis, tanpa build step). Aturan proyek: lihat [CLAUDE.md](CLAUDE.md).

App ada di `docs/` dan ditayangkan GitHub Pages (branch `main`, folder `/docs`).

## Status
- **Iterasi 1:** kerangka PWA (menu utama, manifest, service worker offline, banner update,
  log error + layar "Oops", Mode Papi) dan flashcard Mandarin (Leitner 5 kotak, suara `zh-CN`).
  Konten sementara: 20 kata HSK 1 untuk tes.

## Menjalankan di laptop
```bash
npm run serve        # lalu buka http://localhost:4173/docs/
```
Server sengaja dijalankan dari root repo agar app berada di sub-path `/docs/`, seperti di GitHub Pages.

## Konten
Sumber kosakata: `content/hsk2/vocab.json`. Karena Pages hanya menayangkan `docs/`, app membaca
salinannya di `docs/content/hsk2/vocab.json`. Setelah mengubah kosakata:
```bash
python3 tools/validate_vocab.py --sync
```
Tanpa `--sync`, validator gagal jika salinan di `docs/` tidak sama dengan sumbernya.

## Tes otomatis (Playwright, WebKit + profil iPad)
```bash
npm install
npx playwright install --with-deps webkit
npm run test:webkit
```
`npm test` juga menjalankan project `chromium-ipad-fallback` (cadangan jika WebKit tidak bisa
dipasang; bukan pengganti Safari).

## Rilis baru
Naikkan `CACHE_NAME` di `docs/sw.js` **dan** `APP_VERSION` di `docs/js/version.js` (tes mengecek keduanya sama),
dan tambahkan file baru ke daftar `ASSETS` di `sw.js` (tes mengecek semua file `docs/` ada di daftar).

## Checklist manual di iPad
1. Buka `https://<username>.github.io/belajar-sara/` di Safari → menu muncul, Mandarin bisa dibuka.
2. Mandarin → Start → Show answer: pinyin + arti muncul dan suara Mandarin terdengar.
   Jika tidak ada suara: Settings › Accessibility › Spoken Content › Voices › Chinese (China mainland), unduh satu suara.
3. Jawab beberapa kartu (benar & salah) → tutup tab → buka lagi → angka di kotak tetap.
4. Rotasi portrait ↔ landscape di menu dan di kartu: tidak ada yang terpotong.
5. Share → Add to Home Screen → buka dari ikon → mode pesawat → app tetap jalan dan flashcard bisa dipakai.
6. Tekan lama logo 学 selama 3 detik → Mode Papi → Export progress (simpan ke Files).
