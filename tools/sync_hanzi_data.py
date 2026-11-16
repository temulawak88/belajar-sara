#!/usr/bin/env python3
"""Salin Hanzi Writer + data goresan yang dibutuhkan ke docs/vendor/ (agar jalan offline).

Sumber: node_modules/ (jalankan `npm install` dulu). Versi dikunci di package.json.
Hanya karakter yang muncul di content/hsk2/vocab.json dan kosakata
docs/content/hsk2/lessons.json yang disalin, digabung jadi
satu file chars.json ({"大": {...}, ...}) supaya cukup satu entri di service worker.

  python3 tools/sync_hanzi_data.py
"""
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOCAB = ROOT / "content" / "hsk2" / "vocab.json"
LESSONS = ROOT / "docs" / "content" / "hsk2" / "lessons.json"
NM = ROOT / "node_modules"
OUT = ROOT / "docs" / "vendor"


def main():
    lib_pkg = NM / "hanzi-writer"
    data_pkg = NM / "hanzi-writer-data"
    if not lib_pkg.exists() or not data_pkg.exists():
        print("GAGAL: node_modules/hanzi-writer(-data) tidak ada. Jalankan `npm install` dulu.")
        return 1

    words = json.loads(VOCAB.read_text(encoding="utf-8"))["words"]
    lessons = json.loads(LESSONS.read_text(encoding="utf-8"))["lessons"]
    # Kosakata HSK 1–2 + kosakata pelajaran (ada kata pelajaran yang bukan bagian daftar HSK).
    chars = sorted({c for w in words for c in w["hanzi"]} | {c for l in lessons for v in l["vocab"] for c in v["hanzi"]})

    data, missing = {}, []
    for c in chars:
        f = data_pkg / f"{c}.json"
        if f.exists():
            data[c] = json.loads(f.read_text(encoding="utf-8"))
        else:
            missing.append(c)
    if missing:
        print(f"GAGAL: tidak ada data goresan untuk: {' '.join(missing)}")
        return 1

    # Library: build ES module (tanpa import lain). Buang komentar sourcemap (file .map tidak disalin).
    lib_out = OUT / "hanzi-writer"
    lib_out.mkdir(parents=True, exist_ok=True)
    src = (lib_pkg / "dist" / "index.esm.js").read_text(encoding="utf-8")
    src = "\n".join(l for l in src.splitlines() if not l.startswith("//# sourceMappingURL"))
    (lib_out / "hanzi-writer.esm.js").write_text(src + "\n", encoding="utf-8")
    shutil.copyfile(lib_pkg / "LICENSE", lib_out / "LICENSE.txt")

    data_out = OUT / "hanzi-writer-data"
    data_out.mkdir(parents=True, exist_ok=True)
    (data_out / "chars.json").write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n", encoding="utf-8"
    )
    shutil.copyfile(data_pkg / "ARPHICPL.TXT", data_out / "ARPHICPL.TXT")
    shutil.copyfile(lib_pkg / "COPYING.md", data_out / "COPYING.md")

    version = json.loads((lib_pkg / "package.json").read_text())["version"]
    dversion = json.loads((data_pkg / "package.json").read_text())["version"]
    print(f"OK: hanzi-writer {version}, hanzi-writer-data {dversion}, {len(data)} karakter -> docs/vendor/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
