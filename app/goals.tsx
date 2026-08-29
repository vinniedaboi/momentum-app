"use client";

import { useEffect, useMemo, useState } from "react";
import type { StudySession } from "./study-hours";
import type { Topic } from "./study-tracker-app";
import { progressWeight, syllabusProgress } from "./syllabus-progress";
import { subjectName, type Subject } from "./subjects";
import { getTopicStage, type SyllabusStage } from "./syllabus-stage";
import Icon from "./icons";
import { api, apiMessage } from "./data/api";
import { studyApi } from "./data/endpoints";


type StudyGoal = {
  subjectId: string;
  stage: SyllabusStage;
  startDate: string;
  targetDate: string;
  weeklyHours: number;
  studyDays: number;
  paceMode: PaceMode;
  createdAt: string;
  updatedAt: string;
};

type PaceMode = "steady" | "front-loaded" | "finish-line";

function isCovered(topic: Topic) {
  return topic.status === "Covered" || topic.status === "Exam Ready";
}

/** Partial credit expressed as points, so pace and position match the rest of the app. */
function earnedPoints(points: Topic[]) {
  return points.reduce((sum, point) => sum + progressWeight(point.status), 0);
}

const PACE_OPTIONS: Array<{ value: PaceMode; label: string; detail: string }> = [
  { value: "steady", label: "Steady", detail: "Even chapter spacing" },
  { value: "front-loaded", label: "Front-loaded", detail: "Finish more chapters early" },
  { value: "finish-line", label: "Finish-line push", detail: "Lighter start, stronger finish" },
];

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(`${date}T00:00:00Z`));
}

function shortDate(date: string) {
  return new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short" })
    .format(new Date(`${date}T00:00:00Z`));
}

