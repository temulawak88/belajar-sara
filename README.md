# belajar-sara

Web app belajar untuk iPad (PWA statis, tanpa build step). Aturan proyek: lihat [CLAUDE.md](CLAUDE.md).

App ada di `docs/` dan ditayangkan GitHub Pages (branch `main`, folder `/docs`).

## Status
- **Iterasi 1:** kerangka PWA (menu utama, manifest, service worker offline, banner update,
  log error + layar "Oops", Mode Papi) dan flashcard Mandarin (Leitner 5 kotak, suara `zh-CN`).
  Konten sementara: 20 kata HSK 1 untuk tes.
- **Iterasi 2:** latihan menulis hanzi (`write.html`) dengan Hanzi Writer: Watch → Trace → Write,
  3 karakter per sesi dari kata yang sudah dipelajari di flashcard. Input lewat canvas sendiri
  (Pointer Events, tekanan Apple Pencil, palm rejection, Undo/Clear); Hanzi Writer menilai goresannya.
- **Iterasi 3:** latihan nada (`tone.html`): dengar satu karakter → pilih nada 1–4 (maks 10 soal).
  Karakter diucapkan sendirian, jadi sandhi nada (你好 = ní hǎo) tidak membingungkan; nada netral
  dilewati, 一/不 memakai nada asli. Salah pertama = petunjuk + dengar lagi; salah kedua = jawaban ditunjukkan.
- **Iterasi 4:** kosakata lengkap HSK 1 + HSK 2 (HSK 2.0 revisi 2012, dasar buku *HSK Standard Course*):
  303 kartu, HSK 1 dulu lalu HSK 2, per tema. Karakter berbacaan ganda ditandai `no_tone`.

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
Validator juga memastikan pinyin setiap kata bisa dipecah menjadi satu suku kata per hanzi
(dibutuhkan latihan nada). Tulis pinyin baku tanpa spasi, dengan apostrof sebelum suku kata
yang dimulai a/o/e di tengah kata (mis. `nǚ'ér`, `Xī'ān`).

Field opsional per kata: `no_tone` = daftar karakter yang **tidak** dipakai di latihan nada karena
punya lebih dari satu bacaan (mis. `"no_tone": ["觉"]` untuk 睡觉 shuìjiào / 觉得 juéde). Diucapkan
sendirian, suara iPad bisa memilih bacaan yang lain.

Sumber daftar kata: HSK 2.0 level 1–2 revisi 2012 (dicek dengan paket npm `@leonsilicon/hsk2.0`);
pinyin dicek silang dengan paket `hsk-words`. Arti Inggris/Indonesia ditulis sendiri — **perlu direview**.

Data goresan Hanzi Writer disimpan lokal (agar offline) di `docs/vendor/`. Setelah menambah kata
dengan karakter baru:
```bash
npm install
python3 tools/sync_hanzi_data.py
python3 tools/validate_vocab.py
```
Versi `hanzi-writer` (MIT) dan `hanzi-writer-data` (Arphic Public License) dikunci di `package.json`;
lisensinya ikut disalin ke `docs/vendor/`.

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

### Latihan menulis (iterasi 2)
7. Mandarin → ✍️ Writing practice → Start. Langkah Watch: animasi urutan goresan, "Watch again" bisa diulang.
8. Trace dengan **Apple Pencil**: garis lebih tebal saat ditekan kuat, tipis saat ringan (tetap rapi).
   Letakkan telapak tangan di layar sambil menulis: tidak boleh muncul coretan dari telapak.
9. Trace dengan **jari** (tanpa Pencil beberapa detik): tetap bisa menulis, tebal garis tetap.
10. Sengaja salah dua kali di satu goresan → petunjuk biru muncul. Undo dan Clear berfungsi.
11. Arahkan Pencil di atas kotak tanpa menyentuh → titik biru kecil mengikuti ujung pena (opsional).
12. Putar iPad di tengah menulis: kotak menyesuaikan ukuran dan goresan yang sudah benar tetap ada.
13. Mode pesawat → latihan menulis tetap jalan.

### Latihan nada (iterasi 3)
14. Mandarin → 🎵 Tone practice → Start: karakter langsung diucapkan, "Listen again" mengulang.
15. **Dengarkan baik-baik apakah suara iPad mengucapkan nada yang benar** untuk setiap karakter
    (mis. 好 = hǎo, 中 = zhōng). Jika ada karakter yang dibaca dengan nada lain, catat — itu perlu dikeluarkan dari latihan.
16. Pilih nada salah sekali → petunjuk + suara diputar lagi; salah lagi → jawaban benar ditandai hijau.
17. Tanpa suara Mandarin terpasang: muncul penjelasan dan tombol Start nonaktif; tombol Back/Home tetap ada.

### Kosakata lengkap (iterasi 4)
18. Progres flashcard lama tetap ada setelah update (20 kata awal memakai id yang sama).
19. Latihan menulis untuk karakter baru (mis. 爱, 飞机) tampil dan bisa dinilai; juga dalam mode pesawat.
20. Review arti di `content/hsk2/vocab.json` (terutama kata partikel seperti 了, 着, 过, 得).
