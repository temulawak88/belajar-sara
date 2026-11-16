#!/usr/bin/env python3
"""Tes untuk validator kosakata. Jalankan: python3 -m unittest tools/test_validate_vocab.py"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate_vocab import segment_pinyin, validate  # noqa: E402


def word(**kw):
    w = {"id": "hsk1-pengyou", "hanzi": "朋友", "pinyin": "péngyou", "hsk": 1, "meaning_en": "friend", "meaning_id": "teman"}
    w.update(kw)
    return w


def errors_for(*words):
    return validate({"schemaVersion": 1, "words": list(words)})


class ValidateVocabTest(unittest.TestCase):
    def test_valid_word_passes(self):
        self.assertEqual(errors_for(word()), [])

    def test_pinyin_without_any_tone_mark_is_rejected(self):
        errs = errors_for(word(pinyin="pengyou"))
        self.assertTrue(any("tanpa tanda nada" in e for e in errs), errs)

    def test_neutral_particles_may_have_no_tone_mark(self):
        self.assertEqual(errors_for(word(id="hsk1-ma", hanzi="吗", pinyin="ma")), [])
        self.assertEqual(errors_for(word(id="hsk2-guo", hsk=2, hanzi="过", pinyin="guo")), [])

    def test_no_tone_must_be_single_characters_of_the_word(self):
        ok = word(id="hsk1-shenme", hanzi="什么", pinyin="shénme", no_tone=["什"])
        self.assertEqual(errors_for(ok), [])
        for bad in (["什么"], ["他"], [], "什", [1]):
            errs = errors_for(word(id="hsk1-shenme", hanzi="什么", pinyin="shénme", no_tone=bad))
            self.assertTrue(any("no_tone" in e for e in errs), (bad, errs))

    def test_pinyin_must_split_into_one_syllable_per_hanzi(self):
        errs = errors_for(word(pinyin="péng"))
        self.assertTrue(any("tidak bisa dipecah" in e for e in errs), errs)

    def test_duplicates_and_bad_ids(self):
        errs = errors_for(word(), word())
        self.assertTrue(any("id duplikat" in e for e in errs))
        self.assertTrue(any("hanzi duplikat" in e for e in errs))
        errs = errors_for(word(id="hsk2-pengyou"))
        self.assertTrue(any("prefix id" in e for e in errs))

    def test_segmentation_rules(self):
        cases = {
            ("qùnián", 2): ["qù", "nián"],
            ("bīnguǎn", 2): ["bīn", "guǎn"],
            ("xi'an", 2): ["xi", "an"],
            ("xian", 2): None,
            ("hǎo", 2): None,
            ("yìdiǎnr", 3): ["yì", "diǎn", "r"],
            ("dǎ diànhuà", 3): ["dǎ", "diàn", "huà"],
        }
        for (p, n), expected in cases.items():
            self.assertEqual(segment_pinyin(p, n), expected, p)


if __name__ == "__main__":
    unittest.main()
