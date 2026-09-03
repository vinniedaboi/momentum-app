"""Reads the assessment overview out of a Cambridge syllabus PDF.

Every syllabus prints, on one page of its Syllabus overview, the components a
candidate sits and what each one is worth. That table is the only place the
weightings are stated, and it is the same document `parse_syllabus.py` already
reads for the subject content — so the grade planner's arithmetic comes from
the board rather than from an assumption about halves.

Two houses styles, both on the same page:

    Cambridge International AS & A Level          Cambridge IGCSE

    Paper 1                                       Paper 1: Multiple Choice (Core)
    Multiple Choice                               45 minutes
    1 hour 15 minutes                             40 marks
    40 marks                                      30%
    ...                                           ...
    31% of the AS Level
    15.5% of the A Level

An A Level component can be worth something towards two different awards — the
AS certificate and the full A Level — and the second is usually half the first,
because AS is half of an A Level. An IGCSE component gives one bare percentage,
because there is only one award to be worth part of.

The page is laid out in columns, so PyMuPDF hands back the headers of a row
together and then their bodies in the same order:

    Paper 1
    Paper 4
    <Paper 1's body, ending in its weightings>
    <Paper 4's body, ending in its weightings>

which is what `pair_up` relies on: the nth header of a run belongs to the nth
weighting group that follows it.
"""
import re

# A component's own heading. Cambridge writes "Paper 3", "Paper 3: Theory
# (Core)", and — on a few syllabuses — "Component 2".
HEADER = re.compile(r"^(Paper|Component)\s+(\d+)\s*(?::\s*(.+?))?\s*$", re.I)

# "31% of the AS Level", "15.5% of the A Level", "30% of the A Level only".
OF_AWARD = re.compile(r"^(\d+(?:\.\d+)?)\s*%\s*of the\s+(.+?)(?:\s+only)?\s*$", re.I)

# The IGCSE form: a percentage on a line of its own, sometimes still carrying
# the tab that separated it from the marks cell beside it.
BARE = re.compile(r"^(\d+(?:\.\d+)?)\s*%\s*$")

MARKS = re.compile(r"^(\d+)\s*marks?\s*$", re.I)
DURATION = re.compile(r"^(?:\d+\s*hours?)?\s*(?:\d+\s*minutes?)?\s*$", re.I)

# The headings that divide an overview into the routes a candidate can take.
SECTION = re.compile(
    r"^(core|extended|practical|written|coursework|speaking|listening|reading|writing)"
    r"\s+(?:assessment|components?|papers?)\s*$",
    re.I,
)
# "Pure Mathematics components", "Probability & Statistics components".
NAMED_SECTION = re.compile(r"^(.{3,60}?)\s+components\s*$", re.I)

# What the syllabus says about when a component is taken.
RULE = re.compile(r"^(compulsory|offered|candidates take|all candidates)\b.*$", re.I)

OVERVIEW = re.compile(r"^\s*Assessment overview\s*$", re.I)

# Page furniture that would otherwise be read as a component's name.
NOISE = re.compile(
    r"^(www\.|back to contents|information on availability|cambridge (international|igcse|o level)\b"
    r"|externally assessed|internally assessed|moderated by cambridge|or)\s*",
    re.I,
)


# The typesetting leaves marks of its own in the extracted text. The older
# template ends a table header with a tab; the 2027 one ends it with a
# backspace, which `strip()` does not consider whitespace — so "Paper 1\x08"
# fails to look like "Paper 1" and a whole syllabus reads as having no
# components at all. The en-space in a running header is the same problem in
# the other direction.
CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
SPACES = re.compile(r"[  -   　]")


def _lines(page_text):
    lines = []
    for raw in page_text.splitlines():
        line = SPACES.sub(" ", CONTROL.sub("", raw)).strip()
        if line:
            lines.append(line)
    return lines


def _award(name):
    """Normalises the award a weighting is against.

    "the AS Level", "the A Level", "the qualification" and "the total mark" all
    turn up; the first two are the pair that matter, and everything else is the
    single award an IGCSE or O Level is graded on.
    """
    text = re.sub(r"^the\s+", "", name.strip(), flags=re.I).strip().rstrip(".")
    if re.fullmatch(r"AS Level", text, re.I):
        return "AS"
    if re.fullmatch(r"A Level", text, re.I):
        return "A Level"
    return "qualification"


def overview_pages(doc, limit=30):
    """The pages carrying the assessment overview, in order.

    Found by its heading rather than by the contents page, whose entry for it
    is a page number in a different numbering to PyMuPDF's. The table runs on
    to a second page in the bigger syllabuses, so the pages after the heading
    are taken while they keep describing components.
    """
    pages = []
    for index in range(min(len(doc), limit)):
        lines = _lines(doc[index].get_text())
        if any(OVERVIEW.match(line) for line in lines):
            pages.append(index)
    if not pages:
        return []
    # A contents page mentions the heading too, but carries no component.
    real = [index for index in pages if any(HEADER.match(line) for line in _lines(doc[index].get_text()))]
    if not real:
        return []
    first = real[0]
    found = [first]
    for index in range(first + 1, min(len(doc), limit)):
        lines = _lines(doc[index].get_text())
        if not any(HEADER.match(line) for line in lines):
            break
        found.append(index)
    return found


