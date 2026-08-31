"""Extracts a chapter/point outline from a Cambridge syllabus PDF's text dump.

The Cambridge AS & A Level syllabi share a broad template: the "subject content"
section lists numbered topics (chapters) like `1 Atomic structure` and sub-topics
(points) like `1.1 Particles in the atom`, each followed by numbered learning
outcomes that restart at 1 under every point. We keep the chapters and points and
drop the learning-outcome prose.
"""
import re
import sys
import unicodedata

# The headers a syllabus puts above a table of learning outcomes. "Key concepts"
# is not among them: Cambridge heads a front-matter section with it, which sits
# outside the content region, while inside the content region it is a spec point
# in its own right — every topic of IGCSE Psychology opens with one.
BOILERPLATE = re.compile(r"^(learning outcomes|candidates should be able to|"
                         r"candidates should know and understand|notes and guidance|"
                         r"notes and examples)", re.I)
# The lookahead keeps a sub-point code like `1.5.1` from being read as the point
# `1.5`. It has to let a full stop through on its own, though: Agriculture ends
# every code with one, and `8.1.` is a point.
POINT_CODE = re.compile(r"^([A-Z]{0,2}\d{1,2}\.\d{1,2})(?!\.\d)\s*(.*)$")
CHAPTER_CODE = re.compile(r"^([A-Z]{0,2}\d{1,2})(?:\s+(.*))?$")
NAMED_CHAPTER = re.compile(r"^(?:Theme|Topic|Unit|Section|Module|Part)\s+([A-Z]{0,2}\d{1,2})\s*[:.–-]\s*(.+)$", re.I)
CONTINUED = re.compile(r"\s*\(?continued\)?$", re.I)
FIRST_WORD = re.compile(r"^[^\W\d_]+", re.UNICODE)
# The punctuation a heading puts between its number and its name.
CODE_SEPARATOR = re.compile(r"^[:–—-]\s*")
STAGE_HEADING = re.compile(r"^(AS|A) Level (?:subject )?content$", re.I)

# The two markers that open the subject-content section: the heading it carries
# in the body, which Cambridge numbers ("3 Subject content"), and the running
# page header that repeats above every page of the section after the first.
CONTENT_HEADING = re.compile(r"^\d{0,2}\s*(?:AS Level |A Level )?(?:subject|syllabus) content\s*$", re.I)
RUNNING_HEADER = re.compile(r"syllabus for .*(?:subject|syllabus) content\s*$", re.I)

# A sub-point code — `1.5.1 Effects of forces` under point 1.5. The tree is two
# levels deep, so these are not read as points, but they head the lines that
# follow them and must not be swallowed into the title of the point above.
SUBPOINT_CODE = re.compile(r"^[A-Z]{0,2}\d{1,2}(?:\.\d{1,2}){2,}\b")

# Cambridge IGCSE splits its content into Core and Extended/Supplement rather
# than the AS/A2 stages the A Level syllabuses use. The Maths-family syllabuses
# encode that in the code itself (C1.1, E1.1); the sciences put it in a column
# that lands at the end of the extracted title.
LEVEL_PREFIX = {"C": "Core", "E": "Extended"}
LEVEL_SUFFIX = re.compile(r"\s+(Core|Supplement|Extended)$", re.I)


def code_key(code):
    """Sort key that orders C1.2 before C1.10 and keeps Core ahead of Extended."""
    prefix = re.match(r"^[A-Z]*", code).group(0)
    return (prefix, [int(re.sub(r"\D", "", part) or 0) for part in code.split(".")])


def level_from_code(code):
    return LEVEL_PREFIX.get(re.match(r"^[A-Z]*", code).group(0))


def content_region(lines):
    """Trims to the subject-content pages, using the running page headers.

    Cambridge content pages carry a header like "…syllabus for 2025… Subject
    content"; the assessment section that follows carries "…Details of the
    assessment". Those bracket the real content and separate it from the table
    of contents (which uses dotted leaders) and the timetables that follow.

    That running header starts a page late, though: the first content page is
    headed by the section's own numbered title instead. Everything on it was
    being read as front matter, which in the sciences is a whole topic — IGCSE
    Chemistry opens with `1 States of matter` and lost it, and Physics and
    Biology each lost the heading of topic 1 and its first sub-topic. So open
    the region at whichever marker comes first.
    """
    start = 0
    for index, line in enumerate(lines):
        stripped = normalise_line(line)
        if "...." in stripped:
            continue  # table-of-contents leaders
        if RUNNING_HEADER.search(stripped) or (index > 40 and CONTENT_HEADING.match(stripped)):
            start = index + 1
            break

    end = len(lines)
    for index in range(start, len(lines)):
        stripped = lines[index].strip()
        if "...." in stripped:
            continue  # table-of-contents leaders
        if re.match(r"^\d*\s*Details of the assessment\s*$", stripped, re.I) or re.match(r"^\d*\s*Other information\s*$", stripped, re.I):
            end = index
            break

    # Drop the running headers themselves so they do not look like content.
    return [line for line in lines[start:end]
            if not re.search(r"syllabus for .*(?:subject content|syllabus content|details of)", line.strip(), re.I)]


