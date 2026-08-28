/**
 * The Momentum mark: an open book with a rising chart line growing out of it.
 *
 * Redrawn as SVG from brand/momentum-logo.png rather than shipping the bitmap.
 * It stays crisp at 20px in a browser tab and at 48px in the sidebar, costs
 * about a kilobyte, and the white halo around the chart line keeps it legible
 * on the light app icon and the dark sidebar alike.
 */

const GRADIENT_ID = "momentum-mark-gradient";

// The chart's last segment and its arrowhead are derived from the same
// direction vector, so the head sits square on the line.
const CHART_LINE = "M19 43 L25 38 L30 33 L40 23";
const ARROW_HEAD = "M45 18 L43 25.9 L37.1 20 Z";
// Two nodes, not three: a third crowds the line once the mark is under 40px.
const NODES = [
  { cx: 19, cy: 43 },
  { cx: 26, cy: 37.5 },
];

export default function MomentumMark({ className, title = "Momentum" }: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={GRADIENT_ID} x1="8" y1="54" x2="52" y2="12" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1B78D4" />
          <stop offset="0.55" stopColor="#1D9DB6" />
          <stop offset="1" stopColor="#26C39A" />
        </linearGradient>
      </defs>

      {/* Cover edges, set slightly apart from the pages. */}
      <g stroke={`url(#${GRADIENT_ID})`} strokeWidth="2.4" strokeLinecap="round">
        <path d="M5.8 28 L5.8 44" />
        <path d="M58.2 28 L58.2 44" />
      </g>

      {/* Pages, splayed from a dipping spine. The gap between them is the spine. */}
      <path d="M9 24.5 C16 25.4 24 27.9 30.5 31.5 L30.5 50 C24 46.6 16 44.4 9 44.8 Z" fill={`url(#${GRADIENT_ID})`} />
      <path d="M55 24.5 C48 25.4 40 27.9 33.5 31.5 L33.5 50 C40 46.6 48 44.4 55 44.8 Z" fill={`url(#${GRADIENT_ID})`} />

      {/* White halo, so the chart reads over the pages on any background. */}
      <g fill="#fff" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path d={CHART_LINE} fill="none" />
        <path d={ARROW_HEAD} />
      </g>

      <path
        d={CHART_LINE}
        fill="none"
        stroke={`url(#${GRADIENT_ID})`}
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d={ARROW_HEAD} fill={`url(#${GRADIENT_ID})`} />

      {NODES.map((node) => (
        <circle
          key={`${node.cx}-${node.cy}`}
          cx={node.cx}
          cy={node.cy}
          r="2.5"
          fill="#fff"
          stroke={`url(#${GRADIENT_ID})`}
          strokeWidth="1.6"
        />
      ))}
    </svg>
  );
}
