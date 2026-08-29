"""Extracts a chapter/point outline from a Pearson Edexcel International A Level
specification.

Pearson's specs do not follow Cambridge's template, so they get their own parser.
Two shapes appear across the suite:

  sciences   `Topic 1 - Molecules, Transport and Health` headings, under which the
             learning outcomes are numbered `1.1`, `1.2` ... with the code sitting
             alone on its own line and the text following it.
  unit-based `Unit 1: Markets in Action` headings, whose content is numbered three
             deep: `1.3.1 Introductory concepts`. The `N.1`/`N.2` entries are unit
             description and assessment boilerplate, not content.

Pages repeat a heading with "(continued)" when content spills over; those repeats
are dropped.
"""
import re
import unicodedata

DASH = "\\-\u2010-\u2015\u2212"  # hyphen first so it is not read as a range
TOPIC_HEADING = re.compile(r"^Topic\s+(\d{1,2})\s*[" + DASH + r":]\s*(.*)$", re.I)
UNIT_HEADING = re.compile(r"^Unit\s+(\d{1,2})\s*[" + DASH + r":]\s*(.*)$", re.I)
BARE_CODE = re.compile(r"^(\d{1,2}\.\d{1,3})$")
INLINE_CODE = re.compile(r"^(\d{1,2}\.\d{1,3})\s+(\S.*)$")
DEEP_CODE = re.compile(r"^(\d{1,2}\.\d{1,2}\.\d{1,2})\s+(\S.*)$")
# Physics and Maths drop the Topic/Unit wording and head each chapter with a
# bare number, e.g. "6. Trigonometry".
NUMBER_HEADING = re.compile(r"^(\d{1,2})\.?\s+([A-Z].*)$")
DEEP_MINIMUM = 10
FLAT_MINIMUM = 30
CONTINUED = re.compile(r"\s*\(continued\)\s*$", re.I)
# `Unit P1: Pure Mathematics 1`, `Unit 4: Rates, Equilibria and Further Organic
# Chemistry` — the boundary between the specifications a file carries.
UNIT_LABEL = re.compile(r"^Unit\s+([A-Z]{0,2}\d{1,2})\s*:", re.I)
# A specification ends with a notation appendix, whose sections are numbered and
# named exactly like content - "7. Complex numbers", "9. Vectors" - but whose
# entries are symbols: "a the vector a". Its own heading is no use as the place
# to stop: it opens the contents page, it repeats in the running header of every
# page of the appendix, and in the maths specification it also ends a sentence
# mid-content that points at it. The line introducing the tables appears once.
NOTATION_APPENDIX = re.compile(r"^the (following notation|tables? below set out "
                               r"the notation)", re.I)

# Structural entries every Pearson unit carries before its real content.
UNIT_BOILERPLATE = re.compile(r"^(unit description|assessment information|unit content|"
                              r"externally assessed|overview of assessment)", re.I)
NOT_CONTENT = re.compile(r"^(www\.|pearson |issue \d|contents|introduction|"
                         r"specification|qualification at a glance|assessment objectives?|"
                         r"grade descriptors?|appendix|glossary|command words|"
                         r"sample assessment|mathematical skills|the context|"
                         # A Pearson specification numbers its own sections, so
                         # "1 About this specification" competes with "1 Principles
                         # of chemistry" for the number the content sits under, and
                         # a unit-based one repeats "1 Examination" before each of
                         # its units. Those headings have to lose, or a subject
                         # opens with a chapter named after the front matter.
                         r"examination$|prerequisites?$|notation and formulae|"
                         r"about (this|the) (specification|qualification)|"
                         r"administration|assessment (information|overview)|"
                         r"[a-z]+ content$|subject content|"
                         r"entries and|malpractice|access arrangements|"
                         r"private candidates|awarding and reporting|"
                         r"student recruitment|prior learning|progression)", re.I)


def normalise(text):
    printable = "".join(" " if unicodedata.category(char).startswith("C") else char for char in text)
    return re.sub(r"\s+", " ", printable).replace("’", "'").strip()


def clean(text):
    text = CONTINUED.sub("", normalise(text))
    return re.sub(r"\s*\.{3,}.*$", "", text).rstrip(". ").strip()


def usable(text):
    if not text or len(text) < 3 or len(text) > 200:
        return False
    return not (NOT_CONTENT.match(text) or UNIT_BOILERPLATE.match(text))


def read_title(lines, index):
    """Pearson prints the code and its text as separate lines; stitch them back."""
    pieces = []
    look = index + 1
    while look < len(lines) and len(pieces) < 3:
        candidate = clean(lines[look])
        if not candidate:
            look += 1
            continue
        if (BARE_CODE.match(candidate) or INLINE_CODE.match(candidate)
                or DEEP_CODE.match(candidate) or TOPIC_HEADING.match(candidate)
                or UNIT_HEADING.match(candidate) or NOT_CONTENT.match(candidate)):
            break
        pieces.append(candidate)
        look += 1
        if pieces and len(" ".join(pieces)) > 40:
            break
    return clean(" ".join(pieces))


