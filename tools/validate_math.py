#!/usr/bin/env python3
"""Validasi konten matematika di docs/content/math/syllabus.json.

Yang dicek (lihat CLAUDE.md › Aturan konten matematika):
- struktur syllabus: model_types, difficulty_levels, bab, pola soal, glosarium, kesalahan umum;
- setiap contoh: field wajib, pola & level cocok dengan bab, model termasuk model_types;
- JAWABAN: answer_expr dihitung ulang (evaluator aman, bukan eval) dan harus sama dengan answer;
- angka "ramah": jawaban bulat atau desimal ≤ 2 angka di belakang koma;
- trap_answer (jika ada) berbeda dari answer dan punya trap_note;
- pie: pie_data wajib, tiap sektor punya fraction ("a/b") ATAU percent, paling banyak satu sektor
  "sisanya" (percent null), dan jumlah semua sektor tepat = 1 (dihitung dengan pecahan eksak).

  python3 tools/validate_math.py
"""
import ast
import json
import math
import operator
import sys
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SYLLABUS = ROOT / "docs" / "content" / "math" / "syllabus.json"

CHAPTER_STATUS = {"current", "review", "upcoming"}
EXAMPLE_REQUIRED = ("id", "pattern", "level", "model", "story", "known", "asked", "answer", "unit", "answer_expr")
EXAMPLE_OPTIONAL = {"steps", "trap_answer", "trap_note", "pie_data", "note"}

_BINOPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}
_UNARY = {ast.USub: operator.neg, ast.UAdd: operator.pos}
_FUNCS = {"round": round, "abs": abs, "min": min, "max": max}


def safe_eval(expr):
    """Hitung ekspresi aritmetika sederhana. Hanya angka, + - * / // % **, kurung, round/abs/min/max."""

    def ev(node):
        if isinstance(node, ast.Expression):
            return ev(node.body)
        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in _BINOPS:
            right = ev(node.right)
            if isinstance(node.op, ast.Pow) and abs(right) > 10:
                raise ValueError("pangkat terlalu besar")
            return _BINOPS[type(node.op)](ev(node.left), right)
        if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY:
            return _UNARY[type(node.op)](ev(node.operand))
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id in _FUNCS
            and not node.keywords
        ):
            return _FUNCS[node.func.id](*[ev(a) for a in node.args])
        raise ValueError(f"tidak diizinkan: {ast.dump(node)[:60]}")

    return ev(ast.parse(expr, mode="eval"))


def same_number(a, b):
    return math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-9)


def is_friendly(x):
    """Bulat, atau desimal dengan paling banyak 2 angka di belakang koma (2.5, 0.75)."""
    return same_number(x * 100, round(x * 100))


def parse_fraction(s):
    num, den = s.split("/")
    return Fraction(int(num), int(den))


def check_pie(where, data):
    errors = []
    if not isinstance(data, list) or len(data) < 2:
        return [f"{where}: pie_data harus list berisi minimal 2 sektor"]
    total = Fraction(0)
    rest = 0
    labels = set()
    for i, sec in enumerate(data):
        w = f"{where} pie_data[{i}]"
        if not isinstance(sec, dict) or not sec.get("label"):
            errors.append(f"{w}: sektor harus punya label")
            continue
        if sec["label"] in labels:
            errors.append(f"{w}: label duplikat {sec['label']!r}")
        labels.add(sec["label"])
        has_f, has_p = "fraction" in sec, "percent" in sec
        if has_f == has_p:
            errors.append(f"{w}: isi tepat satu dari 'fraction' atau 'percent'")
            continue
        if has_p and sec["percent"] is None:
            rest += 1
            continue
        try:
            value = parse_fraction(sec["fraction"]) if has_f else Fraction(str(sec["percent"])) / 100
        except (ValueError, ZeroDivisionError, AttributeError):
            errors.append(f"{w}: nilai sektor tidak valid")
            continue
        if value <= 0:
            errors.append(f"{w}: sektor harus > 0")
        total += value
    if rest > 1:
        errors.append(f"{where}: paling banyak satu sektor 'sisanya' (percent null)")
    elif rest == 1:
        if total >= 1:
            errors.append(f"{where}: sektor 'sisanya' jadi {1 - total} (harus > 0); total sektor lain = {total}")
    elif total != 1:
        errors.append(f"{where}: jumlah sektor pie = {total}, harus tepat 1")
    return errors


