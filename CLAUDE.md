# Project: Belajar Sarah (web app belajar untuk iPad)

## Konteks
- Pengguna: anak kelas 6 SD (P6), dipakai di iPad (Safari, layar sentuh, kadang Apple Pencil).
- Orang tua (developer): menjalankan Claude Code di laptop Windows 11 + Ubuntu (WSL).
- Dua mata pelajaran:
  1. **Matematika** — buku *My Pals Are Here! Maths 6B* (3rd Ed., Marshall Cavendish, kurikulum Singapura).
     Kelemahan: soal cerita (memahami soal, logika, bahasa Inggris). Metode yang dilatih: **bar model**.
  2. **Mandarin** — buku *Panduan Persiapan HSK 2* (HSK Standard Course 标准教程 2). Target: kosakata HSK 2 (300 kata kumulatif).

## Prinsip
- Mulai kecil, iterasi kecil. Setiap iterasi harus bisa langsung dicoba di iPad.
- Sesi belajar pendek (10–15 menit). Jangan bikin fitur yang mendorong pemakaian lama.
- Tanpa login, tanpa iklan, tanpa link keluar. Tidak menyimpan data pribadi selain nama panggilan.
- Bahasa antarmuka: Inggris sederhana (sesuai sekolah), dengan bantuan arti Bahasa Indonesia.

## Arsitektur (fase 1)
- **Static web app**: HTML + CSS + JavaScript murni (tanpa framework, tanpa build step).
- **Konten = file JSON**. Dibuat/diubah lewat Claude Code, direview orang tua.
  - Matematika: `docs/content/math/syllabus.json` (langsung di `docs/` agar ikut tayang di GitHub Pages).
  - Mandarin: pelajaran di `docs/content/hsk2/lessons.json` (sumber resmi, langsung di `docs/`).
    Daftar kata HSK 1–2 di `content/hsk2/vocab.json` (salinannya di `docs/content/hsk2/`, `validate_vocab.py --sync`)
    tetap dipakai sebagai dasar kosakata HSK 1, data goresan, dan penanda `no_tone`.
- **Progres disimpan di iPad** (IndexedDB/localStorage), dengan tombol *Export* (JSON) untuk backup/laporan.
- **PWA**: ada `manifest.json` + service worker agar bisa "Add to Home Screen" dan jalan offline.
- **Python** hanya untuk tooling di laptop: validasi konten, cek jawaban matematika, server lokal.
- Hosting: **GitHub Pages** dari branch `main`, folder `/docs`. iPad membuka
  `https://<username>.github.io/<nama-repo>/`. Semua path di app harus **relatif** (tanpa `/` di depan)
  karena app berada di sub-path, termasuk `scope` dan `start_url` di manifest serta path di service worker.
- Folder `docs/` wajib berisi file kosong `.nojekyll` agar GitHub Pages tidak memproses app dengan Jekyll. Jangan dihapus.
- Repo publik: jangan masukkan nama lengkap anak, nama sekolah, foto, atau data pribadi lain ke repo.

## Struktur folder
```
docs/                 # = app yang ditayangkan GitHub Pages
  index.html          # menu utama: Math, Mandarin, Misi Harian
  math.html
  hanzi.html
  css/style.css
  js/                 # satu file per modul, ES modules
  manifest.json
  sw.js
  content/
    math/syllabus.json  # SUMBER RESMI matematika: bab, pola soal, contoh, glosarium, kesalahan umum
    hsk2/lessons.json   # SUMBER RESMI Mandarin: pelajaran 1–11, kosakata, tata bahasa, kalimat latihan
    hsk2/vocab.json     # salinan kosakata (jangan diedit langsung)
content/
  hsk2/vocab.json     # sumber kosakata HSK 1–2
tools/
  validate_math.py    # validasi syllabus.json + hitung ulang semua jawaban, gagal jika beda
  validate_vocab.py
  validate_lessons.py # cek setiap karakter kalimat latihan ada di HSK 1 + pelajaran ≤ N
```

