import unittest

from scripts.parse_uk import parse_aqa, parse_ocr


class ParseAqaTest(unittest.TestCase):
    def test_reads_the_subject_content_section_and_its_two_levels(self):
        text = """
3 Subject content
11
4 Scheme of assessment
59
3 Subject content
Each section begins with an overview.
3.1 Biological molecules
All life on Earth shares a common chemistry.
3.1.1 Monomers and polymers
Content
3.1.2 Carbohydrates
3.2 Cells
3.2.1 Cell structure
4 Scheme of assessment
"""
        chapters, points = parse_aqa(text)

        self.assertEqual(chapters, [
            ("3.1", "Biological molecules", "AS"),
            ("3.2", "Cells", "AS"),
        ])
        self.assertEqual(points, [
            ("3.1.1", "3.1", "Monomers and polymers", None),
            ("3.1.2", "3.1", "Carbohydrates", None),
            ("3.2.1", "3.2", "Cell structure", None),
        ])

    def test_a_level_only_chapters_are_marked_and_the_rest_are_as(self):
        """The suffix is the only place the spec says which year content sits in."""
        text = """
3 Subject content
3.1 Biological molecules
3.1.1 Monomers and polymers
3.5 Energy transfers (A-level only)
3.5.1 Photosynthesis
4 Scheme of assessment
"""
        chapters, _ = parse_aqa(text)

        self.assertEqual([(code, level) for code, _, level in chapters],
                         [("3.1", "AS"), ("3.5", "A Level")])

    def test_headings_broken_across_lines_are_stitched_back(self):
        """A wrapped title continues in lower case; a broken hyphen keeps its dash."""
        text = """
3 Subject content
3.3 Organisms exchange substances with their
environment
3.3.1 Gas exchange
3.7 Genetics, populations and ecosystems (A-
level only)
3.7.1 Inheritance
4 Scheme of assessment
"""
        chapters, _ = parse_aqa(text)

        self.assertEqual([title for _, title, _ in chapters], [
            "Organisms exchange substances with their environment",
            "Genetics, populations and ecosystems (A-level only)",
        ])

    def test_prose_under_a_heading_is_not_absorbed_into_it(self):
        text = """
3 Subject content
3.1 Cells
All life on Earth shares a common chemistry.
3.1.1 Cell structure
3.2 Transport
3.2.1 Diffusion
4 Scheme of assessment
"""
        chapters, _ = parse_aqa(text)
        self.assertEqual([title for _, title, _ in chapters], ["Cells", "Transport"])

    def test_a_spec_with_no_subject_content_section_yields_nothing(self):
        self.assertEqual(parse_aqa("1 Introduction\n1.1 Why choose AQA\n"), ([], []))


class ParseOcrTest(unittest.TestCase):
    def test_module_topics_become_chapters_and_their_content_becomes_points(self):
        """OCR nests three deep; the middle and inner levels are the useful pair."""
        text = """
2c. Content of modules 1 to 6
Module 1: Development of practical skills
1.1 Practical skills assessed in a written examination
1.1.1 Planning
1.1.2 Implementing
Module 2: Foundations in biology
2.1 Foundations in biology
2.1.1 Cell structure
3a. Forms of assessment
"""
        chapters, points = parse_ocr(text)

        self.assertEqual(chapters, [
            ("1.1", "Practical skills assessed in a written examination", None),
            ("2.1", "Foundations in biology", None),
        ])
        self.assertEqual(points, [
            ("1.1.1", "1.1", "Planning", None),
            ("1.1.2", "1.1", "Implementing", None),
            ("2.1.1", "2.1", "Cell structure", None),
        ])

    def test_codes_separated_by_a_tab_are_read(self):
        """OCR sets the code in its own column, which extracts as a tab."""
        text = (
            "2c. Content of modules\n"
            "2.1\t Foundations in biology\n"
            "2.1.1\t Cell structure\n"
            "2.2\t Exchange and transport\n"
            "2.2.1\t Gas exchange\n"
            "3a. Forms of assessment\n"
        )
        chapters, points = parse_ocr(text)

        self.assertEqual([title for _, title, _ in chapters],
                         ["Foundations in biology", "Exchange and transport"])
        self.assertEqual([code for code, _, _, _ in points], ["2.1.1", "2.2.1"])

    def test_content_after_the_assessment_section_is_not_read(self):
        """The appendices renumber from 1, and would otherwise be read as content."""
        text = """
2c. Content of modules
2.1 Foundations in biology
2.1.1 Cell structure
2.2 Exchange and transport
2.2.1 Gas exchange
3a. Forms of assessment
9.1 Appendix
9.1.1 Mathematical requirements
"""
        chapters, points = parse_ocr(text)

        self.assertNotIn("9.1", [code for code, _, _ in chapters])
        self.assertEqual(len(points), 2)

    def test_the_humanities_table_layout_is_read_too(self):
        """The humanities set the code in its own column, so it extracts alone
        with the title wrapped on the lines beneath it."""
        text = """
2c. Content of Component 1: Microeconomics
1. Introduction to Microeconomics
Topic
Students should be able to:
1.1
The economic
problem
Explain:
Economic goods and free goods
1.2
The allocation of
resources
Evaluate:
2. The role of markets
2.1
Market structures
3a. Forms of assessment
"""
        chapters, points = parse_ocr(text)

        self.assertEqual([(code, title) for code, title, _ in chapters],
                         [("1", "Introduction to Microeconomics"), ("2", "The role of markets")])
        self.assertEqual([(code, parent, title) for code, parent, title, _ in points], [
            ("1.1", "1", "The economic problem"),
            ("1.2", "1", "The allocation of resources"),
            ("2.1", "2", "Market structures"),
        ])

    def test_the_richer_of_the_two_layouts_wins(self):
        """A science spec matches the tabular chapter pattern too; the nested
        read finds more, so it is the one kept."""
        text = """
2c. Content of modules
2.1 Foundations in biology
2.1.1 Cell structure
2.1.2 Biological molecules
2.2 Exchange and transport
2.2.1 Gas exchange
3a. Forms of assessment
"""
        chapters, points = parse_ocr(text)
        self.assertEqual([code for code, _, _ in chapters], ["2.1", "2.2"])
        self.assertEqual(len(points), 3)

    def test_a_menu_of_options_yields_nothing_rather_than_a_guess(self):
        """History A is a free choice of units, not a numbered tree."""
        text = """
2b. Content of A Level in History A
Learners will be required to study a variety of historical topics.
Ensuring course coherence
Centres have a free choice over how to combine units.
3a. Forms of assessment
"""
        self.assertEqual(parse_ocr(text), ([], []))

    def test_one_chapter_alone_is_treated_as_a_failed_read(self):
        text = "2c. Content of modules\n2.1 Foundations\n2.1.1 Cell structure\n3a. Forms of assessment\n"
        self.assertEqual(parse_ocr(text), ([], []))


if __name__ == "__main__":
    unittest.main()
