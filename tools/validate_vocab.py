#!/usr/bin/env python3
"""Validasi kosakata HSK di content/hsk2/vocab.json.

GitHub Pages hanya menayangkan folder docs/, jadi app membaca salinan di
docs/content/hsk2/vocab.json. Validator ini juga memastikan salinan itu identik
dengan sumbernya.

  python3 tools/validate_vocab.py          # validasi + cek salinan
  python3 tools/validate_vocab.py --sync   # validasi, lalu salin ke docs/
"""
import json
import re
import shutil
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "content" / "hsk2" / "vocab.json"
DST = ROOT / "docs" / "content" / "hsk2" / "vocab.json"

SCHEMA_VERSION = 1
REQUIRED = ("id", "hanzi", "pinyin", "hsk", "meaning_en", "meaning_id")
ID_RE = re.compile(r"^hsk[12]-[a-z0-9-]+$")
HANZI_RE = re.compile(r"^[一-鿿]+$")
# Huruf pinyin: a-z, ü, vokal bertanda nada, plus spasi/apostrof antar suku kata.
PINYIN_RE = re.compile(r"^[a-zA-ZüÜāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈŌÓǑÒ' ]+$")
TONE_MARKS = set("āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈŌÓǑÒ")


def validate(data):
    errors = []
    if data.get("schemaVersion") != SCHEMA_VERSION:
        errors.append(f"schemaVersion harus {SCHEMA_VERSION}")
    words = data.get("words")
    if not isinstance(words, list) or not words:
        return errors + ["'words' harus list yang tidak kosong"]

    seen_ids, seen_hanzi = set(), set()
    for i, w in enumerate(words):
        where = f"words[{i}] ({w.get('id', '?')})"
        missing = [k for k in REQUIRED if k not in w]
        if missing:
            errors.append(f"{where}: field hilang {missing}")
            continue
        extra = set(w) - set(REQUIRED) - {"tags", "note"}
        if extra:
            errors.append(f"{where}: field tidak dikenal {sorted(extra)}")
        if not ID_RE.match(w["id"]):
            errors.append(f"{where}: id harus seperti 'hsk1-xxx'")
        elif not w["id"].startswith(f"hsk{w['hsk']}-"):
            errors.append(f"{where}: prefix id tidak cocok dengan hsk={w['hsk']}")
        if w["id"] in seen_ids:
            errors.append(f"{where}: id duplikat")
        seen_ids.add(w["id"])
        if not HANZI_RE.match(w["hanzi"]):
            errors.append(f"{where}: hanzi hanya boleh karakter CJK")
        if w["hanzi"] in seen_hanzi:
            errors.append(f"{where}: hanzi duplikat")
        seen_hanzi.add(w["hanzi"])
        py = unicodedata.normalize("NFC", w["pinyin"])
        if py != w["pinyin"]:
            errors.append(f"{where}: pinyin harus Unicode NFC (pakai huruf bertanda nada jadi satu)")
        if not PINYIN_RE.match(py):
            errors.append(f"{where}: pinyin berisi karakter tidak valid: {py!r}")
        elif not TONE_MARKS & set(py):
            errors.append(f"{where}: pinyin tanpa tanda nada sama sekali: {py!r}")
        if w["hsk"] not in (1, 2):
            errors.append(f"{where}: hsk harus 1 atau 2")
        for k in ("meaning_en", "meaning_id"):
            if not isinstance(w[k], str) or not w[k].strip():
                errors.append(f"{where}: {k} kosong")
    return errors


def main():
    sync = "--sync" in sys.argv[1:]
    try:
        raw = SRC.read_bytes()
        data = json.loads(raw)
    except (OSError, json.JSONDecodeError) as e:
        print(f"GAGAL membaca {SRC.relative_to(ROOT)}: {e}")
        return 1

    errors = validate(data)
    if errors:
        print(f"GAGAL: {len(errors)} masalah di {SRC.relative_to(ROOT)}")
        for e in errors:
            print("  -", e)
        return 1

    if sync:
        DST.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(SRC, DST)
        print(f"Disalin ke {DST.relative_to(ROOT)}")
    elif not DST.exists() or DST.read_bytes() != raw:
        print(f"GAGAL: {DST.relative_to(ROOT)} beda dengan sumber. Jalankan dengan --sync.")
        return 1

    print(f"OK: {len(data['words'])} kata valid, salinan docs/ identik.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
