"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Icon from "./icons";
import { apiMessage } from "./data/api";
import { studyApi } from "./data/endpoints";
import type { PastPaper } from "./past-papers";
import { subjectName, type Subject } from "./subjects";
import type { AssessmentComponent, SyllabusSource } from "../lib/syllabus-db";
import {
  bankedFromComponents,
  componentPercent,
  coveredWeight,
  DEFAULT_COMPLETED_WEIGHT,
  defaultScale,
  defaultThresholds,
  GRADE_SCALE_KEYS,
  GRADE_SCALES,
  gradeArticle,
  gradeBeats,
  gradeLadder,
  gradeRange,
  gradesFor,
  gradeTargetSubjects,
  isBanked,
  markPercent,
  MAX_THRESHOLD,
  MIN_THRESHOLD,
  MOCK_WEIGHT,
  overallGrade,
  overallPercent,
  courseOutcome,
  paperTarget,
  remainingFromComponents,
  resultGrades,
  thresholdsDiffer,
  type ComponentStatus,
  type GradeReach,
  type GradeScale,
  type GradeTarget,
  type GradeThresholds,
  type TargetComponent,
} from "./grade-targets";

/** How many recent papers stand for "your current form". */
const FORM_WINDOW = 5;

function formatPercent(value: number | null) {
  if (value == null) return "—";
  return `${Math.round(value * 10) / 10}%`;
}

/** "2025–2027", or a single year, for the window a syllabus is examined over. */
function syllabusWindow(source: SyllabusSource) {
  if (!source.yearFrom) return "";
  return source.yearTo && source.yearTo !== source.yearFrom
    ? `${source.yearFrom}–${source.yearTo}`
    : `${source.yearFrom}`;
}

