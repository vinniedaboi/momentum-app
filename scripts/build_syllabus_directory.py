"""Rebuilds data/syllabus-versions.csv from Cambridge's own subject listings.

  python scripts/build_syllabus_directory.py          # subjects with past papers
  python scripts/build_syllabus_directory.py --all    # every Cambridge subject

Covers Cambridge (IGCSE + AS & A Level) and Pearson Edexcel International Advanced
Level. Pearson's subject listing is rendered client-side, so its subjects are named
here rather than crawled; each spec PDF is still read off the live subject page.

Cambridge gives every syllabus PDF an opaque numeric filename, so the URLs cannot
be guessed — they are read off each subject page. Only syllabuses still examinable
in CURRENT_YEAR or later are kept, which is what the app offers to import.

Hand-written Availability_Notes are carried over by Record_ID so a rebuild does
not discard them.
"""
import csv
import io
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import OrderedDict
from datetime import date
from pathlib import Path

CURRENT_YEAR = 2026
ROOT = Path(__file__).resolve().parent.parent
CATALOGUE = ROOT / "data" / "paper-catalogue.csv"
DIRECTORY = ROOT / "data" / "syllabus-versions.csv"
SITE = "https://www.cambridgeinternational.org"
SITE_PEARSON = "https://qualifications.pearson.com"
UA = {"User-Agent": "Mozilla/5.0 study-tracker-import"}

LISTINGS = {
    "Cambridge IGCSE": (
        "igcse",
        SITE + "/programmes-and-qualifications/cambridge-upper-secondary/cambridge-igcse/subjects/",
        r"cambridge-igcse[a-z0-9-]*?",
    ),
    "Cambridge International AS & A Level": (
        "alevel",
        SITE + "/programmes-and-qualifications/cambridge-advanced/cambridge-international-as-and-a-levels/subjects/",
        r"cambridge-international-as-and-a-level[a-z0-9-]*?",
    ),
}

PEARSON_BASE = "https://qualifications.pearson.com/en/qualifications/edexcel-international-advanced-levels/"
PEARSON_BOARD = "Pearson Edexcel"
# The paper catalogue labels these "International A Level" and identifies each
# subject by the unit code most of its papers carry. Matching both is what lets
# onboarding merge a subject's papers and its syllabus into one card instead of
# offering two.
PEARSON_QUALIFICATION = "International A Level"

# Pearson keys each subject page by its first-teaching year, which differs per
# subject. Maths carries the units the catalogue lists separately.
PEARSON_SUBJECTS = {
    "accounting-2015": ("Accounting", ["Accounting"]),
    "arabic-2016": ("Arabic", ["Arabic"]),
    "biology-2018": ("Biology", ["Biology"]),
    "business-2018": ("Business", ["Business"]),
    "chemistry-2018": ("Chemistry", ["Chemistry"]),
    "economics-2018": ("Economics", ["Economics"]),
    "english-language-2015": ("English Language", ["English Lang"]),
    "english-literature-2015": ("English Literature", ["English Lit"]),
    "french-2016": ("French", ["French"]),
    "geography-2016": ("Geography", ["Geography"]),
    "german-2016": ("German", ["German"]),
    "greek-2016": ("Greek", ["Greek"]),
    "history-2015": ("History", ["History"]),
    "information-technology-2018": ("Information Technology", ["IT"]),
    "law-2015": ("Law", ["Law"]),
    "mathematics-2018": ("Mathematics", ["Pure Mathematics", "Further Pure Maths",
                                          "Mechanics", "Statistics", "Decision Maths"]),
    "physics-2018": ("Physics", ["Physics"]),
    "psychology-2015": ("Psychology", ["Psychology"]),
    "spanish-2016": ("Spanish", ["Spanish"]),
}

PDF_LINK = re.compile(r"/Images/(\d+)-((\d{4})(?:-(\d{4}))?)-syllabus\.pdf")
COLUMNS = [
    "Record_ID", "Exam_Board", "Qualification", "Subject_Name", "Syllabus_Code",
    "Exam_Year_From", "Exam_Year_To", "Is_Current_In_2026", "Is_Latest_Published_Version",
    "Syllabus_PDF_URL", "Syllabus_Page_URL", "PotatoPapers_Subject_Filter",
    "PotatoPapers_Catalogue_URL", "PotatoPapers_Paper_Record_Count",
    "PotatoPapers_Has_Catalogue_Records", "Availability_Notes", "Source_Verification", "Verified_On",
]


def fetch(url, timeout=60):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()


def verify(url):
    """Records the same evidence the directory has always carried: that the URL
    really serves a PDF."""
    request = urllib.request.Request(url, headers=UA, method="HEAD")
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            kind = response.headers.get("Content-Type", "").split(";")[0].strip()
            return "HTTP {} {}".format(response.status, kind).strip()
    except urllib.error.HTTPError as error:
        return "HTTP {}".format(error.code)
    except Exception as error:  # noqa: BLE001
        return "unverified: {}".format(type(error).__name__)


