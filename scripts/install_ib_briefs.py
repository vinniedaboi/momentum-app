"""Files downloaded IB subject briefs into data/ib-briefs/ under the names the
content parser looks for.

  python scripts/install_ib_briefs.py                     # reads ~/Downloads
  python scripts/install_ib_briefs.py --from path/to/dir
  python scripts/install_ib_briefs.py --dry-run

The IB publishes one brief per course, and parse_syllabus_content.py reads it
from a file named after that course's page - `data/ib-briefs/sciences-biology.pdf`
for `.../curriculum/sciences/biology/`, or after the subject code where one page
carries several courses. Working that name out by hand for thirty-odd files is
the tedious part, so this reads each PDF's own title page instead and files it
where it belongs.

A brief that matches nothing is left alone and named in the summary. Where two
files claim the same course - the IB keeps an outgoing brief beside its
replacement - the one whose syllabus table actually reads is kept, and a tie
goes to the newer file.
"""
import argparse
import csv
import io
import re
import shutil
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from parse_ib import parse as parse_ib  # noqa: E402

try:
    import fitz  # PyMuPDF
except ImportError:
    print("PyMuPDF is required: pip install pymupdf", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
SUBJECTS = ROOT / "data" / "ib-subjects.csv"
BRIEFS = ROOT / "data" / "ib-briefs"
TITLE_PAGES = 2


def flatten(text):
    """Lowercase letters and single spaces, so `Language A: literature` and
    `language-a-literature` compare equal."""
    stripped = unicodedata.normalize("NFKD", str(text))
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", stripped.lower())).strip()


def courses():
    """Every course a brief could belong to, with the phrases that name it.

    A page that carries one course is filed under its slug; where it carries
    several, each is filed under its own subject code, because one file cannot
    be the syllabus for both mathematics courses.
    """
    rows = list(csv.DictReader(io.open(SUBJECTS, encoding="utf-8-sig")))
    pages = {}
    for row in rows:
        pages.setdefault(row["Page"], []).append(row)

    found = []
    for page, subjects in pages.items():
        slug = page.rstrip("/").replace("/", "-")
        names = {flatten(row["Subject_Name"]) for row in subjects}
        # Every language shares one course, so the page names it, not the subject.
        shared = len(subjects) > 3
        if shared or len(subjects) == 1:
            keys = {flatten(page.rstrip("/").split("/")[-1])}
            if not shared:
                keys |= names
            found.append({"name": slug, "keys": keys, "subjects": subjects})
        else:
            for row in subjects:
                found.append({
                    "name": row["Subject_Code"],
                    "keys": {flatten(row["Subject_Name"])},
                    "subjects": [row],
                })
    return found


def title_text(path):
    """The line naming the course, which every brief prints above its first
    assessment year: `Sciences: Biology`, `Individuals and societies: Business
    management-higher level`.

    Only that line is matched on. The rest of a first page describes the DP
    itself, and its paragraph about the core names theory of knowledge and the
    extended essay in every brief the IB publishes.
    """
    with fitz.open(path) as document:
        pages = min(TITLE_PAGES, document.page_count)
        text = "\n".join(document[index].get_text() for index in range(pages))
    found = re.search(r"First assessments?\b", text, re.I)
    return text[max(0, found.start() - 120):found.start()] if found else text[:400]


def full_text(path):
    with fitz.open(path) as document:
        return "\n".join(document[index].get_text() for index in range(document.page_count))


def match(text, catalogue):
    """The course a brief names, preferring the longest phrase that appears."""
    haystack = flatten(text)
    best, best_key = None, ""
    for course in catalogue:
        for key in course["keys"]:
            if len(key) > 2 and key in haystack and len(key) > len(best_key):
                best, best_key = course, key
    return best


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--from", dest="source", default=str(Path.home() / "Downloads"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    source = Path(args.source)
    if not source.is_dir():
        print("No such directory: {}".format(source), file=sys.stderr)
        return 1

    catalogue = courses()
    # Chrome leaves a part-finished download as .tmp, which is still a whole PDF.
    files = sorted(path for path in source.iterdir()
                   if path.suffix.lower() in {".pdf", ".tmp"} and path.is_file())

    claimed, skipped = {}, []
    for path in files:
        try:
            course = match(title_text(path), catalogue)
        except Exception:  # noqa: BLE001  - anything unreadable is not a brief
            continue
        if not course:
            continue
        points = len(parse_ib(full_text(path))[1])
        previous = claimed.get(course["name"])
        if previous and (previous["points"], previous["path"].stat().st_mtime) >= (
                points, path.stat().st_mtime):
            skipped.append((path.name, course["name"]))
            continue
        if previous:
            skipped.append((previous["path"].name, course["name"]))
        claimed[course["name"]] = {"path": path, "points": points, "course": course}

    if not args.dry_run:
        BRIEFS.mkdir(parents=True, exist_ok=True)
    print("{} brief{} found in {}".format(len(claimed), "" if len(claimed) == 1 else "s", source))
    for name, hit in sorted(claimed.items()):
        target = BRIEFS / "{}.pdf".format(name)
        if not args.dry_run:
            shutil.copyfile(hit["path"], target)
        subjects = len(hit["course"]["subjects"])
        print("  {:<58} {:>3} points, {} subject{}".format(
            target.name, hit["points"], subjects, "" if subjects == 1 else "s"))
    for filename, name in skipped:
        print("  (kept the better copy of {}, ignored {})".format(name, filename))

    have = {course["name"] for course in catalogue
            if (BRIEFS / "{}.pdf".format(course["name"])).exists()}
    missing = [course for course in catalogue if course["name"] not in have]
    if missing:
        print("\nStill missing {} course{}, covering {} subjects:".format(
            len(missing), "" if len(missing) == 1 else "s",
            sum(len(course["subjects"]) for course in missing)))
        for course in sorted(missing, key=lambda item: -len(item["subjects"])):
            first = course["subjects"][0]
            print("  {:>3} subjects  {:<46} {}".format(
                len(course["subjects"]),
                first["Subject_Name"] if len(course["subjects"]) == 1 else course["name"],
                "ibo.org/programmes/diploma-programme/curriculum/" + first["Page"]))
    print("\nParse them with: python scripts/parse_syllabus_content.py --only-missing")
    return 0


if __name__ == "__main__":
    sys.exit(main())