def restarts_numbering(lines, pattern):
    """Whether the document numbers its sections from 1 again for each unit.

    The International A Level maths specification holds fifteen units in one
    file, so seventeen different titles claim the number 1. Chemistry holds six
    units in one file and numbers its topics 1 to 20 straight through, which
    needs none of this. One number wearing two titles is ordinary — a contents
    entry, a bibliography line caught by the same pattern — so the test is four.
    """
    titles = {}
    for raw in lines:
        match = pattern.match(normalise(raw))
        if not match:
            continue
        title = clean(match.group(2) or "")
        if usable(title):
            titles.setdefault(match.group(1), set()).add(CONTINUED.sub("", title).lower())
    return any(len(names) >= 4 for names in titles.values())


def headings(lines, pattern, label_units=False):
    """First occurrence of each numbered heading, ignoring contents-page repeats.

    Where the numbering restarts per unit, the unit is part of the name: two
    chapters called Trigonometry, one from P1 and one from P3, are a different
    ten and eight points, and a learner has no way to tell them apart otherwise.
    """
    found = {}
    unit = None
    for index, raw in enumerate(lines):
        line = normalise(raw)
        if label_units:
            unit_match = UNIT_LABEL.match(line)
            if unit_match:
                unit = unit_match.group(1).upper()
        match = pattern.match(line)
        if not match:
            continue
        number, title = match.group(1), clean(match.group(2) or "")
        if not title:
            title = read_title(lines, index)
        if usable(title) and number not in found:
            found[number] = ("{} · {}".format(unit, title) if unit else title, index)
    return found


def content_only(lines):
    """Everything up to the notation appendix, which is back matter.

    Reading it left International A Level Maths with 75 symbols among its 129
    points - "the set of rational numbers", "is proportional to" - and a chapter
    called "D1 - Vectors", labelled from the paper-code table two pages earlier
    when vectors are P4.
    """
    for index, raw in enumerate(lines):
        if NOTATION_APPENDIX.match(normalise(raw)):
            return lines[:index]
    return lines


def collect(lines, deep):
    """Reads either the three-deep unit codes or the flat N.M codes."""
    found = {}
    for index, raw in enumerate(lines):
        line = normalise(raw)
        if deep:
            match = DEEP_CODE.match(line)
            if not match:
                continue
            code, title = match.group(1), clean(match.group(2))
        else:
            if DEEP_CODE.match(line):
                continue
            bare, inline = BARE_CODE.match(line), INLINE_CODE.match(line)
            if bare:
                code, title = bare.group(1), read_title(lines, index)
            elif inline:
                code, title = inline.group(1), clean(inline.group(2))
            else:
                continue
        if usable(title) and code not in found:
            found[code] = title
    return found


def parse(text):
    lines = content_only([line.rstrip() for line in text.split("\n")])
    topics = headings(lines, TOPIC_HEADING)
    units = headings(lines, UNIT_HEADING)

    # Unit-based specs number their content three deep, but several specs carry
    # Unit headings for assessment while numbering content flat. Take whichever
    # actually yields content rather than trusting the headings.
    if units and not topics:
        point_titles = collect(lines, deep=True)
        if len(point_titles) < DEEP_MINIMUM:
            # Some unit-headed specs number their content flat instead. Only trust
            # that reading when it is dense enough to be real content — the language
            # specs have no numbered content at all and yield a handful of stray
            # assessment-criteria lines that look like points but are not.
            flat = collect(lines, deep=False)
            point_titles = flat if len(flat) >= FLAT_MINIMUM else point_titles
    else:
        point_titles = collect(lines, deep=False)

    if topics:
        parents, kind = topics, "topic"
    elif units and any("." in code and code.count(".") == 2 for code in point_titles):
        parents, kind = units, "unit"
    else:
        # Only a file whose numbering restarts needs its units named: chemistry
        # runs its topics 1 to 20 across six of them and reads fine without.
        numbered = headings(lines, NUMBER_HEADING, label_units=restarts_numbering(lines, NUMBER_HEADING))
        parents, kind = (numbered or units), "chapter" if numbered else "unit"

    chapters = []
    for number in sorted({code.split(".")[0] for code in point_titles}, key=int):
        title = parents.get(number, (None, None))[0]
        chapters.append((number, title or "{} {}".format(kind.title(), number), None))

    points = sorted(
        ((code, code.split(".")[0], point_titles[code], None) for code in point_titles),
        key=lambda item: [int(part) for part in item[0].split(".")],
    )
    return chapters, points
