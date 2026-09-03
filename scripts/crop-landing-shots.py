"""Cut the landing page's detail crops out of the full-screen screenshots.

A whole 1440px screen shrunk into part of a column shows nothing: the crop is
what makes the counters, the dates and the syllabus row counts readable beside
the copy. So each one is cut close to the card that makes its point, on a clean
edge of the source.

Both themes get the identical box, because the page follows the reader's.

Run it after retaking any of the screenshots it reads:

    python scripts/crop-landing-shots.py
"""

from pathlib import Path

from PIL import Image

SHOTS = Path(__file__).resolve().parent.parent / "public" / "shots"

# name -> (source, (left, top, right, bottom))
CROPS = {
    # The past-paper summary cards on their own. A score is the number every
    # tracker already gives you, so the section arguing past the score shows
    # those figures at a size they can be read at.
    "paper-figures": ("past-papers", (330, 165, 1385, 305)),
    # And the catalogue under them, cut so the two frames of that section do not
    # both show the same summary cards.
    "paper-catalogue": ("past-papers", (330, 300, 1385, 1240)),
    # The four loop boxes are 2.26:1, so those steps sit in bands of one height
    # however wide the column gets.
    # The subject picker's cards, with the syllabus row count on each.
    "loop-subjects": ("syllabus-import", (95, 424, 905, 782)),
    # The four counters, down to the study-hours strip under them.
    "loop-board": ("review-board", (330, 60, 1385, 526)),
    # The quick-log fields. Cropped below the card's own heading, which still
    # names YPT after the app's copy dropped it.
    "loop-log": ("study-log", (330, 434, 1385, 900)),
    # Spec points, each with the date it comes back and the status that set it.
    "loop-reschedule": ("review-queue", (330, 130, 1385, 596)),
}


def main() -> None:
    for name, (source, box) in CROPS.items():
        for theme in ("light", "dark"):
            image = Image.open(SHOTS / f"{source}-{theme}.png")
            crop = image.crop(box)
            target = SHOTS / f"{name}-{theme}.png"
            crop.save(target, optimize=True)
            print(f"{target.name}  {crop.width}x{crop.height}")


if __name__ == "__main__":
    main()
