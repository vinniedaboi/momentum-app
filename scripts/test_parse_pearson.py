import unittest

from scripts.parse_pearson import (NUMBER_HEADING, content_only, headings,
                                   parse, restarts_numbering)


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

    def test_a_unit_is_named_when_the_numbering_restarts(self):
        """Two chapters called Trigonometry, one from P1 and one from P3, are a
        different eight and ten points, and nothing else tells them apart."""
        lines = ["Unit P1: Pure Mathematics 1", "3. Trigonometry",
                 "Unit P3: Pure Mathematics 3", "3. Differentiation"]
        found = headings(lines, NUMBER_HEADING, label_units=True)
        self.assertEqual(found["3"][0], "P1 · Trigonometry")

    def test_only_a_file_whose_numbering_restarts_is_labelled(self):
        """Chemistry holds six units and numbers its topics 1 to 20 straight
        through, so its chapters need no unit in front of them. Maths holds
        fifteen units that each start again at 1. One number wearing two titles
        is ordinary - a contents entry - so the test is four."""
        restarting = ["1. Algebra", "1. Vectors", "1. Kinematics", "1. Probability"]
        self.assertTrue(restarts_numbering(restarting, NUMBER_HEADING))
        continuous = ["1. Principles of chemistry", "1. Principles of chemistry",
                      "2. Inorganic chemistry", "3. Physical chemistry"]
        self.assertFalse(restarts_numbering(continuous, NUMBER_HEADING))

    def test_the_notation_appendix_is_not_read_as_content(self):
        """It numbers and names its sections exactly as the specification does,
        so `9. Vectors` there was landing beside the real topics with eight
        symbols under it."""
        text = """
Unit P1: Pure Mathematics 1
1. Algebra and functions
1.1 Laws of indices for all rational exponents
The following notation will be used in the examinations.
9. Vectors
9.1 a the vector a
9.2 AB the vector represented in magnitude and direction by AB
"""
        chapters, points = parse(text)
        self.assertEqual([title for _, title, _ in chapters], ["Algebra and functions"])
        self.assertEqual([code for code, _, _, _ in points], ["1.1"])

    def test_a_reference_to_the_appendix_keeps_the_content_after_it(self):
        """A unit points at the appendix mid-content; that must not end the read."""
        lines = ["3. Notation and formulae Students will be expected to understand",
                 "the symbols outlined in", "Appendix 7: Notation.", "4. Integration"]
        self.assertEqual(content_only(lines), lines)

    def test_topic_heading_accepts_either_dash(self):
        for dash in ["-", "–", ":"]:
            with self.subTest(dash=dash):
                text = "Topic 4 {} Plant Structure\n4.1\nknow the structure of a leaf\n".format(dash)
                chapters, _ = parse(text)
                self.assertEqual(chapters, [("4", "Plant Structure", None)])


if __name__ == "__main__":
    unittest.main()
