# Retaking the landing page's board screenshot

`public/shots/board-hero-{light,dark}.png` is the picture the landing page opens
on. It is a straight capture of the running app — not a crop, and not two
captures joined — so retaking it is a matter of putting the board into the state
worth photographing and shooting the whole of it at once.

## What has to be in frame

- The four counters, because the labels under the picture on the landing page
  point at them. Their place in the frame is measured into `landing.css`, so
  keep the capture **1440 wide** or those labels stop lining up.
- The **tasks** card. It only renders for a task due today or overdue, so make
  sure there is one before you shoot.
- **A few syllabus points**, which means a chapter left expanded in the queue.

## Getting the height right

Shoot at the height the content itself ends at, and nothing is left half-drawn:
the sidebar finishes on Sign out, and the queue finishes on a chapter rather than
part-way through a row. Read that height off the page rather than guessing:

```js
const panel = [...document.querySelectorAll('.review-panel, .panel-card')]
  .find(p => p.textContent.includes('Review next'));
Math.round(panel.querySelector('.queue-groups').children[0].getBoundingClientRect().bottom);
```

Set the viewport to 1440 by that number. The workspace is a plain document, so
changing the height moves nothing in it — only the sidebar grows, which is what
lets it finish cleanly.

## Taking it

Chrome's own full-page capture is the simplest route: DevTools → device toolbar
→ 1440 wide → **Capture full size screenshot**, then trim to the height above.

Rasterising from inside the page also works and is what was used last time, but
only through SVG `foreignObject` — `html-to-image`, not `html2canvas`. The latter
re-implements layout and drew two queue rows on top of each other. Render at 2x
or more and downscale to 1440; `color-mix()` is used on every card and resolves
to a `color()` function some rasterisers cannot read, so replace those two rules
with the flat colour they paint before shooting.

Take both themes from the same state, and wait for the theme transition to
finish — a card's computed background has to stop changing before the shutter,
or the counters come out mid-fade.

## After

Nothing to run: the hero is not derived from anything.
`scripts/crop-landing-shots.py` reads `review-board` and `review-queue`, which
are separate captures and stay as they are.