/** The document a figure came from, named the way a student would recognise it. */
function syllabusName(source: SyllabusSource) {
  return `${source.qualification} ${source.subject} (${source.syllabusCode})`;
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

/**
 * A paper of the course while the form is open.
 *
 * `included` is the route: a syllabus offers more papers than any one candidate
 * sits — 0620 lists six and you take three — so the rows are all shown and only
 * the ticked ones are saved.
 *
 * `custom` is a paper the learner typed in themselves. The board's own table
 * covers 131 Cambridge syllabuses and nothing else, so every other course — an
 * Edexcel unit, an AQA A Level, a language nobody has parsed — is one where the
 * weightings are on the page in front of the student and not in our data.
 *
 * Every row is editable either way — its name, its share of the award, and the
 * total it is marked out of. What we parsed is a good starting point, not an
 * authority: a syllabus is revised between sessions, a candidate can be entered
 * for a different combination than the one we assumed, and a parser can simply
 * be wrong. `source` and `sourceMax` are what the board's table said, kept so a
 * row can say it has been changed and offer the way back.
 */
type DraftComponent = TargetComponent & {
  included: boolean;
  custom: boolean;
  /** The syllabus's own weighting, or null for a paper the learner added. */
  source: number | null;
  /** The syllabus's own mark total, on the same terms. */
  sourceMax: number | null;
};

type Draft = {
  subjectId: string;
  gradeScale: GradeScale;
  /** Which award the papers are weighted against. */
  award: string;
  /** Empty for a subject whose syllabus the parser could not read. */
  components: DraftComponent[];
  /** Null when the result is a mock, which belongs to no stage of the course. */
  completedStage: string | null;
  remainingStage: string;
  completedGrade: string;
  mark: string;
  max: string;
  weight: string;
  targetGrade: string;
  /** The learner's own boundaries, or null for the scale's standard bands. */
  thresholds: GradeThresholds | null;
};

function draftFor(target: GradeTarget): Draft {
  return {
    subjectId: target.subjectId,
    gradeScale: target.gradeScale,
    award: target.award,
    components: target.components.map((component) => (
      { ...component, included: true, custom: true, source: null, sourceMax: null })),
    completedStage: target.completedStage,
    remainingStage: target.remainingStage,
    completedGrade: target.completedGrade ?? "",
    mark: String(target.completedMark ?? target.completedPercent),
    max: String(target.completedMax ?? 100),
    weight: String(target.completedWeight),
    targetGrade: target.targetGrade,
    thresholds: target.thresholds,
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
    award: banked ? "A Level" : "qualification",
    components: [],
    completedStage,
    remainingStage: banked ? otherStage(subject, completedStage!) : subject?.stages[0] ?? "A2",
    completedGrade: "",
    mark: "",
    max: "100",
    weight: String(banked ? DEFAULT_COMPLETED_WEIGHT : MOCK_WEIGHT),
    // The second rung: an A on both letter ladders, an 8 on the numeric one.
    targetGrade: grades[1] ?? grades[0],
    thresholds: null,
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
  /** The board's own component table for the syllabus on screen. */
  const [assessment, setAssessment] = useState<AssessmentComponent[]>([]);
  const [assessmentCode, setAssessmentCode] = useState<string | null>(null);
  /** The document those figures were read out of, so the screen can cite it. */
  const [source, setSource] = useState<SyllabusSource | null>(null);

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

  const showingForm = editing || !active;
  /**
   * The syllabus the screen is answering for: the one the form is open on, or
   * the one behind the target being read. Both want it — the form to seed its
   * papers, the detail to say where the papers it already has came from.
   */
  const shownSubject = lookup.get(showingForm ? draft.subjectId : active?.subjectId ?? "");
  const syllabusCode = shownSubject?.syllabusCode ?? null;

  /**
   * What each paper of this syllabus is worth, read from the board's own PDF.
   *
   * Fetched rather than bundled: it is 485 rows across 131 syllabuses, and a
   * learner needs the one they are looking at. A syllabus the parser could not
   * read simply answers with nothing, and the form falls back to asking for a
   * single mark — which is how every subject worked before this existed.
   */
  useEffect(() => {
    if (!syllabusCode || syllabusCode === assessmentCode) return;
    let live = true;
    studyApi.syllabus
      .assessment<{ assessment: AssessmentComponent[]; source: SyllabusSource | null }>(syllabusCode)
      .then((data) => {
        if (!live) return;
        setAssessment(data.assessment);
        setSource(data.source ?? null);
      })
      .catch(() => { if (live) { setAssessment([]); setSource(null); } })
      .finally(() => { if (live) setAssessmentCode(syllabusCode); });
    return () => { live = false; };
  }, [syllabusCode, assessmentCode]);

  /** The awards this syllabus is weighted against, best-known order first. */
  const awards = useMemo(() => {
    const found = [...new Set(assessment.map((component) => component.award))];
    return ["A Level", "AS", "qualification"].filter((award) => found.includes(award))
      .concat(found.filter((award) => !["A Level", "AS", "qualification"].includes(award)));
  }, [assessment]);

  /**
   * Seeds the form with the papers of the chosen award, once, when they
   * arrive. Every paper is listed and none is ticked: which of them a
   * candidate actually sits is the one thing the syllabus cannot say, because
   * 0620 offers six papers to a course made of three.
   */
  const [seededCode, setSeededCode] = useState<string | null>(null);
  const seedKey = `${draft.subjectId}|${draft.award}|${assessmentCode ?? ""}`;
  if (assessmentCode && assessmentCode === syllabusCode && seededCode !== seedKey && !draft.components.length) {
    setSeededCode(seedKey);
    const award = awards.includes(draft.award) ? draft.award : awards[0];
    const forAward = assessment.filter((component) => component.award === award);
    if (forAward.length) {
      setDraft((current) => ({
        ...current,
        award,
        components: forAward.map((component, index) => ({
          component: component.component,
          title: component.title,
          weighting: component.weighting,
          mark: null,
          maxMark: component.marks,
          status: "todo" as ComponentStatus,
          position: index,
          included: false,
          custom: false,
          source: component.weighting,
          sourceMax: component.marks,
        })),
      }));
    }
  }

  /** The papers actually being sat, which is what the arithmetic reads. */
  const chosenComponents = useMemo(
    () => draft.components.filter((component) => component.included),
    [draft.components],
  );

  // The subject's own split, or what the draft is holding while it loads. A
  // mock names no completed stage, so only the one still ahead is certain.
  const stages = lookup.get(draft.subjectId)?.stages
    ?? [draft.completedStage, draft.remainingStage].filter((stage): stage is string => Boolean(stage));
  // With papers on the form the banked figure is counted from them; without
  // them it is the single mark the learner typed, which is every subject the
  // parser cannot speak for.
  const typed = markPercent(
    draft.mark === "" ? null : Number(draft.mark),
    draft.max === "" ? null : Number(draft.max),
  );
  const fromPapers = bankedFromComponents(chosenComponents);
  const usingPapers = chosenComponents.length > 0;
  const draftPercent = usingPapers ? fromPapers.completedPercent : typed;
  const draftWeight = usingPapers ? fromPapers.completedWeight : Number(draft.weight);
  // 95 was the ceiling while the weight was a share typed in by hand. Papers
  // can settle the whole award, and a course with everything sat is exactly the
  // case the form most needs to report.
  const draftPreview = draftPercent == null || !Number.isFinite(draftWeight) || draftWeight < 0 || draftWeight > 100
    ? null
    : gradeLadder({
      completedPercent: draftPercent,
      completedWeight: draftWeight,
      gradeScale: draft.gradeScale,
      thresholds: draft.thresholds,
    }).find((rung) => rung.grade === draft.targetGrade) ?? null;

  /**
   * What the marks on the form already come to, while it is still open.
   *
   * The screen is a calculator as much as a planner: someone who has every
   * paper in front of them is not setting a target, they are adding up. Null
   * until the papers cover a whole award and each of them has a mark.
   */
  const draftOutcome = usingPapers
    ? courseOutcome({
      completedPercent: fromPapers.completedPercent,
      completedWeight: fromPapers.completedWeight,
      gradeScale: draft.gradeScale,
      thresholds: draft.thresholds,
      components: chosenComponents,
    })
    : null;

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
        award: draft.award,
        // Only the papers being sat. The server counts what they bank rather
        // than trusting the browser's arithmetic.
        components: chosenComponents.map((component) => ({
          component: component.component,
          title: component.title,
          weighting: component.weighting,
          mark: component.mark,
          maxMark: component.maxMark,
          status: component.status,
          position: component.position,
        })),
        completedStage: usingPapers ? null : draft.completedStage,
        remainingStage: draft.remainingStage,
        completedGrade: draft.completedGrade || null,
        // With papers, the single mark field is not on screen and the pair the
        // ladder reads is counted from the rows instead. Sending the percentage
        // is what lets the server check it before recounting it for itself.
        completedMark: usingPapers || draft.mark === "" ? null : Number(draft.mark),
        completedMax: usingPapers || draft.max === "" ? null : Number(draft.max),
        completedPercent: usingPapers ? fromPapers.completedPercent : (typed ?? 0),
        completedWeight: usingPapers ? fromPapers.completedWeight : Number(draft.weight),
        targetGrade: draft.targetGrade,
        // Editing the result should not silently drop a paper target the
        // learner set by hand on the screen behind this form.
        paperTargetPercent: existing?.paperTargetPercent ?? null,
        thresholds: draft.thresholds,
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
        award: next.award,
        components: next.components,
        completedStage: next.completedStage,
        remainingStage: next.remainingStage,
        completedGrade: next.completedGrade,
        completedMark: next.completedMark,
        completedMax: next.completedMax,
        completedPercent: next.completedPercent,
        completedWeight: next.completedWeight,
        targetGrade: next.targetGrade,
        paperTargetPercent: next.paperTargetPercent,
        thresholds: next.thresholds,
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
        awards={awards}
        assessment={assessment}
        source={syllabusCode && assessmentCode === syllabusCode && assessment.length ? source : null}
        subjects={editing && targets.some((target) => target.subjectId === draft.subjectId) ? eligible : untargeted}
        existing={targets.some((target) => target.subjectId === draft.subjectId)}
        percent={draftPercent}
        preview={draftPreview}
        outcome={draftOutcome}
        settledWeight={usingPapers ? fromPapers.completedWeight : null}
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
        source={syllabusCode && assessmentCode === syllabusCode && assessment.length ? source : null}
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

function ResultForm({ draft, stages, awards, assessment, source, subjects, existing, percent, preview, outcome, settledWeight, busy, onChange, onChooseSubject, onSubmit, onCancel }: {
  draft: Draft;
  stages: string[];
  awards: string[];
  assessment: AssessmentComponent[];
  /** The syllabus the board's own figures were read from, where we have one. */
  source: SyllabusSource | null;
  subjects: Subject[];
  existing: boolean;
  percent: number | null;
  preview: { required: number; reach: GradeReach } | null;
  /** What the papers already add up to, once they add up to a whole award. */
  outcome: { percent: number; grade: string; settled: boolean } | null;
  /** How much of the award the marks already settle, or null without papers. */
  settledWeight: number | null;
  busy: boolean;
  onChange: (draft: Draft) => void;
  onChooseSubject: (subjectId: string) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: (() => void) | null;
}) {
  const completed = draft.completedStage;
  const remaining = draft.remainingStage;
  const papers = draft.components.length > 0;
  const chosen = draft.components.filter((component) => component.included);
  const banked = papers ? chosen.some((component) => component.status === "sat") : Number(draft.weight) > 0;
  const scale = GRADE_SCALES[draft.gradeScale];
  const splits = stages.length > 1;
  const covered = coveredWeight(chosen);
  const settled = bankedFromComponents(chosen);
  /** This course is priced on boundaries the learner supplied, not the bands. */
  const ownBands = draft.thresholds != null;
  const standardFor = (grade: string) => scale.grades.find(([name]) => name === grade)?.[1] ?? 0;
  const bandValues = gradesFor(draft.gradeScale).map((grade) => draft.thresholds?.[grade] ?? standardFor(grade));
  /**
   * Each grade has to start below the one above it. A set that does not is a
   * typo rather than a boundary — the ladder would rank the grades wrong — so
   * the form says so and holds the save rather than letting the server refuse.
   */
  const bandsOrdered = bandValues.every((value, index) =>
    Number.isFinite(value) && value >= MIN_THRESHOLD && value <= MAX_THRESHOLD
    && (index === 0 || value < bandValues[index - 1]));
  /** Whether anything on the form now disagrees with what the syllabus said. */
  const edited = draft.components.some((component) =>
    (component.source != null && component.source !== component.weighting)
    || (component.sourceMax != null && component.sourceMax !== component.maxMark));

  /** Rewrites one paper of the route, leaving the rest of the draft alone. */
  function setComponent(component: DraftComponent, changes: Partial<DraftComponent>) {
    onChange({
      ...draft,
      components: draft.components.map((entry) =>
        (entry.component === component.component ? { ...entry, ...changes } : entry)),
    });
  }

  /**
   * A paper the learner adds themselves.
   *
   * It opens on whatever is left of the award, because that is almost always
   * the answer — someone adding the last of three papers has 20% to account
   * for — and on the next unused paper number, because syllabuses number them
   * in order and nobody wants to type "Paper 3".
   */
  function addPaper() {
    const used = new Set(draft.components.map((component) => component.component.toLowerCase()));
    let number = 1;
    while (used.has(`paper ${number}`)) number += 1;
    const left = Math.round((100 - covered) * 10) / 10;
    onChange({
      ...draft,
      components: [...draft.components, {
        component: `Paper ${number}`,
        title: null,
        weighting: left > 0 ? left : 50,
        mark: null,
        maxMark: null,
        status: "todo" as ComponentStatus,
        position: draft.components.length,
        included: true,
        custom: true,
        source: null,
        sourceMax: null,
      }],
    });
  }

  function removePaper(component: DraftComponent) {
    onChange({
      ...draft,
      components: draft.components.filter((entry) => entry.component !== component.component),
    });
  }

  /**
   * Swapping the award swaps the papers with it, because AS and A Level are
   * different qualifications made of different components — and on some
   * syllabuses the same paper is worth a different share of each.
   */
  function chooseAward(award: string) {
    const forAward = assessment.filter((component) => component.award === award);
    onChange({
      ...draft,
      award,
      components: forAward.map((component, index) => ({
        component: component.component,
        title: component.title,
        weighting: component.weighting,
        mark: null,
        maxMark: component.marks,
        status: "todo" as ComponentStatus,
        position: index,
        included: false,
        custom: false,
        source: component.weighting,
        sourceMax: component.marks,
      })),
    });
  }

  /** One boundary of the learner's own set, leaving the rest alone. */
  function setBand(grade: string, value: number) {
    onChange({
      ...draft,
      thresholds: { ...(draft.thresholds ?? defaultThresholds(draft.gradeScale)), [grade]: value },
    });
  }

  return <section className="goal-setup grade-setup panel-card">
    <div className="goal-setup-copy">
      <p className="eyebrow">{existing ? "EDIT RESULT" : papers ? "WHICH PAPERS ARE YOURS?" : banked ? "ALREADY SAT ONE HALF?" : "GOT A MOCK BACK?"}</p>
      <h3>{papers ? "What have you sat so far?" : banked ? `What did you get in ${completed}?` : "What did your mock come to?"}</h3>
      <p>{papers
        ? "Three things to fill in. Momentum does the arithmetic as you type."
        : banked
          ? `Two numbers and a grade. Momentum works out what ${remaining} has to average.`
          : "Two numbers and a grade. Momentum works out what the exam has to average."}</p>
      {/* The same three steps whichever shape the form takes, because the
          question is the same one: what is behind you, what is ahead, what are
          you aiming at. Spelling them out is cheaper than a paragraph that has
          to be read twice. */}
      <ol className="grade-steps">
        {(papers
          ? [
            ["Tick the papers you sit", "A syllabus offers more papers than anyone takes. Tick only yours."],
            ["Say how each one went", "Sat, a mock, or still to come — then type the mark. Only a paper marked sat counts towards the grade; a mock just forecasts."],
            ["Pick the grade you want", "You get the percentage everything left has to average."],
          ]
          : [
            [banked ? `Type your ${completed} mark` : "Type your mock mark", "The raw score and what it was out of, or a percentage out of 100."],
            [banked ? `Say what ${completed} is worth` : "Nothing is banked yet", banked
              ? "Half the grade on a normal A Level. Change it if your course differs."
              : "A mock counts for nothing, so what you need is simply the boundary."],
            ["Pick the grade you want", `You get the percentage ${banked ? remaining : "the exam"} has to average.`],
          ]).map(([step, detail]) => <li key={step}><b>{step}</b><span>{detail}</span></li>)}
      </ol>
      <p className="grade-setup-note">
        {ownBands
          ? <>Grades are priced against the boundaries you set below, not the
            standard {scale.detail} bands.</>
          : <>Grades are priced against the standard {scale.detail} boundaries.
            Real boundaries shift a mark or two each session, so treat every
            number here as close rather than exact — or set your own below.</>}
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
            // A grade from the old ladder means nothing on the new one — and
            // neither do boundaries keyed by its grades, so they restart from
            // the new scale's own bands rather than carrying names it lacks.
            targetGrade: grades.includes(draft.targetGrade) ? draft.targetGrade : grades[1] ?? grades[0],
            thresholds: draft.thresholds ? defaultThresholds(gradeScale) : null,
            completedGrade: resultGrades(gradeScale, banked).includes(draft.completedGrade) ? draft.completedGrade : "",
          });
        }}>
          {GRADE_SCALE_KEYS.map((key) => <option key={key} value={key}>{GRADE_SCALES[key].label}</option>)}
        </select>
      </label>
      {papers && awards.length > 1 && <label><span>Aiming at</span>
        <select value={draft.award} onChange={(event) => chooseAward(event.target.value)}>
          {awards.map((award) => <option key={award} value={award}>
            {award === "qualification" ? "The whole qualification" : `The ${award}`}
          </option>)}
        </select>
      </label>}
      {!papers && splits && <label><span>This result is</span>
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
      {!papers && <label><span>Grade awarded <small>optional</small></span>
        <select value={draft.completedGrade} onChange={(event) => onChange({ ...draft, completedGrade: event.target.value })}>
          <option value="">Not saying</option>
          {resultGrades(draft.gradeScale, banked).map((grade) => <option key={grade}>{grade}</option>)}
        </select>
      </label>}

      <div className="grade-papers">
        <div className="grade-papers-head">
          <span>Your papers</span>
          <b className={covered > 100.05 ? "over" : covered < 99.95 ? "under" : "whole"}>
            {covered ? `${Math.round(covered * 10) / 10}% of the award` : "none picked yet"}
          </b>
        </div>
        {source && draft.components.length > 0 && <p className="grade-papers-source">
          <Icon name="book" />
          <span>
            The papers below, what each is worth and what each is marked out of
            are read from the official <b>{syllabusName(source)}</b> syllabus
            {syllabusWindow(source) ? ` for ${syllabusWindow(source)}` : ""}.
            Every one of those numbers can be changed if your entry differs.
          </span>
          {source.pdfUrl && <a href={source.pdfUrl} target="_blank" rel="noreferrer noopener">
            Open the PDF
          </a>}
        </p>}
        <div className="grade-papers-legend" aria-hidden="true">
          <span>Paper</span>
          <span>Worth</span>
          <span>Out of</span>
          <span>Have you sat it?</span>
          <span>Your mark</span>
          <span />
        </div>
        <ul>
          {draft.components.map((component) => {
            const percentage = componentPercent(component);
            return <li key={component.component} className={component.included ? "in" : ""}>
              <label className="grade-paper-pick">
                <input
                  type="checkbox"
                  checked={component.included}
                  onChange={(event) => setComponent(component, {
                    included: event.target.checked,
                    ...(event.target.checked ? {} : { status: "todo" as ComponentStatus, mark: null }),
                  })}
                  aria-label={`Sitting ${component.component}`}
                />
                <input
                  className="grade-paper-name"
                  value={component.component}
                  maxLength={40}
                  aria-label="Paper name"
                  onChange={(event) => setComponent(component, { component: event.target.value })}
                />
                <small>
                  <i>{component.title ?? ""}</i>
                  {/* A figure we supplied and the learner has since changed says
                      so, and offers the way back — a syllabus is revised between
                      sessions, and a parser can simply be wrong. */}
                  {component.source != null && component.source !== component.weighting && <button
                    type="button"
                    className="grade-paper-reset"
                    onClick={() => setComponent(component, { weighting: component.source! })}
                  >syllabus says {component.source}%</button>}
                  {component.sourceMax != null && component.sourceMax !== component.maxMark && <button
                    type="button"
                    className="grade-paper-reset"
                    onClick={() => setComponent(component, { maxMark: component.sourceMax! })}
                  >syllabus says out of {component.sourceMax}</button>}
                </small>
              </label>
              <span className="grade-paper-weight">
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="0.5"
                  value={component.weighting}
                  aria-label={`What ${component.component} is worth`}
                  onChange={(event) => setComponent(component, { weighting: Number(event.target.value) })}
                />
                <i>%</i>
              </span>
              <span className="grade-paper-max">
                <input
                  type="number"
                  min="1"
                  max="1000"
                  step="1"
                  placeholder="100"
                  value={component.maxMark ?? ""}
                  aria-label={`What ${component.component} is marked out of`}
                  onChange={(event) => setComponent(component, {
                    maxMark: event.target.value === "" ? null : Number(event.target.value),
                  })}
                />
                <i>marks</i>
              </span>
              {component.included ? <>
                <select
                  aria-label={`${component.component} status`}
                  value={component.status}
                  onChange={(event) => {
                    const status = event.target.value as ComponentStatus;
                    setComponent(component, { status, ...(status === "todo" ? { mark: null } : {}) });
                  }}
                >
                  <option value="todo">Still to come</option>
                  <option value="sat">Sat — counts</option>
                  <option value="mock">Mock — does not count</option>
                </select>
                {component.status === "todo"
                  ? <span className="grade-paper-blank">—</span>
                  : <span className="grade-paper-mark">
                    <input
                      type="number"
                      min="0"
                      max={component.maxMark ?? 100}
                      step="0.5"
                      placeholder="0"
                      aria-label={`${component.component} mark`}
                      value={component.mark ?? ""}
                      onChange={(event) => setComponent(component, {
                        mark: event.target.value === "" ? null : Number(event.target.value),
                      })}
                    />
                    <i>{component.maxMark ? `/ ${component.maxMark}` : "as a %"}</i>
                    <em>{percentage == null ? "" : `${percentage}%`}</em>
                  </span>}
              </> : <span className="grade-paper-blank grade-paper-out" aria-hidden="true">not sitting</span>}
              {component.custom && <button
                type="button"
                className="grade-paper-drop"
                aria-label={`Remove ${component.component}`}
                onClick={() => removePaper(component)}
              ><Icon name="close" /></button>}
            </li>;
          })}
        </ul>
        <button type="button" className="ghost-button grade-paper-add" onClick={addPaper}>
          + Add a paper
        </button>
        <p className="grade-papers-note">
          {!draft.components.length
            ? "We have not read this syllabus's papers, so add them yourself: a name, what each is worth, and what it is marked out of. Every specification prints all three at the front, in the assessment overview. Or skip this and enter one overall mark below."
            : covered > 100.05
              ? "Those papers come to more than a whole course between them. Syllabuses list alternatives nobody sits all of — a practical or its written stand-in, a Core route or an Extended one — so untick the ones that are not yours."
              : covered < 99.95 && covered > 0
                ? `Those papers come to ${Math.round(covered * 10) / 10}% between them. A full course adds up to 100%, so one is still missing.`
                : edited
                  ? "Using your figures, not ours. Everything is worked out from whatever is on the row — press the reminder under a paper to put the syllabus's own number back."
                  : settled.completedWeight > 0
                    ? `${Math.round(settled.completedWeight * 10) / 10}% of the grade is settled so far, averaging ${settled.completedPercent}% across it.`
                    : "Every figure here can be changed, ours included — so a syllabus we have read wrongly, or one revised since, is a number you correct rather than live with."}
        </p>
      </div>
      {!papers && <div className="grade-mark-field">
        <span>Mark <small>{banked ? "or your percentage uniform mark" : "across the mock, or its percentage"}</small></span>
        <div>
          <input type="number" min="0" max="1000" step="0.5" required placeholder="82" value={draft.mark} aria-label={banked ? `Mark scored in ${completed}` : "Mark scored in the mock"} onChange={(event) => onChange({ ...draft, mark: event.target.value })} />
          <b>out of</b>
          <input type="number" min="1" max="1000" step="0.5" required placeholder="100" value={draft.max} aria-label="Total marks available" onChange={(event) => onChange({ ...draft, max: event.target.value })} />
        </div>
      </div>}
      {!papers && banked && <label><span>{completed} counts for</span>
        <div className="hours-input">
          <input type="number" min="1" max="100" step="0.5" required value={draft.weight} onChange={(event) => onChange({ ...draft, weight: event.target.value })} />
          <b>% of the grade</b>
        </div>
      </label>}
      {/* The bands the app ships are the standard uniform-mark ones: the right
          default, and a real approximation. A board publishes its own for every
          session and a school sets its own for a mock, so a learner holding
          those numbers should not have to watch the screen disagree with them. */}
      <div className="grade-thresholds">
        <div className="grade-thresholds-head">
          <span>Grade boundaries</span>
          <label className="grade-thresholds-toggle">
            <input
              type="checkbox"
              checked={ownBands}
              onChange={(event) => onChange({
                ...draft,
                thresholds: event.target.checked ? defaultThresholds(draft.gradeScale) : null,
              })}
            />
            <b>Use my own</b>
          </label>
        </div>
        {ownBands ? <>
          <ul className="grade-threshold-rows">
            {gradesFor(draft.gradeScale).map((grade) => {
              const standard = standardFor(grade);
              const value = draft.thresholds?.[grade] ?? standard;
              return <li key={grade}>
                <span className={`grade-badge ${gradeTone(grade)}`}>{grade}</span>
                <span className="grade-threshold-field">
                  <input
                    type="number"
                    min={MIN_THRESHOLD}
                    max={MAX_THRESHOLD}
                    step="0.1"
                    value={value}
                    aria-label={`Percentage ${gradeArticle(grade)} ${grade} starts at`}
                    onChange={(event) => setBand(grade, Number(event.target.value))}
                  />
                  <i>%</i>
                </span>
                {/* A figure we supplied and the learner has since changed says
                    so, and offers the way back — the same bargain the papers
                    strike with the syllabus's own weightings. */}
                {value !== standard && <button
                  type="button"
                  className="grade-threshold-reset"
                  onClick={() => setBand(grade, standard)}
                >standard {standard}%</button>}
              </li>;
            })}
          </ul>
          <p className="grade-papers-note">
            {bandsOrdered
              ? `Percentages of the whole award rather than raw marks. Every figure on this screen is read against these instead of the standard ${scale.detail} bands.`
              : "Each grade has to start below the one above it. A boundary sitting above the grade over it cannot be read as a ladder, so check the order."}
          </p>
        </> : <p className="grade-papers-note">
          Priced against the standard {scale.detail} bands. Your board publishes its
          own for every session and they move a mark or two — switch this on and
          type the ones your course was really graded against.
        </p>}
      </div>
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
      {/* Every paper in and nothing outstanding is an answer, not a target —
          and it is the answer someone typing four marks in a row is after. */}
      {outcome
        ? <div className={`grade-preview outcome ${gradeBeats(draft.gradeScale, outcome.grade, draft.targetGrade) || outcome.grade === draft.targetGrade ? "reachable" : "out-of-reach"}`} aria-live="polite">
          <strong>
            <b className={`grade-badge ${gradeTone(outcome.grade)}`}>{outcome.grade}</b>
            {formatPercent(outcome.percent)}
          </strong>
          <small>
            {outcome.settled ? "across every paper" : "on these marks, some of them mocks"}
            {" — "}
            {outcome.grade === draft.targetGrade
              ? `exactly your ${draft.targetGrade} target`
              : gradeBeats(draft.gradeScale, outcome.grade, draft.targetGrade)
                ? `above your ${draft.targetGrade} target`
                : `short of your ${draft.targetGrade} target`}
          </small>
        </div>
        : <div className={`grade-preview ${preview?.reach ?? "empty"}`} aria-live="polite">
          {preview == null || percent == null
            ? <><strong>—</strong><small>{papers
              ? "Fill in a paper's mark to see where you are"
              : `Enter ${banked ? `your ${completed} mark` : "your mock mark"} to see the target`}</small></>
            : preview.reach === "out-of-reach"
              ? <><strong>Out of reach</strong><small>{percent}% across {settledWeight != null ? `the ${Math.round(settledWeight)}% settled so far` : completed} puts {gradeArticle(draft.targetGrade)} {draft.targetGrade} beyond a perfect finish</small></>
              : preview.reach === "secured"
                ? <><strong>Already yours</strong><small>{percent}% across {settledWeight != null ? `the ${Math.round(settledWeight)}% settled so far` : completed} secures {gradeArticle(draft.targetGrade)} {draft.targetGrade} whatever follows</small></>
                : <><strong>{preview.required}%</strong><small>{settledWeight != null
                    ? `needed across the ${Math.round(100 - settledWeight)}% still to come for ${gradeArticle(draft.targetGrade)} ${draft.targetGrade} — you are on ${percent}% so far`
                    : banked
                      ? `needed in ${remaining} for ${gradeArticle(draft.targetGrade)} ${draft.targetGrade}`
                      : `needed for ${gradeArticle(draft.targetGrade)} ${draft.targetGrade} — your mock is on ${percent}%`}</small></>}
        </div>}
      <div className="goal-form-actions">
        {onCancel && <button type="button" className="ghost-button" onClick={onCancel}>Cancel</button>}
        <button className="primary-button" disabled={busy || !draft.subjectId || (papers && !chosen.length) || !bandsOrdered}>
          {busy ? "Saving…"
            : papers && !chosen.length ? "Tick the papers you sit"
            : !bandsOrdered ? "Check your boundaries"
            : existing ? "Save result" : "Set my target"}
        </button>
      </div>
    </form>
  </section>;
}

