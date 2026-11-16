#!/usr/bin/env python3
"""Tes untuk validator matematika. Jalankan: python3 -m unittest tools/test_validate_math.py"""
import copy
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate_math import SYLLABUS, safe_eval, validate  # noqa: E402

REAL = json.loads(SYLLABUS.read_text(encoding="utf-8"))


def ch(data, chapter_id):
    return next(c for c in data["chapters"] if c["id"] == chapter_id)


def ex(data, example_id):
    return next(e for c in data["chapters"] for e in c.get("examples", []) if e["id"] == example_id)


def errors_after(change):
    data = copy.deepcopy(REAL)
    change(data)
    return validate(data)


class ValidateMathTest(unittest.TestCase):
    def assertRejected(self, change, needle):
        errs = errors_after(change)
        self.assertTrue(any(needle in e for e in errs), f"diharapkan '{needle}', dapat: {errs}")

    def test_real_syllabus_passes(self):
        self.assertEqual(validate(copy.deepcopy(REAL)), [])

    def test_wrong_answer_is_caught(self):
        self.assertRejected(lambda d: ex(d, "7-1").update(answer=170), "answer_expr = 180")

    def test_unfriendly_answer_is_caught(self):
        def change(d):
            ex(d, "7-6").update(answer=1 / 3, answer_expr="1 / 3")

        self.assertRejected(change, "tidak 'ramah'")

    def test_pie_must_sum_to_one(self):
        self.assertRejected(lambda d: ex(d, "9-1")["pie_data"][0].update(fraction="1/3"), "harus tepat 1")

    def test_pie_rest_sector(self):
        self.assertRejected(lambda d: ex(d, "9-2")["pie_data"][0].update(percent=80), "'sisanya' jadi")
        self.assertRejected(lambda d: ex(d, "9-2")["pie_data"][0].update(percent=None), "paling banyak satu sektor")

    def test_pie_sector_needs_exactly_one_value(self):
        self.assertRejected(lambda d: ex(d, "9-1")["pie_data"][0].update(percent=25), "tepat satu dari")

    def test_pie_model_needs_pie_data(self):
        self.assertRejected(lambda d: ex(d, "9-3").pop("pie_data"), "wajib punya pie_data")

    def test_old_bar_model_field_is_rejected(self):
        self.assertRejected(lambda d: ex(d, "8-1").update(bar_model="..."), "bar_model sudah diganti")

    def test_model_must_be_a_known_type(self):
        self.assertRejected(lambda d: ex(d, "8-1").update(model="cube"), "tidak ada di model_types")

    def test_pattern_and_level_must_match_chapter(self):
        self.assertRejected(lambda d: ex(d, "7-1").update(pattern="tank-fraction"), "tidak ada di patterns")
        self.assertRejected(lambda d: ex(d, "7-1").update(level=3), "beda dengan level pola")

    def test_trap_answer_rules(self):
        self.assertRejected(lambda d: ex(d, "7-3").pop("trap_note"), "butuh trap_note")
        self.assertRejected(lambda d: ex(d, "7-3").update(trap_answer=48), "berbeda dari answer")

    def test_common_mistakes_required_when_chapter_has_examples(self):
        self.assertRejected(lambda d: ch(d, "6B-07").pop("common_mistakes"), "common_mistakes wajib")

    def test_duplicate_example_id(self):
        self.assertRejected(lambda d: ex(d, "7-2").update(id="7-1"), "id contoh duplikat")

    def test_safe_eval_allows_arithmetic_only(self):
        self.assertEqual(safe_eval("(180 + 60) / (180 / 60 + 60 / 30)"), 48)
        self.assertEqual(safe_eval("round(343 ** (1 / 3), 6)"), 7)
        for bad in ("__import__('os').system('true')", "open('x')", "[1, 2]", "x + 1", "2 ** 999"):
            with self.assertRaises(ValueError, msg=bad):
                safe_eval(bad)


if __name__ == "__main__":
    unittest.main()
