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

from PIL import Image, ImageChops

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
    # One queue row at each status that parks a topic, for the table of
    # intervals to sit against. Not Started is the fifth row of that table and
    # the one with no interval, so the four here are the whole of what it
    # schedules.
    "status-rows": ("review-queue", (341, 204, 1385, 558)),
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


# --- The hero -----------------------------------------------------------------
#
# The landing page needs one picture carrying the whole board: the counters, the
# tasks under them, and the queue's actual spec points with their dates and
# statuses. No single capture holds all three. The board was photographed at
# 1440x900, which runs out part-way through the queue's first chapter row, and
# the queue was photographed scrolled down, which starts below the counters.
#
# They are the same session at the same width, so the page they both belong to
# can be put back together — the browser's own full-page screenshot is the same
# operation. Two things make it honest rather than a montage:
#
#   * The queue capture is scrolled by exactly SHIFT. Correlating a band of it
#     against the board finds that offset with the runner-up nine times worse,
#     so there is no ambiguity about where it goes.
#   * The two disagree from row 764 down, because the queue capture has a
#     chapter expanded and so reads "Collapse all" where the board reads "Expand
#     all". SEAM sits above that. Below it every pixel is the expanded state's
#     own; above it, expanding a chapter cannot change anything, since it
#     re-renders only its own subtree — and check_seam proves that for the rows
#     the two captures share, so a retake that breaks the assumption fails here
#     rather than shipping a screen that never existed.
#
# The sidebar is left out. It does not scroll with the page, and the two
# captures caught its own nav at different scroll positions, so it is the one
# column that genuinely cannot be joined. The workspace runs 276..1440, which
# leaves the same gutter either side of the cards.
SHIFT = 715
SEAM = 763
WORKSPACE = (276, 1440)
# Three spec points is enough to show what a queue row carries without the
# picture growing taller than the copy beside it. 1187 is the divider under the
# third, so it stops between rows rather than through one.
HERO_BOTTOM = 1187


def check_seam(board: Image.Image, queue: Image.Image, theme: str) -> None:
    """The rows both captures show above the seam have to be identical."""
    left, right = WORKSPACE
    shared = ImageChops.difference(
        board.crop((left, SHIFT, right, SEAM)),
        queue.crop((left, 0, right, SEAM - SHIFT)),
    ).getbbox()
    if shared is not None:
        raise SystemExit(
            f"{theme}: the board and queue captures disagree above the seam at {shared}. "
            "They are no longer the same page state — retake both, or move SEAM above "
            "the first row that differs."
        )


def build_hero() -> None:
    left, right = WORKSPACE
    for theme in ("light", "dark"):
        board = Image.open(SHOTS / f"review-board-{theme}.png").convert("RGB")
        queue = Image.open(SHOTS / f"review-queue-{theme}.png").convert("RGB")
        check_seam(board, queue, theme)

        page = Image.new("RGB", (right - left, SEAM + queue.height - (SEAM - SHIFT)))
        page.paste(board.crop((left, 0, right, SEAM)), (0, 0))
        page.paste(queue.crop((left, SEAM - SHIFT, right, queue.height)), (0, SEAM))

        hero = page.crop((0, 0, right - left, HERO_BOTTOM))
        target = SHOTS / f"board-hero-{theme}.png"
        hero.save(target, optimize=True)
        print(f"{target.name}  {hero.width}x{hero.height}")


def main() -> None:
    build_hero()
    for name, (source, box) in CROPS.items():
        for theme in ("light", "dark"):
            image = Image.open(SHOTS / f"{source}-{theme}.png")
            crop = image.crop(box)
            target = SHOTS / f"{name}-{theme}.png"
            crop.save(target, optimize=True)
            print(f"{target.name}  {crop.width}x{crop.height}")


if __name__ == "__main__":
    main()
