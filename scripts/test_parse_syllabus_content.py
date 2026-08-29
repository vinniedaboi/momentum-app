import unittest

from scripts.parse_syllabus_content import is_content, name_unread_chapters


class IsContentTest(unittest.TestCase):
    def test_keeps_a_one_word_spec_point(self):
        """`3.2 Osmosis` is a whole syllabus point in IGCSE Biology."""
        self.assertTrue(is_content("Osmosis"))
        self.assertTrue(is_content("Enzymes"))

    def test_keeps_a_point_written_in_another_script(self):
        """AQA Panjabi lists its vocabulary in Gurmukhi, and it is content."""
        self.assertTrue(is_content("Prepositions (eg ਤੋਂ, ਥੱਲੇ, ਉੱਤੇ, ਨਾਲ ਆਕਦ)"))

    def test_drops_a_row_of_an_assessment_table(self):
        """The hours and weightings a specification prints in its overview."""
        self.assertFalse(is_content("120 3 30%"))
        self.assertFalse(is_content("56 40-42 AO3"))
        self.assertFalse(is_content("N=5 0 -"))

    def test_drops_a_data_sheet_constant(self):
        """A number beside its units is not a statement about the subject."""
        self.assertFalse(is_content("x 10-19 C"))
        self.assertFalse(is_content("x 10-14 mol2 dm-6"))

    def test_drops_notation_the_text_layer_pulled_apart(self):
        """Maths specifications carry a notation glossary; dy/dx comes out as this."""
        self.assertFalse(is_content("d d y"))
        self.assertFalse(is_content("E( ) X"))


class NameUnreadChaptersTest(unittest.TestCase):
    def test_leaves_a_real_heading_alone(self):
        chapters = [("1", "Principles of chemistry", None), ("2", "Inorganic chemistry", "AS")]
        self.assertEqual(name_unread_chapters(chapters), chapters)

    def test_renames_a_heading_that_is_really_a_sentence(self):
        """The branch keeps its points; only the name it could not read goes.

        Dropping these cost 125 real spec points in Edexcel's Science Double
        Award, whose chapter headings came out as bibliography entries.
        """
        prose = ("1", "OECD - Better Skills, Better Jobs, Better Lives: A Strategic "
                      "Approach to Skills Policies (OECD Publishing, 2012)", None)
        self.assertEqual(name_unread_chapters([prose]), [("1", "Topic 1", None)])


if __name__ == "__main__":
    unittest.main()
