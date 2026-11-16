#!/usr/bin/env python3
"""Tes untuk validator pelajaran. Jalankan: python3 -m unittest tools/test_validate_lessons.py"""
import copy
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate_lessons import LESSONS, count_syllables_ok, load_hsk1_chars, validate  # noqa: E402

REAL = json.loads(LESSONS.read_text(encoding="utf-8"))
HSK1 = load_hsk1_chars()


def ex(data, ex_id):
    return next(e for l in data["lessons"] for e in l["exercises"] if e["id"] == ex_id)


def lesson(data, n):
    return data["lessons"][n - 1]


def errors_after(change):
    data = copy.deepcopy(REAL)
    change(data)
    return validate(data, HSK1)


class ValidateLessonsTest(unittest.TestCase):
    def assertRejected(self, change, needle):
        errs = errors_after(change)
        self.assertTrue(any(needle in e for e in errs), f"diharapkan '{needle}', dapat: {errs}")

    def test_real_lessons_pass(self):
        self.assertEqual(validate(copy.deepcopy(REAL), HSK1), [])

    def test_character_outside_allowed_vocab_is_rejected(self):
        # 又 = HSK 3: tidak boleh muncul, juga sebagai pilihan jawaban.
        self.assertRejected(lambda d: ex(d, "L8-f1").update(options=["再", "又", "呢"]), "karakter di luar HSK 1 + pelajaran 1–8: 又")

    def test_word_from_a_later_lesson_is_rejected(self):
        # 手机 baru diajarkan di pelajaran 10.
        def change(d):
            e = ex(d, "L1-o1")
            e.update(chunks=["我", "要", "买", "手机"], answer="我要买手机。", pinyin="Wǒ yào mǎi shǒujī.", also_accept=[])

        self.assertRejected(change, "pelajaran 1–1: 手")

    def test_also_accept_and_chunks_are_checked_too(self):
        self.assertRejected(lambda d: ex(d, "L2-o5").update(also_accept=["明天又我妈妈出院。"]), "又")
        self.assertRejected(lambda d: ex(d, "L3-o1")["chunks"].__setitem__(0, "又"), "又")

    def test_same_word_in_lesson_counts_from_that_lesson_on(self):
        # 手机 dipakai di pelajaran 10 itu sendiri: boleh.
        self.assertEqual([e for e in errors_after(lambda d: None) if "L10" in e], [])

    def test_chunks_must_form_the_answer(self):
        self.assertRejected(lambda d: ex(d, "L1-o2").update(answer="我觉得九月去北京很好。"), "potongan tidak membentuk")

    def test_chunks_are_stored_in_answer_order(self):
        def change(d):
            c = ex(d, "L1-o2")["chunks"]
            c[0], c[1] = c[1], c[0]

        self.assertRejected(change, "urutan chunks harus sama")

    def test_fill_rules(self):
        self.assertRejected(lambda d: ex(d, "L1-f1").update(answer="会"), "answer tidak ada di options")
        self.assertRejected(lambda d: ex(d, "L1-f1").update(sentence="这三本书里，我喜欢这本。"), "tepat satu '___'")
        self.assertRejected(lambda d: ex(d, "L1-f1").update(options=["最", "最"]), "2–4 pilihan yang berbeda")

    def test_pinyin_must_match_number_of_hanzi(self):
        self.assertRejected(lambda d: ex(d, "L7-o1").update(pinyin="Wǒ jiā lí xuéxiào yuǎn."), "pinyin tidak cocok")

    def test_duplicate_ids_and_meanings(self):
        self.assertRejected(lambda d: ex(d, "L1-f2").update(id="L1-f1"), "id latihan duplikat")
        self.assertRejected(lambda d: ex(d, "L1-f2").update(arti=ex(d, "L1-f1")["arti"]), "arti sama dengan")
        self.assertRejected(lambda d: lesson(d, 2)["vocab"][0].update(id="hsk2-lvyou"), "id kata duplikat")

    def test_lessons_must_be_numbered_in_order(self):
        self.assertRejected(lambda d: lesson(d, 2).update(number=5), "berurutan")

    def test_syllable_counter(self):
        self.assertTrue(count_syllables_ok("Jīchǎng lí zhèr hěn yuǎn.", 6))  # 这儿 = zhè + r
        self.assertTrue(count_syllables_ok("Zhèlǐ de miàntiáo hěn hǎochī.", 8))
        self.assertTrue(count_syllables_ok("Tā shì dì-yī ge dào jiàoshì de.", 9))
        self.assertTrue(count_syllables_ok("Zhège fángjiān yǒudiǎnr xiǎo.", 8))  # 这个房间有点儿小
        self.assertFalse(count_syllables_ok("Zhège fángjiān yǒudiǎnr xiǎo.", 7))
        self.assertFalse(count_syllables_ok("Nǐ hǎo", 3))


if __name__ == "__main__":
    unittest.main()
