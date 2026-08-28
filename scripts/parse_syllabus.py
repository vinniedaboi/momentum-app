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

BOILERPLATE = re.compile(r"^(learning outcomes|candidates should be able to|notes and guidance|key concept)", re.I)
POINT_CODE = re.compile(r"^(\d{1,2}\.\d{1,2})(?!\.)\s*(.*)$")
CHAPTER_CODE = re.compile(r"^(\d{1,2})(?:\s+(.*))?$")
STAGE_HEADING = re.compile(r"^(AS|A) Level (?:subject )?content$", re.I)


def content_region(lines):
    """Trims to the subject-content pages, using the running page headers.

    Cambridge content pages carry a header like "…syllabus for 2025… Subject
    content"; the assessment section that follows carries "…Details of the
    assessment". Those bracket the real content and separate it from the table
    of contents (which uses dotted leaders) and the timetables that follow.
    """
    start = None
    for index, line in enumerate(lines):
        if re.search(r"syllabus for .*subject content\s*$", line.strip(), re.I):
            start = index + 1
            break
    if start is None:
        for index, line in enumerate(lines):
            if index > 40 and re.match(r"^(AS Level |A Level )?subject content\s*$", line.strip(), re.I):
                start = index + 1
                break
    if start is None:
        start = 0

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
            if not re.search(r"syllabus for .*(subject content|details of)", line.strip(), re.I)]


def looks_like_title(text):
    """Titles are short noun phrases; learning outcomes are lowercase verb clauses."""
    text = clean_title(text)
    if not text or BOILERPLATE.match(text) or FRONT_MATTER.match(text):
        return False
    if len(text) > 300:
        return False
    first = text.strip()[0]
    return first.isupper() or first.isdigit()


# Section headings that belong to the document, not the subject content.
FRONT_MATTER = re.compile(
    r"^(why choose|syllabus overview|subject content|details of the assessment|"
    r"practical assessment|additional information|other information|assessment at a glance|"
    r"assessment objectives|scheme of assessment|before you start|content overview|"
    r"cambridge international)",
    re.I,
)


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
    return re.sub(r"\s*\.{3,}.*$", "", cleaned).replace("’", "'").rstrip(". ").strip()


def usable_chapter_title(text):
    cleaned = clean_title(text)
    # Chapter titles are short capitalised noun phrases; prose runs long and
    # often starts lower-case or ends mid-sentence.
    if not (4 <= len(cleaned) <= 120):
        return None
    if not cleaned[0].isupper():
        return None
    if " " not in cleaned and len(cleaned) < 6:
        return None
    if BOILERPLATE.match(cleaned) or FRONT_MATTER.match(cleaned) or NOT_A_TITLE.match(cleaned) or "assumed" in cleaned.lower():
        return None
    return cleaned


def is_navigation(text):
    return bool(re.match(r"^(back to contents|www\.|©|\d{1,3}$)", clean_title(text), re.I))


def point_title(lines, index, inline_title):
    """Read a point title, including wrapped continuation lines."""
    pieces = []
    if inline_title:
        pieces.append(clean_title(inline_title))
    look = index + 1
    while look < len(lines) and len(pieces) < 3:
        candidate = clean_title(lines[look])
        if not candidate:
            look += 1
            continue
        if (BOILERPLATE.match(candidate) or FRONT_MATTER.match(candidate)
                or POINT_CODE.match(candidate) or CHAPTER_CODE.fullmatch(candidate)
                or is_navigation(candidate)):
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


def explicit_chapter_title(lines, chapter_num, before_index):
    """Find the chapter's own numbered heading before its first sub-point."""
    candidates = []
    for index in range(before_index):
        line = normalise_line(lines[index])
        match = CHAPTER_CODE.match(line)
        if not match or match.group(1) != chapter_num:
            continue
        title = clean_title(match.group(2) or "")
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
            point_stage[code] = stage_at(markers, index)

    # Pass 2: derive each chapter's title from the line just above its first point.
    chapter_nums = sorted({code.split(".")[0] for code in point_titles}, key=int)
    chapters = []
    for num in chapter_nums:
        firsts = sorted((c for c in point_titles if c.split(".")[0] == num),
                        key=lambda value: int(value.split(".")[1]))
        anchor = point_line[firsts[0]]
        title = explicit_chapter_title(lines, num, anchor)
        chapters.append((num, title or f"Topic {num}", point_stage[firsts[0]]))

    points = sorted(((code, code.split(".")[0], point_titles[code], point_stage[code]) for code in point_titles),
                    key=lambda item: [int(part) for part in item[0].split(".")])
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
