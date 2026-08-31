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

    def test_a_depth_studys_shared_content_hangs_off_the_depth_study(self):
        """A Core content option lists specified content under each key question.
        A Depth study lists all of its key questions first and then one specified
        content covering the study, which belongs to the study rather than to
        whichever key question came last."""
        text = HEADER + """
Depth study A: The First World War, 1914-18
1
Why was there stalemate on the Western Front?
Focus points
•
Why did the Schlieffen Plan fail?
2
Why did Germany ask for an armistice in 1918?
Focus points
•
Why was the German offensive of 1918 unsuccessful?
Specified content
•
The nature and problems of trench warfare
•
The Armistice
4 Details of the assessment
"""
        chapters, points = parse(text)

        by_code = {code: title for code, title, _ in chapters}
        self.assertEqual(sorted(by_code.values()), [
            "Depth study A: The First World War, 1914-18",
            "Why did Germany ask for an armistice in 1918?",
            "Why was there stalemate on the Western Front?",
        ])
        self.assertEqual([(by_code[row[1]], row[2]) for row in points], [
            ("Why was there stalemate on the Western Front?", "Why did the Schlieffen Plan fail?"),
            ("Why did Germany ask for an armistice in 1918?", "Why was the German offensive of 1918 unsuccessful?"),
            ("Depth study A: The First World War, 1914-18", "The nature and problems of trench warfare"),
            ("Depth study A: The First World War, 1914-18", "The Armistice"),
        ])

    def test_content_listed_under_each_key_question_stays_there(self):
        """Written the other way round — one specified content per key question —
        each list belongs to the question above it."""
        text = HEADER + """
Core content: Option A
1
Were the revolutions of 1848 important?
Focus points
•
Why were there so many revolutions in 1848?
Specified content
•
Reasons for the failure of the revolutions
2
How was Italy unified?
Focus points
•
Why was Italy not unified in 1848?
Specified content
•
Austrian influence over Italy
4 Details of the assessment
"""
        chapters, points = parse(text)

        # "Core content: Option A" gathers no bullets of its own and is dropped.
        by_code = {code: title for code, title, _ in chapters}
        self.assertEqual([(by_code[row[1]], row[2]) for row in points], [
            ("Were the revolutions of 1848 important?", "Why were there so many revolutions in 1848?"),
            ("Were the revolutions of 1848 important?", "Reasons for the failure of the revolutions"),
            ("How was Italy unified?", "Why was Italy not unified in 1848?"),
            ("How was Italy unified?", "Austrian influence over Italy"),
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