def looks_like_title(text):
    """Titles are short noun phrases; learning outcomes are lowercase verb clauses.

    A title can still open lower-case, where its first word is spelled that way:
    Marine Science has `2.2 pH and salinity` and ICT has `8.2 eSafety`. Both
    carry a capital inside that first word, which a verb clause never does. So
    what rules a point out is a first word that is lower-case throughout — not a
    first character that merely is not a capital, which also throws out the ʿ
    that opens Religious Studies' `I4.1 ʿId al-Adha`.

    A title still has to start with a letter or a digit. What a code-shaped
    number picks up out of a table starts with neither: the Avogadro constant
    reads `6.02 × 1023 particles`, and an assessment grid gives `11.5 % of the
    A Level`.
    """
    text = clean_title(text)
    if not text or BOILERPLATE.match(text) or FRONT_MATTER.match(text):
        return False
    if len(text) > 300:
        return False
    opening = FIRST_WORD.match(text)
    return not opening.group(0).islower() if opening else text[0].isdigit()


# Section headings that belong to the document, not the subject content.
FRONT_MATTER = re.compile(
    r"^(why choose|syllabus overview|subject content|details of the assessment|"
    r"practical assessment|additional information|other information|assessment at a glance|"
    r"assessment objectives|scheme of assessment|before you start|content overview|"
    r"cambridge international)",
    re.I,
)


# The labels the sciences head a table column with. They sit where a chapter
# title sits — one short capitalised word on its own line — and a topic named
# in one word ("Waves", "Drugs") has to be told apart from them by name rather
# than by length, or the reader falls through to the first learning outcome
# that happens to be numbered like the topic and titles the chapter with that.
COLUMN_LABEL = re.compile(r"(core|supplement|extended|continued)", re.I)


# Navigation, cross-reference and assumed-knowledge lines that sit near headings
# but are not chapter titles.
NOT_A_TITLE = re.compile(
    r"^(back to contents|refer to|an understanding of|knowledge of the content|"
    r"vector notation|paper\s*\d|www\.|candidates|note[:s]|for more information|"
    r"the following|this is assumed|it is assumed)",
    re.I,
)


def normalise_line(text):
    """Remove PDF control glyphs and collapse its many kinds of whitespace."""
    printable = "".join(" " if unicodedata.category(char).startswith("C") else char for char in text)
    return re.sub(r"\s+", " ", printable).strip()


def clean_title(text):
    cleaned = normalise_line(text)
    cleaned = re.sub(r"\s*\.{3,}.*$", "", cleaned).replace("’", "'").rstrip(". ").strip()
    # A heading that runs on to the next page is repeated at the top of it and
    # marked as carried over. The mark belongs to the layout, not to the title.
    return CONTINUED.sub("", cleaned).strip()


def usable_chapter_title(text):
    cleaned = clean_title(text)
    # Chapter titles are short capitalised noun phrases; prose runs long and
    # often starts lower-case or ends mid-sentence.
    if not (4 <= len(cleaned) <= 120):
        return None
    if not cleaned[0].isupper():
        return None
    if COLUMN_LABEL.fullmatch(cleaned):
        return None
    if BOILERPLATE.match(cleaned) or FRONT_MATTER.match(cleaned) or NOT_A_TITLE.match(cleaned) or "assumed" in cleaned.lower():
        return None
    return cleaned


def is_navigation(text):
    return bool(re.match(r"^(back to contents|www\.|©|\d{1,3}$)", clean_title(text), re.I))


def point_title(lines, index, inline_title):
    """Read a point title, including wrapped continuation lines."""
    pieces = []
    # A code that carries its own full stop leaves nothing behind it on the line.
    if clean_title(inline_title or ""):
        pieces.append(clean_title(inline_title))
    look = index + 1
    while look < len(lines) and len(pieces) < 3:
        candidate = clean_title(lines[look])
        if not candidate:
            look += 1
            continue
        if (BOILERPLATE.match(candidate) or FRONT_MATTER.match(candidate)
                or POINT_CODE.match(candidate) or CHAPTER_CODE.fullmatch(candidate)
                or SUBPOINT_CODE.match(candidate) or is_navigation(candidate)):
            break
        pieces.append(candidate)
        look += 1
    return clean_title(" ".join(pieces))


def stage_markers(lines):
    markers = []
    for index, line in enumerate(lines):
        match = STAGE_HEADING.match(normalise_line(line))
        if match:
            markers.append((index, "AS" if match.group(1).upper() == "AS" else "A2"))
    return markers


