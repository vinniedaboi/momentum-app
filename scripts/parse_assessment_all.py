"""Reads every Cambridge syllabus's assessment overview into data/syllabus-assessment.csv.

  python scripts/parse_assessment_all.py
  python scripts/parse_assessment_all.py --only 9702,0620
  python scripts/parse_assessment_all.py --limit 40

What a paper is worth is the one thing the grade planner cannot work out for
itself, and it is printed in the same PDFs `parse_syllabus_content.py` already
reads for the subject content. Unlike that content, a weighting is a fact about
the qualification rather than the board's material — the same kind of fact as
the grade thresholds in data/paper-catalogue.csv — so the output is committed
and ships with the app.

Only Cambridge is read here. Pearson, AQA and OCR lay their assessment tables
out differently enough to need their own reader, and a subject this cannot
speak for is simply one the planner asks the learner about instead.
"""
import argparse
import csv
import io
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from parse_assessment import awards, parse  # noqa: E402

try:
    import fitz  # PyMuPDF
except ImportError:
    print("PyMuPDF is required: pip install pymupdf", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
VERSIONS = ROOT / "data" / "syllabus-versions.csv"
OUT = ROOT / "data" / "syllabus-assessment.csv"
CACHE = ROOT / ".syllabus-cache"
AGENT = {"User-Agent": "Mozilla/5.0 (compatible; momentum-syllabus/1.0)"}

FIELDS = [
    "Exam_Board", "Qualification", "Syllabus_Code", "Subject_Name",
    "Component", "Component_Number", "Component_Title", "Marks", "Route",
    "Award", "Weighting_Percent", "Rule",
]


def truthy(value):
    return str(value).strip().lower() in {"true", "1", "yes"}


def fetch(url):
    cached = CACHE / url.rsplit("/", 1)[-1]
    if cached.exists():
        return cached.read_bytes()
    CACHE.mkdir(exist_ok=True)
    data = urllib.request.urlopen(urllib.request.Request(url, headers=AGENT), timeout=120).read()
    cached.write_bytes(data)
    return data


def rows_for(record, components):
    """One row per component per award, which is the shape a table wants: a
    paper worth 46% of the AS and 23% of the A Level is two facts, not one."""
    for component in components:
        for award, weight in sorted(component["weights"].items()):
            yield {
                "Exam_Board": record["Exam_Board"],
                "Qualification": record["Qualification"],
                "Syllabus_Code": record["Syllabus_Code"],
                "Subject_Name": record["Subject_Name"],
                "Component": component["component"],
                "Component_Number": component["number"],
                "Component_Title": component["title"],
                "Marks": component["marks"] or "",
                "Route": component["section"] or "",
                "Award": award,
                "Weighting_Percent": f"{weight:g}",
                "Rule": component["rule"] or "",
            }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", help="comma-separated syllabus codes")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args()
    only = {code.strip() for code in args.only.split(",")} if args.only else None

    with VERSIONS.open(newline="", encoding="utf-8-sig") as handle:
        records = [row for row in csv.DictReader(handle)
                   if row["Exam_Board"].strip().upper() == "CAIE"
                   and truthy(row["Is_Latest_Published_Version"])
                   and row["Syllabus_PDF_URL"].strip()]
    if only:
        records = [row for row in records if row["Syllabus_Code"] in only]
    # One syllabus can be listed for several exam windows; the code is the key.
    seen, unique = set(), []
    for row in records:
        if row["Syllabus_Code"] in seen:
            continue
        seen.add(row["Syllabus_Code"])
        unique.append(row)
    if args.limit:
        unique = unique[:args.limit]

    rows, misses = [], []
    for index, record in enumerate(unique, start=1):
        code = record["Syllabus_Code"]
        try:
            data = fetch(record["Syllabus_PDF_URL"])
            doc = fitz.open(stream=io.BytesIO(data), filetype="pdf")
            components = parse(doc)
            doc.close()
        except (urllib.error.URLError, OSError, RuntimeError, ValueError) as error:
            misses.append((code, record["Subject_Name"], f"{type(error).__name__}: {error}"))
            continue
        if not components:
            misses.append((code, record["Subject_Name"], "no assessment overview found"))
            continue
        rows.extend(rows_for(record, components))
        print(f"[{index}/{len(unique)}] {code} {record['Subject_Name'][:38]:<40}"
              f" {len(components)} components  {json.dumps(awards(components))}", flush=True)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\n{len(rows)} rows from {len(unique) - len(misses)}/{len(unique)} syllabuses -> {args.out}")
    if misses:
        print(f"{len(misses)} could not be read:")
        for code, name, why in misses[:40]:
            print(f"  {code} {name[:40]:<42} {why[:60]}")


if __name__ == "__main__":
    main()