## Aturan konten matematika (WAJIB)
- **`docs/content/math/syllabus.json` adalah sumber resmi** daftar bab, pola soal (`patterns`), glosarium
  (`glossary`, per bab) dan kesalahan umum (`common_mistakes`, per bab). Soal baru mengikuti bab & pola di sana;
  jangan membuat daftar bab/pola/glosarium terpisah di file lain.
- **Soal harus buatan sendiri**, bukan salinan soal dari buku *My Pals Are Here!* (hak cipta). Dari buku hanya
  diambil peta bab dan jenis soalnya; cerita, nama, dan angka dibuat sendiri.
- Setiap soal (contoh di `examples`) punya: `id` (diawali nomor bab, mis. `7-1`), `pattern`, `level`,
  `model`, `story` (Inggris), `known`, `asked`, `answer`, `unit`, `answer_expr` (ekspresi Python yang
  menghasilkan jawaban). Opsional: `steps[]`, `trap_answer` + `trap_note` (jawaban jebakan + penjelasannya).
- Field `bar_model` **diganti** `model` dengan tipe `bar | journey | tank | pie | none`, sesuai `model_types`
  di syllabus. Model `pie` wajib punya `pie_data`: tiap sektor berisi `fraction` (`"a/b"`) atau `percent`
  (boleh satu sektor `percent: null` = sisanya), dan jumlah semua sektor harus tepat 1.
- **Jawaban tidak boleh dipercaya begitu saja**: `tools/validate_math.py` menghitung `answer_expr` dan harus sama dengan `answer`
  (juga mengecek pola, level, model, pie = 1, dan `common_mistakes`). Jalankan validator setiap kali menambah/mengubah soal,
  bersama tesnya: `python3 -m unittest tools/test_validate_math.py`.
- Angka dibuat "ramah" (hasil bulat atau pecahan sederhana) sesuai level P6.
- Gaya soal mengikuti soal cerita Singapura P6 (multi-langkah), mulai dari yang 2 langkah.

## Alur soal cerita (UI)
1. Baca cerita (kata sulit bisa di-tap → arti).
2. Tap: apa yang **diketahui**, apa yang **ditanya**.
3. **Pilih model** yang cocok dari 3 pilihan (SVG), sesuai `model` soal: `bar`, `journey`, `tank`, `pie`
   (atau lewati jika `none`). *(Fase 2: susun bar model sendiri.)*
4. Hitung dan isi jawaban.
5. Kalau salah, catat jenis kesalahan: `comprehension` / `model` / `calculation`.
6. **Petunjuk saat salah** memakai `common_mistakes` bab itu (logika di `docs/js/mathhints.js`):
   salah ke-1 → `trap_note` jika jawabannya = `trap_answer`, selain itu daftar `common_mistakes` ("Cek lagi");
   salah ke-2 → apa yang diketahui (`known`); salah ke-3 → jawaban ditunjukkan dengan ramah.

## Mandarin (HSK 2)
- **Berbasis pelajaran**: anak memilih Pelajaran 1–11 (12–15 menyusul) dari buku *HSK Standard Course 2*.
  **`docs/content/hsk2/lessons.json` adalah sumber resmi** judul, kosakata, tata bahasa, dan kalimat latihan per pelajaran.
  Status pelajaran (`current` / `review` / `upcoming`) diisi orang tua. Tidak ada lagi flashcard HSK 1 terpisah:
  kosakata HSK 1 dianggap sudah dikuasai dan menjadi dasar kalimat.