def _weighting_groups(lines):
    """Runs of consecutive weighting lines, as (start, end, weights) triples."""
    groups = []
    index = 0
    while index < len(lines):
        weights = {}
        start = index
        while index < len(lines):
            of_award = OF_AWARD.match(lines[index])
            bare = BARE.match(lines[index])
            if of_award:
                weights[_award(of_award.group(2))] = float(of_award.group(1))
            elif bare:
                weights.setdefault("qualification", float(bare.group(1)))
            else:
                break
            index += 1
        if weights:
            groups.append((start, index, weights))
        else:
            index += 1
    return groups


def pair_up(lines):
    """Matches each component heading to the weightings that belong to it.

    Headings arrive in runs — one per column of the printed row — and their
    bodies follow in the same order, so the nth heading of a run takes the nth
    weighting group after the run ends. Anything that yields no weighting at
    all is dropped rather than guessed at.
    """
    components = []
    index = 0
    section = None
    while index < len(lines):
        line = lines[index]
        if NAMED_SECTION.match(line) and not HEADER.match(line):
            section = NAMED_SECTION.match(line).group(1).strip()
            index += 1
            continue
        if SECTION.match(line):
            section = re.sub(r"\s+(assessment|components?|papers?)$", "", line, flags=re.I).strip()
            index += 1
            continue
        if not HEADER.match(line):
            index += 1
            continue

        run = []
        while index < len(lines) and HEADER.match(lines[index]):
            match = HEADER.match(lines[index])
            run.append({
                "kind": match.group(1).title(),
                "number": int(match.group(2)),
                "title": (match.group(3) or "").strip(),
            })
            index += 1

        body = lines[index:]
        # Stop the body at the next run of headings, which belongs to the row
        # below and whose bodies must not be stolen by this one.
        for offset, ahead in enumerate(body):
            if HEADER.match(ahead):
                body = body[:offset]
                break
        groups = _weighting_groups(body)
        for position, header in enumerate(run):
            if position >= len(groups):
                break
            start, end, weights = groups[position]
            # The lines around this component's own weighting, bounded by its
            # neighbours' so a two-column row cannot read the next paper's marks
            # as its own.
            before = body[groups[position - 1][1] if position else 0:start]
            after = body[end:groups[position + 1][0] if position + 1 < len(groups) else len(body)]
            components.append({
                "component": f"{header['kind']} {header['number']}",
                "number": header["number"],
                "title": header["title"] or _title_from(before) or _title_from(after),
                # Cambridge prints the marks above the weighting on an A Level
                # and below it on some IGCSEs, so both sides are read — nearest
                # first, which is the cell the weighting was set beside.
                "marks": _marks_from(reversed(before)) or _marks_from(after),
                "section": section,
                "weights": weights,
                "rule": next((line for line in after if RULE.match(line)), None),
            })
        # A route heading — "Extended assessment", "Mechanics components" —
        # sits between one row of components and the next, which is inside the
        # body just consumed. Reading it here is what keeps the row below it
        # under the right route.
        for line in body:
            if NAMED_SECTION.match(line) and not HEADER.match(line):
                section = NAMED_SECTION.match(line).group(1).strip()
            elif SECTION.match(line):
                section = re.sub(r"\s+(assessment|components?|papers?)$", "", line, flags=re.I).strip()
        index += len(body)
    return components


def _marks_from(lines):
    return next((int(MARKS.match(line).group(1)) for line in lines if MARKS.match(line)), None)


def _title_from(before):
    """The component's name, which sits above its duration and marks."""
    for line in before:
        text = line.strip().rstrip("\t").strip()
        if not text or NOISE.match(text) or MARKS.match(text) or BARE.match(text):
            continue
        # The previous component's closing rule sits in this one's run-up, and
        # "Compulsory for A Level" is not the name of a paper.
        if RULE.match(text):
            continue
        if DURATION.fullmatch(text) or re.fullmatch(r"\d+\s*hours?\s*\d*\s*minutes?", text, re.I):
            continue
        if re.match(r"^\d", text):
            continue
        return text
    return ""


def parse(doc):
    """Every component of a syllabus, with what each one is worth.

    Returns a list of dicts; an empty list means the overview could not be read,
    which is a syllabus the app then asks the learner about rather than guessing.
    """
    pages = overview_pages(doc)
    if not pages:
        return []
    lines = []
    for index in pages:
        lines.extend(_lines(doc[index].get_text()))
    seen = set()
    components = []
    for component in pair_up(lines):
        key = (component["component"], tuple(sorted(component["weights"].items())))
        if key in seen:
            continue
        seen.add(key)
        components.append(component)
    return components


def awards(components):
    """What each award's weightings add up to, per route.

    The check that says whether a parse can be trusted: a candidate's papers
    have to come to 100% of the award they are sitting for. A subject offering
    routes — Core against Extended, Pure against Mechanics — will not total 100
    across every component, only across one route's worth, so this reports the
    sum per section as well as overall.
    """
    totals = {}
    for component in components:
        for award, weight in component["weights"].items():
            totals.setdefault(award, {}).setdefault(component["section"] or "", 0.0)
            totals[award][component["section"] or ""] += weight
    return totals
