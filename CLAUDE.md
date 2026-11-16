# Project: Belajar Sarah (web app belajar untuk iPad)

## Konteks
- Pengguna: anak kelas 6 SD (P6), dipakai di iPad (Safari, layar sentuh, kadang Apple Pencil).
- Orang tua (developer): menjalankan Claude Code di laptop Windows 11 + Ubuntu (WSL).
- Dua mata pelajaran:
  1. **Matematika** — buku *My Pals Are Here! Maths 6A* (3rd Ed., Marshall Cavendish, kurikulum Singapura).
     Kelemahan: soal cerita (memahami soal, logika, bahasa Inggris). Metode yang dilatih: **bar model**.
  2. **Mandarin** — buku *Panduan Persiapan HSK 2* (HSK Standard Course 标准教程 2). Target: kosakata HSK 2 (300 kata kumulatif).

## Prinsip
- Mulai kecil, iterasi kecil. Setiap iterasi harus bisa langsung dicoba di iPad.
- Sesi belajar pendek (10–15 menit). Jangan bikin fitur yang mendorong pemakaian lama.
- Tanpa login, tanpa iklan, tanpa link keluar. Tidak menyimpan data pribadi selain nama panggilan.
- Bahasa antarmuka: Inggris sederhana (sesuai sekolah), dengan bantuan arti Bahasa Indonesia.

## Arsitektur (fase 1)
- **Static web app**: HTML + CSS + JavaScript murni (tanpa framework, tanpa build step).
- **Konten = file JSON** di `content/`. Dibuat/diubah lewat Claude Code, direview orang tua.
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
  math/<topik>.json   # soal cerita
  hsk2/vocab.json     # kosakata HSK 1–2
tools/
  validate_math.py    # hitung ulang semua jawaban dari ekspresi, gagal jika beda
  validate_vocab.py
```

## Aturan konten matematika (WAJIB)
- Setiap soal punya: `id`, `topic`, `story` (Inggris), `known`, `asked`, `steps[]`,
  `answer`, `answer_expr` (ekspresi Python yang menghasilkan jawaban), `bar_model` (deskripsi balok), `glossary` (kata sulit → arti Indonesia).
- **Jawaban tidak boleh dipercaya begitu saja**: `tools/validate_math.py` menghitung `answer_expr` dan harus sama dengan `answer`.
  Jalankan validator setiap kali menambah/mengubah soal.
- Angka dibuat "ramah" (hasil bulat atau pecahan sederhana) sesuai level P6.
- Gaya soal mengikuti soal cerita Singapura P6 (multi-langkah), mulai dari yang 2 langkah.

## Alur soal cerita (UI)
1. Baca cerita (kata sulit bisa di-tap → arti).
2. Tap: apa yang **diketahui**, apa yang **ditanya**.
3. **Pilih bar model** yang cocok dari 3 pilihan (SVG). *(Fase 2: susun bar model sendiri.)*
4. Hitung dan isi jawaban.
5. Kalau salah, catat jenis kesalahan: `comprehension` / `model` / `calculation`.

## Mandarin (HSK 2)
- Flashcard dengan spaced repetition sederhana (Leitner 5 kotak).
- Tampilkan hanzi → pinyin → arti (Indonesia/Inggris); suara pakai Web Speech API `zh-CN`.
- Latihan menulis dengan library Hanzi Writer (simpan datanya lokal agar bisa offline).
- Latihan nada: dengar → pilih nada 1/2/3/4.

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