- Setiap pelajaran punya 4 latihan:
  1. **Kartu kata** — kata pelajaran itu: hanzi → pinyin → arti, suara Web Speech `zh-CN`, Leitner 5 kotak.
     Kata `supplementary` (bertanda * di buku) muncul lebih jarang.
  2. **Isi bagian kosong** — pilihan ganda (`fill`), melatih tata bahasa.
  3. **Susun kalimat** — potongan (`chunks`) diacak; bisa di-drag (Pointer Events) atau di-tap berurutan.
     Urutan lain yang juga benar dicatat di `also_accept`.
  4. **Dengar → pilih arti** — kalimat dari `fill`/`order` dibacakan (TTS); pengecoh = arti kalimat lain di pelajaran yang sama.
- **Aturan kalimat latihan (WAJIB)**:
  - Buatan sendiri, bukan salinan teks buku.
  - Hanya boleh memakai karakter dari kosakata HSK 1 (`content/hsk2/vocab.json`, `hsk: 1`) + kosakata pelajaran 1
    sampai pelajaran itu — termasuk pilihan jawaban, potongan kalimat, dan `also_accept`.
  - `tools/validate_lessons.py` mengecek aturan ini (juga: potongan membentuk jawaban, jawaban ada di pilihan,
    jumlah suku kata pinyin = jumlah hanzi, arti tidak dobel). Jalankan bersama `python3 -m unittest tools/test_validate_lessons.py`.
  - Kalimat buatan Claude ditandai `"origin": "claude"` dan direview orang tua (tata bahasa & arti tidak bisa dicek otomatis).
- Latihan menulis dengan library Hanzi Writer (simpan datanya lokal agar bisa offline) dan latihan nada
  (dengar → pilih nada 1/2/3/4) memakai kata dari pelajaran yang dipilih.

## Catatan iPad
- Target sentuh minimal 44px, font besar, mode landscape dan portrait.
- Web Speech di Safari harus dipicu oleh tap (user gesture).
- Data web app bisa terhapus Safari jika tidak di-"Add to Home Screen" — selalu sediakan Export.

## UI/UX — aturan wajib (iPad Safari + Apple Pencil)

### Perangkat target
- **iPad Air 11" (M4)**, Safari / iPadOS terbaru. Performa bukan kendala; fokus ke rasa respons.
- Pencil yang dipakai: **Apple Pencil Pro** (punya tekanan, kemiringan, hover).
- Tekanan (`pressure`) dipakai untuk variasi ketebalan garis hanya di latihan menulis hanzi, dengan batas
  tebal min–maks agar tetap rapi. App tetap harus jalan normal dengan jari (nilai tekanan tetap).
- Hover Pencil (pointer `pen` bergerak tanpa menyentuh): opsional, mis. menampilkan titik bantu
  posisi ujung pena di kotak hanzi. Jangan jadikan syarat agar fitur berjalan.
- Fitur khusus Pencil Pro (squeeze, barrel roll, haptic) tidak bisa diakses dari web — jangan dirancang.

### Input sentuh & Pencil
- Pakai **Pointer Events** (`pointerdown/move/up/cancel`) untuk semua interaksi; jangan campur dengan mouse/touch events.
  - Pengecualian: library Hanzi Writer hanya mendengarkan mouse/touch events. Input anak tetap ditangkap dengan
    Pointer Events (`js/inkpad.js`); goresan yang sudah selesai diteruskan ke Hanzi Writer sebagai mouse event
    buatan (`js/write.js`) untuk dinilai. Jangan memakai mouse/touch events di tempat lain.
- Area menulis/menggambar (canvas): `touch-action: none`, `setPointerCapture`, tangani `pointercancel`.
- **Palm rejection**: saat Pencil terdeteksi (`pointerType === 'pen'`), canvas mengabaikan input jari.
- Garis halus: gambar di `requestAnimationFrame`, pakai `getCoalescedEvents()` jika tersedia,
  canvas diskalakan dengan `devicePixelRatio`, ukur ulang saat rotasi/resize. Selalu ada tombol **Undo** dan **Clear**.
