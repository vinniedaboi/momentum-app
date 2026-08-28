import unittest

from scripts.parse_pearson import parse


class ParsePearsonTest(unittest.TestCase):
    def test_science_topics_stitch_code_and_wrapped_text(self):
        """The science specs print the outcome code and its text as separate lines."""
        text = """
Topic 1 - Molecules, Transport and Health
1.1
understand the importance of water as a solvent
1.2
know the structure of carbohydrates
"""
        chapters, points = parse(text)

        self.assertEqual(chapters, [("1", "Molecules, Transport and Health", None)])
        self.assertEqual(points, [
            ("1.1", "1", "understand the importance of water as a solvent", None),
            ("1.2", "1", "know the structure of carbohydrates", None),
        ])

    def test_unit_specs_read_three_deep_codes_and_skip_boilerplate(self):
        """Unit-based specs number content `1.3.1`; `1.1`/`1.2` are structural."""
        text = """
Unit 1: Markets in Action
1.1 Unit description
1.2 Assessment information
1.3.1 Introductory concepts
1.3.2 Consumer behaviour and demand
"""
        chapters, points = parse(text)

        self.assertEqual(chapters, [("1", "Markets in Action", None)])
        self.assertEqual(points, [
            ("1.3.1", "1", "Introductory concepts", None),
            ("1.3.2", "1", "Consumer behaviour and demand", None),
        ])

    def test_sparse_flat_numbering_is_not_mistaken_for_content(self):
        """The language specs carry no numbered content. A handful of stray numbered
        lines must not be imported as if they were syllabus points."""
        text = """
Unit 1: Speaking
1.1 Assessment criteria
1.2 Marking grid
"""
        self.assertEqual(parse(text), ([], []))

    def test_topic_heading_accepts_either_dash(self):
        for dash in ["-", "–", ":"]:
            with self.subTest(dash=dash):
                text = "Topic 4 {} Plant Structure\n4.1\nknow the structure of a leaf\n".format(dash)
                chapters, _ = parse(text)
                self.assertEqual(chapters, [("4", "Plant Structure", None)])


if __name__ == "__main__":
    unittest.main()
