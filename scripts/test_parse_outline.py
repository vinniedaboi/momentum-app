import unittest

from scripts.parse_outline import parse

# region_of() only looks for the content heading past the contents pages.
HEADER = "\n".join("filler {}".format(n) for n in range(45)) + "\n3 Subject content"


class ParseOutlineTest(unittest.TestCase):
    def test_numbered_key_questions_take_their_bullets(self):
        """Cambridge History numbers each key question, then lists focus points."""
        text = HEADER + """
1
Were the revolutions of 1848 important?
Focus points
•
Why had liberalism grown in influence by 1848?
•
Why were there so many revolutions in 1848?
2
How was Italy unified?
Focus points
•
Why was Italy not unified in 1848?
4 Details of the assessment
"""
        chapters, points = parse(text)

        self.assertEqual([title for _, title, _ in chapters],
                         ["Were the revolutions of 1848 important?", "How was Italy unified?"])
        self.assertEqual([row[2] for row in points], [
            "Why had liberalism grown in influence by 1848?",
            "Why were there so many revolutions in 1848?",
            "Why was Italy not unified in 1848?",
        ])

    def test_named_skill_sections_become_chapters(self):
        """First Language English names its sections instead of numbering them."""
        text = HEADER + """
Reading
•
Demonstrate understanding of written texts.
•
Summarise and use material for a specific context.
Writing
•
Express what is thought, felt and imagined.
•
Organise and convey facts effectively.
4 Details of the assessment
"""
        chapters, points = parse(text)

        self.assertEqual([title for _, title, _ in chapters], ["Reading", "Writing"])
        self.assertEqual([row[1] for row in points], ["1", "1", "2", "2"])

    def test_everything_under_one_heading_is_rejected(self):
        """A single chapter holding every bullet means the headings were missed,
        which reads worse than importing nothing."""
        text = HEADER + """
Examples
•
identify and understand factual information
•
a range of short and longer text types
•
texts with different purposes
4 Details of the assessment
"""
        self.assertEqual(parse(text), ([], []))

    def test_content_outside_the_subject_section_is_ignored(self):
        text = """
Why choose Cambridge?
•
We are a not-for-profit organisation.
•
Our qualifications are recognised worldwide.
"""
        self.assertEqual(parse(text), ([], []))


if __name__ == "__main__":
    unittest.main()
