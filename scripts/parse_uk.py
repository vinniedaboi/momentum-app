"""Extracts a chapter/point outline from AQA and OCR A-level specifications.

The English boards each lay their content out differently, and neither matches
Cambridge's template or Pearson's:

  AQA  numbers everything under one "Subject content" section — `3.1 Cells` for
       a chapter and `3.1.1 Cell structure` for a point. Chapters that are not
       co-taught with the AS carry an "(A-level only)" suffix, which is the only
       place the specification says which year content belongs to.

  OCR  nests three deep: `Module 2` holds `2.1 Foundations in biology`, which
       holds `2.1.1 Cell structure`. The middle and inner levels are the useful
       pair, so the modules are left as grouping and `N.N`/`N.N.N` become the
       chapter and point.

Pearson's UK A levels are laid out like its International ones and are read by
parse_pearson, so they have no reader here.

Both boards wrap long headings across lines and repeat a running header on every
page; `heading_at` handles the first and SKIP the second.
"""
import re
import unicodedata

# Running headers, page furniture and the column labels inside content tables.
SKIP = re.compile(
    r"^(visit (aqa|ocr)\.org\.uk|aqa (as|gcse|a-level)|©|version \d|"
    r"content$|learning outcomes$|additional guidance$|opportunities for skills|"
    r"development$|learners should be able|www\.|\d+\s*$|"
    r"specification at a glance|scheme of assessment|general administration)",
    re.I,
)

AQA_SECTION = re.compile(r"^(\d{1,2})\s+Subject content\s*$", re.I)
# OCR heads its content section "2c. Content of modules 1 to 6" and follows it
# with the assessment section, which is where the content stops.
OCR_SECTION = re.compile(r"^\d[a-z]?\.\s*Content of\b", re.I)
OCR_SECTION_END = re.compile(r"^3[a-z]?[.\s]\s*(Forms of assessment|Assessment\b)", re.I)

A_LEVEL_ONLY = re.compile(r"\(\s*A-?\s*level\s+only\s*\)", re.I)

# An OCR content table sets the code in one column and the outcomes in another,
# so its column headings and bullets land between a heading and its title.
COLUMN_HEADING = re.compile(
    r"^(topic|students should be able|explain|evaluate|calculate|"
    r"learning outcomes|additional guidance)\b", re.I)
BULLET = re.compile(r"^[•●▪‣·∙◦�\-–]$")


def normalise(text):
    printable = "".join(" " if unicodedata.category(char).startswith("C") else char for char in text)
    return re.sub(r"\s+", " ", printable).replace("’", "'").strip()


def clean(text):
    """Drops the dot leaders a contents entry trails behind its page number."""
    return re.sub(r"\s*\.{3,}.*$", "", normalise(text)).strip()


def heading_at(lines, index, pattern):
    """Reads one heading, stitching back the lines a PDF broke it across.

    A wrapped heading continues in lower case ("... with their" / "environment")
    or breaks after a hyphen that belongs to the word ("(A-" / "level only)").
    The hyphen is kept, because these specifications break on word boundaries
    rather than hyphenating, so one that appears is part of the term. Anything
    starting upper case is the prose underneath, not more of the title.
    """
    match = pattern.match(clean(lines[index]))
    if not match:
        return None, index + 1

    code, title = match.group(1), clean(match.group(2))
    look = index + 1
    while look < len(lines) and len(title) < 150:
        nxt = clean(lines[look])
        if not nxt:
            look += 1
            continue
        if pattern.match(nxt) or SKIP.match(nxt):
            break
        if title.endswith("-"):
            title, look = title + nxt, look + 1
            continue
        if nxt[0].islower() or nxt.startswith("("):
            title, look = title + " " + nxt, look + 1
            continue
        break
    return (code, re.sub(r"\s+", " ", title).strip(" .")), look


def bare_heading_at(lines, index, pattern):
    """Reads a heading whose code sits alone on its line.

    OCR sets the code in its own table column, so the humanities specifications
    extract as a bare `1.1` with the title on the lines after it, wrapped:

        1.1
        The economic
        problem
        Explain:

    The title is the run of lines up to the first that starts a new thought —
    the table's own column headings, a bullet, or the next code.
    """
    match = pattern.match(clean(lines[index]))
    if not match:
        return None, index + 1

    pieces, look = [], index + 1
    while look < len(lines) and len(" ".join(pieces)) < 90:
        nxt = clean(lines[look])
        if not nxt:
            look += 1
            continue
        if pattern.match(nxt) or SKIP.match(nxt) or COLUMN_HEADING.match(nxt) or BULLET.match(nxt):
            break
        # The first line is the title; later ones only continue a wrapped one.
        if pieces and not nxt[0].islower():
            break
        pieces.append(nxt)
        look += 1
    title = re.sub(r"\s+", " ", " ".join(pieces)).strip(" .:")
    return ((match.group(1), title), look) if title else (None, index + 1)


