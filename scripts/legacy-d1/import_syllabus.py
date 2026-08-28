"""Loads the Cambridge syllabus-version directory and parsed spec-point content
into the local D1 database.

  python scripts/import_syllabus.py [path/to/versions.csv]

The version directory (codes, windows, PDF URLs) is factual metadata. The parsed
chapter/point content is fetched from Cambridge's official PDFs into the local
D1 only — it is never written to committed source.
"""
import csv
import io
import re
import sqlite3
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from parse_syllabus import parse  # noqa: E402

try:
    import fitz  # PyMuPDF
except ImportError:
    print("PyMuPDF is required: pip install pymupdf", file=sys.stderr)
    sys.exit(1)

DEFAULT_CSV = "data/syllabus-versions.csv"
D1_DIR = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject"

CREATE_VERSIONS = """
CREATE TABLE IF NOT EXISTS syllabus_versions (
  record_id TEXT PRIMARY KEY,
  board TEXT NOT NULL,
  qualification TEXT NOT NULL,
  subject TEXT NOT NULL,
  syllabus_code TEXT NOT NULL,
  year_from INTEGER,
  year_to INTEGER,
  is_current INTEGER NOT NULL DEFAULT 0,
  is_latest INTEGER NOT NULL DEFAULT 0,
  pdf_url TEXT,
  page_url TEXT,
  notes TEXT
)
"""

CREATE_CONTENT = """
CREATE TABLE IF NOT EXISTS syllabus_content (
  record_id TEXT NOT NULL,
  syllabus_code TEXT NOT NULL,
  seq INTEGER NOT NULL,
  code TEXT NOT NULL,
  kind TEXT NOT NULL,
  parent_code TEXT,
  title TEXT NOT NULL,
  academic_level TEXT
)
"""


def find_db():
    directory = Path(D1_DIR).resolve()
    candidates = sorted(
        (path for path in directory.glob("*.sqlite") if path.name != "metadata.sqlite"),
        key=lambda path: path.stat().st_size,
        reverse=True,
    )
    if not candidates:
        raise SystemExit(f"No D1 database in {directory}. Start the dev server once first.")
    return str(candidates[0])


def truthy(value):
    return str(value).strip().lower() in {"true", "1", "yes"}


def download_pdf(url):
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 study-tracker-import"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()


def pdf_text(data):
    doc = fitz.open(stream=data, filetype="pdf")
    return "\n".join(doc[index].get_text() for index in range(doc.page_count))


def main():
    csv_path = Path(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CSV).resolve()
    rows = list(csv.DictReader(io.open(csv_path, encoding="utf-8-sig")))

    db = sqlite3.connect(find_db())
    db.execute("PRAGMA journal_mode=WAL")
    db.execute(CREATE_VERSIONS)
    db.execute(CREATE_CONTENT)
    columns = {row[1] for row in db.execute("PRAGMA table_info(syllabus_content)")}
    if "academic_level" not in columns:
        db.execute("ALTER TABLE syllabus_content ADD COLUMN academic_level TEXT")
    db.execute("CREATE INDEX IF NOT EXISTS idx_syllabus_content_record ON syllabus_content(record_id)")

    db.execute("DELETE FROM syllabus_content")
    db.execute("DELETE FROM syllabus_versions")
    for row in rows:
        db.execute(
            """INSERT OR REPLACE INTO syllabus_versions
               (record_id, board, qualification, subject, syllabus_code, year_from, year_to,
                is_current, is_latest, pdf_url, page_url, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                row["Record_ID"], row["Exam_Board"], row["Qualification"], row["Subject_Name"],
                row["Syllabus_Code"], int(row["Exam_Year_From"]), int(row["Exam_Year_To"]),
                1 if truthy(row["Is_Current_In_2026"]) else 0,
                1 if truthy(row["Is_Latest_Published_Version"]) else 0,
                row["Syllabus_PDF_URL"], row["Syllabus_Page_URL"], row.get("Availability_Notes") or None,
            ),
        )
    db.commit()
    print(f"Versions   {len(rows)} rows loaded")

    # Parse the version each 2026 student would sit; fall back to the latest.
    by_code = {}
    for row in rows:
        code = row["Syllabus_Code"]
        existing = by_code.get(code)
        if (existing is None
                or (truthy(row["Is_Current_In_2026"]) and not truthy(existing["Is_Current_In_2026"]))
                or (not truthy(existing["Is_Current_In_2026"])
                    and truthy(row["Is_Latest_Published_Version"])
                    and not truthy(existing["Is_Latest_Published_Version"]))):
            by_code[code] = row
    targets = list(by_code.values())
    print(f"Parsing    {len(targets)} current/latest syllabus PDFs\n")

    for row in targets:
        record_id = row["Record_ID"]
        code = row["Syllabus_Code"]
        db.execute("DELETE FROM syllabus_content WHERE record_id = ?", (record_id,))
        try:
            text = pdf_text(download_pdf(row["Syllabus_PDF_URL"]))
            chapters, points = parse(text)
        except Exception as error:  # noqa: BLE001
            print(f"  {row['Subject_Name']:<20} {code}  FAILED: {error}")
            continue

        seq = 0
        for ccode, title, academic_level in chapters:
            db.execute(
                "INSERT INTO syllabus_content (record_id, syllabus_code, seq, code, kind, parent_code, title, academic_level) VALUES (?, ?, ?, ?, 'chapter', NULL, ?, ?)",
                (record_id, code, seq, ccode, title, academic_level),
            )
            seq += 1
        for pcode, parent, title, academic_level in points:
            db.execute(
                "INSERT INTO syllabus_content (record_id, syllabus_code, seq, code, kind, parent_code, title, academic_level) VALUES (?, ?, ?, ?, 'point', ?, ?, ?)",
                (record_id, code, seq, pcode, parent, title, academic_level),
            )
            seq += 1
        db.commit()
        flag = "review" if any(re.match(r"^Topic \d+$", title) for _, title, _ in chapters) else "ok"
        print(f"  {row['Subject_Name']:<20} {code}  {len(chapters):>2} chapters  {len(points):>3} points  [{flag}]")

    db.close()
    print("\nDone. Content is stored in your local D1 only.")


if __name__ == "__main__":
    main()