function TargetDetail({ target, subject, source, papers, busy, targetDraft, onTargetDraft, onEdit, onRemove, onPatch }: {
  target: GradeTarget;
  subject: Subject | null;
  /** The syllabus these papers were weighted from, where we have one. */
  source: SyllabusSource | null;
  papers: PastPaper[];
  busy: boolean;
  targetDraft: string | null;
  onTargetDraft: (value: string | null) => void;
  onEdit: () => void;
  onRemove: () => void;
  onPatch: (changes: Partial<GradeTarget>) => Promise<void>;
}) {
  const ladder = gradeLadder(target);
  /** Whether this course is priced on figures the learner supplied. */
  const ownBands = thresholdsDiffer(target.gradeScale, target.thresholds);
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
  const hits = wanted == null ? 0 : scored.filter((paper) => paper.percentage! >= wanted).length;

  /**
   * What the papers still to come have come to, once their marks are filled
   * in. A2 is not separately certificated, so this is the same arithmetic read
   * over a different set of papers — and it is the figure a student is really
   * after once the last mark is in: not where the whole A Level lands, but
   * what they got in A2.
   */
  const remaining = remainingFromComponents(target.components);
  const remainingGrade = remaining ? overallGrade(target.gradeScale, remaining.percent, target.thresholds) : null;
  /**
   * Every paper of the award has a mark against it, so the course is over and
   * the screen owes a grade rather than a target. Nothing else on this page
   * can say it: the ladder prices what is still to come, and at the end of a
   * course there is nothing still to come.
   */
  const outcome = courseOutcome(target);
  /**
   * The course is genuinely over — every paper sat, not merely marked. Only
   * then does the breakdown collapse to one figure: while any of it is still a
   * mock, what the halves came to separately is the more useful reading.
   */
  const finished = Boolean(outcome?.settled);
  /** The stage still ahead is fully marked, even if the course is not. */
  const complete = Boolean(remaining && remaining.known >= remaining.weight - 0.05);

  /**
   * Where the learner is standing right now.
   *
   * Marks entered against the papers themselves say it best — they are this
   * course, not practice for it. Logged past papers stand in until there are
   * any, and for a one-sitting course a single typed-in mock stands in until
   * there are those. A banked half is not a reading of the same thing: it is
   * marks already in the bank, and the screen reports it separately.
   *
   * A target built from papers never falls back to the typed figure, because
   * for those rows it is not a reading at all: it is the sum of the marks, and
   * with none entered that sum is zero. Reading it as a score turned an
   * untouched course into one scoring nothing — the ladder offered "90 points
   * off your form" against a form nobody had set.
   */
  const standing = remaining?.percent
    ?? form
    ?? (banked || target.components.length ? null : target.completedPercent);
  const projected = standing == null ? null : overallPercent(target, standing);
  const projectedGrade = projected == null ? null : overallGrade(target.gradeScale, projected, target.thresholds);
  const gap = standing == null || wanted == null ? null : wanted - standing;

  return <>
    <section className="goal-hero grade-hero">
      <div className="goal-hero-copy">
        <p className="eyebrow">GRADE TARGET</p>
        <h3>{subject?.name ?? target.subjectId} {named && <span>{target.remainingStage}</span>}</h3>
        <p>
          {finished
            ? <>Every paper in, and <strong>{formatPercent(outcome!.percent)}</strong> across the lot</>
            : banked
              ? target.completedStage
                ? <><strong>{target.completedStage}</strong> banked at <strong>{formatPercent(target.completedPercent)}</strong></>
                : <><strong>{Math.round(target.completedWeight)}%</strong> of the grade banked at <strong>{formatPercent(target.completedPercent)}</strong></>
              : <><strong>Mock</strong> came to <strong>{formatPercent(target.completedPercent)}</strong></>}
          {target.completedGrade ? <> · grade <strong>{target.completedGrade}</strong></> : null}
        </p>
        <div className="goal-plan-tags">
          {/* "Best possible" and "guaranteed" are forward-looking, and a course
              with every paper sat has no forward left to look at. */}
          {finished
            ? <>
              <span>{GRADE_SCALES[target.gradeScale].label}</span>
              <span>{target.components.length} papers, all sat</span>
              <span>Weighted by the syllabus</span>
            </>
            : banked
            ? <>
              <span>{target.completedStage
                ? `${target.completedStage} worth ${target.completedWeight}%`
                : `${Math.round(target.completedWeight)}% settled`}</span>
              <span>Best possible {range.best}</span>
              <span>Guaranteed {range.worst === "U" ? "nothing yet" : range.worst}</span>
            </>
            : <>
              <span>{GRADE_SCALES[target.gradeScale].label}</span>
              <span>Sat in one go</span>
              <span>The mock counts for nothing</span>
            </>}
          {ownBands && <span>Your own boundaries</span>}
        </div>
        <div className="grade-hero-actions">
          <button onClick={onEdit}>Edit result</button>
          <button className="delete-goal" onClick={onRemove}>Remove</button>
        </div>
      </div>
      {/* A course with every paper marked has a result, and a result outranks a
          target: "you need 98%" is the wrong sentence to read after the last
          paper has been sat. */}
      {outcome
        ? <div className={`grade-headline final ${outcome.grade === target.targetGrade || gradeBeats(target.gradeScale, outcome.grade, target.targetGrade) ? "hit" : "missed"}`}>
          <span className={`grade-badge ${gradeTone(outcome.grade)}`}>{outcome.grade}</span>
          <strong>{formatPercent(outcome.percent)}</strong>
          <small>{outcome.settled
            ? `across every paper — ${gradeBeats(target.gradeScale, outcome.grade, target.targetGrade) ? "above" : outcome.grade === target.targetGrade ? "exactly" : "short of"} your ${target.targetGrade} target`
            : `on these marks, with some of them mocks — your target was ${gradeArticle(target.targetGrade)} ${target.targetGrade}`}</small>
        </div>
        : <div className={`grade-headline ${chosen.reach}`}>
          <span className={`grade-badge ${gradeTone(target.targetGrade)}`}>{target.targetGrade}</span>
          {chosen.reach === "out-of-reach"
            ? <><strong>Out of reach</strong><small>even a perfect {ahead} lands on {reachLabel(overallGrade(target.gradeScale, overallPercent(target, 100), target.thresholds))}</small></>
            : chosen.reach === "secured"
              ? <><strong>Secured</strong><small>{gradeArticle(target.targetGrade)} {target.targetGrade} stands whatever {ahead} does</small></>
              : <><strong>{chosen.required}%</strong><small>needed across {ahead} for {gradeArticle(target.targetGrade)} {target.targetGrade}</small></>}
        </div>}
    </section>

    {source && target.components.length > 0 && <p className="grade-source-strip">
      <Icon name="book" />
      <span>
        The papers, weightings and mark totals for this course are read from the
        official <b>{syllabusName(source)}</b> syllabus
        {syllabusWindow(source) ? ` for ${syllabusWindow(source)}` : ""}.
        Press <em>Edit result</em> to change any of them.
      </span>
      {source.pdfUrl && <a href={source.pdfUrl} target="_blank" rel="noreferrer noopener">
        Open the PDF
      </a>}
    </p>}

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
        <small>{wanted == null
          ? "every paper is in"
          : gap == null ? `target is ${Math.round(wanted)}%`
          : gap <= 0 ? `clear of your ${Math.round(wanted)}% target`
          : `points under your ${Math.round(wanted)}% target`}</small>
      </article>
      <article>
        <span>Projected grade</span>
        <strong>{projectedGrade ?? "—"}</strong>
        <small>{projected == null ? "log a paper to project a grade" : `${formatPercent(projected)} overall if ${ahead} matches`}</small>
      </article>
      <article>
        <span>Papers on target</span>
        <strong>{wanted != null && scored.length ? `${hits}/${scored.length}` : "—"}</strong>
        <small>{best == null ? "nothing logged yet" : `best ${formatPercent(best)}`}</small>
      </article>
    </section>

    {(remaining || outcome) && <section className="grade-outcome panel-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{outcome ? (outcome.settled ? "THE RESULT" : "ON THESE MARKS") : complete ? "EVERY PAPER IN" : "ON THE MARKS SO FAR"}</p>
          <h3>{outcome && outcome.settled ? "What you got" : "Where this lands"}</h3>
        </div>
        <span>{outcome
          ? (outcome.settled ? "Every paper sat and marked." : "Every paper marked, some of them mocks.")
          : complete
            ? "Every paper has a mark against it."
            : `${remaining!.known}% of the ${remaining!.weight}% still to come has a mark.`}</span>
      </div>
      <div className="grade-outcome-rows">
        {/* A banked half only earns a row of its own while there is another
            half to tell it apart from. Once everything is in, the course has
            one figure and splitting it would be inventing a distinction. */}
        {banked && !finished && <article>
          <span>{target.completedStage ?? "Banked"}</span>
          <strong>{formatPercent(target.completedPercent)}</strong>
          <b className={`grade-badge ${gradeTone(overallGrade(target.gradeScale, target.completedPercent, target.thresholds))}`}>
            {overallGrade(target.gradeScale, target.completedPercent, target.thresholds)}
          </b>
          <small>{Math.round(target.completedWeight * 10) / 10}% of the grade, already sat</small>
        </article>}
        {remaining && !finished && <article className="highlight">
          <span>{named ? target.remainingStage : "These papers"}</span>
          <strong>{formatPercent(remaining.percent)}</strong>
          <b className={`grade-badge ${gradeTone(remainingGrade)}`}>{remainingGrade}</b>
          <small>{complete
            ? `across all ${remaining.weight}% of it`
            : `across the ${remaining.known}% marked so far`}</small>
        </article>}
        <article className={finished ? "highlight" : ""}>
          <span>{finished ? "Final grade" : "Overall"}</span>
          <strong>{formatPercent(outcome ? outcome.percent : projected)}</strong>
          <b className={`grade-badge ${gradeTone(outcome ? outcome.grade : projectedGrade)}`}>
            {outcome ? outcome.grade : projectedGrade}
          </b>
          <small>{outcome
            ? (outcome.settled ? "every paper, weighted as the syllabus weights them" : "with some marks still only mocks")
            : complete ? "the two halves together" : "if the rest matches"}</small>
        </article>
      </div>
      {/* A grade for one half of a course is not a grade the board awards, and
          saying so is the difference between a useful figure and a wrong one. */}
      <p className="grade-outcome-note">
        {outcome
          ? ownBands
            ? "Every paper's mark, weighted the way the syllabus weights it, read against the boundaries you set."
            : "Every paper's mark, weighted the way the syllabus weights it, read against the standard boundaries. Real boundaries move a mark or two each session, so a result this close to one could land either side of it."
          : named
            ? `${target.remainingStage} is not certificated on its own — the board awards the ${target.award === "qualification" ? "qualification" : target.award}. This is what those papers came to, read against the same boundaries.`
            : ownBands
              ? "Read against the boundaries you set."
              : "Read against the standard boundaries, which move a mark or two each session."}
      </p>
    </section>}

    <section className="grade-ladder panel-card">
      <div className="section-heading">
        <div><p className="eyebrow">EVERY GRADE, PRICED</p><h3>What you need in {ahead} for each grade</h3></div>
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
      <p className="grade-ladder-note">{ownBands
        ? "Priced against the boundaries you set rather than the standard bands."
        : "Boundaries move between sessions, so these are estimates."} {chosen.reach === "reachable" && <>{gradeArticle(target.targetGrade) === "an" ? "An" : "A"} {target.targetGrade} needs {chosen.required}% across {ahead} — every paper of it, not one.</>}</p>
    </section>

    <section className="grade-paper-target panel-card">
      <div className="section-heading">
        <div><p className="eyebrow">PAST PAPER TARGET</p><h3>The number every {named ? `${target.remainingStage} ` : ""}paper is marked against</h3></div>
      </div>
      <div className="grade-paper-body">
        {/* A past-paper target is practice for an exam still to come. Once every
            paper is in there is nothing to practise for, and offering a number
            would be inviting the learner to keep chasing a course that is
            already behind them. */}
        {wanted == null ? <p className="muted">
          Every paper of this award has a mark against it, so there is nothing
          left to aim a past paper at. Papers you log from here are practice
          rather than a target — reopen the result above if one of them was
          entered too early.
        </p> : <>
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
        </>}
      </div>
    </section>
  </>;
}