- Tombol: `touch-action: manipulation` (hilangkan delay & zoom double-tap), target minimal **48px**, jarak antar tombol cukup.
- Area latihan: `-webkit-user-select: none; -webkit-touch-callout: none` (cegah seleksi teks / menu long-press tak sengaja).
- Efek hover hanya di `@media (hover: hover)` agar tidak "nyangkut" di layar sentuh.

### Input jawaban
- **Jangan pakai keyboard iOS** untuk jawaban matematika: buat **keypad angka sendiri** di layar
  (0–9, titik desimal, pecahan, hapus). Keyboard iOS menggeser layout dan memperlambat.
- Jawaban dinormalisasi sebelum dicek (spasi, `0.5` = `1/2` jika soal mengizinkan, satuan opsional).

### Layout
- Viewport: `width=device-width, initial-scale=1, viewport-fit=cover`; tinggi pakai `100dvh`, bukan `100vh`;
  hormati `env(safe-area-inset-*)`. Uji portrait dan landscape.
- Satu tugas per layar. Selalu ada tombol **Home/Back** — tidak boleh ada layar buntu.
- Jangan pakai `alert()/confirm()`; pakai dialog buatan sendiri.
- Font sistem; hanzi pakai `"PingFang SC", sans-serif`.

### Rasa "smooth"
- Semua konten & aset lokal → layar terbuka instan, tanpa spinner.
- Animasi hanya `transform`/`opacity`, 150–250ms; hormati `prefers-reduced-motion`.
- Umpan balik langsung untuk setiap tap (perubahan warna/scale ≤100ms).
- Salah jawab = ramah: petunjuk + coba lagi, tanpa suara/efek yang menghukum.

### Suara
- Web Speech hanya dipicu dari tap. Tunggu event `voiceschanged`, pilih suara `zh-CN`;
  jika tidak ada, tampilkan pesan kecil + tetap jalan tanpa suara.
  - Pengecualian: latihan yang intinya mendengar (latihan nada, dengar → pilih arti) tidak bisa jalan tanpa suara:
    tampilkan penjelasan cara memasang suara, nonaktifkan Start, dan tetap sediakan tombol Home/Back.

## Kualitas — mencegah error

### Data & progres
- Semua akses storage dibungkus `try/catch`; data punya `schemaVersion` + fungsi migrasi.
- Progres **disimpan setiap jawaban** (bukan di akhir sesi), jadi app tertutup tiba-tiba tidak kehilangan data.

### PWA / service worker (sumber bug paling sering)
- Nama cache memakai versi (`belajar-v1`, `v2`, …); naikkan versi setiap rilis; hapus cache lama saat `activate`.
- Saat ada versi baru: tampilkan banner "Update tersedia — ketuk untuk memuat ulang", jangan reload paksa di tengah latihan.

### Penanganan error
- `window.onerror` + `unhandledrejection`: catat ke log lokal (maks 50 entri) dan tampilkan layar ramah
  "Ups, coba lagi" dengan tombol kembali ke Home — app tidak boleh membeku.
- **Mode Papi** (tersembunyi, mis. tekan lama logo 3 detik): lihat log error, export progres, reset data.

### Testing (wajib sebelum iterasi dianggap selesai)
- Validator konten (`tools/validate_*.py`) lulus.
- Tes otomatis dengan **Playwright engine WebKit** + profil device iPad untuk alur utama
  (buka app → latihan → jawab benar/salah → progres tersimpan → reload → progres masih ada).
- Checklist manual di iPad asli: Pencil, rotasi layar, Add to Home Screen, offline (mode pesawat), suara.

## Cara kerja dengan Claude Code
- Dikerjakan lewat Claude Code cloud session (claude.ai/code): setiap tugas = satu branch.
  Setelah direview, branch di-merge ke `main` agar tampil di GitHub Pages.
- Satu fitur per iterasi; tunjukkan rencana singkat sebelum mengubah banyak file.
- Setelah perubahan konten: jalankan validator. Setelah perubahan UI: jelaskan cara mengetesnya di iPad.
- Jangan menambah dependency/framework tanpa alasan kuat.
