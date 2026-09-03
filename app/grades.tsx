"use client";

import { useMemo, useState, type FormEvent } from "react";
import Icon from "./icons";
import { apiMessage } from "./data/api";
import { studyApi } from "./data/endpoints";
import type { PastPaper } from "./past-papers";
import { subjectName, type Subject } from "./subjects";
import {
  DEFAULT_COMPLETED_WEIGHT,
  defaultScale,
  GRADE_SCALE_KEYS,
  GRADE_SCALES,
  gradeArticle,
  gradeLadder,
  gradeRange,
  gradesFor,
  gradeTargetSubjects,
  isBanked,
  markPercent,
  MOCK_WEIGHT,
  overallGrade,
  overallPercent,
  paperTarget,
  resultGrades,
  type GradeReach,
  type GradeScale,
  type GradeTarget,
} from "./grade-targets";

/** How many recent papers stand for "your current form". */
const FORM_WINDOW = 5;

function formatPercent(value: number | null) {
  if (value == null) return "—";
  return `${Math.round(value * 10) / 10}%`;
}

/** "an A", "a B", and "a U" for the grade nobody targets. */
function reachLabel(grade: string) {
  return grade === "U" ? "a U" : `${gradeArticle(grade)} ${grade}`;
}

/** Four bands across three ladders, so a 7 reads the way a B does. */
function gradeTone(grade: string | null) {
  if (grade === "A*" || grade === "A" || grade === "9" || grade === "8") return "high";
  if (grade === "B" || grade === "C" || grade === "7" || grade === "6") return "mid";
  if (grade === "D" || grade === "E" || grade === "5" || grade === "4") return "low";
  return "fail";
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

type Draft = {
  subjectId: string;
  gradeScale: GradeScale;
  /** Null when the result is a mock, which belongs to no stage of the course. */
  completedStage: string | null;
  remainingStage: string;
  completedGrade: string;
  mark: string;
  max: string;
  weight: string;
  targetGrade: string;
};

function draftFor(target: GradeTarget): Draft {
  return {
    subjectId: target.subjectId,
    gradeScale: target.gradeScale,
    completedStage: target.completedStage,
    remainingStage: target.remainingStage,
    completedGrade: target.completedGrade ?? "",
    mark: String(target.completedMark ?? target.completedPercent),
    max: String(target.completedMax ?? 100),
    weight: String(target.completedWeight),
    targetGrade: target.targetGrade,
  };
}

/**
 * Which half of a subject has been sat. A stage the learner has already marked
 * done on the subject itself is the answer; otherwise the first, which is the
 * one an AS/A2 course is sat in first.
 */
function satStage(subject: Subject | undefined) {
  return subject?.completedStages[0] ?? subject?.stages[0] ?? "AS";
}

function otherStage(subject: Subject | undefined, sat: string) {
  return subject?.stages.find((stage) => stage !== sat) ?? "A2";
}

/**
 * A subject sat in two halves prices the second against the first. One sat in
 * a single go has nothing banked, so it opens on a mock instead: weight zero,
 * no stage behind it, and the target is simply the grade's own boundary.
 */
function blankDraft(subject: Subject | undefined): Draft {
  const gradeScale = defaultScale(subject?.qualification);
  const banked = (subject?.stages.length ?? 0) > 1;
  const completedStage = banked ? satStage(subject) : null;
  const grades = gradesFor(gradeScale);
  return {
    subjectId: subject?.id ?? "",
    gradeScale,
    completedStage,
    remainingStage: banked ? otherStage(subject, completedStage!) : subject?.stages[0] ?? "A2",
    completedGrade: "",
    mark: "",
    max: "100",
    weight: String(banked ? DEFAULT_COMPLETED_WEIGHT : MOCK_WEIGHT),
    // The second rung: an A on both letter ladders, an 8 on the numeric one.
    targetGrade: grades[1] ?? grades[0],
  };
}

/**
 * Half an A Level, and what the other half now has to do.
 *
 * The screen answers one question — "I already have my AS result, so what do I
 * need in A2?" — and then keeps answering it as past papers come in, because
 * the number only means something next to what the learner is actually
 * scoring. Every grade is priced at once rather than only the chosen one: the
 * difference between an A and a B is usually the fact that changes a revision
 * plan, and it is invisible if the screen shows a single target.
 */
export default function GradesView({ targets, subjects, papers, onMessage, onChanged }: {
  targets: GradeTarget[];
  subjects: Subject[];
  papers: PastPaper[];
  onMessage: (message: string) => void;
  onChanged: () => void | Promise<void>;
}) {
  const lookup = useMemo(() => new Map(subjects.map((subject) => [subject.id, subject])), [subjects]);
  const eligible = useMemo(() => gradeTargetSubjects(subjects), [subjects]);
  const untargeted = eligible.filter((subject) => !targets.some((target) => target.subjectId === subject.id));

  const [chosenId, setChosenId] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => blankDraft(undefined));
  const [busy, setBusy] = useState(false);
  const [targetDraft, setTargetDraft] = useState<string | null>(null);

  const active = targets.find((target) => target.subjectId === chosenId) ?? targets[0] ?? null;

  // The subjects arrive after the first paint, so the form's default cannot be
  // set when its state is created. Adjusting during the render rather than from
  // an effect is React's own answer to that, and it runs before the browser
  // paints — seeded once, so it never pulls the form off a later choice.
  const [seeded, setSeeded] = useState(false);
  if (!seeded && !targets.length && untargeted.length) {
    setSeeded(true);
    setDraft(blankDraft(untargeted[0]));
  }

  // The subject's own split, or what the draft is holding while it loads. A
  // mock names no completed stage, so only the one still ahead is certain.
  const stages = lookup.get(draft.subjectId)?.stages
    ?? [draft.completedStage, draft.remainingStage].filter((stage): stage is string => Boolean(stage));
  const draftPercent = markPercent(
    draft.mark === "" ? null : Number(draft.mark),
    draft.max === "" ? null : Number(draft.max),
  );
  const draftWeight = Number(draft.weight);
  const draftPreview = draftPercent == null || !Number.isFinite(draftWeight) || draftWeight < 0 || draftWeight > 95
    ? null
    : gradeLadder({ completedPercent: draftPercent, completedWeight: draftWeight, gradeScale: draft.gradeScale })
      .find((rung) => rung.grade === draft.targetGrade) ?? null;

  function beginNew() {
    const subject = untargeted[0];
    if (!subject) return;
    setDraft(blankDraft(subject));
    setEditing(true);
  }

  function beginEdit(target: GradeTarget) {
    setDraft(draftFor(target));
    setEditing(true);
  }

  /**
   * A different subject can be a different shape of question — two halves or
   * one sitting, and a different ladder — so everything but the marks already
   * typed is re-derived rather than carried across.
   */
  function chooseSubject(subjectId: string) {
    const subject = lookup.get(subjectId);
    setDraft((current) => ({ ...blankDraft(subject), mark: current.mark, max: current.max }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const existing = targets.find((target) => target.subjectId === draft.subjectId);
      const { target } = await studyApi.gradeTargets.save<{ target: GradeTarget }>({
        subjectId: draft.subjectId,
        gradeScale: draft.gradeScale,
        completedStage: draft.completedStage,
        remainingStage: draft.remainingStage,
        completedGrade: draft.completedGrade || null,
        completedMark: draft.mark === "" ? null : Number(draft.mark),
        completedMax: draft.max === "" ? null : Number(draft.max),
        completedWeight: Number(draft.weight),
        targetGrade: draft.targetGrade,
        // Editing the result should not silently drop a paper target the
        // learner set by hand on the screen behind this form.
        paperTargetPercent: existing?.paperTargetPercent ?? null,
      });
      await onChanged();
      setChosenId(target.subjectId);
      setEditing(false);
      onMessage(`${subjectName(lookup, target.subjectId)} ${target.remainingStage} target saved`);
    } catch (error) {
      onMessage(apiMessage(error, "Your grade target could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  /** Re-targeting from the ladder, which is one field of an otherwise unchanged row. */
  async function patch(target: GradeTarget, changes: Partial<GradeTarget>) {
    const next = { ...target, ...changes };
    setBusy(true);
    try {
      await studyApi.gradeTargets.save<{ target: GradeTarget }>({
        subjectId: next.subjectId,
        gradeScale: next.gradeScale,
        completedStage: next.completedStage,
        remainingStage: next.remainingStage,
        completedGrade: next.completedGrade,
        completedMark: next.completedMark,
        completedMax: next.completedMax,
        completedPercent: next.completedPercent,
        completedWeight: next.completedWeight,
        targetGrade: next.targetGrade,
        paperTargetPercent: next.paperTargetPercent,
      });
      await onChanged();
    } catch (error) {
      onMessage(apiMessage(error, "That change could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(target: GradeTarget) {
    try {
      await studyApi.gradeTargets.remove(target.subjectId);
      await onChanged();
      setChosenId("");
      setEditing(false);
      onMessage("Grade target removed");
    } catch {
      onMessage("That grade target could not be removed.");
    }
  }

  if (!eligible.length) {
    return <section className="empty-state">
      <strong>No subjects to aim at yet</strong>
      <p>This works for any course graded A* to E, A* to G, or 9 to 1 — an A Level priced against the AS you have already sat, or an IGCSE priced against a mock. Add a subject in Subjects and its grade target appears here.</p>
    </section>;
  }

  return <div className="goals-page grades-page">
    <section className="goal-switcher" aria-label="Grade targets">
      <div>
        {targets.map((target) => (
          <button
            key={target.subjectId}
            className={active?.subjectId === target.subjectId && !editing ? "active" : ""}
            onClick={() => { setChosenId(target.subjectId); setEditing(false); setTargetDraft(null); }}
          >{subjectName(lookup, target.subjectId)} <b>{target.targetGrade}</b></button>
        ))}
      </div>
      {untargeted.length > 0 && <button className="add-goal-button" onClick={beginNew}>+ Add a result</button>}
    </section>

    {editing || !active ? (
      <ResultForm
        draft={draft}
        stages={stages}
        subjects={editing && targets.some((target) => target.subjectId === draft.subjectId) ? eligible : untargeted}
        existing={targets.some((target) => target.subjectId === draft.subjectId)}
        percent={draftPercent}
        preview={draftPreview}
        busy={busy}
        onChange={setDraft}
        onChooseSubject={chooseSubject}
        onSubmit={save}
        onCancel={targets.length ? () => setEditing(false) : null}
      />
    ) : (
      <TargetDetail
        target={active}
        subject={lookup.get(active.subjectId) ?? null}
        papers={papers}
        busy={busy}
        targetDraft={targetDraft}
        onTargetDraft={setTargetDraft}
        onEdit={() => beginEdit(active)}
        onRemove={() => remove(active)}
        onPatch={(changes) => patch(active, changes)}
      />
    )}
  </div>;
}

function ResultForm({ draft, stages, subjects, existing, percent, preview, busy, onChange, onChooseSubject, onSubmit, onCancel }: {
  draft: Draft;
  stages: string[];
  subjects: Subject[];
  existing: boolean;
  percent: number | null;
  preview: { required: number; reach: GradeReach } | null;
  busy: boolean;
  onChange: (draft: Draft) => void;
  onChooseSubject: (subjectId: string) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: (() => void) | null;
}) {
  const completed = draft.completedStage;
  const remaining = draft.remainingStage;
  const banked = Number(draft.weight) > 0;
  const scale = GRADE_SCALES[draft.gradeScale];
  const splits = stages.length > 1;

  return <section className="goal-setup grade-setup panel-card">
    <div className="goal-setup-copy">
      <p className="eyebrow">{existing ? "EDIT RESULT" : banked ? "ALREADY SAT ONE HALF?" : "GOT A MOCK BACK?"}</p>
      <h3>{banked ? `What did you get in ${completed}?` : "What did your mock come to?"}</h3>
      <p>{banked
        ? `Momentum works out what ${remaining} has to average for each overall grade, then measures every ${remaining} past paper you log against the one you pick.`
        : "Momentum prices every grade against the boundary it needs, shows how far the mock is off each one, and measures every past paper you log against the one you pick."}</p>
      <p className="grade-setup-note">
        {banked
          ? "The maths assumes the two halves are weighted as you set below. "
          : "A mock counts for nothing towards the real grade, so it is read as a position rather than as marks in the bank. "}
        Grades are priced against the standard {scale.detail} boundaries. Real boundaries shift a mark or two each session, so treat every number here as close rather than exact.
      </p>
    </div>
    <form className="goal-form grade-form" onSubmit={onSubmit}>
      <label><span>Subject</span>
        <select value={draft.subjectId} disabled={existing} required onChange={(event) => onChooseSubject(event.target.value)}>
          {!draft.subjectId && <option value="">Choose a subject</option>}
          {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </select>
      </label>
      <label><span>Graded <small>{scale.detail}</small></span>
        <select value={draft.gradeScale} onChange={(event) => {
          const gradeScale = event.target.value as GradeScale;
          const grades = gradesFor(gradeScale);
          onChange({
            ...draft,
            gradeScale,
            // A grade from the old ladder means nothing on the new one.
            targetGrade: grades.includes(draft.targetGrade) ? draft.targetGrade : grades[1] ?? grades[0],
            completedGrade: resultGrades(gradeScale, banked).includes(draft.completedGrade) ? draft.completedGrade : "",
          });
        }}>
          {GRADE_SCALE_KEYS.map((key) => <option key={key} value={key}>{GRADE_SCALES[key].label}</option>)}
        </select>
      </label>
      {splits && <label><span>This result is</span>
        <select value={draft.completedStage ?? ""} onChange={(event) => {
          const completedStage = event.target.value || null;
          onChange({
            ...draft,
            completedStage,
            weight: String(completedStage ? DEFAULT_COMPLETED_WEIGHT : MOCK_WEIGHT),
            remainingStage: completedStage
              ? stages.find((stage) => stage !== completedStage) ?? draft.remainingStage
              : draft.remainingStage,
          });
        }}>
          {stages.map((stage) => <option key={stage} value={stage}>{stage}, already sat</option>)}
          <option value="">A mock — nothing sat yet</option>
        </select>
      </label>}
      <label><span>Grade awarded <small>optional</small></span>
        <select value={draft.completedGrade} onChange={(event) => onChange({ ...draft, completedGrade: event.target.value })}>
          <option value="">Not saying</option>
          {resultGrades(draft.gradeScale, banked).map((grade) => <option key={grade}>{grade}</option>)}
        </select>
      </label>
      <div className="grade-mark-field">
        <span>Mark <small>{banked ? "or your percentage uniform mark" : "across the mock, or its percentage"}</small></span>
        <div>
          <input type="number" min="0" max="1000" step="0.5" required placeholder="82" value={draft.mark} aria-label={banked ? `Mark scored in ${completed}` : "Mark scored in the mock"} onChange={(event) => onChange({ ...draft, mark: event.target.value })} />
          <b>out of</b>
          <input type="number" min="1" max="1000" step="0.5" required placeholder="100" value={draft.max} aria-label="Total marks available" onChange={(event) => onChange({ ...draft, max: event.target.value })} />
        </div>
      </div>
      {banked && <label><span>{completed} counts for</span>
        <div className="hours-input">
          <input type="number" min="5" max="95" step="1" required value={draft.weight} onChange={(event) => onChange({ ...draft, weight: event.target.value })} />
          <b>% of the grade</b>
        </div>
      </label>}
      <fieldset className="grade-target-picker">
        <legend>Overall grade you want</legend>
        <div>
          {gradesFor(draft.gradeScale).map((grade) => <button
            type="button"
            key={grade}
            aria-pressed={draft.targetGrade === grade}
            className={draft.targetGrade === grade ? "active" : ""}
            onClick={() => onChange({ ...draft, targetGrade: grade })}
          >{grade}</button>)}
        </div>
      </fieldset>
      <div className={`grade-preview ${preview?.reach ?? "empty"}`} aria-live="polite">
        {preview == null || percent == null
          ? <><strong>—</strong><small>Enter {banked ? `your ${completed} mark` : "your mock mark"} to see the target</small></>
          : preview.reach === "out-of-reach"
            ? <><strong>Out of reach</strong><small>{percent}% in {completed} puts {gradeArticle(draft.targetGrade)} {draft.targetGrade} beyond a perfect {remaining}</small></>
            : preview.reach === "secured"
              ? <><strong>Already yours</strong><small>{percent}% in {completed} secures {gradeArticle(draft.targetGrade)} {draft.targetGrade} whatever {remaining} does</small></>
              : <><strong>{preview.required}%</strong><small>{banked
                  ? `needed in ${remaining} for ${gradeArticle(draft.targetGrade)} ${draft.targetGrade}`
                  : `needed for ${gradeArticle(draft.targetGrade)} ${draft.targetGrade} — your mock is on ${percent}%`}</small></>}
      </div>
      <div className="goal-form-actions">
        {onCancel && <button type="button" className="ghost-button" onClick={onCancel}>Cancel</button>}
        <button className="primary-button" disabled={busy || !draft.subjectId}>{busy ? "Saving…" : existing ? "Save result" : "Set my target"}</button>
      </div>
    </form>
  </section>;
}

function TargetDetail({ target, subject, papers, busy, targetDraft, onTargetDraft, onEdit, onRemove, onPatch }: {
  target: GradeTarget;
  subject: Subject | null;
  papers: PastPaper[];
  busy: boolean;
  targetDraft: string | null;
  onTargetDraft: (value: string | null) => void;
  onEdit: () => void;
  onRemove: () => void;
  onPatch: (changes: Partial<GradeTarget>) => Promise<void>;
}) {
  const ladder = gradeLadder(target);
  const chosen = ladder.find((rung) => rung.grade === target.targetGrade)!;
  const range = gradeRange(target);
  const wanted = paperTarget(target);
  const banked = isBanked(target);
  /** What the exam still to come is called, for a course that has only one. */
  const ahead = banked ? target.remainingStage : "the exam";
  /**
   * A one-stage course stores its single stage under the tracker's own
   * shorthand, so naming it on screen would show an IGCSE student an "A2" they
   * have never heard of. A stage label is only worth showing where there is a
   * second one to tell it apart from.
   */
  const named = (subject?.stages.length ?? 0) > 1;

  // Only the stage still to sit, and only papers with a score on them: a
  // planned paper has nothing to say about form, and an AS paper is a record
  // of the half already banked.
  const scored = useMemo(() => papers
    .filter((paper) => paper.subjectId === target.subjectId
      && paper.stage === target.remainingStage
      && paper.status === "done"
      && paper.percentage != null)
    .sort((a, b) => b.attemptDate.localeCompare(a.attemptDate) || b.id - a.id),
    [papers, target.subjectId, target.remainingStage]);

  const recent = scored.slice(0, FORM_WINDOW);
  const form = average(recent.map((paper) => paper.percentage!));
  const best = scored.length ? Math.max(...scored.map((paper) => paper.percentage!)) : null;
  const hits = scored.filter((paper) => paper.percentage! >= wanted).length;

  /**
   * Where the learner is standing right now. Logged papers say it best, but a
   * mock is a reading too — and for a course sat in one go it is often the
   * only one there is, so it stands in until papers arrive. A banked half is
   * not a reading of the same thing: it is marks already in the bank, and the
   * screen reports it separately.
   */
  const standing = form ?? (banked ? null : target.completedPercent);
  const projected = standing == null ? null : overallPercent(target, standing);
  const projectedGrade = projected == null ? null : overallGrade(target.gradeScale, projected);
  const gap = standing == null ? null : wanted - standing;

  return <>
    <section className="goal-hero grade-hero">
      <div className="goal-hero-copy">
        <p className="eyebrow">GRADE TARGET</p>
        <h3>{subject?.name ?? target.subjectId} {named && <span>{target.remainingStage}</span>}</h3>
        <p>
          {banked
            ? <><strong>{target.completedStage}</strong> banked at <strong>{formatPercent(target.completedPercent)}</strong></>
            : <><strong>Mock</strong> came to <strong>{formatPercent(target.completedPercent)}</strong></>}
          {target.completedGrade ? <> · grade <strong>{target.completedGrade}</strong></> : null}
        </p>
        <div className="goal-plan-tags">
          {banked
            ? <>
              <span>{target.completedStage} worth {target.completedWeight}%</span>
              <span>Best possible {range.best}</span>
              <span>Guaranteed {range.worst === "U" ? "nothing yet" : range.worst}</span>
            </>
            : <>
              <span>{GRADE_SCALES[target.gradeScale].label}</span>
              <span>Sat in one go</span>
              <span>The mock counts for nothing</span>
            </>}
        </div>
        <div className="grade-hero-actions">
          <button onClick={onEdit}>Edit result</button>
          <button className="delete-goal" onClick={onRemove}>Remove</button>
        </div>
      </div>
      <div className={`grade-headline ${chosen.reach}`}>
        <span className={`grade-badge ${gradeTone(target.targetGrade)}`}>{target.targetGrade}</span>
        {chosen.reach === "out-of-reach"
          ? <><strong>Out of reach</strong><small>even a perfect {ahead} lands on {reachLabel(overallGrade(target.gradeScale, overallPercent(target, 100)))}</small></>
          : chosen.reach === "secured"
            ? <><strong>Secured</strong><small>{gradeArticle(target.targetGrade)} {target.targetGrade} stands whatever {ahead} does</small></>
            : <><strong>{chosen.required}%</strong><small>needed across {ahead} for {gradeArticle(target.targetGrade)} {target.targetGrade}</small></>}
      </div>
    </section>

    <section className="goal-metrics grade-metrics">
      <article>
        <span>Your form</span>
        <strong>{formatPercent(standing)}</strong>
        <small>{recent.length
          ? `last ${recent.length} ${named ? `${target.remainingStage} ` : ""}${recent.length === 1 ? "paper" : "papers"}`
          : banked ? "no scored papers yet" : "your mock, until papers land"}</small>
      </article>
      <article className={gap == null ? "" : gap <= 0 ? "on-track" : "behind"}>
        <span>Against target</span>
        <strong>{gap == null ? "—" : gap <= 0 ? `+${Math.round(Math.abs(gap))}` : `−${Math.round(gap)}`}</strong>
        <small>{gap == null ? `target is ${Math.round(wanted)}%` : gap <= 0 ? `clear of your ${Math.round(wanted)}% target` : `points under your ${Math.round(wanted)}% target`}</small>
      </article>
      <article>
        <span>On this form</span>
        <strong>{projectedGrade ?? "—"}</strong>
        <small>{projected == null ? "log a paper to project a grade" : `${formatPercent(projected)} overall if ${ahead} matches`}</small>
      </article>
      <article>
        <span>Papers on target</span>
        <strong>{scored.length ? `${hits}/${scored.length}` : "—"}</strong>
        <small>{best == null ? "nothing logged yet" : `best ${formatPercent(best)}`}</small>
      </article>
    </section>

    <section className="grade-ladder panel-card">
      <div className="section-heading">
        <div><p className="eyebrow">EVERY GRADE, PRICED</p><h3>What each one costs you in {ahead}</h3></div>
        <span>Pick one to make it your target</span>
      </div>
      <ul>
        {ladder.map((rung) => <li key={rung.grade} className={`${rung.reach} ${rung.grade === target.targetGrade ? "chosen" : ""}`}>
          <button
            type="button"
            aria-pressed={rung.grade === target.targetGrade}
            disabled={rung.reach === "out-of-reach"}
            onClick={() => onPatch({ targetGrade: rung.grade })}
          >
            <span className={`grade-badge ${gradeTone(rung.grade)}`}>{rung.grade}</span>
            <b>{rung.minimum}% overall</b>
            <div className="grade-need-bar"><i style={{ width: `${rung.required}%` }} />{standing != null && <em style={{ left: `${Math.min(100, standing)}%` }} aria-hidden="true" />}</div>
            <strong>{rung.reach === "out-of-reach" ? "Gone" : rung.reach === "secured" ? "Secured" : `${rung.required}%`}</strong>
            <small>{rung.reach === "out-of-reach"
              ? `needs ${Math.round(rung.raw)}% in ${ahead}`
              : rung.reach === "secured" ? "already banked"
              : standing == null ? `in ${ahead}`
              : rung.required <= standing ? "you are there" : `${Math.ceil(rung.required - standing)} points off your form`}</small>
          </button>
        </li>)}
      </ul>
      <p className="grade-ladder-note">Boundaries move between sessions, so these are estimates. {chosen.reach === "reachable" && <>{gradeArticle(target.targetGrade) === "an" ? "An" : "A"} {target.targetGrade} needs {chosen.required}% across {ahead} — every paper of it, not one.</>}</p>
    </section>

    <section className="grade-paper-target panel-card">
      <div className="section-heading">
        <div><p className="eyebrow">PAST PAPER TARGET</p><h3>The number every {named ? `${target.remainingStage} ` : ""}paper is marked against</h3></div>
      </div>
      <div className="grade-paper-body">
        <div className="grade-paper-set">
          <label>
            <span>Target</span>
            <div className="hours-input">
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={targetDraft ?? String(Math.round(wanted * 10) / 10)}
                onChange={(event) => onTargetDraft(event.target.value)}
              />
              <b>%</b>
            </div>
          </label>
          <button
            className="primary-button"
            disabled={busy || targetDraft === null || targetDraft === ""}
            onClick={async () => {
              await onPatch({ paperTargetPercent: Number(targetDraft) });
              onTargetDraft(null);
            }}
          >Set target</button>
          {target.paperTargetPercent != null && <button
            className="ghost-button"
            onClick={async () => { await onPatch({ paperTargetPercent: null }); onTargetDraft(null); }}
          >Follow my target grade</button>}
        </div>
        <p className="muted">
          {/* A target grade that is gone would otherwise show as a flat 100%,
              which reads as an instruction rather than as the dead end it is. */}
          {chosen.reach === "out-of-reach"
            ? `${gradeArticle(target.targetGrade) === "an" ? "An" : "A"} ${target.targetGrade} is no longer reachable from ${target.completedPercent}% in ${target.completedStage}. Pick a grade from the ladder above for a target you can actually hit, or set your own here.`
            : target.paperTargetPercent == null
              ? `Following your ${target.targetGrade} target: ${chosen.required}% across ${ahead}. Change it to aim somewhere else — a cushion above the boundary is the usual reason.`
              : `Set by you. Your ${target.targetGrade} target needs ${chosen.required}%.`}
        </p>
        {scored.length > 0 && <ul className="grade-paper-log">
          {recent.map((paper) => {
            const over = paper.percentage! - wanted;
            return <li key={paper.id} className={over >= 0 ? "hit" : "miss"}>
              <strong>{paper.paper}{paper.variant ? ` v${paper.variant}` : ""}</strong>
              <span>{paper.session} {paper.year}</span>
              <b>{formatPercent(paper.percentage)}</b>
              <i>{over >= 0 ? <><Icon name="check" /> {Math.round(over)} over</> : `${Math.round(Math.abs(over))} under`}</i>
            </li>;
          })}
        </ul>}
        {!scored.length && <p className="muted">Nothing logged {named ? `for ${target.remainingStage} ` : ""}yet. Log a paper in Past papers — a school mock included — and it is measured against this number.</p>}
      </div>
    </section>
  </>;
}
