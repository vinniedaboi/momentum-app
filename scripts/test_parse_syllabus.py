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


if __name__ == "__main__":
    unittest.main()
