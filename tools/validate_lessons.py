#!/usr/bin/env python3
"""Validasi pelajaran Mandarin di docs/content/hsk2/lessons.json.

Aturan utama (CLAUDE.md › Mandarin): setiap karakter di kalimat latihan pelajaran N — termasuk
pilihan jawaban, potongan kalimat, dan urutan lain yang diterima — harus ada di kosakata
HSK 1 (content/hsk2/vocab.json, hsk = 1) + kosakata pelajaran 1 sampai N.

Juga dicek: id unik, potongan membentuk jawaban, jawaban isi-bagian-kosong ada di pilihan,
jumlah suku kata pinyin = jumlah hanzi (menangkap salah ketik pinyin), arti tidak dobel dalam satu
pelajaran (dibutuhkan latihan dengar → pilih arti).

  python3 tools/validate_lessons.py
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate_vocab import FINALS, INITIALS, plain  # noqa: E402  (pemecah pinyin yang sama)

ROOT = Path(__file__).resolve().parent.parent
LESSONS = ROOT / "docs" / "content" / "hsk2" / "lessons.json"
VOCAB = ROOT / "content" / "hsk2" / "vocab.json"
STROKES = ROOT / "docs" / "vendor" / "hanzi-writer-data" / "chars.json"

CJK = re.compile(r"[一-鿿]")
STATUS = {"current", "review", "upcoming"}
EXERCISE_TYPES = {"cards", "fill", "order", "listen"}
BLANK = "___"
SEPARATORS = set(" '’-,.!?;:，。！？；：、…\"“”")
MIN_SENTENCES = 3  # dengar → pilih arti butuh 1 jawaban + 2 pengecoh


def cjk(text):
    return CJK.findall(text)


def count_syllables_ok(pinyin, n_hanzi):
    """True jika pinyin satu kalimat bisa dipecah menjadi tepat n_hanzi suku kata.
    Erhua "r" di akhir kata (zhèr, yìdiǎnr) dihitung sebagai suku kata untuk 儿."""
    p = plain(unicodedata.normalize("NFC", pinyin))
    seps = SEPARATORS

    def dfs(pos, left, memo={}):  # noqa: B006 (memo per panggilan di bawah)
        key = (pos, left)
        if key in memo:
            return memo[key]
        start = pos
        while pos < len(p) and p[pos] in seps:
            pos += 1
        separated = pos == 0 or pos > start
        if pos == len(p):
            return left == 0
        if left == 0:
            return False
        rest = p[pos:]
        lens = {
            len(i) + len(f)
            for i in INITIALS
            if rest.startswith(i) and (i or (rest[0] in "aoe" and separated))
            for f in FINALS
            if rest.startswith(f, len(i))
        }
        if rest[0] == "r" and (len(rest) == 1 or rest[1] in seps):
            lens.add(1)  # erhua
        result = any(dfs(pos + n, left - 1) for n in sorted(lens, reverse=True))
        memo[key] = result
        return result

    return dfs(0, n_hanzi, {})


def validate(data, hsk1_chars):
    errors = []
    if data.get("schemaVersion") != 1:
        errors.append("schemaVersion harus 1")
    if set(data.get("exercise_types", {})) != EXERCISE_TYPES:
        errors.append(f"exercise_types harus tepat {sorted(EXERCISE_TYPES)}")
    lessons = data.get("lessons")
    if not isinstance(lessons, list) or not lessons:
        return errors + ["lessons harus list yang tidak kosong"]

    allowed = set(hsk1_chars)
    vocab_ids, ex_ids, vocab_hanzi = set(), set(), {}
    for li, les in enumerate(lessons):
        n = les.get("number")
        lw = f"pelajaran {n}"
        if n != li + 1:
            errors.append(f"{lw}: nomor pelajaran harus berurutan mulai 1 (posisi {li + 1})")
        if les.get("status") not in STATUS:
            errors.append(f"{lw}: status harus salah satu dari {sorted(STATUS)}")
        for k in ("title_zh", "title_id"):
            if not les.get(k):
                errors.append(f"{lw}: {k} kosong")

        # --- kosakata pelajaran ini menambah karakter yang boleh dipakai ---
        for v in les.get("vocab", []):
            vw = f"{lw} kata {v.get('hanzi', '?')}"
            for k in ("id", "hanzi", "pinyin", "arti"):
                if not v.get(k):
                    errors.append(f"{vw}: field '{k}' kosong")
            if not v.get("id") or not v.get("hanzi"):
                continue
            if v["id"] in vocab_ids:
                errors.append(f"{vw}: id kata duplikat {v['id']}")
            vocab_ids.add(v["id"])
            if v["hanzi"] in vocab_hanzi:
                errors.append(f"{vw}: kata sudah ada di pelajaran {vocab_hanzi[v['hanzi']]}")
            vocab_hanzi[v["hanzi"]] = n
            if len(cjk(v["hanzi"])) != len(v["hanzi"]):
                errors.append(f"{vw}: hanzi hanya boleh karakter CJK")
            if not count_syllables_ok(v.get("pinyin", ""), len(v["hanzi"])):
                errors.append(f"{vw}: pinyin {v.get('pinyin')!r} tidak cocok dengan {len(v['hanzi'])} hanzi")
            if "no_tone" in v and (
                not isinstance(v["no_tone"], list) or any(len(c) != 1 or c not in v["hanzi"] for c in v["no_tone"])
            ):
                errors.append(f"{vw}: no_tone harus list karakter tunggal dari kata ini")
            for flag in ("supplementary", "proper_noun"):
                if flag in v and not isinstance(v[flag], bool):
                    errors.append(f"{vw}: {flag} harus true/false")
            allowed |= set(v["hanzi"])

        # --- latihan ---
        exercises = les.get("exercises", [])
        artis = {}
        for ex in exercises:
            ew = f"{lw} latihan {ex.get('id', '?')}"
            for k in ("id", "type", "pinyin", "arti", "answer"):
                if not ex.get(k):
                    errors.append(f"{ew}: field '{k}' kosong")
            if not ex.get("id") or ex.get("type") not in ("fill", "order"):
                if ex.get("type") not in ("fill", "order"):
                    errors.append(f"{ew}: type harus 'fill' atau 'order'")
                continue
            if ex["id"] in ex_ids:
                errors.append(f"{ew}: id latihan duplikat")
            ex_ids.add(ex["id"])
            if not ex["id"].startswith(f"L{n}-"):
                errors.append(f"{ew}: id harus diawali 'L{n}-'")
            if ex.get("origin") not in (None, "claude"):
                errors.append(f"{ew}: origin hanya boleh 'claude' (atau tidak ada)")

            texts = [ex.get("answer", "")]
            if ex["type"] == "fill":
                s, opts = ex.get("sentence", ""), ex.get("options", [])
                texts += [s, *opts]
                if s.count(BLANK) != 1:
                    errors.append(f"{ew}: sentence harus berisi tepat satu '{BLANK}'")
                if not (2 <= len(opts) <= 4) or len(set(opts)) != len(opts):
                    errors.append(f"{ew}: options harus 2–4 pilihan yang berbeda")
                if ex.get("answer") not in opts:
                    errors.append(f"{ew}: answer tidak ada di options")
                full = s.replace(BLANK, ex.get("answer", ""))
            else:
                chunks = ex.get("chunks", [])
                texts += chunks
                if len(chunks) < 3:
                    errors.append(f"{ew}: chunks minimal 3 potongan")
                alts = ex.get("also_accept", [])
                texts += alts
                for sentence in [ex.get("answer", ""), *alts]:
                    if sorted(cjk(sentence)) != sorted(cjk("".join(chunks))):
                        errors.append(f"{ew}: potongan tidak membentuk {sentence!r}")
                if cjk(ex.get("answer", "")) != cjk("".join(chunks)):
                    errors.append(f"{ew}: urutan chunks harus sama dengan answer (pengacakan dilakukan app)")
                if ex.get("answer") in alts:
                    errors.append(f"{ew}: also_accept tidak boleh sama dengan answer")
                full = ex.get("answer", "")

            outside = sorted({c for t in texts for c in cjk(t) if c not in allowed})
            if outside:
                errors.append(
                    f"{ew}: karakter di luar HSK 1 + pelajaran 1–{n}: {' '.join(outside)}  ({full})"
                )
            if not count_syllables_ok(ex.get("pinyin", ""), len(cjk(full))):
                errors.append(f"{ew}: pinyin tidak cocok dengan {len(cjk(full))} hanzi: {ex.get('pinyin')!r}")
            if ex.get("arti") in artis:
                errors.append(f"{ew}: arti sama dengan {artis[ex['arti']]} (pengecoh dengar → arti jadi ganda)")
            artis[ex.get("arti")] = ex["id"]

        if len(exercises) < MIN_SENTENCES:
            errors.append(f"{lw}: minimal {MIN_SENTENCES} kalimat latihan (untuk dengar → pilih arti)")
        if not any(e.get("type") == "fill" for e in exercises) or not any(e.get("type") == "order" for e in exercises):
            errors.append(f"{lw}: butuh minimal satu latihan 'fill' dan satu 'order'")
    return errors


def load_hsk1_chars():
    words = json.loads(VOCAB.read_text(encoding="utf-8"))["words"]
    return {c for w in words if w["hsk"] == 1 for c in w["hanzi"]}


def main():
    try:
        data = json.loads(LESSONS.read_text(encoding="utf-8"))
        hsk1 = load_hsk1_chars()
    except (OSError, json.JSONDecodeError, KeyError) as e:
        print(f"GAGAL membaca konten: {e}")
        return 1
    errors = validate(data, hsk1)
    # Latihan menulis per pelajaran: setiap karakter kosakata pelajaran butuh data goresan.
    try:
        strokes = json.loads(STROKES.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        strokes = {}
        errors.append(f"tidak bisa membaca {STROKES.relative_to(ROOT)}: {e}")
    missing = sorted({c for l in data["lessons"] for v in l.get("vocab", []) for c in v.get("hanzi", "") if c not in strokes})
    if missing:
        errors.append(f"data goresan belum ada untuk: {' '.join(missing)} (jalankan tools/sync_hanzi_data.py)")
    if errors:
        print(f"GAGAL: {len(errors)} masalah di {LESSONS.relative_to(ROOT)}")
        for e in errors:
            print("  -", e)
        return 1
    n_ex = sum(len(l["exercises"]) for l in data["lessons"])
    n_new = sum(1 for l in data["lessons"] for e in l["exercises"] if e.get("origin") == "claude")
    print(
        f"OK: {len(data['lessons'])} pelajaran, {sum(len(l['vocab']) for l in data['lessons'])} kata, "
        f"{n_ex} kalimat ({n_new} buatan Claude): semua karakter ada di HSK 1 + pelajaran sampai pelajaran itu."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
