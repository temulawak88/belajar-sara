#!/usr/bin/env python3
"""Validasi kosakata HSK di content/hsk2/vocab.json.

GitHub Pages hanya menayangkan folder docs/, jadi app membaca salinan di
docs/content/hsk2/vocab.json. Validator ini juga memastikan salinan itu identik
dengan sumbernya.

  python3 tools/validate_vocab.py          # validasi + cek salinan
  python3 tools/validate_vocab.py --sync   # validasi, lalu salin ke docs/

Juga mengecek setiap karakter punya data goresan Hanzi Writer
(docs/vendor/hanzi-writer-data/chars.json, dibuat oleh tools/sync_hanzi_data.py).
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
STROKES = ROOT / "docs" / "vendor" / "hanzi-writer-data" / "chars.json"

SCHEMA_VERSION = 1
REQUIRED = ("id", "hanzi", "pinyin", "hsk", "meaning_en", "meaning_id")
ID_RE = re.compile(r"^hsk[12]-[a-z0-9-]+$")
HANZI_RE = re.compile(r"^[一-鿿]+$")
# Huruf pinyin: a-z, ü, vokal bertanda nada, plus spasi/apostrof antar suku kata.
PINYIN_RE = re.compile(r"^[a-zA-ZüÜāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈŌÓǑÒ' ]+$")
TONE_MARKS = set("āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈŌÓǑÒ")

# Pemecah suku kata pinyin — setara dengan segmentPinyin() di docs/js/pinyin.js.
# Latihan nada butuh satu suku kata per hanzi; kata yang tidak bisa dipecah ditolak di sini.
_BASE = {}
for _base, _marks in (("a", "āáǎà"), ("e", "ēéěè"), ("i", "īíǐì"), ("o", "ōóǒò"), ("u", "ūúǔù"), ("v", "ǖǘǚǜ"),
                      ("a", "ĀÁǍÀ"), ("e", "ĒÉĚÈ"), ("o", "ŌÓǑÒ")):
    for _m in _marks:
        _BASE[_m] = _base
INITIALS = ["zh", "ch", "sh", *"bpmfdtnlgkhjqxrzcsyw", ""]
FINALS = sorted(
    "iang iong uang ueng van ang eng ong iao ian ing uai uan ve vn ai ei ao ou an en er ia ie iu in ua uo ui un ue "
    "a o e i u v".split(),
    key=len,
    reverse=True,
)


def plain(s):
    return "".join(_BASE.get(c, c).lower().replace("ü", "v") for c in s)


def segment_pinyin(pinyin, count):
    p = plain(pinyin)

    def dfs(pos, left):
        start = pos
        while pos < len(p) and p[pos] in "' ’":
            pos += 1
        separated = pos == 0 or pos > start
        if pos == len(p):
            return [] if left == 0 else None
        if left == 0:
            return None
        rest = p[pos:]
        if left == 1 and rest == "r":
            return [(pos, pos + 1)]
        lens = {
            len(i) + len(f)
            for i in INITIALS
            # tanpa konsonan awal: hanya final a/o/e, dan di tengah kata wajib sesudah apostrof
            if rest.startswith(i) and (i or (rest[0] in "aoe" and separated))
            for f in FINALS
            if rest.startswith(f, len(i))
        }
        for n in sorted(lens, reverse=True):
            tail = dfs(pos + n, left - 1)
            if tail is not None:
                return [(pos, pos + n), *tail]
        return None

    spans = dfs(0, count)
    return None if spans is None else [pinyin[a:b] for a, b in spans]


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
        elif segment_pinyin(py, len(w["hanzi"])) is None:
            errors.append(f"{where}: pinyin {py!r} tidak bisa dipecah jadi {len(w['hanzi'])} suku kata "
                          "(cek ejaan; pakai apostrof untuk xi'an)")
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

    try:
        strokes = json.loads(STROKES.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        print(f"GAGAL membaca {STROKES.relative_to(ROOT)}: {e}. Jalankan tools/sync_hanzi_data.py.")
        return 1
    chars = sorted({c for w in data["words"] for c in w["hanzi"]})
    missing = [c for c in chars if c not in strokes]
    if missing:
        print(f"GAGAL: data goresan belum ada untuk {' '.join(missing)}. Jalankan tools/sync_hanzi_data.py.")
        return 1
    for c in chars:
        d = strokes[c]
        if not d.get("strokes") or len(d["strokes"]) != len(d.get("medians", [])):
            print(f"GAGAL: data goresan {c} rusak (strokes/medians tidak cocok).")
            return 1

    print(f"OK: {len(data['words'])} kata valid, salinan docs/ identik, {len(chars)} karakter punya data goresan.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
