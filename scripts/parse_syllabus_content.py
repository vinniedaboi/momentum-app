"""Parses the official syllabus PDFs into data/syllabus-content.json.

  python scripts/parse_syllabus_content.py
  python scripts/parse_syllabus_content.py --only-missing

The directory in data/syllabus-versions.csv is factual metadata and is committed.
The parsed chapter/point tree is not: it is exam-board content, so it is generated
here and loaded straight into Postgres by scripts/import-shared-data.mjs, which
reads the JSON this writes.

The version a student sits in CURRENT_YEAR is preferred, but a syllabus that yields
nothing falls through to the next one. Cambridge rewrites sometimes add numbered
spec points where the outgoing version had none — History 9489 and Sociology 0495
are both like that — and offering the neighbouring version beats offering nothing,
as long as the app keeps showing which years it covers.
"""
import argparse
import csv
import io
import json
import re
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from parse_outline import parse as parse_outline  # noqa: E402
from parse_pearson import parse as parse_pearson  # noqa: E402
from parse_syllabus import parse as parse_cambridge  # noqa: E402
from parse_ib import parse as parse_ib  # noqa: E402
from parse_uk import parse_aqa, parse_ocr  # noqa: E402

try:
    import fitz  # PyMuPDF
except ImportError:
    print("PyMuPDF is required: pip install pymupdf", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_VERSIONS = ROOT / "data" / "syllabus-versions.csv"
DEFAULT_OUT = ROOT / "data" / "syllabus-content.json"
IB_BRIEFS = ROOT / "data" / "ib-briefs"
PLACEHOLDER = re.compile(r"^(Topic|Unit|Chapter) \d+$")


def truthy(value):
    return str(value).strip().lower() in {"true", "1", "yes"}


def parser_for(board):
    """Each board lays its specifications out differently enough to need its own
    reader. Pearson is the exception to that: its UK and International A levels
    share a template, so they share a parser."""
    name = str(board).strip().lower()
    if "aqa" in name:
        return parse_aqa
    if "ocr" in name:
        return parse_ocr
    if "pearson" in name:
        return parse_pearson
    if name == "ib":
        return parse_ib
    return parse_cambridge


def readers_for(board):
    """The readers to try, in order, for one board's specifications.

    parse_outline is written around Cambridge's prose-and-bullets humanities
    syllabuses — its section markers and skip list are that template. Turned
    loose on an English board's specification it finds headings everywhere: AQA
    History came back with 344 chapters and 878 points, none of them real.

    So AQA and OCR get their own reader or nothing. A subject whose content is
    named rather than numbered — AQA History is a menu of options, `1A The Age
    of the Crusades` — is offered without a syllabus, and the student imports
    theirs from subject settings. That is what the empty source is for, and it
    beats importing a tree that was never in the specification.
    """
    readers = [(parser_for(board), "")]
    name = str(board).strip().lower()
    if "caie" in name or "cambridge" in name or "pearson" in name:
        readers.append((parse_outline, " outline"))
    return readers


WORD = re.compile(r"[^\W\d_]{3,}", re.UNICODE)
LETTER = re.compile(r"[^\W\d_]", re.UNICODE)
DIGIT = re.compile(r"\d")


def is_content(title):
    """Whether a parsed point says something about the subject.

    Every reader keys on a number at the start of a line, and a specification is
    full of numbers that are not syllabus codes: the assessment overview's hours
    and weightings ("120 3 30%"), a data sheet's constants ("x 10-19 C"), a maths
    notation glossary that the text layer renders as "d d y". None of them says
    anything about the subject, and all of them arrive looking like a point.

    So a point has to carry a word, and carry more letters than digits. Both are
    counted in letters of any script, or a syllabus written in Gurmukhi would be
    thrown out with the tables — and one word is enough, because "Osmosis" is a
    whole syllabus point in IGCSE Biology.
    """
    return bool(WORD.search(title)) and len(LETTER.findall(title)) > len(DIGIT.findall(title))


HEADING_LIMIT = 90


def name_unread_chapters(chapters):
    """Renames a chapter whose title came out as a sentence rather than a heading.

    A paragraph set in the same style as a heading reads to a parser as one, and
    a bibliography line reads as one too: Edexcel's Science Double Award opens a
    chapter "OECD - Better Skills, Better Jobs, Better Lives", and Cambridge PE
    heads one with the sentence that introduces it.

    What sits under those is real content - 125 spec points in the Science case -
    so the branch stays and only the name goes. `Topic <code>` is the placeholder
    the summary already flags for review and subject settings already highlights,
    which puts the choice in front of whoever imports it.
    """
    return [(code, title if len(title) <= HEADING_LIMIT else "Topic {}".format(code), level)
            for code, title, level in chapters]


def pdf_text(data):
    doc = fitz.open(stream=data, filetype="pdf")
    return "\n".join(doc[index].get_text() for index in range(doc.page_count))


def brief_path(row):
    """Where an IB subject's brief is kept, named after its course page.

    `.../curriculum/sciences/biology/` is read from `data/ib-briefs/sciences-biology.pdf`,
    and one brief serves every subject on that page: the Language A: literature
    brief is the syllabus for all eighty of its languages.

    A page that hosts more than one course — mathematics carries both of its —
    needs one brief per subject, so a file named after the subject code wins.
    """
    slug = str(row["Syllabus_Page_URL"]).rstrip("/").split("/curriculum/")[-1].replace("/", "-")
    coded = IB_BRIEFS / "{}.pdf".format(row["Syllabus_Code"])
    return coded if coded.exists() else IB_BRIEFS / "{}.pdf".format(slug)


def source_text(row):
    """The document a row's syllabus is read from, or None where there is none.

    Every board but one publishes a specification the directory can link and this
    script can fetch. The IB publishes its guides through the programme resource
    centre instead, so its rows carry a course page, and the public subject brief
    behind it has to be saved into data/ib-briefs by hand.
    """
    if str(row["Exam_Board"]).strip().upper() == "IB":
        path = brief_path(row)
        return pdf_text(path.read_bytes()) if path.exists() else None
    return pdf_text(download(row["Syllabus_PDF_URL"])) if row["Syllabus_PDF_URL"] else None


def download(url):
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 momentum-import"})
    with urllib.request.urlopen(request, timeout=150) as response:
        return response.read()


def candidates(rows):
    """Every version of each syllabus, in the order worth trying: the one current
    now, then the latest published, then the rest newest first."""
    grouped = {}
    for row in rows:
        grouped.setdefault(row["Syllabus_Code"], []).append(row)

    def rank(row):
        return (
            0 if truthy(row["Is_Current_In_2026"]) else 1,
            0 if truthy(row["Is_Latest_Published_Version"]) else 1,
            -int(row["Exam_Year_From"] or 0),
        )

    return {code: sorted(group, key=rank) for code, group in grouped.items()}


def window(row):
    return "{}-{}".format(row["Exam_Year_From"], row["Exam_Year_To"] or row["Exam_Year_From"])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--versions", default=str(DEFAULT_VERSIONS))
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    parser.add_argument("--only-missing", action="store_true",
                        help="keep the existing JSON and retry only syllabuses with no content")
    args = parser.parse_args()

    rows = list(csv.DictReader(io.open(args.versions, encoding="utf-8-sig")))
    # A syllabus with nothing behind it has nothing to parse: an IB course whose
    # brief has not been saved into data/ib-briefs arrives without one, and the
    # learner imports their own from subject settings.
    readable = [row for row in rows
                if row["Syllabus_PDF_URL"] or brief_path(row).exists()]
    by_code = candidates(readable)

    records = []
    if args.only_missing:
        # Keep what already parsed and retry only the syllabuses that came up empty.
        existing = json.loads(Path(args.out).read_text(encoding="utf-8"))
        # The directory is the authority on a version's code, so re-stamp what was
        # parsed before deciding what is still missing; a subject recoded since the
        # last run would otherwise be parsed twice into colliding rows.
        code_by_record = {row["Record_ID"]: row["Syllabus_Code"] for row in rows}
        records = [dict(row, syllabus_code=code_by_record.get(row["record_id"], row["syllabus_code"]))
                   for row in existing if row["record_id"] in code_by_record]
        done = {row["syllabus_code"] for row in records}
        by_code = {code: group for code, group in by_code.items() if code not in done}
        print("Retrying {} syllabuses with no content\n".format(len(by_code)))
    else:
        listed = len(rows) - len(readable)
        print("Parsing {} syllabuses from {} versions{}\n".format(
            len(by_code), len(rows),
            ", skipping {} with no syllabus PDF".format(listed) if listed else ""))

    parsed = 0
    order = sorted(by_code.items(),
                   key=lambda item: (item[1][0]["Exam_Board"], item[1][0]["Subject_Name"]))
    for code, group in order:
        chapters, points, chosen, how = [], [], group[0], ""
        for attempt in group:
            try:
                text = source_text(attempt)
            except Exception as error:  # noqa: BLE001
                print("  {:<30} {:<10} FAILED: {}".format(attempt["Subject_Name"][:28], code, error))
                continue
            if not text:
                continue
            # Numbered spec points where they exist; otherwise read the headings
            # and bullets, which is how the humanities syllabuses are written.
            for reader, label in readers_for(attempt["Exam_Board"]):
                found = reader(text)
                found = (name_unread_chapters(found[0]),
                         [point for point in found[1] if is_content(point[2])])
                if found[1]:
                    chapters, points, chosen, how = found[0], found[1], attempt, label
                    break
            if points:
                break
            chosen = attempt

        record_id = chosen["Record_ID"]
        seq = 0
        for chapter_code, title, level in chapters:
            records.append({
                "record_id": record_id, "syllabus_code": code, "seq": seq,
                "code": chapter_code, "kind": "chapter", "parent_code": None,
                "title": title, "academic_level": level,
            })
            seq += 1
        for point_code, parent, title, level in points:
            records.append({
                "record_id": record_id, "syllabus_code": code, "seq": seq,
                "code": point_code, "kind": "point", "parent_code": parent,
                "title": title, "academic_level": level,
            })
            seq += 1

        if points:
            parsed += 1
        note = "" if chosen is group[0] else "  (fell back to {})".format(window(chosen))
        note += how
        flag = "review" if any(PLACEHOLDER.match(title) for _, title, _ in chapters) else "ok"
        print("  {:<30} {:<10} {:>3} chapters {:>4} points  [{}]{}".format(
            chosen["Subject_Name"][:28], code, len(chapters), len(points), flag, note))

    Path(args.out).write_text(json.dumps(records, ensure_ascii=False), encoding="utf-8")
    print("\n{} rows, {} syllabuses with content -> {}".format(
        len(records), parsed, Path(args.out).relative_to(ROOT)))
    print("Load them with: npm run import:shared")


if __name__ == "__main__":
    main()
