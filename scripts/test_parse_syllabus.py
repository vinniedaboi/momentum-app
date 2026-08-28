import unittest

from scripts.parse_syllabus import parse


class ParseSyllabusTest(unittest.TestCase):
    def test_wrapped_titles_controls_and_stages(self):
        text = """
Cambridge syllabus for 2026 Subject content
AS Level subject content
10
Group 2
10.1 \x07Similarities and trends in the properties of the Group 2 metals, magnesium to barium, and
their compounds
Learning outcomes
Candidates should be able to:
1
describe the trend
27
www.cambridgeinternational.org/alevel
Back to contents page
A Level subject content
27
Group 2
27.1 Similarities and trends in the properties of the Group 2 metals, magnesium to barium, and
their compounds
Learning outcomes
4 Details of the assessment
"""
        chapters, points = parse(text)

        self.assertEqual(chapters, [("10", "Group 2", "AS"), ("27", "Group 2", "A2")])
        self.assertEqual(points, [
            ("10.1", "10", "Similarities and trends in the properties of the Group 2 metals, magnesium to barium, and their compounds", "AS"),
            ("27.1", "27", "Similarities and trends in the properties of the Group 2 metals, magnesium to barium, and their compounds", "A2"),
        ])

    def test_content_before_lone_a_level_marker_is_as(self):
        text = """
Example syllabus for 2026 Subject content
1
Foundations
1.1 First principles
Learning outcomes
A Level subject content
2
Advanced work
2.1 Advanced principles
Learning outcomes
4 Details of the assessment
"""
        chapters, _ = parse(text)
        self.assertEqual([row[2] for row in chapters], ["AS", "A2"])


    def test_igcse_prefixed_codes_carry_core_and_extended_levels(self):
        """IGCSE Maths-family syllabuses head the section "Syllabus content" and
        encode Core/Extended in the code itself."""
        text = """
Cambridge syllabus for 2026 Syllabus content
C1
Number
C1.1 Types of number
Learning outcomes
E1
Number
E1.1 Types of number
Learning outcomes
4 Details of the assessment
"""
        chapters, points = parse(text)

        self.assertEqual(chapters, [("C1", "Number", "Core"), ("E1", "Number", "Extended")])
        self.assertEqual(points, [
            ("C1.1", "C1", "Types of number", "Core"),
            ("E1.1", "E1", "Types of number", "Extended"),
        ])

    def test_repeated_column_label_is_stripped_from_titles(self):
        """The IGCSE sciences print Core/Supplement in a column that lands at the
        end of the extracted title."""
        text = """
Cambridge syllabus for 2026 Syllabus content
1
Cell biology
1.1 Diffusion Core
Learning outcomes
1.2 Osmosis Core
Learning outcomes
1.3 Active transport Supplement
Learning outcomes
4 Details of the assessment
"""
        _, points = parse(text)

        self.assertEqual(points, [
            ("1.1", "1", "Diffusion", "Core"),
            ("1.2", "1", "Osmosis", "Core"),
            ("1.3", "1", "Active transport", "Supplement"),
        ])

    def test_lone_trailing_core_is_kept(self):
        """One "Core" is more likely part of a real title than a column label."""
        text = """
Cambridge syllabus for 2026 Subject content
1
Plate tectonics
1.1 The Earth's Core
Learning outcomes
4 Details of the assessment
"""
        _, points = parse(text)

        self.assertEqual([row[2] for row in points], ["The Earth's Core"])


if __name__ == "__main__":
    unittest.main()
