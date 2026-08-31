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
        end of the extracted title, and a point whose table starts a page carries
        both of that table's bands."""
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
2
Enzymes
2.1 Enzyme action Core Supplement
Learning outcomes
4 Details of the assessment
"""
        _, points = parse(text)

        self.assertEqual(points, [
            ("1.1", "1", "Diffusion", "Core"),
            ("1.2", "1", "Osmosis", "Core"),
            ("1.3", "1", "Active transport", "Supplement"),
            ("2.1", "2", "Enzyme action", "Core"),
        ])

    def test_lone_trailing_core_is_kept(self):
        """One "Core" is more likely part of a real title than a column label."""
        text = """
Cambridge syllabus for 2026 Subject content
1
Plate tectonics
1.1 The Earth's Core
Learning outcomes
2
Waves
2.1 Seismic waves
Learning outcomes
4 Details of the assessment
"""
        _, points = parse(text)

        self.assertEqual([row[2] for row in points], ["The Earth's Core", "Seismic waves"])

    def test_a_single_topic_is_no_reading_at_all(self):
        """Numbering that covers one topic is the document's, not the syllabus's:
        it has to come back empty so the prose-and-bullets reader is tried."""
        text = """
Cambridge syllabus for 2026 Subject content
4
Specialist option: Systems & Control
4.1 Structures
Learning outcomes
4.2 Mechanisms
Learning outcomes
5 Details of the assessment
"""
        self.assertEqual(parse(text), ([], []))

    def test_the_first_content_page_is_read(self):
        """The running header only starts on the section's second page, so the
        section's own numbered heading has to open the region. Reading from the
        header instead cost IGCSE Chemistry the whole of `1 States of matter`,
        and Physics and Biology the heading of topic 1 and its first sub-topic."""
        text = "\n".join("filler {}".format(number) for number in range(45)) + """
3 Subject content
This syllabus gives you the flexibility to design a course.
1
States of matter
1.1 Solids, liquids and gases
Learning outcomes
1.2 Diffusion
Learning outcomes
Cambridge IGCSE Chemistry 0620 syllabus for 2026 Subject content
2
Atoms, elements and compounds
2.1 Elements, compounds and mixtures
Learning outcomes
4 Details of the assessment
"""
        chapters, points = parse(text)

        self.assertEqual([title for _, title, _ in chapters],
                         ["States of matter", "Atoms, elements and compounds"])
        self.assertEqual([row[0] for row in points], ["1.1", "1.2", "2.1"])

    def test_a_one_word_topic_beats_an_outcome_numbered_like_it(self):
        """Learning outcomes restart at 1 under every point, so one of them is
        always numbered like the topic that follows. `3 Waves` has to win that,
        or the chapter is titled with an outcome from the topic before it."""
        text = """
Cambridge syllabus for 2026 Subject content
2
Thermal physics
2.1 Transfer of thermal energy
Learning outcomes
3
Describe the effect of surface colour on the emission of radiation
3
Waves
3.1 General properties of waves
Learning outcomes
4 Details of the assessment
"""
        chapters, _ = parse(text)

        self.assertEqual([title for _, title, _ in chapters], ["Thermal physics", "Waves"])

    def test_a_sub_point_does_not_run_into_the_point_above(self):
        """Physics divides `1.5 Forces` again into `1.5.1 Effects of forces`.
        The tree stops at two levels, but the sub-point is still a heading."""
        text = """
Cambridge syllabus for 2026 Subject content
1
Motion, forces and energy
1.5 Forces
1.5.1 Effects of forces
Learning outcomes
1.6 Momentum
Learning outcomes
2
Thermal physics
2.1 Kinetic particle model of matter
2.1.1 States of matter
Learning outcomes
4 Details of the assessment
"""
        _, points = parse(text)

        self.assertEqual([row[2] for row in points],
                         ["Forces", "Momentum", "Kinetic particle model of matter"])

    def test_a_code_may_carry_its_own_full_stop(self):
        """Agriculture writes `8.1.` and puts the title on the next line."""
        text = """
Cambridge syllabus for 2026 Subject content
8
Pasture management
8.1.
Extensive and intensive pasture management
Candidates should be able to:
9
Livestock breeding
9.1.
Selection of breeding stock
Candidates should be able to:
10 Details of the assessment
"""
        chapters, points = parse(text)

        self.assertEqual([title for _, title, _ in chapters],
                         ["Pasture management", "Livestock breeding"])
        self.assertEqual([row[2] for row in points],
                         ["Extensive and intensive pasture management", "Selection of breeding stock"])

    def test_a_point_may_be_spelled_lower_case(self):
        """`pH` and `eSafety` are spelled that way; a learning outcome that has
        to be kept out is lower-case all through its first word."""
        text = """
Cambridge syllabus for 2026 Subject content
2
Water
2.1 The water cycle
Learning outcomes
2.2 pH and salinity
Learning outcomes
3
Safety
3.1 eSafety
Learning outcomes
4 Details of the assessment
"""
        _, points = parse(text)

        self.assertEqual([row[2] for row in points],
                         ["The water cycle", "pH and salinity", "eSafety"])

    def test_a_topic_headed_by_its_theme_or_bare_number_is_named(self):
        """Geography heads a topic "Theme 1: …", and the Maths syllabuses number
        their points C1.1 and E1.1 but head both topics `1 Number`."""
        geography = """
Cambridge syllabus for 2026 Subject content
Theme 1: Population and settlement
1.1 Population dynamics
Candidates should be able to:
Theme 2: The natural environment
2.1 Earthquakes and volcanoes
Candidates should be able to:
4 Details of the assessment
"""
        maths = """
Cambridge syllabus for 2026 Syllabus content
Core subject content
1
Number
C1.1 Types of number
Notes and examples
Extended subject content
1
Number
E1.1 Types of number
Notes and examples
4 Details of the assessment
"""
        self.assertEqual([title for _, title, _ in parse(geography)[0]],
                         ["Population and settlement", "The natural environment"])
        self.assertEqual(parse(maths)[0], [("C1", "Number", "Core"), ("E1", "Number", "Extended")])


if __name__ == "__main__":
    unittest.main()
