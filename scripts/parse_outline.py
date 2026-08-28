"""Reads syllabuses that describe their content in prose headings and bullets
rather than numbered spec points.

Cambridge only numbers `1.1`-style points in its science-shaped syllabuses. History,
the first-language English syllabuses and most humanities instead name their sections
("Core content: Option A", "Depth Study B", "Reading") and list what has to be covered
as bullets underneath. That is still a chapter/point tree - it just has to be read
from the layout instead of a numbering scheme.

Used only when the numbered reader finds nothing, so a syllabus that numbers its
content is never read this way.
"""
import re
import sys

from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from parse_syllabus import normalise_line  # noqa: E402

# PDF bullets extract as a lone glyph on their own line, with the text following.
BULLET = re.compile(r"^[•●▪‣·∙◦\-–]$")
NUMBER_ONLY = re.compile(r"^(\d{1,2})$")
SECTION = re.compile(r"^(Core content|Depth [Ss]tudy|Option|Component|Section|Theme|Unit|Paper)\b")
SKIP = re.compile(
    r"^(back to contents|www\.|©|page \d|cambridge|learning outcomes|candidates should|"
    r"focus points?|specified content|key questions?|assessment objectives?|"
    r"teachers? |candidates |students |for examination|all candidates|in addition|"
    # Headings that describe how the paper is marked rather than what is studied.
    r"examples?|skills demonstrated|assessment criteria|marking|grade descript|"
    r"command words|weighting|scheme of assessment|exemplar)",
    re.I,
)


# The numbered reader trims to the running page header, which starts a page late
# and would drop the first section. These syllabuses head their content with a
# numbered section title in the body instead.
CONTENT_START = re.compile(r'^\d{0,2}\s*(?:Subject|Syllabus) content\s*$', re.I)
CONTENT_END = re.compile(r'^\d{0,2}\s*(?:Details of the assessment|Other information)\s*$', re.I)


def region_of(lines):
    start = next((index + 1 for index, line in enumerate(lines)
                  if index > 40 and CONTENT_START.match(normalise_line(line))), None)
    if start is None:
        return []
    end = next((index for index in range(start, len(lines))
                if CONTENT_END.match(normalise_line(lines[index]))), len(lines))
    return lines[start:end]


def clean(text):
    text = normalise_line(text).replace("’", "'")
    return re.sub(r"\s*\.{3,}.*$", "", text).strip()


def is_heading(text):
    """Headings are short, capitalised and not sentences."""
    if not (4 <= len(text) <= 110) or SKIP.match(text):
        return False
    if not (text[0].isupper() or text[0].isdigit()):
        return False
    return not text.endswith((".", ",", ";", ":")) or bool(SECTION.match(text))


def usable_point(text):
    return bool(text) and 8 <= len(text) <= 300 and not SKIP.match(text)


def parse(text):
    lines = [line.rstrip() for line in text.split("\n")]
    region = region_of(lines)

    chapters = []          # (code, title)
    by_title = {}
    points = []
    seen = set()
    counted = {}
    current = None

    def open_chapter(title):
        """Headings repeat across pages and in contents lists; keep the first."""
        key = title.lower()
        if key not in by_title:
            by_title[key] = str(len(chapters) + 1)
            chapters.append((by_title[key], title))
        return by_title[key]

    index = 0
    while index < len(region):
        line = clean(region[index])
        if not line:
            index += 1
            continue

        # "1" alone, with the heading it numbers on the next line.
        number = NUMBER_ONLY.match(line)
        if number and index + 1 < len(region):
            title = clean(region[index + 1])
            if is_heading(title) and not BULLET.match(title):
                current = open_chapter(title)
                index += 2
                continue

        if BULLET.match(line):
            look, pieces = index + 1, []
            while look < len(region) and len(pieces) < 2:
                candidate = clean(region[look])
                if not candidate:
                    look += 1
                    continue
                if BULLET.match(candidate) or NUMBER_ONLY.match(candidate) or SKIP.match(candidate):
                    break
                # A wrapped line continues a sentence, so it starts lower-case.
                # Anything capitalised is the next heading, not more of this point.
                if pieces and not candidate[0].islower():
                    break
                pieces.append(candidate)
                look += 1
                if len(" ".join(pieces)) > 60:
                    break
            body_text = " ".join(pieces).strip()
            if current and usable_point(body_text) and (current, body_text.lower()) not in seen:
                seen.add((current, body_text.lower()))
                counted[current] = counted.get(current, 0) + 1
                points.append(("{}.{}".format(current, counted[current]), current, body_text, None))
            index = max(look, index + 1)
            continue

        # Any heading can open a chapter; those that gather no bullets are
        # dropped below, which is what keeps stray capitalised lines out.
        if is_heading(line):
            current = open_chapter(line)

        index += 1

    used = {code for _, code, _, _ in points}
    kept = [(code, title, None) for code, title in chapters if code in used]
    # One chapter holding everything means the headings were never found, not that
    # the syllabus has a single topic - that reading is worse than none.
    if len(kept) < 2:
        return [], []
    return kept, points