def catalogue_subjects():
    """Subject codes the app already has past papers for, with their paper counts."""
    rows = list(csv.DictReader(io.open(CATALOGUE, encoding="utf-8-sig")))
    found = OrderedDict()
    for row in rows:
        if row["Board"] != "CAIE" or not row["Syllabus_Code"]:
            continue
        entry = found.setdefault(row["Syllabus_Code"], {
            "filter": "{}({})".format(row["Subject"], row["Syllabus_Code"]),
            "url": row["PotatoPapers_Catalogue_URL"],
            "count": 0,
        })
        entry["count"] += 1
    return found


def listing(qualification):
    """Maps syllabus code -> (slug, official subject name) for one qualification."""
    slug_prefix, url, pattern = LISTINGS[qualification]
    html = fetch(url).decode("utf-8", "ignore")
    anchor = re.compile(
        r'<a[^>]+href="[^"]*?/programmes-and-qualifications/(' + pattern + r'-(\d{4}))/"[^>]*>(.*?)</a>',
        re.S | re.I,
    )
    found = OrderedDict()
    for slug, code, label in anchor.findall(html):
        if code in found:
            continue
        name = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", label)).strip()
        name = re.sub(r"\s*[-(]\s*\d{4}\)?$", "", name).strip()
        found[code] = (slug, name, slug_prefix)
    return found


def versions_for(slug):
    """Every still-examinable syllabus PDF linked from a subject page."""
    html = fetch(SITE + "/programmes-and-qualifications/" + slug + "/", 45).decode("utf-8", "ignore")
    found = {}
    for asset, window, year_from, year_to in PDF_LINK.findall(html):
        start, end = int(year_from), int(year_to or year_from)
        if end < CURRENT_YEAR:
            continue  # already examined out
        found[(start, end)] = "{}/Images/{}-{}-syllabus.pdf".format(SITE, asset, window)
    return sorted((start, end, url) for (start, end), url in found.items())


def pearson_spec(slug):
    """The specification PDF on a Pearson subject page, told apart from the teaching
    guides and sample-assessment material that sit beside it."""
    html = fetch(PEARSON_BASE + slug + ".html", 45).decode("utf-8", "ignore")
    candidates = sorted(set(re.findall(r"(/content/dam/pdf/[^\"'>]*?\.pdf)", html)))

    def score(path):
        name, folder = path.rsplit("/", 1)[-1].lower(), path.rsplit("/", 1)[0].lower()
        points = 0
        if "spec" in name:
            points += 10
        if "specification" in folder:
            points += 8
        if re.search(r"guide|onboard|sams|faq|checklist|sample", name):
            points -= 20
        if "/general/" in folder:
            points -= 12
        return points

    ranked = sorted(candidates, key=score, reverse=True)
    return ranked[0] if ranked and score(ranked[0]) > 0 else None


def edexcel_papers():
    """Edexcel catalogue rows carry no syllabus code of their own, so they are
    counted by subject name, and identified by the unit code that leads most of
    their paper labels - the same code the app's catalogue directory picks."""
    rows = list(csv.DictReader(io.open(CATALOGUE, encoding="utf-8-sig")))
    counts, codes = {}, {}
    for row in rows:
        if row["Board"] != PEARSON_BOARD:
            continue
        subject = row["Subject"]
        counts[subject] = counts.get(subject, 0) + 1
        label = (row.get("Syllabus_Code") or "").strip() or (row.get("Paper_Code") or "").split(" ")[0].strip()
        if label:
            codes.setdefault(subject, {})
            codes[subject][label] = codes[subject].get(label, 0) + 1
    # Most papers first, then shortest - matching catalogueSubjectDirectory().
    chosen = {
        subject: sorted(tally.items(), key=lambda item: (-item[1], len(item[0])))[0][0]
        for subject, tally in codes.items()
    }
    url = next((r["PotatoPapers_Catalogue_URL"] for r in rows if r["Board"] == PEARSON_BOARD), "")
    return counts, chosen, url


