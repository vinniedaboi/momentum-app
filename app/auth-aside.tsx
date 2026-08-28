import MomentumMark from "./momentum-mark";

/** Marketing panel shared by the sign-in and sign-up screens. */
export default function AuthAside() {
  return (
    <aside className="auth-aside">
      <div className="brand-lockup">
        <div className="brand-mark"><MomentumMark /></div>
        <div>
          <p className="eyebrow light">Focus. Study. Grow.</p>
          <h1>Momentum</h1>
        </div>
      </div>

      <div className="auth-pitch">
        <h2>Know exactly what to review next.</h2>
        <p>
          Momentum turns your syllabus into a schedule, then keeps it honest as
          your exam date gets closer.
        </p>

        <ul className="auth-highlights">
          <li>
            <i aria-hidden="true">◷</i>
            <span><strong>Spaced review queue</strong> — every topic resurfaces on its own schedule.</span>
          </li>
          <li>
            <i aria-hidden="true">◈</i>
            <span><strong>Full CAIE syllabus</strong> — chapters and spec points loaded on day one.</span>
          </li>
          <li>
            <i aria-hidden="true">◑</i>
            <span><strong>Past paper analytics</strong> — scores, grades and weak topics in one place.</span>
          </li>
          <li>
            <i aria-hidden="true">✦</i>
            <span><strong>Goal pacing</strong> — pick a target date and get a day-by-day plan.</span>
          </li>
        </ul>
      </div>

      <p className="eyebrow light" style={{ margin: 0 }}>
        Built for Cambridge AS &amp; A Level
      </p>
    </aside>
  );
}