def collect(lines, chapter_pattern, point_pattern, level_of=lambda title: None,
            point_reader=heading_at):
    """Walks a content region, attaching each point to the chapter above it."""
    chapters, points, seen = [], [], set()
    current = None

    index = 0
    while index < len(lines):
        # Points first: `3.1.1` also matches a `3.1` pattern's prefix.
        found, step = point_reader(lines, index, point_pattern)
        if found:
            code, title = found
            parent = code.rsplit(".", 1)[0]
            if current and parent == current and title and ("p", code) not in seen:
                seen.add(("p", code))
                points.append((code, parent, title, None))
            index = step
            continue

        found, step = heading_at(lines, index, chapter_pattern)
        if found:
            code, title = found
            # Headings repeat in the contents list and across page breaks; the
            # first reading is the one inside the region, so keep it.
            if title and ("c", code) not in seen:
                seen.add(("c", code))
                chapters.append((code, title, level_of(title)))
            current = code
            index = step
            continue

        index += 1

    used = {parent for _, parent, _, _ in points}
    kept = [entry for entry in chapters if entry[0] in used]
    # A single chapter means the headings were never really found.
    return (kept, points) if len(kept) >= 2 else ([], [])


def region(lines, start_pattern, end_pattern):
    """The body copy of a section, skipping the contents page that lists it.

    A specification names its sections twice, once in the contents and again
    over the content itself, so the heading alone does not say which is which.
    The body copy is the one with the section's worth of text under it, so of
    every heading that matches, the region is the one running furthest before
    the section that ends it. That also picks the right heading when a board
    splits its content into several sections — OCR heads one per component,
    `2c. Content of Component 1`, `2d ...` — where taking the last would leave
    only the final component's worth of lines.
    """
    starts = [index for index, line in enumerate(lines) if start_pattern.match(clean(line))]
    if not starts:
        return []

    def ends_at(start):
        return next((index for index in range(start + 1, len(lines))
                     if end_pattern.match(clean(lines[index]))), len(lines))

    start = max(starts, key=lambda index: ends_at(index) - index)
    return lines[start:ends_at(start)]


def parse_aqa(text):
    lines = text.split("\n")
    section = next((AQA_SECTION.match(clean(line)) for line in lines if AQA_SECTION.match(clean(line))), None)
    if not section:
        return [], []
    number = section.group(1)

    chapter = re.compile(r"^(" + number + r"\.\d{1,2})\s+(\S.*)$")
    point = re.compile(r"^(" + number + r"\.\d{1,2}\.\d{1,2})\s+(\S.*)$")
    end = re.compile(r"^" + str(int(number) + 1) + r"\s+\S", re.I)

    body = region(lines, AQA_SECTION, end)
    # "(A-level only)" marks the year-two content; the rest is co-taught with AS.
    return collect(body, chapter, point,
                   level_of=lambda title: "A Level" if A_LEVEL_ONLY.search(title) else "AS")


def parse_ocr(text):
    """OCR writes its content two ways, so both are read and the fuller wins.

    The sciences nest three deep and set every heading inline — `2.1 Foundations
    in biology` holding `2.1.1 Cell structure`. The humanities nest two deep and
    set the code in its own table column, so it extracts alone on its line with
    the title wrapped underneath. Neither layout reads the other's.

    A specification that is a menu of options rather than a numbered tree, as
    History A is, yields nothing from either — which is the honest answer for it.
    """
    body = region(text.split("\n"), OCR_SECTION, OCR_SECTION_END)

    nested = collect(
        body,
        re.compile(r"^(\d{1,2}\.\d{1,2})[\t ]+(\S.*)$"),
        re.compile(r"^(\d{1,2}\.\d{1,2}\.\d{1,2})[\t ]+(\S.*)$"),
    )
    tabular = collect(
        body,
        re.compile(r"^(\d{1,2})\.[\t ]+([A-Z].*)$"),
        re.compile(r"^(\d{1,2}\.\d{1,2})$"),
        point_reader=bare_heading_at,
    )
    return max(nested, tabular, key=lambda found: len(found[1]))