def validate(data):
    errors = []
    if data.get("schemaVersion") != 1:
        errors.append("schemaVersion harus 1")
    models = data.get("model_types")
    levels = data.get("difficulty_levels")
    if not isinstance(models, dict) or not models:
        return errors + ["model_types harus dict yang tidak kosong"]
    if not isinstance(levels, dict) or not levels:
        return errors + ["difficulty_levels harus dict yang tidak kosong"]
    level_set = {int(k) for k in levels}
    chapters = data.get("chapters")
    if not isinstance(chapters, list) or not chapters:
        return errors + ["chapters harus list yang tidak kosong"]

    chapter_ids, example_ids = set(), set()
    for ci, ch in enumerate(chapters):
        cw = f"chapters[{ci}] ({ch.get('id', '?')})"
        for k in ("id", "number", "title", "status", "default_model", "glossary"):
            if k not in ch:
                errors.append(f"{cw}: field '{k}' hilang")
        if ch.get("id") in chapter_ids:
            errors.append(f"{cw}: id bab duplikat")
        chapter_ids.add(ch.get("id"))
        if ch.get("status") not in CHAPTER_STATUS:
            errors.append(f"{cw}: status harus salah satu dari {sorted(CHAPTER_STATUS)}")
        if ch.get("default_model") not in models:
            errors.append(f"{cw}: default_model {ch.get('default_model')!r} tidak ada di model_types")
        glossary = ch.get("glossary", {})
        if not isinstance(glossary, dict) or not glossary or not all(
            isinstance(k, str) and k.strip() and isinstance(v, str) and v.strip() for k, v in glossary.items()
        ):
            errors.append(f"{cw}: glossary harus dict istilah -> arti yang tidak kosong")

        examples = ch.get("examples", [])
        if not examples:
            if not ch.get("app_note"):
                errors.append(f"{cw}: bab tanpa contoh harus punya app_note (alasan)")
            continue
        mistakes = ch.get("common_mistakes")
        if not isinstance(mistakes, list) or not mistakes or not all(isinstance(m, str) and m.strip() for m in mistakes):
            errors.append(f"{cw}: common_mistakes wajib (list teks) karena dipakai sebagai petunjuk saat salah")
        patterns = {}
        for pi, p in enumerate(ch.get("patterns", [])):
            if p.get("id") in patterns:
                errors.append(f"{cw} patterns[{pi}]: id pola duplikat")
            if p.get("level") not in level_set:
                errors.append(f"{cw} patterns[{pi}]: level {p.get('level')!r} tidak ada di difficulty_levels")
            patterns[p.get("id")] = p
        used_patterns = set()

        for ei, ex in enumerate(examples):
            ew = f"{cw} contoh {ex.get('id', ei)}"
            missing = [k for k in EXAMPLE_REQUIRED if k not in ex]
            if missing:
                errors.append(f"{ew}: field hilang {missing}")
                continue
            unknown = set(ex) - set(EXAMPLE_REQUIRED) - EXAMPLE_OPTIONAL
            if unknown:
                errors.append(f"{ew}: field tidak dikenal {sorted(unknown)} (bar_model sudah diganti 'model')")
            if ex["id"] in example_ids:
                errors.append(f"{ew}: id contoh duplikat")
            example_ids.add(ex["id"])
            if not str(ex["id"]).startswith(f"{ch.get('number')}-"):
                errors.append(f"{ew}: id harus diawali nomor bab '{ch.get('number')}-'")
            pat = patterns.get(ex["pattern"])
            if not pat:
                errors.append(f"{ew}: pola {ex['pattern']!r} tidak ada di patterns bab ini")
            else:
                used_patterns.add(ex["pattern"])
                if ex["level"] != pat.get("level"):
                    errors.append(f"{ew}: level {ex['level']} beda dengan level pola ({pat.get('level')})")
            if ex["model"] not in models:
                errors.append(f"{ew}: model {ex['model']!r} tidak ada di model_types {sorted(models)}")
            for k in ("story", "asked", "unit"):
                if not isinstance(ex[k], str) or not ex[k].strip():
                    errors.append(f"{ew}: {k} kosong")
            if not isinstance(ex["known"], list) or not ex["known"] or not all(isinstance(k, str) and k for k in ex["known"]):
                errors.append(f"{ew}: known harus list teks yang tidak kosong")

            # --- jawaban dihitung ulang ---
            answer = ex["answer"]
            if type(answer) not in (int, float):
                errors.append(f"{ew}: answer harus angka")
                continue
            try:
                got = safe_eval(ex["answer_expr"])
            except (ValueError, SyntaxError, ZeroDivisionError, TypeError, OverflowError) as e:
                errors.append(f"{ew}: answer_expr tidak bisa dihitung ({e})")
                continue
            if not same_number(got, answer):
                errors.append(f"{ew}: answer_expr = {got}, tetapi answer = {answer}")
            if not is_friendly(answer):
                errors.append(f"{ew}: jawaban {answer} tidak 'ramah' (maks 2 angka desimal)")
            if "trap_answer" in ex:
                if type(ex["trap_answer"]) not in (int, float) or same_number(ex["trap_answer"], answer):
                    errors.append(f"{ew}: trap_answer harus angka dan berbeda dari answer")
                if not ex.get("trap_note"):
                    errors.append(f"{ew}: trap_answer butuh trap_note (dipakai sebagai petunjuk)")

            # --- pie ---
            if ex["model"] == "pie":
                if "pie_data" not in ex:
                    errors.append(f"{ew}: model pie wajib punya pie_data")
                else:
                    errors += check_pie(ew, ex["pie_data"])
            elif "pie_data" in ex:
                errors.append(f"{ew}: pie_data hanya untuk model pie")

        unused = sorted(set(patterns) - used_patterns)
        if unused:
            # Bukan error: pola boleh belum punya contoh. Hanya diberitahukan.
            print(f"  info: {cw}: pola tanpa contoh: {', '.join(unused)}")
    return errors


def main():
    try:
        data = json.loads(SYLLABUS.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        print(f"GAGAL membaca {SYLLABUS.relative_to(ROOT)}: {e}")
        return 1
    errors = validate(data)
    if errors:
        print(f"GAGAL: {len(errors)} masalah di {SYLLABUS.relative_to(ROOT)}")
        for e in errors:
            print("  -", e)
        return 1
    n = sum(len(c.get("examples", [])) for c in data["chapters"])
    pies = sum(1 for c in data["chapters"] for e in c.get("examples", []) if e.get("model") == "pie")
    print(f"OK: {len(data['chapters'])} bab, {n} contoh: semua jawaban cocok dengan answer_expr, {pies} pie berjumlah 1.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
