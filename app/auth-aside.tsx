import MomentumMark from "./momentum-mark";
import ThemeToggle from "./theme-toggle";
import Icon from "./icons";

/**
 * Marketing panel shared by the sign-in and sign-up screens.
 *
 * It says the same things the landing page says, in the same terms. It used to
 * say narrower ones — Cambridge only, and free "while Momentum is in early
 * access" — which read, one click after a page promising five exam boards and
 * no limits, as two different products, or as a price about to arrive.
 */
export default function AuthAside() {
  return (
    <aside className="auth-aside">
      <ThemeToggle />
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
          Momentum does the planning. Open it, and you know what to review next.
        </p>

        <ul className="auth-highlights">
          <li>
            <i aria-hidden="true"><Icon name="hours" /></i>
            <span><strong>Spaced review queue</strong> — every topic resurfaces on its own schedule.</span>
          </li>
          <li>
            <i aria-hidden="true"><Icon name="book" /></i>
            <span><strong>Official syllabuses</strong> — Cambridge, Edexcel, AQA, OCR and IB, loaded on day one.</span>
          </li>
          <li>
            <i aria-hidden="true"><Icon name="chart" /></i>
            <span><strong>Past paper analytics</strong> — scores, grades and weak topics in one place.</span>
          </li>
          <li>
            <i aria-hidden="true"><Icon name="spark" /></i>
            <span><strong>Goal pacing</strong> — pick a target date and get a day-by-day plan.</span>
          </li>
        </ul>
      </div>

      <p className="eyebrow light" style={{ margin: 0 }}>
        For A Level, IGCSE and IB students
      </p>
    </aside>
  );
}