def stage_at(markers, index):
    # Several Cambridge PDFs label only the A Level continuation. In those
    # documents the content before that marker is the AS portion.
    stage = "AS" if markers and markers[0][1] == "A2" else None
    for marker_index, marker_stage in markers:
        if marker_index > index:
            break
        stage = marker_stage
    return stage


def heads_chapter(line, chapter_num):
    """Whether `line` is the heading of chapter `chapter_num`, and its title.

    A chapter is headed by its own code — `10 Group 2` — or by a word for what
    the syllabus calls its divisions, which Geography numbers "Theme 1:
    Population and settlement". Where the code carries a Core/Extended prefix
    the heading usually does not: the Maths syllabuses number the points C1.1
    and E1.1 but head both topics `1 Number`, under a "Core subject content"
    or "Extended subject content" banner that the prefix comes from.
    """
    match = NAMED_CHAPTER.match(line) or CHAPTER_CODE.match(line)
    if not match:
        return None
    found = match.group(1)
    if found != chapter_num and found != re.sub(r"^[A-Z]+", "", chapter_num):
        return None
    # Travel & Tourism writes "1 – Introduction to …"; the dash is punctuation.
    return CODE_SEPARATOR.sub("", match.group(2) or "")


def explicit_chapter_title(lines, chapter_num, before_index):
    """Find the chapter's own numbered heading before its first sub-point."""
    candidates = []
    for index in range(before_index):
        line = normalise_line(lines[index])
        heading = heads_chapter(line, chapter_num)
        if heading is None:
            continue
        title = clean_title(heading)
        if not title:
            look = index + 1
            while look < before_index and not clean_title(lines[look]):
                look += 1
            if look < before_index and not is_navigation(lines[look]):
                title = clean_title(lines[look])
        usable = usable_chapter_title(title)
        if usable:
            candidates.append((index, usable))
    return candidates[-1][1] if candidates else None


def parse(text):
    raw = [line.rstrip() for line in text.split("\n")]
    lines = content_region(raw)
    markers = stage_markers(lines)

    # Pass 1: points N.M are the reliable signal — collect them with titles.
    point_titles = {}
    point_line = {}
    point_stage = {}
    for index, rawline in enumerate(lines):
        match = POINT_CODE.match(normalise_line(rawline))
        if not match:
            continue
        code = match.group(1)
        title = point_title(lines, index, match.group(2))
        if code not in point_titles and looks_like_title(title):
            point_titles[code] = title
            point_line[code] = index
            point_stage[code] = stage_at(markers, index) or level_from_code(code)

    # A repeated trailing "Core"/"Supplement" is the column label bleeding into
    # the title, not part of it; a lone one is more likely genuine ("Earth's Core").
    # A point whose table starts a page carries both of its bands, so strip until
    # the labels run out and keep the one nearest the title: a point that opens
    # with Core content is Core, whatever follows it further down the table.
    tagged = [code for code, title in point_titles.items() if LEVEL_SUFFIX.search(title)]
    if len(tagged) >= 3:
        for code in tagged:
            label = None
            while True:
                match = LEVEL_SUFFIX.search(point_titles[code])
                if not match:
                    break
                point_titles[code] = point_titles[code][:match.start()].strip()
                label = match.group(1).title()
            point_stage[code] = point_stage[code] or label

    # Pass 2: derive each chapter's title from the line just above its first point.
    chapter_nums = sorted({code.split(".")[0] for code in point_titles}, key=code_key)
    chapters = []
    for num in chapter_nums:
        firsts = sorted((c for c in point_titles if c.split(".")[0] == num),
                        key=lambda value: int(re.sub(r"\D", "", value.split(".")[1]) or 0))
        anchor = point_line[firsts[0]]
        title = explicit_chapter_title(lines, num, anchor)
        chapters.append((num, title or f"Topic {num}", point_stage[firsts[0]]))

    # A single chapter means the numbering was never the syllabus's own: Design &
    # Technology numbers only the specialist option a candidate picks, and
    # Islamiyat only its papers, so both came back as one topic holding a handful
    # of points. That reading is worse than none, because it stops the reader for
    # prose-and-bullets syllabuses — which is what these are — from being tried.
    if len(chapters) < 2:
        return [], []

    points = sorted(((code, code.split(".")[0], point_titles[code], point_stage[code]) for code in point_titles),
                    key=lambda item: code_key(item[0]))
    return chapters, points


if __name__ == "__main__":
    import io
    path = sys.argv[1]
    text = io.open(path, encoding="utf-8").read()
    chapters, points = parse(text)
    out = io.open(sys.argv[2], "w", encoding="utf-8") if len(sys.argv) > 2 else sys.stdout
    out.write(f"CHAPTERS: {len(chapters)}  POINTS: {len(points)}\n")
    for code, title, stage in chapters:
        out.write(f"  [{code}] {title} ({stage or 'unassigned'})\n")
        for pcode, parent, ptitle, point_stage in points:
            if parent == code:
                out.write(f"      {pcode}  {ptitle} ({point_stage or 'unassigned'})\n")
