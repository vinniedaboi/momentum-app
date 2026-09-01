"use client";

import { useState } from "react";
import Icon from "./icons";
import { CORE_LOOP, GUIDE_SECTIONS, STATUS_GUIDE } from "./guide-content";

/**
 * The knowledge section: what every part of the app does, and the handful of
 * rules that are not visible from the screen they govern — how long a status
 * parks a topic, what a pacing style changes, which stage content lands in.
 *
 * Onboarding shows the loop once. This is where a learner comes back to it,
 * which is why it reads the same content rather than a second copy of it.
 */
export default function GuideView({ onOpenView }: { onOpenView: (view: string) => void }) {
  const [open, setOpen] = useState<string | null>(GUIDE_SECTIONS[0]?.id ?? null);

  return (
    <div className="guide-page">
      <section className="guide-loop" aria-label="How Momentum works">
        <div className="guide-loop-head">
          <p className="eyebrow">THE LOOP</p>
          <h3>Five moves, and the app runs itself</h3>
          <p className="muted">
            Everything else feeds these. Read them once and the rest of the guide is detail.
          </p>
          {/* Setup explains the loop before there is anything to look at, which
              is the worst moment to take it in. This is the way back to it. */}
          <a className="guide-walkthrough" href="/onboarding?preview=1">
            Walk through setup again
          </a>
        </div>
        <ol className="guide-loop-steps">
          {CORE_LOOP.map((step, index) => (
            <li key={step.title}>
              <span className="guide-loop-mark" aria-hidden="true">
                <Icon name={step.icon} />
              </span>
              <div>
                <p className="guide-loop-index">Step {index + 1} · {step.where}</p>
                <strong>{step.title}</strong>
                <p>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="guide-statuses" aria-label="Status meanings">
        <div>
          <p className="eyebrow">STATUSES</p>
          <h3>What each one means, and when it comes back</h3>
          <p className="muted">
            Set a status on a syllabus point and the review is scheduled from it. Nothing to configure.
          </p>
        </div>
        <table>
          <thead>
            <tr><th scope="col">Status</th><th scope="col">Means</th><th scope="col">Comes back in</th></tr>
          </thead>
          <tbody>
            {STATUS_GUIDE.map((row) => (
              <tr key={row.status}>
                <th scope="row"><span className={`guide-status ${row.status.toLowerCase().replaceAll(" ", "-")}`}>{row.status}</span></th>
                <td>{row.meaning}</td>
                <td>{row.days ? `${row.days} days` : "Not scheduled"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="guide-sections">
        {GUIDE_SECTIONS.map((section) => {
          const expanded = open === section.id;
          return (
            <section key={section.id} className={`guide-section ${expanded ? "open" : ""}`}>
              <h3>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={`guide-${section.id}`}
                  onClick={() => setOpen(expanded ? null : section.id)}
                >
                  <span className="guide-section-mark" aria-hidden="true"><Icon name={section.icon} /></span>
                  <span className="guide-section-title">
                    <strong>{section.title}</strong>
                    <small>{section.lead}</small>
                  </span>
                  <Icon name={expanded ? "check" : "plus"} className="guide-section-toggle" />
                </button>
              </h3>
              <div id={`guide-${section.id}`} className="guide-section-body" hidden={!expanded}>
                <dl>
                  {section.items.map((item) => (
                    <div key={item.term}>
                      <dt>{item.term}</dt>
                      <dd>{item.detail}</dd>
                    </div>
                  ))}
                </dl>
                {section.tip ? (
                  <p className="guide-tip"><Icon name="spark" /> {section.tip}</p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      <section className="guide-jump" aria-label="Where to start">
        <div>
          <p className="eyebrow">IF YOU ARE NEW</p>
          <strong>Set one syllabus goal, then work the board every day.</strong>
          <p className="muted">The plan writes itself onto the queue, so those are the only two screens you need at first.</p>
        </div>
        <div className="guide-jump-actions">
          <button type="button" className="auth-submit" onClick={() => onOpenView("Goals")}>Set a syllabus goal</button>
          <button type="button" className="ghost-button" onClick={() => onOpenView("Today")}>Open the review board</button>
        </div>
      </section>
    </div>
  );
}
