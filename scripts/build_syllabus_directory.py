"""Rebuilds data/syllabus-versions.csv from the exam boards' own subject listings.

  python scripts/build_syllabus_directory.py               # every suite
  python scripts/build_syllabus_directory.py --all         # ... including Cambridge
                                                           #     subjects with no papers
  python scripts/build_syllabus_directory.py --only=aqa    # one suite, merged in

Seven suites, listed in SUITES: Cambridge (IGCSE + AS & A Level), Pearson Edexcel
International (Advanced Level + International GCSE), the three English boards'
A levels — AQA, OCR and Edexcel — and the IB Diploma Programme, which is read
from data/ib-subjects.csv rather than crawled (see ib_rows).

`--only` rebuilds the named suites and carries every other row through untouched,
which is how a board should be added. A full rebuild re-verifies three hundred-odd
URLs, and one flaky connection during that is enough to drop rows that were already
good. Without `--all`, Cambridge is narrowed to subjects the paper catalogue covers,
so a full rebuild wants `--all` or it will shed most of the Cambridge suite.

Neither AQA nor Pearson serves a crawlable subject listing: AQA's is read from its
sitemap, Pearson's from the "first teaching" pages that name each suite. Cambridge
gives every syllabus PDF an opaque numeric filename, so those URLs cannot be guessed
and are read off each subject page. Only syllabuses still examinable in CURRENT_YEAR
or later are kept, which is what the app offers to import.

Hand-written Availability_Notes are carried over by Record_ID so a rebuild does
not discard them.
"""
import csv
import html
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

EDEXCEL_IGCSE_BASE = "https://qualifications.pearson.com/en/qualifications/edexcel-international-gcses/"
EDEXCEL_IGCSE_QUALIFICATION = "International GCSE"

# Pearson renders its subject listing client-side, so the suite is named here.
# Each page is keyed by first-teaching year, which differs per subject; the
# specification PDF is still read off the live page.
# Names as Pearson writes them; the slug alone would give "Mathematics a".
EDEXCEL_IGCSE_NAME_FIXES = {
    "English Language a": "English Language A",
    "English Language b": "English Language B",
    "Mathematics a": "Mathematics A",
    "Mathematics b": "Mathematics B",
    "Science Double Award": "Science (Double Award)",
}

EDEXCEL_IGCSE_SUBJECTS = {
    "international-gcse-accounting-2017": ("Accounting", "ACCOUNTING"),
    "international-gcse-bangla-2017": ("Bangla", "BANGLA"),
    "international-gcse-biology-2017": ("Biology", "BIOLOGY"),
    "international-gcse-chemistry-2017": ("Chemistry", "CHEMISTRY"),
    "international-gcse-chinese-2017": ("Chinese", "CHINESE"),
    "international-gcse-commerce-2017": ("Commerce", "COMMERCE"),
    "international-gcse-computer-science-2017": ("Computer Science", "COMPUTER_SCIENCE"),
    "international-gcse-economics-2017": ("Economics", "ECONOMICS"),
    "international-gcse-english-language-a-2016": ("English Language a", "ENGLISH_LANGUAGE_A"),
    "international-gcse-english-language-b-2016": ("English Language b", "ENGLISH_LANGUAGE_B"),
    "international-gcse-english-literature-2016": ("English Literature", "ENGLISH_LITERATURE"),
    "international-gcse-french-2017": ("French", "FRENCH"),
    "international-gcse-further-pure-mathematics-2017": ("Further Pure Mathematics", "FURTHER_PURE_MATHEMATICS"),
    "international-gcse-geography-2017": ("Geography", "GEOGRAPHY"),
    "international-gcse-global-citizenship-2017": ("Global Citizenship", "GLOBAL_CITIZENSHIP"),
    "international-gcse-history-2017": ("History", "HISTORY"),
    "international-gcse-human-biology-2017": ("Human Biology", "HUMAN_BIOLOGY"),
    "international-gcse-information-and-communication-technology-2017": ("Information and Communication Technology", "INFORMATION_AND_COMMUNICATION_TECHNOLOGY"),
    "international-gcse-islamic-studies-2017": ("Islamic Studies", "ISLAMIC_STUDIES"),
    "international-gcse-mathematics-a-2016": ("Mathematics a", "MATHEMATICS_A"),
    "international-gcse-mathematics-b-2016": ("Mathematics b", "MATHEMATICS_B"),
    "international-gcse-pakistan-studies-2017": ("Pakistan Studies", "PAKISTAN_STUDIES"),
    "international-gcse-physics-2017": ("Physics", "PHYSICS"),
    "international-gcse-religious-studies-2017": ("Religious Studies", "RELIGIOUS_STUDIES"),
    "international-gcse-science-double-award-2017": ("Science Double Award", "SCIENCE_DOUBLE_AWARD"),
    "international-gcse-sinhala-2017": ("Sinhala", "SINHALA"),
    "international-gcse-spanish-2017": ("Spanish", "SPANISH"),
    "international-gcse-swahili-2017": ("Swahili", "SWAHILI"),
}

