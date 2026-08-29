import unittest

from scripts.parse_ib import parse


class ParseIbTest(unittest.TestCase):
    def test_bulleted_themes_mark_higher_level_with_an_asterisk(self):
        """The 2023 sciences bullet their topics under a theme."""
        text = """
Syllabus component
Recommended teaching hours
SL
HL
Syllabus content
110
180
Unity and diversity
•
Water
•
Nucleic acids
•
Origins of cells  *
19
33
Form and function
•
Carbohydrates and lipids
26
39
* Topics with content that should only be taught to HL students
III. Assessment model
"""
        chapters, points = parse(text)

        self.assertEqual(chapters, [("1", "Unity and diversity", None), ("2", "Form and function", None)])
        self.assertEqual(points, [
            ("1.1", "1", "Water", None),
            ("1.2", "1", "Nucleic acids", None),
            ("1.3", "1", "Origins of cells", "HL"),
            ("2.1", "2", "Carbohydrates and lipids", None),
        ])

    def test_numbered_units_read_their_codes_and_hl_only_markers(self):
        """Business management numbers its content and names the HL additions."""
        text = """
Component
Recommended
teaching hours
Unit 1: Introduction to business management
1.1   What is a business?
1.2   Types of business entities
20
Unit 2: Human resource management
2.1   Introduction to human resource management
2.2   Organizational culture (HL only)
35
III. Assessment model
"""
        chapters, points = parse(text)

        self.assertEqual(chapters, [
            ("1", "Introduction to business management", None),
            ("2", "Human resource management", None),
        ])
        self.assertEqual(points, [
            ("1.1", "1", "What is a business?", None),
            ("1.2", "1", "Types of business entities", None),
            ("2.1", "2", "Introduction to human resource management", None),
            ("2.2", "2", "Organizational culture", "HL"),
        ])

    def test_lettered_topics_file_their_points_under_the_letter(self):
        """Mathematics heads a chapter `Topic A` and codes its content `A1`."""
        text = """
Syllabus component
Recommended teaching hours
SL
HL
Topic A: Number and algebra
A1 Sequences
A2 Complex numbers (HL only)
19
42
Topic B: Functions
B1 Representation of functions
33
46
III. Assessment model
"""
        chapters, points = parse(text)

        self.assertEqual(chapters, [("A", "Number and algebra", None), ("B", "Functions", None)])
        self.assertEqual(points, [
            ("A1", "A", "Sequences", None),
            ("A2", "A", "Complex numbers", "HL"),
            ("B1", "B", "Representation of functions", None),
        ])

    def test_a_table_read_out_of_order_yields_nothing(self):
        """The older briefs set the table in two columns, which the text layer
        interleaves into half-sentences. An outline built from those was never in
        the brief, so the subject is better off without one."""
        text = """
Syllabus component
Teaching hours
SL
HL
Visual arts in context
Examine and compare the work of artists
from different cultural contexts.
Consider the contexts influencing their
own work and the work of others.
III. Assessment model
"""
        self.assertEqual(parse(text), ([], []))

    def test_a_brief_that_only_names_its_components_yields_no_points(self):
        """Several of the arts describe a component rather than listing topics;
        the caller reads chapters without points as no syllabus."""
        text = """
Syllabus component
Teaching hours
SL
HL
Reading film
45
Contextualizing film
45
III. Assessment model
"""
        chapters, points = parse(text)

        self.assertEqual([title for _, title, _ in chapters], ["Reading film", "Contextualizing film"])
        self.assertEqual(points, [])


if __name__ == "__main__":
    unittest.main()
