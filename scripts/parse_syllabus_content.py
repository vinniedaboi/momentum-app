"""Parses the official syllabus PDFs into data/syllabus-content.json.

  python scripts/parse_syllabus_content.py
  python scripts/parse_syllabus_content.py --versions data/syllabus-versions.csv

The directory in data/syllabus-versions.csv is factual metadata and is committed.
The parsed chapter/point tree is not: it is exam-board content, so it is generated
here and loaded straight into Postgres by scripts/import-shared-data.mjs, which
reads the JSON this writes.

Only the version a student sits in CURRENT_YEAR is parsed, falling back to the
latest published one, matching what the app offers to import.
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
from parse_pearson import parse as parse_pearson  # noqa: E402
from parse_syllabus import parse as parse_cambridge  # noqa: E402

try:
    import fitz  # PyMuPDF
except ImportError:
    print("PyMuPDF is required: pip install pymupdf", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_VERSIONS = ROOT / "data" / "syllabus-versions.csv"
DEFAULT_OUT = ROOT / "data" / "syllabus-content.json"


def truthy(value):
    return str(value).strip().lower() in {"true", "1", "yes"}


def parser_for(board):
    """Cambridge and Pearson lay their specifications out differently enough to
    need separate readers."""
    return parse_pearson if "pearson" in str(board).strip().lower() else parse_cambridge


def pdf_text(data):
    doc = fitz.open(stream=data, filetype="pdf")
    return "\n".join(doc[index].get_text() for index in range(doc.page_count))


def download(url):
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 momentum-import"})
    with urllib.request.urlopen(request, timeout=150) as response:
        return response.read()


def target_versions(rows):
    """One version per syllabus code: the one current now, else the latest."""
    chosen = {}
    for row in rows:
        code = row["Syllabus_Code"]
        existing = chosen.get(code)
        if (existing is None
                or (truthy(row["Is_Current_In_2026"]) and not truthy(existing["Is_Current_In_2026"]))
                or (not truthy(existing["Is_Current_In_2026"])
                    and truthy(row["Is_Latest_Published_Version"])
                    and not truthy(existing["Is_Latest_Published_Version"]))):
            chosen[code] = row
    return list(chosen.values())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--versions", default=str(DEFAULT_VERSIONS))
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    args = parser.parse_args()

    rows = list(csv.DictReader(io.open(args.versions, encoding="utf-8-sig")))
    targets = target_versions(rows)
    print("Parsing {} of {} syllabus versions\n".format(len(targets), len(rows)))

    records = []
    parsed = 0
    for row in sorted(targets, key=lambda item: (item["Exam_Board"], item["Subject_Name"])):
        record_id, code = row["Record_ID"], row["Syllabus_Code"]
        try:
            chapters, points = parser_for(row["Exam_Board"])(pdf_text(download(row["Syllabus_PDF_URL"])))
        except Exception as error:  # noqa: BLE001
            print("  {:<32} {:<18} FAILED: {}".format(row["Subject_Name"][:30], code, error))
            continue

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
        flag = "review" if any(re.match(r"^(Topic|Unit|Chapter) \d+$", title) for _, title, _ in chapters) else "ok"
        print("  {:<32} {:<18} {:>3} chapters {:>4} points  [{}]".format(
            row["Subject_Name"][:30], code, len(chapters), len(points), flag))

    Path(args.out).write_text(json.dumps(records, ensure_ascii=False), encoding="utf-8")
    print("\n{} rows for {} syllabuses with content -> {}".format(
        len(records), parsed, Path(args.out).relative_to(ROOT)))
    print("Load them with: npm run import:shared")


if __name__ == "__main__":
    main()