PDF_LINK = re.compile(r"/Images/(\d+)-((\d{4})(?:-(\d{4}))?)-syllabus\.pdf")
COLUMNS = [
    "Record_ID", "Exam_Board", "Qualification", "Subject_Name", "Syllabus_Code", "Stages",
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
    markup = fetch(url).decode("utf-8", "ignore")
    anchor = re.compile(
        r'<a[^>]+href="[^"]*?/programmes-and-qualifications/(' + pattern + r'-(\d{4}))/"[^>]*>(.*?)</a>',
        re.S | re.I,
    )
    found = OrderedDict()
    for slug, code, label in anchor.findall(markup):
        if code in found:
            continue
        name = html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", label))).strip()
        # Listing labels carry the code and sometimes a "New" badge.
        name = re.sub(r"\s*(?:New|Updated)$", "", name, flags=re.I).strip()
        name = re.sub(r"\s*[-(]\s*\d{4}\)?$", "", name).strip()
        found[code] = (slug, name, slug_prefix)
    return found


def versions_for(slug):
    """Every still-examinable syllabus PDF linked from a subject page."""
    markup = fetch(SITE + "/programmes-and-qualifications/" + slug + "/", 45).decode("utf-8", "ignore")
    found = {}
    for asset, window, year_from, year_to in PDF_LINK.findall(markup):
        start, end = int(year_from), int(year_to or year_from)
        if end < CURRENT_YEAR:
            continue  # already examined out
        found[(start, end)] = "{}/Images/{}-{}-syllabus.pdf".format(SITE, asset, window)
    return sorted((start, end, url) for (start, end), url in found.items())


def pearson_spec(slug):
    """The specification PDF on a Pearson subject page, told apart from the teaching
    guides and sample-assessment material that sit beside it."""
    markup = fetch(PEARSON_BASE + slug + ".html", 45).decode("utf-8", "ignore")
    candidates = sorted(set(re.findall(r"(/content/dam/pdf/[^\"'>]*?\.pdf)", markup)))

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
    # Most papers first, then shortest, then alphabetical - matching
    # catalogueSubjectDirectory(). Ties are common, so the last key matters.
    chosen = {
        subject: sorted(tally.items(), key=lambda item: (-item[1], len(item[0]), item[0]))[0][0]
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


def spec_pdf(page_url, folder):
    """The specification PDF on a Pearson subject page, told apart from the
    teaching guides and sample assessments beside it."""
    markup = fetch(page_url, 45).decode("utf-8", "ignore")
    pattern = r"(/content/dam/pdf/" + folder + r"[^\"'>]*?\.pdf)"
    candidates = sorted(set(re.findall(pattern, markup)))

    def score(path):
        name, parent = path.rsplit("/", 1)[-1].lower(), path.rsplit("/", 1)[0].lower()
        points = 0
        if "spec" in name:
            points += 10
        if "specification" in parent:
            points += 8
        if re.search(r"guide|onboard|sams|faq|checklist|sample|arrangements", name):
            points -= 20
        if "/general/" in parent:
            points -= 12
        return points

    ranked = sorted(candidates, key=score, reverse=True)
    return ranked[0] if ranked and score(ranked[0]) > 0 else None


def edexcel_igcse_rows(notes, today):
    """Edexcel's International GCSEs, which the paper catalogue does not cover -
    they arrive as syllabus-only subjects."""
    rows = []
    print("{}: {} subjects".format(EDEXCEL_IGCSE_QUALIFICATION, len(EDEXCEL_IGCSE_SUBJECTS)))
    for slug, (raw_name, code) in sorted(EDEXCEL_IGCSE_SUBJECTS.items()):
        name = EDEXCEL_IGCSE_NAME_FIXES.get(raw_name, raw_name)
        page = EDEXCEL_IGCSE_BASE + slug + ".html"
        try:
            path = spec_pdf(page, "International(?:%20| )GCSE/")
        except Exception as error:  # noqa: BLE001
            print("  {:<38} FAILED: {}".format(name[:36], error))
            continue
        if not path:
            print("  {:<38} no specification PDF linked".format(name[:36]))
            continue
        url = SITE_PEARSON + urllib.parse.quote(path)
        record_id = "edexcel-igcse-" + slug.replace("international-gcse-", "")
        year = int(re.search(r"(\d{4})$", slug).group(1))
        rows.append({
            "Record_ID": record_id,
            "Exam_Board": PEARSON_BOARD,
            "Qualification": EDEXCEL_IGCSE_QUALIFICATION,
            "Subject_Name": name,
            "Syllabus_Code": "IG-" + code,
            "Exam_Year_From": year,
            "Exam_Year_To": "",
            "Is_Current_In_2026": "true",
            "Is_Latest_Published_Version": "true",
            "Syllabus_PDF_URL": url,
            "Syllabus_Page_URL": page,
            "PotatoPapers_Subject_Filter": "",
            "PotatoPapers_Catalogue_URL": "",
            "PotatoPapers_Paper_Record_Count": 0,
            "PotatoPapers_Has_Catalogue_Records": "false",
            "Availability_Notes": notes.get(record_id, ""),
            "Source_Verification": verify(url),
            "Verified_On": today,
        })
        print("  {:<38} {}".format(name[:36], path.rsplit("/", 1)[-1][:44]))
    return rows


# ---------------------------------------------------------------------------
# The English boards. Cambridge and Pearson International cover students sitting
# international qualifications; these three cover the domestic A level.
#
# Each qualification is named for its board ("AQA A Level" rather than plain
# "A Level") because onboarding keys a subject on qualification and name, and
# three boards all offering "Chemistry" would otherwise collide on one key.
# ---------------------------------------------------------------------------

SITE_AQA = "https://www.aqa.org.uk"
SITE_OCR = "https://www.ocr.org.uk"

AQA_QUALIFICATION = "AQA A Level"
OCR_QUALIFICATION = "OCR A Level"
EDEXCEL_UK_QUALIFICATION = "Edexcel A Level"

# AQA renders its subject listing client-side, so the sitemap is what enumerates
# the suite. Every A-level subject page ends in its own syllabus code.
AQA_SITEMAP = SITE_AQA + "/sitemap.xml"
AQA_SUBJECT_PAGE = re.compile(r"/subjects/[^/]+/a-level/[^/]+$")
AQA_PDF = re.compile(r'https://cdn\.sanity\.io/files/[^"\'<> ]+?\.pdf')
ARIA_LABEL = re.compile(r'aria-label="([^"]+)"')
H1 = re.compile(r"<h1[^>]*>(.*?)</h1>", re.S)
AQA_SPEC_LABEL = re.compile(r"specification\s*\((\d{4})\)", re.I)
FIRST_TEACHING = re.compile(r"first teaching in (\d{4})", re.I)
# Labels tag a replacement specification while the outgoing one is still taught.
SUPERSEDING = re.compile(r"updated|proposed|draft", re.I)

OCR_LISTING = SITE_OCR + "/qualifications/as-and-a-level/"
OCR_SUBJECT_LINK = re.compile(
    r'<a[^>]+href="(/qualifications/as-and-a-level/([a-z0-9-]+)/)"[^>]*>(.*?)</a>', re.S)
# OCR numbers the AS below H400 and the A level at or above it, and puts both in
# the slug: `biology-a-h020-h420-from-2015`.
OCR_CODE = re.compile(r"-(h\d{3})", re.I)
OCR_FROM_YEAR = re.compile(r"-from-(\d{4})$")

EDEXCEL_UK_BASE = SITE_PEARSON + "/en/qualifications/edexcel-a-levels/"
# Pearson's UK listing is client-side too, but its "first teaching" pages name
# every subject in the suite, which is what these are read for.
EDEXCEL_UK_INDEXES = [
    "first-teaching-from-2015-and-2016",
    "first-teaching-from-2017",
    "first-teaching-from-2018",
]
EDEXCEL_UK_SLUG = re.compile(r"edexcel-a-levels/([a-z0-9-]+-(\d{4}))\.html")


def text_of(markup):
    return html.unescape(re.sub(r"<[^>]+>", " ", markup)).strip()


def aqa_subject_name(markup, code):
    """The page names the subject in three places; the first that resolves wins.

    The specification's own label is the most reliable, because it is the only
    one that distinguishes English Literature A from English Literature B.
    """
    for label in ARIA_LABEL.findall(markup):
        label = html.unescape(label)
        found = AQA_SPEC_LABEL.search(label)
        if found and found.group(1) == code:
            name = re.sub(r"^(?:AS and )?A-?level\s+", "", label[:found.start()], flags=re.I)
            name = re.sub(r"\s*\((?:new|current|updated)\)\s*$", "", name, flags=re.I)
            if name.strip():
                return name.strip()
    heading = H1.search(markup)
    if heading:
        title = re.sub(r"\s*\(?" + code + r"\)?\s*$", "", text_of(heading.group(1)))
        title = re.sub(r"^(?:AS and )?A-?level\s+", "", title, flags=re.I)
        if title.strip():
            return title.strip()
    return None


def aqa_specification(markup):
    """The current specification PDF, and the year it was first taught.

    A subject being rewritten carries both the outgoing specification and its
    replacement; the outgoing one is what this year's students are sitting.
    """
    urls = list(dict.fromkeys(AQA_PDF.findall(markup)))
    if not urls:
        return None, ""
    chosen, year = urls[0], ""
    for url in urls:
        at = markup.find(url)
        labels = ARIA_LABEL.findall(markup[max(0, at - 700):at])
        near = html.unescape(labels[-1]) if labels else ""
        if len(urls) > 1 and SUPERSEDING.search(near):
            continue
        chosen = url
        found = FIRST_TEACHING.search(near)
        year = found.group(1) if found else ""
        break
    if not year:
        found = FIRST_TEACHING.search(html.unescape(markup))
        year = found.group(1) if found else ""
    return chosen, year


def aqa_rows(notes, today):
    sitemap = fetch(AQA_SITEMAP, 90).decode("utf-8", "ignore")
    pages = sorted({loc for loc in re.findall(r"<loc>([^<]+)</loc>", sitemap)
                    if AQA_SUBJECT_PAGE.search(loc)})
    rows = []
    print("{}: {} subjects".format(AQA_QUALIFICATION, len(pages)))
    for page in pages:
        code = page.rsplit("-", 1)[-1]
        try:
            markup = fetch(page, 45).decode("utf-8", "ignore")
        except Exception as error:  # noqa: BLE001
            print("  {} {:<32} FAILED: {}".format(code, "", error))
            continue
        name = aqa_subject_name(markup, code)
        url, year = aqa_specification(markup)
        if not (name and url):
            print("  {} {:<32} no specification linked".format(code, (name or "")[:30]))
            continue
        record_id = "aqa-alevel-" + code
        rows.append({
            "Record_ID": record_id,
            "Exam_Board": "AQA",
            "Qualification": AQA_QUALIFICATION,
            "Subject_Name": name,
            "Syllabus_Code": code,
            "Exam_Year_From": year,
            "Exam_Year_To": "",
            "Is_Current_In_2026": "true",
            "Is_Latest_Published_Version": "true",
            "Syllabus_PDF_URL": url,
            "Syllabus_Page_URL": page,
            "PotatoPapers_Subject_Filter": "",
            "PotatoPapers_Catalogue_URL": "",
            "PotatoPapers_Paper_Record_Count": 0,
            "PotatoPapers_Has_Catalogue_Records": "false",
            "Availability_Notes": notes.get(record_id, ""),
            "Source_Verification": verify(url),
            "Verified_On": today,
        })
        print("  {} {:<32} {}".format(code, name[:30], year or "-"))
    return rows


def ocr_specification(page_url):
    """The A-level specification, told apart from the AS one beside it."""
    markup = fetch(page_url, 45).decode("utf-8", "ignore")
    candidates = list(dict.fromkeys(re.findall(r'href="(/Images/[^"]+?\.pdf)"', markup, re.I)))

    def score(path):
        name = path.rsplit("/", 1)[-1].lower()
        points = 0
        if "specification" in name:
            points += 10
        if re.search(r"\ba[-\s]?level\b", name):
            points += 8
        if re.search(r"\bas[-\s]?level\b", name):
            points -= 15
        if re.search(r"sam|sample|guide|planner|checklist|transition", name):
            points -= 20
        return points

    ranked = sorted(candidates, key=score, reverse=True)
    return ranked[0] if ranked and score(ranked[0]) > 0 else None


def ocr_rows(notes, today):
    markup = fetch(OCR_LISTING, 45).decode("utf-8", "ignore")
    subjects = OrderedDict()
    for href, slug, label in OCR_SUBJECT_LINK.findall(markup):
        name = re.sub(r"\s+", " ", text_of(label))
        if not name or slug in subjects:
            continue
        subjects[slug] = (href, name)

    rows = []
    print("{}: {} subjects".format(OCR_QUALIFICATION, len(subjects)))
    for slug, (href, name) in subjects.items():
        codes = [code.upper() for code in OCR_CODE.findall(slug)]
        # H400 and above is the A level; below it is the standalone AS.
        advanced = [code for code in codes if code >= "H400"]
        code = advanced[0] if advanced else (codes[-1] if codes else None)
        if not code:
            continue
        page = SITE_OCR + href
        try:
            path = ocr_specification(page)
        except Exception as error:  # noqa: BLE001
            print("  {} {:<32} FAILED: {}".format(code, name[:30], error))
            continue
        if not path:
            print("  {} {:<32} no specification PDF linked".format(code, name[:30]))
            continue
        year = OCR_FROM_YEAR.search(slug)
        record_id = "ocr-alevel-" + slug
        rows.append({
            "Record_ID": record_id,
            "Exam_Board": "OCR",
            "Qualification": OCR_QUALIFICATION,
            "Subject_Name": name,
            "Syllabus_Code": code,
            "Exam_Year_From": year.group(1) if year else "",
            "Exam_Year_To": "",
            "Is_Current_In_2026": "true",
            "Is_Latest_Published_Version": "true",
            "Syllabus_PDF_URL": SITE_OCR + urllib.parse.quote(path),
            "Syllabus_Page_URL": page,
            "PotatoPapers_Subject_Filter": "",
            "PotatoPapers_Catalogue_URL": "",
            "PotatoPapers_Paper_Record_Count": 0,
            "PotatoPapers_Has_Catalogue_Records": "false",
            "Availability_Notes": notes.get(record_id, ""),
            "Source_Verification": verify(SITE_OCR + urllib.parse.quote(path)),
            "Verified_On": today,
        })
        print("  {} {:<32} {}".format(code, name[:30], path.rsplit("/", 1)[-1][:40]))
    return rows


def edexcel_uk_subjects():
    """Every UK A level Pearson lists, keyed by slug, with its first-teaching year."""
    found = OrderedDict()
    for index in EDEXCEL_UK_INDEXES:
        try:
            markup = fetch(EDEXCEL_UK_BASE + "about/" + index + ".html", 45).decode("utf-8", "ignore")
        except Exception as error:  # noqa: BLE001
            print("  index {} FAILED: {}".format(index, error))
            continue
        for slug, year in EDEXCEL_UK_SLUG.findall(markup):
            found.setdefault(slug, year)
    return found


def edexcel_uk_page(page_url):
    return fetch(page_url, 45).decode("utf-8", "ignore")


def edexcel_uk_name(markup, slug):
    """Pearson's own name for the subject, which the slug cannot supply.

    The slug would give "Design Technology Product Design" and "History Of Art";
    the page title carries "Design and Technology - Product Design" and
    "History of Art".
    """
    title = re.search(r"<title>(.*?)</title>", markup, re.S)
    if title:
        text = html.unescape(re.sub(r"<[^>]+>", " ", title.group(1)))
        found = re.search(
            r"AS\s*(?:&(?:amp;)?|and)\s*A\s*level\s+(.+?)\s*\(?\d{4}\)?\s*(?:\||$)",
            re.sub(r"\s+", " ", text), re.I)
        if found and found.group(1).strip():
            return found.group(1).strip()
    return re.sub(r"-\d{4}$", "", slug).replace("-", " ").title()


def edexcel_uk_spec(markup, slug):
    """The A level specification, told apart from everything shipped beside it.

    A subject page carries the AS specification, teaching guides, sample
    assessments and a mapping from the outgoing specification. Maths carries
    Further Maths too, which is a different qualification with its own page.
    """
    candidates = sorted(set(re.findall(r'(/content/dam/pdf/[^"\'>]*?\.pdf)', markup)))

    def score(path):
        name, parent = path.rsplit("/", 1)[-1].lower(), path.rsplit("/", 1)[0].lower()
        # The folder is the dependable signal: whatever else a subject page
        # links to, the specification is filed under one that says so. Some
        # filenames carry no clue at all (`9781446914366-gce-2015-a-hist.pdf`).
        points = 12 if "specification" in parent else 0
        if "spec" in name:
            points += 6
        if re.search(r"(^|[_-])a[_-]?level", name):
            points += 4
        if re.search(r"(^|[_-])as([_-]|\d)", name):
            points -= 18
        # Maths links Further Maths, which is its own qualification and page.
        if "further" in name and "further" not in slug:
            points -= 20
        # Sample assessments sit in the same folder as the specification, and
        # everything else on the page is teaching support of one kind or another.
        if re.search(r"sams|mapping|legacy|draft|guide|onboard|faq|checklist|"
                     r"arrangements|transition|getting-started|teacher|support|"
                     r"overview|network|event|at-a-glance", name):
            points -= 25
        if "/general/" in parent:
            points -= 12
        return points

    ranked = sorted(candidates, key=score, reverse=True)
    return ranked[0] if ranked and score(ranked[0]) > 0 else None


def edexcel_uk_rows(notes, today):
    subjects = edexcel_uk_subjects()
    rows = []
    print("{}: {} subjects".format(EDEXCEL_UK_QUALIFICATION, len(subjects)))
    for slug, year in sorted(subjects.items()):
        name = re.sub(r"-\d{4}$", "", slug).replace("-", " ").title()
        page = EDEXCEL_UK_BASE + slug + ".html"
        try:
            markup = edexcel_uk_page(page)
            name = edexcel_uk_name(markup, slug)
            path = edexcel_uk_spec(markup, slug)
        except Exception as error:  # noqa: BLE001
            print("  {:<38} FAILED: {}".format(name[:36], error))
            continue
        if not path:
            print("  {:<38} no specification PDF linked".format(name[:36]))
            continue
        url = SITE_PEARSON + urllib.parse.quote(path)
        record_id = "edexcel-alevel-" + slug
        rows.append({
            "Record_ID": record_id,
            "Exam_Board": PEARSON_BOARD,
            "Qualification": EDEXCEL_UK_QUALIFICATION,
            "Subject_Name": name,
            "Syllabus_Code": "AL-" + re.sub(r"-\d{4}$", "", slug).upper(),
            "Exam_Year_From": year,
            "Exam_Year_To": "",
            "Is_Current_In_2026": "true",
            "Is_Latest_Published_Version": "true",
            "Syllabus_PDF_URL": url,
            "Syllabus_Page_URL": page,
            "PotatoPapers_Subject_Filter": "",
            "PotatoPapers_Catalogue_URL": "",
            "PotatoPapers_Paper_Record_Count": 0,
            "PotatoPapers_Has_Catalogue_Records": "false",
            "Availability_Notes": notes.get(record_id, ""),
            "Source_Verification": verify(url),
            "Verified_On": today,
        })
        print("  {:<38} {}".format(name[:36], path.rsplit("/", 1)[-1][:40]))
    return rows

# ---------------------------------------------------------------------------
# The IB Diploma Programme.
#
# The other six suites are crawled. This one is read from data/ib-subjects.csv,
# which carries the IB's own "All Diploma Programme subjects" listing - subject
# code, name, level availability and group - with the entries it marks
# discontinued left out. Nothing here is fetched: ibo.org answers this script
# with a bot challenge rather than a page, and a subject guide sits behind the
# programme resource centre in any case, so there is no specification PDF to
# link or to parse. Every subject does have a public course page, and that is
# what Syllabus_Page_URL carries.
#
# The IB splits a course by level rather than by year, so these are the rows
# that fill the Stages column: "SL|HL" for a subject taught at both, "SL" for
# one offered at standard level only, and "none" for the core, which is graded
# without levels at all.
# ---------------------------------------------------------------------------

SITE_IB = "https://www.ibo.org"
IB_CURRICULUM = SITE_IB + "/programmes/diploma-programme/curriculum/"
IB_QUALIFICATION = "IB Diploma Programme"
IB_SUBJECTS = ROOT / "data" / "ib-subjects.csv"


def ib_rows(notes, today):
    subjects = list(csv.DictReader(io.open(IB_SUBJECTS, encoding="utf-8-sig")))
    rows = []
    print("{}: {} subjects".format(IB_QUALIFICATION, len(subjects)))
    for subject in subjects:
        code = subject["Subject_Code"].strip()
        name = subject["Subject_Name"].strip()
        levels = [level.strip() for level in subject["Levels"].split(",") if level.strip()]
        # The core carries a code of the app's own making, IB-TOK; the record id
        # already says which suite it belongs to.
        record_id = "ib-dp-" + code.lower().replace("ib-", "", 1)
        rows.append({
            "Record_ID": record_id,
            "Exam_Board": "IB",
            "Qualification": IB_QUALIFICATION,
            "Subject_Name": name,
            "Syllabus_Code": code,
            "Stages": "|".join(levels) or "none",
            # The listing dates the programme, not each subject: a course's first
            # examination is stated on its guide, which is not public.
            "Exam_Year_From": "",
            "Exam_Year_To": "",
            "Is_Current_In_2026": "true",
            "Is_Latest_Published_Version": "true",
            "Syllabus_PDF_URL": "",
            "Syllabus_Page_URL": IB_CURRICULUM + subject["Page"].strip(),
            "PotatoPapers_Subject_Filter": "",
            "PotatoPapers_Catalogue_URL": "",
            "PotatoPapers_Paper_Record_Count": 0,
            "PotatoPapers_Has_Catalogue_Records": "false",
            # A note written into the directory by hand outlives a rebuild; the
            # rest are the listing's own, which say where a subject is offered.
            "Availability_Notes": notes.get(record_id) or subject.get("Notes", ""),
            "Source_Verification": "listed in the IB DP subject list",
            "Verified_On": today,
        })
        print("  {:<8} {:<44} {}".format(code, name[:42], "/".join(levels) or "no levels"))
    return rows


def existing_notes():
    if not DIRECTORY.exists():
        return {}
    rows = csv.DictReader(io.open(DIRECTORY, encoding="utf-8-sig"))
    return {row["Record_ID"]: row.get("Availability_Notes") or "" for row in rows}


def cambridge_rows(notes, today, everything):
    catalogue = catalogue_subjects()
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

    return rows


# Every suite the directory carries, with the Record_ID prefix its rows use.
# The prefix is what lets one suite be rebuilt and merged over the others, so
# adding a board does not mean re-verifying — and risking — the whole file.
SUITES = OrderedDict([
    ("cambridge", ("caie-", lambda notes, today, everything: cambridge_rows(notes, today, everything))),
    ("pearson-ial", ("edexcel-ial-", lambda notes, today, everything: pearson_rows(notes, today))),
    ("edexcel-igcse", ("edexcel-igcse-", lambda notes, today, everything: edexcel_igcse_rows(notes, today))),
    ("aqa", ("aqa-alevel-", lambda notes, today, everything: aqa_rows(notes, today))),
    ("ocr", ("ocr-alevel-", lambda notes, today, everything: ocr_rows(notes, today))),
    ("edexcel-uk", ("edexcel-alevel-", lambda notes, today, everything: edexcel_uk_rows(notes, today))),
    ("ib", ("ib-dp-", lambda notes, today, everything: ib_rows(notes, today))),
])


def existing_rows():
    if not DIRECTORY.exists():
        return []
    return list(csv.DictReader(io.open(DIRECTORY, encoding="utf-8-sig")))


def main():
    everything = "--all" in sys.argv
    only = [name for argument in sys.argv if argument.startswith("--only=")
            for name in argument.split("=", 1)[1].split(",") if name]
    unknown = [name for name in only if name not in SUITES]
    if unknown:
        print("Unknown suite {}. Choose from: {}".format(", ".join(unknown), ", ".join(SUITES)))
        return 1

    notes = existing_notes()
    today = date.today().isoformat()

    rows = []
    for name in (only or list(SUITES)):
        rows.extend(SUITES[name][1](notes, today, everything))

    if only:
        # Carry over every suite this run did not rebuild. A board is added by
        # crawling that board, not by re-reading three hundred rows that were
        # already verified — one flaky connection would otherwise drop them.
        rebuilt = tuple(SUITES[name][0] for name in only)
        kept = [row for row in existing_rows() if not row["Record_ID"].startswith(rebuilt)]
        print("\nCarried over {} rows from the suites this run left alone".format(len(kept)))
        rows.extend(kept)

    rows.sort(key=lambda row: (row["Exam_Board"], row["Qualification"], row["Subject_Name"],
                               str(row["Exam_Year_From"])))
    with io.open(DIRECTORY, "w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    unverified = [row for row in rows
                  if row["Syllabus_PDF_URL"] and not row["Source_Verification"].startswith("HTTP 200")]
    listed = sum(1 for row in rows if not row["Syllabus_PDF_URL"])
    print("\nWrote {} rows to {}".format(len(rows), DIRECTORY.relative_to(ROOT)))
    if unverified:
        print("{} rows did not verify as a PDF:".format(len(unverified)))
        for row in unverified:
            print("  {} {:<30} {}".format(row["Syllabus_Code"], row["Subject_Name"][:28], row["Source_Verification"]))


if __name__ == "__main__":
    sys.exit(main() or 0)