def pearson_rows(notes, today):
    counts, catalogue_codes, catalogue_url = edexcel_papers()
    rows = []
    print("{}: {} subjects".format(PEARSON_QUALIFICATION, len(PEARSON_SUBJECTS)))
    for slug, (name, catalogue_names) in sorted(PEARSON_SUBJECTS.items()):
        try:
            path = pearson_spec(slug)
        except Exception as error:  # noqa: BLE001
            print("  {:<32} FAILED: {}".format(name[:30], error))
            continue
        if not path:
            print("  {:<32} no specification PDF linked".format(name[:30]))
            continue
        url = SITE_PEARSON + urllib.parse.quote(path)
        record_id = "edexcel-ial-" + slug
        papers = sum(counts.get(item, 0) for item in catalogue_names)
        rows.append({
            "Record_ID": record_id,
            "Exam_Board": PEARSON_BOARD,
            "Qualification": PEARSON_QUALIFICATION,
            "Subject_Name": name,
            # Anchor on the first catalogue subject so the maths units, which share
            # one specification, attach to the largest of them.
            "Syllabus_Code": next((catalogue_codes[item] for item in catalogue_names
                                   if item in catalogue_codes),
                                  "IAL-" + re.sub(r"-\d{4}$", "", slug).upper()),
            "Exam_Year_From": re.sub(r"^.*-", "", slug),
            "Exam_Year_To": "",
            "Is_Current_In_2026": "true",
            "Is_Latest_Published_Version": "true",
            "Syllabus_PDF_URL": url,
            "Syllabus_Page_URL": PEARSON_BASE + slug + ".html",
            "PotatoPapers_Subject_Filter": ", ".join(catalogue_names) if papers else "",
            "PotatoPapers_Catalogue_URL": catalogue_url if papers else "",
            "PotatoPapers_Paper_Record_Count": papers,
            "PotatoPapers_Has_Catalogue_Records": "true" if papers else "false",
            "Availability_Notes": notes.get(record_id, ""),
            "Source_Verification": verify(url),
            "Verified_On": today,
        })
        print("  {:<32} {} ({} papers)".format(name[:30], path.rsplit("/", 1)[-1][:44], papers))
    return rows


def existing_notes():
    if not DIRECTORY.exists():
        return {}
    rows = csv.DictReader(io.open(DIRECTORY, encoding="utf-8-sig"))
    return {row["Record_ID"]: row.get("Availability_Notes") or "" for row in rows}


def main():
    everything = "--all" in sys.argv
    catalogue = catalogue_subjects()
    notes = existing_notes()
    today = date.today().isoformat()

    rows = []
    for qualification in LISTINGS:
        subjects = listing(qualification)
        wanted = subjects if everything else {c: s for c, s in subjects.items() if c in catalogue}
        print("{}: {} subjects".format(qualification, len(wanted)))
        for code, (slug, name, slug_prefix) in sorted(wanted.items()):
            try:
                versions = versions_for(slug)
            except Exception as error:  # noqa: BLE001
                print("  {} {:<32} FAILED: {}".format(code, name[:30], error))
                continue
            if not versions:
                print("  {} {:<32} no current syllabus PDF linked".format(code, name[:30]))
                continue
            latest = max(start for start, _, _ in versions)
            paper = catalogue.get(code)
            for start, end, url in versions:
                record_id = "caie-{}-{}-{}-{}".format(slug_prefix, code, start, end)
                rows.append({
                    "Record_ID": record_id,
                    "Exam_Board": "CAIE",
                    "Qualification": qualification,
                    "Subject_Name": name,
                    "Syllabus_Code": code,
                    "Exam_Year_From": start,
                    "Exam_Year_To": end,
                    "Is_Current_In_2026": "true" if start <= CURRENT_YEAR <= end else "false",
                    "Is_Latest_Published_Version": "true" if start == latest else "false",
                    "Syllabus_PDF_URL": url,
                    "Syllabus_Page_URL": SITE + "/programmes-and-qualifications/" + slug + "/",
                    "PotatoPapers_Subject_Filter": paper["filter"] if paper else "",
                    "PotatoPapers_Catalogue_URL": paper["url"] if paper else "",
                    "PotatoPapers_Paper_Record_Count": paper["count"] if paper else 0,
                    "PotatoPapers_Has_Catalogue_Records": "true" if paper else "false",
                    "Availability_Notes": notes.get(record_id, ""),
                    "Source_Verification": verify(url),
                    "Verified_On": today,
                })
            windows = ", ".join("{}-{}".format(start, end) for start, end, _ in versions)
            print("  {} {:<32} {}".format(code, name[:30], windows))

    rows.extend(pearson_rows(notes, today))

    rows.sort(key=lambda row: (row["Exam_Board"], row["Qualification"], row["Subject_Name"],
                               str(row["Exam_Year_From"])))
    with io.open(DIRECTORY, "w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    unverified = [row for row in rows if not row["Source_Verification"].startswith("HTTP 200")]
    print("\nWrote {} rows to {}".format(len(rows), DIRECTORY.relative_to(ROOT)))
    if unverified:
        print("{} rows did not verify as a PDF:".format(len(unverified)))
        for row in unverified:
            print("  {} {:<30} {}".format(row["Syllabus_Code"], row["Subject_Name"][:28], row["Source_Verification"]))


if __name__ == "__main__":
    main()
