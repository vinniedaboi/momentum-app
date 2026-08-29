"""Extracts a chapter/point outline from an IB Diploma Programme subject brief.

The IB does not publish its subject guides - they sit behind the programme
resource centre - but every course has a public two-page subject brief, and the
"syllabus component" table in it is the course's own outline. Three shapes
appear across the suite:

  coded     Business management and computer science number their content:
            `Unit 1: Introduction to business management` over `1.1 What is a
            business?`, `A Concepts of computer science` over `A.1 Computer
            fundamentals`.
  lettered  Mathematics heads a chapter `Topic A: Number and algebra` and codes
            its content `A1 Sequences`.
  bulleted  The 2023 sciences name a theme and bullet its topics, marking the
            ones only HL students take with a trailing asterisk.

Higher level content is flagged three ways depending on the brief - `(HL only)`,
a leading `HL only:` or `HL extension`, and the asterisk - and comes back as an
academic level of HL, which is what files it under the HL track. Everything else
is SL content, which HL students study too, and carries no level.

The teaching-hour columns land in the extracted text as bare numbers between
entries; those, the running headers and everything outside the table are dropped.
A brief that only names its components - several of the arts do - yields chapters
and no points, which the caller reads as no syllabus rather than as an empty one.
"""
import re
import unicodedata

BULLET = "•●▪‣·"
# Where the syllabus table starts, and the section that always follows it.
TABLE_HEAD = re.compile(r"^(syllabus (?:component|content|outline)s?|components?|"
                        r"curriculum model overview)\b", re.I)
TABLE_MARKER = re.compile(r"(teaching hours|^sl$|^hl$|^syllabus content$)", re.I)
TABLE_END = re.compile(r"^(iii\.|iv\.|assessment (?:model|at a glance|objectives)|"
                       r"external assessment|internal assessment$|total(?: teaching hours)?$)", re.I)

# `1.1 What is a business?`, `A.1 Computer fundamentals`, `A1 Sequences`. A bare
# number is never a point: a brief that heads its components `1 Cell biology`
# means that as a chapter.
POINT_CODE = re.compile(r"^([A-Z]?\d{1,2}(?:\.\d{1,2})+|[A-Z]\.?\d{1,2})\.?\s+(\S.*)$")
# `Unit 1: Introduction to business management`, `Topic A: Number and algebra`
NAMED_CHAPTER = re.compile(r"^(?:unit|topic|theme|area|option|part|section)\s+"
                           r"([A-Z]|\d{1,2})\s*[:.–—-]?\s*(\S.*)$", re.I)
# `A Concepts of computer science`
LETTER_CHAPTER = re.compile(r"^([A-Z])\s+([A-Z]\S.*)$")

HL_SUFFIX = re.compile(r"\s*[(\[]\s*HL(?:\s+only)?\s*[)\]]\s*$", re.I)
HL_PREFIX = re.compile(r"^HL(?:\s+only|\s+extension)\s*[:–—-]\s*", re.I)
HL_STAR = re.compile(r"\s*\*+\s*$")
HL_WORDS = re.compile(r"^(hl|ahl|additional higher level|hl extension|hl only)\b", re.I)

# The hour columns, and the running header and footer of every page.
NOISE = re.compile(r"^(\d+(\.\d+)?|[a-z]|sl|hl|and|or|the|"
                   r"(recommended\s+)?teaching\s*hours?|recommended|"
                   r"syllabus (component|content|outline)s?|components?|"
                   r"curriculum model overview|total.*|"
                   r"first assessments?.*|diploma programme subject brief.*|"
                   r"international baccalaureate.*|©.*|page \d.*)$", re.I)
HEADING_LIMIT = 70
# The older briefs set their syllabus table in two columns, which comes out of
# the PDF as half-sentences: "from different cultural contexts.", "Critique of
# the maximizing behaviour of". Every real entry is a title, so it starts with a
# capital and does not trail off.
FRAGMENT = re.compile(r"^[a-z]|[,;]$|\s(and|or|of|the|to|for|with|from|in)$")
# Above this share of fragments the table was not read in the order it was
# written, and the outline that comes out of it would be an invention.
FRAGMENT_LIMIT = 0.25
FOOTNOTE = re.compile(r"^\*+\s*(topics?|content)\b", re.I)


def normalise(text):
    printable = "".join(" " if unicodedata.category(char).startswith("C") else char for char in text)
    return re.sub(r"\s+", " ", printable).replace("’", "'").strip()


