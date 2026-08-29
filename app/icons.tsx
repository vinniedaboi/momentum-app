/**
 * The app's icon set.
 *
 * These replace the Unicode geometry (◉ ◷ ▧ ◎ ◈ ▦ ◇ ▤ ⚙ ☰ …) the UI used to
 * lean on. Those glyphs came from whatever font happened to have them, so they
 * arrived at different weights and optical sizes on every platform, and several
 * had no relationship to what they labelled.
 *
 * One drawing style, so they read as a set: a 24×24 box, 1.75 stroke, round
 * caps and joins, no fills except where a shape is deliberately solid. Sizing
 * is `1em`, which means an icon takes the font-size of whatever it sits in and
 * the existing type rules keep controlling it. Colour is `currentColor` for the
 * same reason.
 */

export type IconName = keyof typeof PATHS;

/** Each entry is the ordered list of paths that draw one icon. */
const PATHS = {
  // ---- Navigation ------------------------------------------------------
  /** Review board: the spaced-repetition loop, so a rotation. */
  review: ["M21 12a9 9 0 1 1-2.64-6.36", "M21 3v5h-5"],
  /** Tasks: a checkbox. */
  tasks: ["M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z", "M8 12l3 3 5-6"],
  /** Study hours: a clock. */
  hours: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 7v5l3.5 2"],
  /** Past papers: a sheet with a folded corner. */
  papers: ["M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z", "M14 3v5h5", "M9 13h6M9 17h4"],
  /** Syllabus goals: a target. */
  goals: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z", "M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"],
  /** Exams: an hourglass, for the countdown. */
  exams: ["M7 3h10M7 21h10", "M17 3v3.5L12 12l5 5.5V21", "M7 3v3.5L12 12l-5 5.5V21"],
  /** Calendar. */
  calendar: ["M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z", "M8 3v4M16 3v4M4 10h16"],
  /** Flashcards: one card behind another. */
  flashcards: ["M3 9.5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "M7 7.5V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1.5"],
  /** Notes library: a folder. */
  notes: ["M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"],
  /** Subjects: sliders, since the page is configuration. */
  subjects: ["M4 8h8.5M17.5 8h2.5M4 16h2.5M11.5 16h8.5", "M17.5 8a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0z", "M11.5 16a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0z"],
  /** The mobile "More" tab. */
  menu: ["M4 7h16M4 12h16M4 17h16"],

  // ---- Marketing panel -------------------------------------------------
  /** Syllabus coverage: an open book. */
  book: ["M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z", "M4 19.5A2.5 2.5 0 0 1 6.5 17H20"],
  /** Paper analytics: a bar chart. */
  chart: ["M3 21h18", "M7 21v-6M12 21V7M17 21v-10"],
  /** Goal pacing: a four-point star. */
  spark: ["M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z"],

  // ---- Utility ---------------------------------------------------------
  search: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "M20 20l-4-4"],
  check: ["M4.5 12.5l5 5 10-11"],
  plus: ["M12 5v14M5 12h14"],
  close: ["M6 6l12 12M18 6L6 18"],
  upload: ["M12 16V4", "M7 9l5-5 5 5", "M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"],
  swap: ["M4 9h13l-3.5-3.5", "M20 15H7l3.5 3.5"],
  trending: ["M22 7l-8.5 8.5-5-5L2 17", "M16 7h6v6"],
  "arrow-up": ["M12 19V5", "M6 11l6-6 6 6"],
  "arrow-down": ["M12 5v14", "M18 13l-6 6-6-6"],
  "arrow-left": ["M19 12H5", "M11 18l-6-6 6-6"],
  "arrow-right": ["M5 12h14", "M13 6l6 6-6 6"],
  "chevron-down": ["M6 9l6 6 6-6"],
  "chevron-right": ["M9 6l6 6-6 6"],
  "chevron-left": ["M15 6l-6 6 6 6"],
  /** Empty states: an open ring, deliberately quiet. */
  circle: ["M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z"],
} as const;

/** Shapes drawn as solid rather than stroked. */
const SOLID = new Set<IconName>(["goals", "spark"]);

export default function Icon({
  name,
  className,
  strokeWidth = 1.75,
}: {
  name: IconName;
  className?: string;
  /** Lower this for icons sitting on a dark fill, where strokes bloom. */
  strokeWidth?: number;
}) {
  const paths = PATHS[name];
  const solid = SOLID.has(name);

  return (
    <svg
      className={className}
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      // Every use is decorative — each one sits beside its own text label.
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((d, index) => (
        <path
          key={`${name}-${index}`}
          d={d}
          // The target's centre and the star are filled; everything else is a
          // line drawing, so filling them would blot the shape out.
          fill={solid && index === paths.length - 1 ? "currentColor" : "none"}
          stroke={solid && index === paths.length - 1 ? "none" : "currentColor"}
        />
      ))}
    </svg>
  );
}
