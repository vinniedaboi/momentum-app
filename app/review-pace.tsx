"use client";

import { useEffect, useState } from "react";
import { apiMessage } from "./data/api";
import { studyApi } from "./data/endpoints";
import {
  MAX_REVIEW_DAYS, MIN_REVIEW_DAYS, PACED_STATUSES, PACE_PRESETS,
  matchingPreset, normalisePace, type PacedStatus, type ReviewPace,
} from "./topics";

/** What the save reports back, beyond the gaps themselves. */
type PaceSaved = {
  pace: ReviewPace;
  /** Points the new pace had already passed, and so handed back. */
  caughtUp: number;
  /** Days that catch-up was dealt over, starting today. */
  spreadDays: number;
};

/**
 * What each status means, in the order work moves through them. The wording is
 * the guide's own, so a learner setting a gap here reads the same description
 * of the status that the guide gave them.
 */
const PACE_FIELDS: Array<{ status: PacedStatus; meaning: string }> = [
  { status: "Learning", meaning: "First pass done" },
  { status: "Practising", meaning: "Working through questions" },
  { status: "Covered", meaning: "Content complete" },
  { status: "Exam Ready", meaning: "Confident under exam conditions" },
];

/**
 * The gaps between reviews, as the learner wants them.
 *
 * A pace that suits a school year is the wrong one for the fortnight before a
 * paper, and the numbers were compiled in with no way to say so. Presets carry
 * most people; the four fields are there for anyone who wants five days rather
 * than seven.
 */
export default function ReviewPacePanel({ pace, onSaved, onMessage }: {
  pace: ReviewPace;
  /** Hands back what the server stored, which may be rounded or clamped. */
  onSaved: (pace: ReviewPace) => void;
  onMessage: (message: string) => void;
}) {
  const [draft, setDraft] = useState<ReviewPace>(pace);
  const [saving, setSaving] = useState(false);

  // The stored pace lands after the first paint, and again after every save.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(pace);
  }, [pace]);

  const preset = matchingPreset(draft);
  const dirty = PACED_STATUSES.some((status) => draft[status] !== pace[status]);

  async function save() {
    setSaving(true);
    try {
      const data = await studyApi.reviewPace.save<PaceSaved>({ pace: normalisePace(draft) });
      onSaved(data.pace);
      onMessage(data.caughtUp
        ? `Pace saved — ${data.caughtUp} point${data.caughtUp === 1 ? "" : "s"} to catch up, spread over ${data.spreadDays === 1 ? "today" : `the next ${data.spreadDays} days`}`
        : "Pace saved — your reviews have been re-planned");
    } catch (error) {
      onMessage(apiMessage(error, "Your review pace could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="review-pace panel-card">
      <div className="panel-heading">
        <p className="eyebrow">REVIEW PACE</p>
        <h3>How soon work comes back</h3>
        <p>
          How long a syllabus point waits before the board asks for it again, counted from the day you
          last studied it. A point you find hard still comes back sooner than one you find easy — this
          sets the gap those are measured against.
        </p>
      </div>

      <fieldset className="pace-picker">
        <legend>Start from a pace</legend>
        {PACE_PRESETS.map((option) => (
          <div className={`pace-option ${preset === option.id ? "active" : ""}`} key={option.id}>
            <input
              type="radio"
              name="review-pace"
              value={option.id}
              checked={preset === option.id}
              aria-label={`${option.label}: ${option.note}`}
              onChange={() => setDraft({ ...option.pace })}
            />
            <span><strong>{option.label}</strong><small>{option.note}</small></span>
          </div>
        ))}
      </fieldset>

      <div className="pace-days">
        {PACE_FIELDS.map((field) => (
          <label key={field.status}>
            <span>{field.status}<small>{field.meaning}</small></span>
            <input
              type="number"
              inputMode="numeric"
              min={MIN_REVIEW_DAYS}
              max={MAX_REVIEW_DAYS}
              value={draft[field.status]}
              disabled={saving}
              onChange={(event) => {
                const days = Number(event.target.value);
                setDraft((current) => ({ ...current, [field.status]: Number.isFinite(days) ? days : current[field.status] }));
              }}
            />
            <b>days</b>
          </label>
        ))}
      </div>

      <div className="pace-actions">
        <p>
          {preset ? `${PACE_PRESETS.find((option) => option.id === preset)?.label} pace.` : "Custom pace."}{" "}
          Saving re-plans everything you have already studied. Nothing turns overdue: work the new pace
          has already passed comes back from today, the most overdue first, about a day&rsquo;s worth at a
          time. Points you have not started stay due now.
        </p>
        <button className="primary-button" disabled={!dirty || saving} onClick={save}>
          {saving ? "Saving…" : dirty ? "Save pace" : "Saved"}
        </button>
      </div>
    </section>
  );
}