function formatHours(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function paceFraction(fraction: number, mode: PaceMode) {
  if (mode === "front-loaded") return Math.pow(fraction, 1.3);
  if (mode === "finish-line") return Math.pow(fraction, 0.72);
  return fraction;
}

export default function GoalPlanner({ topics, subjects, sessions, today, onMessage, onScheduleChanged }: {
  topics: Topic[];
  subjects: Subject[];
  sessions: StudySession[];
  today: string;
  onMessage: (message: string) => void;
  onScheduleChanged: () => void | Promise<void>;
}) {
  const [goals, setGoals] = useState<StudyGoal[]>([]);
  const lookup = useMemo(() => new Map(subjects.map((item) => [item.id, item])), [subjects]);
  const tracked = useMemo(() => subjects.filter((item) => !item.archived && item.stages.length > 0), [subjects]);
  const [chosenSubject, setActiveSubject] = useState("");
  const [activeStage, setActiveStage] = useState<SyllabusStage>("AS");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [startDate, setStartDate] = useState(today);
  const [targetDate, setTargetDate] = useState(addDays(today, 90));
  const [weeklyHours, setWeeklyHours] = useState(10);
  const [studyDays, setStudyDays] = useState(5);
  const [paceMode, setPaceMode] = useState<PaceMode>("steady");

  useEffect(() => {
    api.get<{ goals: StudyGoal[] }>(studyApi.goals.path)
      .then((data) => {
        setGoals(data.goals);
        if (data.goals[0]) {
          setActiveSubject(data.goals[0].subjectId);
          setActiveStage(data.goals[0].stage);
          setStartDate(data.goals[0].startDate);
          setTargetDate(data.goals[0].targetDate);
          setWeeklyHours(data.goals[0].weeklyHours);
          setStudyDays(data.goals[0].studyDays);
          setPaceMode(data.goals[0].paceMode);
        } else setEditing(true);
      })
      .catch(() => onMessage("Your syllabus goals could not load."))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const currentSubject = chosenSubject || tracked[0]?.id || "";
  const activeGoal = goals.find((goal) => goal.subjectId === currentSubject && goal.stage === activeStage) ?? null;
  const availableTracks = tracked.flatMap((subject) => subject.stages.map((stage) => ({ subjectId: subject.id, name: subject.name, stage: stage as SyllabusStage })))
    .filter((track) => !goals.some((goal) => goal.subjectId === track.subjectId && goal.stage === track.stage));

  const plan = useMemo(() => {
    if (!activeGoal) return null;
    const subjectTopics = topics.filter((topic) => topic.subjectId === currentSubject);
    const chapters = subjectTopics.filter((topic) => topic.kind === "chapter" && getTopicStage(topic, topics, lookup.get(currentSubject)) === activeStage);
    const chapterIds = new Set(chapters.map((chapter) => chapter.id));
    const points = subjectTopics.filter((topic) => topic.kind === "point" && topic.parentId && chapterIds.has(topic.parentId));
    const totalPoints = points.length;
    const coveredPoints = points.filter(isCovered).length;
    const examReadyPoints = points.filter((topic) => topic.status === "Exam Ready").length;
    const earned = earnedPoints(points);
    const progressPercent = syllabusProgress(points).percent;
    const remainingPoints = Math.max(0, totalPoints - earned);
    const totalDays = Math.max(1, daysBetween(activeGoal.startDate, activeGoal.targetDate));
    const elapsedDays = Math.max(0, Math.min(totalDays, daysBetween(activeGoal.startDate, today)));
    const daysLeft = Math.max(0, daysBetween(today, activeGoal.targetDate));
    const plannedReady = Math.min(totalPoints, Math.ceil(totalPoints * elapsedDays / totalDays));
    const weeklyPace = daysLeft > 0 ? Math.ceil(remainingPoints / daysLeft * 7) : Math.ceil(remainingPoints);
    const weekStart = addDays(today, -6);
    const weeklyMinutes = sessions
      .filter((session) => session.subjectId === currentSubject && session.studyDate >= weekStart && session.studyDate <= today)
      .reduce((sum, session) => sum + session.minutes, 0);
    const milestones = chapters.map((chapter, chapterIndex) => {
      const children = points.filter((point) => point.parentId === chapter.id);
      const complete = children.filter(isCovered).length;
      const percent = syllabusProgress(children).percent;
      const cumulativePoints = chapters.slice(0, chapterIndex + 1).reduce((sum, item) => (
        sum + points.filter((point) => point.parentId === item.id).length
      ), 0);
      const progress = totalPoints ? cumulativePoints / totalPoints : 1;
      const offset = Math.round(totalDays * paceFraction(progress, activeGoal.paceMode));
      const dueDate = addDays(activeGoal.startDate, offset);
      return {
        id: chapter.id,
        code: chapter.code,
        title: chapter.title,
        complete,
        percent,
        total: children.length,
        dueDate,
        done: children.length > 0 && complete === children.length,
      };
    });
    const nextMilestone = milestones.find((milestone) => !milestone.done) ?? null;
    const pointsPerStudyDay = activeGoal.studyDays ? weeklyPace / activeGoal.studyDays : weeklyPace;
    return { totalPoints, coveredPoints, examReadyPoints, earned, progressPercent, remainingPoints, daysLeft, plannedReady, weeklyPace, pointsPerStudyDay, weeklyMinutes, milestones, nextMilestone };
  }, [activeGoal, activeStage, currentSubject, lookup, sessions, today, topics]);

  function beginNewGoal() {
    const nextTrack = availableTracks[0];
    if (!nextTrack) return;
    setActiveSubject(nextTrack.subjectId);
    setActiveStage(nextTrack.stage);
    setStartDate(today);
    setTargetDate(addDays(today, 90));
    setWeeklyHours(10);
    setStudyDays(5);
    setPaceMode("steady");
    setEditing(true);
  }

  function selectGoal(goal: StudyGoal) {
    setActiveSubject(goal.subjectId);
    setActiveStage(goal.stage);
    setStartDate(goal.startDate);
    setTargetDate(goal.targetDate);
    setWeeklyHours(goal.weeklyHours);
    setStudyDays(goal.studyDays);
    setPaceMode(goal.paceMode);
    setEditing(false);
  }

  async function saveGoal(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const { goal: saved } = await studyApi.goals.save<{ goal: StudyGoal }>({
        subjectId: currentSubject,
        stage: activeStage,
        startDate,
        targetDate,
        weeklyHours,
        studyDays,
        paceMode,
      });
      setGoals((current) => [...current.filter((goal) => goal.subjectId !== saved.subjectId || goal.stage !== saved.stage), saved]);
      await onScheduleChanged();
      setEditing(false);
      onMessage(`${subjectName(lookup, currentSubject)} ${activeStage} plan added to your review board`);
    } catch (error) {
      onMessage(apiMessage(error, "Your syllabus goal was not saved."));
    } finally {
      setSaving(false);
    }
  }

  async function removeGoal() {
    if (!activeGoal) return;
    try {
      await studyApi.goals.remove(currentSubject, activeStage);
      await onScheduleChanged();
      const remaining = goals.filter((goal) => goal.subjectId !== currentSubject || goal.stage !== activeStage);
      setGoals(remaining);
      if (remaining[0]) {
        selectGoal(remaining[0]);
      } else {
        setActiveSubject("Mathematics");
        setActiveStage("AS");
        setStartDate(today);
        setTargetDate(addDays(today, 90));
        setWeeklyHours(10);
        setStudyDays(5);
        setPaceMode("steady");
        setEditing(true);
      }
      onMessage("Syllabus goal removed");
    } catch {
      onMessage("That syllabus goal could not be removed.");
    }
  }

  if (loading) return <section className="loading-state" aria-label="Loading syllabus goals"><div /><div /><div /></section>;

  return (
    <div className="goals-page">
      <section className="goal-switcher" aria-label="Syllabus goals">
        <div>
          {goals.map((goal) => (
            <button key={`${goal.subjectId}-${goal.stage}`} className={currentSubject === goal.subjectId && activeStage === goal.stage && !editing ? "active" : ""} onClick={() => selectGoal(goal)}>{subjectName(lookup, goal.subjectId)} <b>{goal.stage}</b></button>
          ))}
        </div>
        {availableTracks.length > 0 && <button className="add-goal-button" onClick={beginNewGoal}>+ Add syllabus goal</button>}
      </section>

      {editing || !activeGoal ? (
        <section className="goal-setup panel-card">
          <div className="goal-setup-copy">
            <p className="eyebrow">FINISH PLAN</p>
            <h3>{activeGoal ? `Adjust ${subjectName(lookup, currentSubject)} ${activeStage}` : "When do you want to finish?"}</h3>
            <p>Momentum will spread the syllabus across your timeline, add the work to your review board, and recalculate the pace from your real progress.</p>
            <div className="goal-preview-line"><i /><span>{shortDate(startDate)}</span><i /><strong>{shortDate(targetDate)}</strong></div>
          </div>
          <form onSubmit={saveGoal} className="goal-form">
            <label><span>Syllabus</span>
              <select value={`${currentSubject}|${activeStage}`} disabled={Boolean(activeGoal)} onChange={(event) => { const [subject, stage] = event.target.value.split("|") as [string, SyllabusStage]; setActiveSubject(subject); setActiveStage(stage); }}>
                {(activeGoal ? [{ subjectId: currentSubject, name: subjectName(lookup, currentSubject), stage: activeStage }] : availableTracks).map((track) => <option value={`${track.subjectId}|${track.stage}`} key={`${track.subjectId}-${track.stage}`}>{track.name} — {track.stage}</option>)}
              </select>
            </label>
            <div className="goal-date-fields">
              <label><span>Plan starts</span><input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); if (targetDate <= event.target.value) setTargetDate(addDays(event.target.value, 30)); }} required /></label>
              <label><span>Finish syllabus by</span><input type="date" min={addDays(startDate, 1)} value={targetDate} onChange={(event) => setTargetDate(event.target.value)} required /></label>
            </div>
            <label><span>Weekly study target</span><div className="hours-input"><input type="number" min="1" max="80" value={weeklyHours} onChange={(event) => setWeeklyHours(Number(event.target.value))} required /><b>hours</b></div></label>
            <label><span>Study days each week</span><div className="study-days-picker">{[1, 2, 3, 4, 5, 6, 7].map((days) => <button type="button" aria-pressed={studyDays === days} className={studyDays === days ? "active" : ""} onClick={() => setStudyDays(days)} key={days}>{days}</button>)}</div></label>
            <fieldset className="pace-picker"><legend>Pacing style</legend>{PACE_OPTIONS.map((option) => <div className={`pace-option ${paceMode === option.value ? "active" : ""}`} key={option.value}><input aria-label={`${option.label}: ${option.detail}`} type="radio" name="pace" value={option.value} checked={paceMode === option.value} onChange={() => setPaceMode(option.value)} /><span><strong>{option.label}</strong><small>{option.detail}</small></span></div>)}</fieldset>
            <div className="goal-form-actions">
              {activeGoal && <button type="button" className="delete-goal" onClick={removeGoal}>Delete goal</button>}
              {activeGoal && <button type="button" className="ghost-button" onClick={() => setEditing(false)}>Cancel</button>}
              <button className="primary-button" disabled={saving}>{saving ? "Saving…" : activeGoal ? "Update timeline" : "Build my timeline"}</button>
            </div>
          </form>
        </section>
      ) : plan ? (
        <>
          <section className="goal-hero">
            <div className="goal-hero-copy">
              <p className="eyebrow">ACTIVE FINISH PLAN</p>
              <h3>{subjectName(lookup, currentSubject)} <span>{activeStage}</span></h3>
              <p><strong>{formatDate(activeGoal.startDate)}</strong> → <strong>{formatDate(activeGoal.targetDate)}</strong></p>
              <div className="goal-plan-tags"><span>{activeGoal.studyDays} study days/week</span><span>{PACE_OPTIONS.find((option) => option.value === activeGoal.paceMode)?.label}</span><span>Review board active</span></div>
              <button onClick={() => setEditing(true)}>Edit dates &amp; plan</button>
            </div>
            <div className="goal-ring" style={{ "--progress": `${plan.progressPercent / 100 * 360}deg` } as React.CSSProperties}>
              <div><strong>{plan.progressPercent}%</strong><span>progress</span></div>
            </div>
            <div className="goal-next">
              <p className="eyebrow">NEXT MILESTONE</p>
              {plan.nextMilestone ? <><strong>{plan.nextMilestone.code} · {plan.nextMilestone.title}</strong><span>{plan.nextMilestone.complete} of {plan.nextMilestone.total} points covered · due {shortDate(plan.nextMilestone.dueDate)}</span></> : <><strong>Syllabus covered</strong><span>Every point has been grasped. {plan.examReadyPoints} are exam ready.</span></>}
            </div>
          </section>

          <section className="goal-metrics">
            <article><span>Time remaining</span><strong>{plan.daysLeft}</strong><small>days until your finish date</small></article>
            <article><span>Required pace</span><strong>{plan.weeklyPace}</strong><small>points/week · about {plan.pointsPerStudyDay.toFixed(1)} per study day</small></article>
            <article className={plan.earned >= plan.plannedReady ? "on-track" : "behind"}><span>Timeline position</span><strong>{plan.earned >= plan.plannedReady ? "On track" : `${Math.round(plan.plannedReady - plan.earned)} behind`}</strong><small>{plan.plannedReady} points should be covered by today</small></article>
            <article><span>Study hours</span><strong>{formatHours(plan.weeklyMinutes)}</strong><small>of {activeGoal.weeklyHours}h in the last 7 days</small><div className="mini-progress"><i style={{ width: `${Math.min(100, plan.weeklyMinutes / (activeGoal.weeklyHours * 60) * 100)}%` }} /></div></article>
          </section>

          <section className="goal-timeline panel-card">
            <div className="section-heading">
              <div><p className="eyebrow">CHAPTER TIMELINE</p><h3>Your route to completion</h3></div>
              <span>{plan.coveredPoints} of {plan.totalPoints} syllabus points covered · {plan.examReadyPoints} exam ready</span>
            </div>
            <div className="timeline-list">
              {plan.milestones.map((milestone, index) => {
                const state = milestone.done ? "done" : milestone.dueDate < today ? "late" : milestone.id === plan.nextMilestone?.id ? "current" : "upcoming";
                return (
                  <article className={`timeline-item ${state}`} key={milestone.id}>
                    <div className="timeline-marker"><i>{milestone.done ? <Icon name="check" /> : index + 1}</i></div>
                    <div className="timeline-copy"><small>{milestone.code}</small><strong>{milestone.title}</strong><span>{milestone.complete} / {milestone.total} points covered</span></div>
                    <div className="timeline-progress"><div><i style={{ width: `${milestone.percent}%` }} /></div><span>{milestone.percent}%</span></div>
                    <div className="timeline-date"><strong>{shortDate(milestone.dueDate)}</strong><span>{state === "done" ? "Complete" : state === "late" ? "Needs attention" : state === "current" ? "Work on this next" : "Planned"}</span></div>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