def strip_level(title):
    """Pulls the higher-level marker off a title, whichever way the brief writes it."""
    level = None
    if HL_SUFFIX.search(title):
        title, level = HL_SUFFIX.sub("", title), "HL"
    if HL_PREFIX.match(title):
        title, level = HL_PREFIX.sub("", title), "HL"
    if HL_STAR.search(title):
        title, level = HL_STAR.sub("", title), "HL"
    return title.strip(" :–—-"), level


def region(lines):
    """The lines of the syllabus table, found by its heading and the section after it.

    A brief lists its own contents page first, so the heading is only the table
    where the hours columns follow it.
    """
    start = None
    for index, line in enumerate(lines):
        if not TABLE_HEAD.match(line):
            continue
        window = lines[index + 1:index + 6]
        if any(TABLE_MARKER.search(item) for item in window):
            start = index + 1
            break
        if start is None and any(POINT_CODE.match(item) for item in window):
            start = index + 1
            break
    if start is None:
        return []

    end = len(lines)
    for index in range(start, len(lines)):
        if TABLE_END.match(lines[index]):
            end = index
            break
    return lines[start:end]


def parent_code(code):
    """The chapter a point's own code belongs to: `1.1` to 1, `A.1` and `A1` to A."""
    head = code.split(".")[0]
    letters = re.match(r"^[A-Z]+", head)
    return letters.group(0) if letters and letters.group(0) != head else head


def usable(title):
    return bool(title) and 2 < len(title) <= 160 and not NOISE.match(title) and not FOOTNOTE.match(title)


def parse(text):
    lines = [normalise(line) for line in text.split("\n")]
    lines = [line for line in lines if line]
    body = region(lines)

    chapters, points = [], []
    chapter_code = None
    bulleted = False
    read = fragments = 0

    def next_code():
        """A number no named chapter has already taken."""
        taken = {code for code, _, _ in chapters}
        number = len(chapters) + 1
        while str(number) in taken:
            number += 1
        return str(number)

    for line in body:
        if FOOTNOTE.match(line):
            continue

        # A bullet arrives either alone on its line or leading the topic it marks.
        if line and line[0] in BULLET:
            bulleted = True
            line = line[1:].strip(" \t")
            if not line:
                continue
        elif line.strip() in set(BULLET):
            bulleted = True
            continue

        title, level = strip_level(line)
        if not usable(title):
            bulleted = False
            continue
        read += 1
        if FRAGMENT.search(title):
            fragments += 1
            bulleted = False
            continue

        coded = POINT_CODE.match(title)
        named = NAMED_CHAPTER.match(title)
        lettered = LETTER_CHAPTER.match(title)

        if named and not coded:
            chapter_code = named.group(1).upper()
            chapters.append((chapter_code, strip_level(named.group(2))[0], level))
            bulleted = False
        elif coded and chapters:
            code, body_text = coded.group(1), strip_level(coded.group(2))[0]
            # A numbered point names its own chapter, so it is filed under that
            # rather than under whichever heading was read last.
            points.append((code, parent_code(code) or chapter_code, body_text, level))
            bulleted = False
        elif lettered and not bulleted:
            chapter_code = lettered.group(1)
            chapters.append((chapter_code, strip_level(lettered.group(2))[0], level))
        elif bulleted and chapter_code:
            index = sum(1 for point in points if point[1] == chapter_code) + 1
            points.append(("{}.{}".format(chapter_code, index), chapter_code, title, level))
        elif len(title) <= HEADING_LIMIT:
            # An unmarked line opens a component: the themes of the 2023 sciences
            # and the `Core` of global politics are both written this way.
            chapter_code = next_code()
            chapters.append((chapter_code, title, level))
            bulleted = False
        else:
            # Prose. Several briefs describe a component in a paragraph beneath
            # it, and a sentence is not a heading.
            bulleted = False

    # Two signs that the table was not read in the order it was written, both of
    # which the older two-column briefs show: half-sentences where the columns
    # were interleaved, and a chapter code arriving twice.
    if read and fragments / read > FRAGMENT_LIMIT:
        return [], []
    codes = [code for code, _, _ in chapters]
    if len(codes) != len(set(codes)):
        return [], []

    # A code that never got its chapter would import as an orphan.
    known = {code for code, _, _ in chapters}
    points = [point for point in points if point[1] in known]
    return chapters, points
