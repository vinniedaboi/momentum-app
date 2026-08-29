"use client";

import { useEffect, useMemo, useState } from "react";
import CalendarView from "./calendar";
import FlashcardsView from "./flashcards";
import ExamPlanner from "./exams";
import GoalPlanner from "./goals";
import MomentumMark from "./momentum-mark";
import NotesView from "./notes";
import PastPapersView, { type PaperDifficulty, type PaperMeta, type PastPaper, type PastPaperInput } from "./past-papers";
import StudyHoursView, { formatStudyTime, type StudySession } from "./study-hours";
import { progressSegments, segmentSlug, syllabusProgress } from "./syllabus-progress";
import SubjectSettings from "./subject-settings";
import { activeSubjects, subjectById, subjectName, type Subject } from "./subjects";
import { getTopicStage, type SyllabusStage } from "./syllabus-stage";
import TasksView, { DueTasksPanel, type StudyTask, type TaskInput } from "./tasks";
import TopicTimeline from "./topic-timeline";
import Icon from "./icons";
import { STATUSES, type StudyStatus, type Topic } from "./topics";
import { apiMessage } from "./data/api";
import { studyApi } from "./data/endpoints";
import { useStudyWorkspace } from "./data/use-workspace";

// Re-exported so the eight views that import `Topic` from here keep working.
export type { Topic };

type ActiveView = "Today" | "Tasks" | "Calendar" | "Flashcards" | "Notes" | "Goals" | "Exams" | "Hours" | "Papers" | "Subjects" | { subjectId: string };

function viewSubjectId(view: ActiveView) {
  return typeof view === "object" ? view.subjectId : null;
}
type QueueFilter = "all" | "overdue" | "today" | "upcoming";
type QueueGroup = { chapter: Topic | null; items: Topic[] };


function localDate() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function formatDate(date: string | null) {
  if (!date) return "Not scheduled";
  return new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short" })
    .format(new Date(`${date}T00:00:00Z`));
}

function dateLabel(date: string | null, today: string) {
  if (!date) return "Not scheduled";
  if (date < today) {
    const days = Math.round((Date.parse(today) - Date.parse(date)) / 86400000);
    return `${days}d overdue`;
  }
  if (date === today) return "Due today";
  if (date === addDays(today, 1)) return "Tomorrow";
  return formatDate(date);
}

function scheduledDate(topic: Pick<Topic, "reviewDue" | "goalDue">) {
  if (topic.reviewDue && topic.goalDue) return topic.reviewDue < topic.goalDue ? topic.reviewDue : topic.goalDue;
  return topic.reviewDue ?? topic.goalDue;
}

function statusSlug(status: StudyStatus) {
  return status.toLowerCase().replaceAll(" ", "-");
}

function compactMoment(value: string | null) {
  if (!value) return "Never";
  const date = value.length === 10 ? new Date(`${value}T00:00:00Z`) : new Date(value);
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    day: "numeric",
    month: "short",
    ...(value.length === 10 ? {} : { hour: "numeric", minute: "2-digit" }),
  }).format(date);
}

export default function StudyTrackerApp() {
  const [message, setMessage] = useState<string | null>(null);

  // Loading lives in useStudyWorkspace; this component only renders what it
  // holds and splices write results back into it.
  const workspace = useStudyWorkspace(setMessage);
  const { value: subjects, setValue: setSubjects } = workspace.subjects;
  const { value: topics, setValue: setTopics, failed: loadError, reload: refreshTopics } = workspace.topics;
  const { value: studySessions, setValue: setStudySessions, failed: hoursError } = workspace.sessions;
  const { value: tasks, setValue: setTasks } = workspace.tasks;
  const { value: pastPapers, setValue: setPastPapers, failed: papersError } = workspace.papers;
  const { value: paperMeta, setValue: setPaperMeta } = workspace.paperMeta;
  const [activeView, setActiveView] = useState<ActiveView>("Today");
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");
  const [query, setQuery] = useState("");
  const [openChapters, setOpenChapters] = useState<Set<string>>(new Set());
  const [updating, setUpdating] = useState<Set<string>>(new Set());
  const [selectedReviews, setSelectedReviews] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<StudyStatus>("Practising");
  const [hoursSaving, setHoursSaving] = useState(false);
  const [taskAdding, setTaskAdding] = useState(false);
  const [taskBusyIds, setTaskBusyIds] = useState<Set<number>>(new Set());
  const [paperSaving, setPaperSaving] = useState(false);
  const [paperBusyIds, setPaperBusyIds] = useState<Set<number>>(new Set());
  const [timelineTopicId, setTimelineTopicId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // The mobile drawer is a layer over the page: Escape closes it, and the page
  // behind it must not scroll while it is open.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  // Every nav entry does the same three things, and on mobile a fourth: the
  // drawer has to close behind the choice. Threading that through eleven inline
  // handlers is how they drift apart.
  function selectView(view: ActiveView) {
    setActiveView(view);
    setQuery("");
    setSelectedReviews(new Set());
    setMenuOpen(false);
  }
  const today = localDate();

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 3200);
    return () => window.clearTimeout(timer);
  }, [message]);

  const subjectLookup = useMemo(() => subjectById(subjects), [subjects]);
  const trackedSubjects = useMemo(() => activeSubjects(subjects), [subjects]);
  const points = useMemo(() => topics.filter((topic) => topic.kind === "point"), [topics]);
  const tracked = useMemo(() => points.filter((topic) => scheduledDate(topic)), [points]);
  const overdue = useMemo(() => tracked.filter((topic) => scheduledDate(topic)! < today), [tracked, today]);
  const dueToday = useMemo(() => tracked.filter((topic) => scheduledDate(topic) === today), [tracked, today]);
  const upcoming = useMemo(
    () => tracked.filter((topic) => scheduledDate(topic)! > today && scheduledDate(topic)! <= addDays(today, 7)),
    [tracked, today],
  );
  const progress = syllabusProgress(points);
  const progressBands = progressSegments(points);
  const dueTaskCount = tasks.filter((task) => !task.completed && task.dueDate <= today).length;
  const donePaperCount = pastPapers.filter((paper) => paper.status === "done").length;
  const timelineTopic = timelineTopicId ? topics.find((topic) => topic.id === timelineTopicId) ?? null : null;
  const todayStudyMinutes = studySessions
    .filter((session) => session.studyDate === today)
    .reduce((sum, session) => sum + session.minutes, 0);
  const weekStudyMinutes = studySessions
    .filter((session) => session.studyDate >= addDays(today, -6) && session.studyDate <= today)
    .reduce((sum, session) => sum + session.minutes, 0);

  const queue = useMemo(() => {
    const all = [...overdue, ...dueToday, ...upcoming]
      .sort((a, b) => (scheduledDate(a) ?? "").localeCompare(scheduledDate(b) ?? ""));
    if (queueFilter === "overdue") return all.filter((topic) => scheduledDate(topic)! < today);
    if (queueFilter === "today") return all.filter((topic) => scheduledDate(topic) === today);
    if (queueFilter === "upcoming") return all.filter((topic) => scheduledDate(topic)! > today);
    return all;
  }, [overdue, dueToday, upcoming, queueFilter, today]);

  const queueGroups = useMemo(() => {
    const chapterById = new Map(topics.filter((topic) => topic.kind === "chapter").map((topic) => [topic.id, topic]));
    const groups = new Map<string, QueueGroup>();
    queue.slice(0, 30).forEach((topic) => {
      const key = topic.parentId ?? `${topic.subjectId}:${topic.section ?? "Other"}`;
      const group = groups.get(key) ?? { chapter: topic.parentId ? chapterById.get(topic.parentId) ?? null : null, items: [] };
      group.items.push(topic);
      groups.set(key, group);
    });
    return [...groups.values()];
  }, [queue, topics]);

  const visibleQueueIds = useMemo(() => queueGroups.flatMap((group) => group.items.map((topic) => topic.id)), [queueGroups]);

  const searchResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return topics.filter((topic) =>
      [topic.title, topic.code, subjectName(subjectLookup, topic.subjectId), topic.section, topic.paper]
        .some((value) => value?.toLowerCase().includes(needle)),
    ).slice(0, 80);
  }, [query, subjectLookup, topics]);

  async function updateTopic(topic: Topic, options: { status?: StudyStatus; reviewedNow?: boolean; wholeChapter?: boolean }) {
    const ids = options.wholeChapter
      ? topics.filter((item) => item.id === topic.id || item.parentId === topic.id).map((item) => item.id)
      : [topic.id];
    setUpdating((current) => new Set([...current, ...ids]));
    try {
      const data = await studyApi.topics.update<{ topics: Topic[] }>({ id: topic.id, ...options });
      const changed = new Map(data.topics.map((item) => [item.id, item]));
      setTopics((current) => current.map((item) => changed.get(item.id) ?? item));
      const label = options.wholeChapter ? "Chapter schedule updated" : options.reviewedNow ? "Review logged and next date scheduled" : "Status updated and tracking started";
      setMessage(label);
    } catch {
      setMessage("That change was not saved. Please try again.");
    } finally {
      setUpdating((current) => {
        const next = new Set(current);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  }

  async function updateSelectedReviews(options: { status?: StudyStatus; reviewedNow?: boolean }) {
    const ids = [...selectedReviews];
    if (!ids.length) return;
    setUpdating((current) => new Set([...current, ...ids]));
    try {
      const data = await studyApi.topics.update<{ topics: Topic[] }>({ ids, ...options });
      const changed = new Map(data.topics.map((item) => [item.id, item]));
      setTopics((current) => current.map((item) => changed.get(item.id) ?? item));
      setSelectedReviews(new Set());
      setMessage(options.reviewedNow ? `${ids.length} reviews logged and rescheduled` : `${ids.length} syllabus points updated`);
    } catch {
      setMessage("Those selected reviews were not saved. Please try again.");
    } finally {
      setUpdating((current) => {
        const next = new Set(current);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  }

  function toggleReviewSelection(ids: string[]) {
    setSelectedReviews((current) => {
      const next = new Set(current);
      const everySelected = ids.every((id) => next.has(id));
      ids.forEach((id) => everySelected ? next.delete(id) : next.add(id));
      return next;
    });
  }

  async function addStudySession(input: {
    studyDate: string;
    minutes: number;
    subjectId: string | null;
    note: string | null;
    topicIds: string[];
  }) {
    setHoursSaving(true);
    try {
      const data = await studyApi.studyHours.log<{ session: StudySession; reviewedTopics: Topic[] }>(input);
      setStudySessions((current) => [data.session, ...current]);
      if (data.reviewedTopics.length) {
        const reviewedById = new Map(data.reviewedTopics.map((topic) => [topic.id, topic]));
        setTopics((current) => current.map((topic) => reviewedById.get(topic.id) ?? topic));
      }
      setMessage(data.reviewedTopics.length
        ? `${formatStudyTime(input.minutes)} logged · ${data.reviewedTopics.length} syllabus items reviewed and rescheduled`
        : `${formatStudyTime(input.minutes)} added to your study log`);
      return true;
    } catch {
      setMessage("Your study time was not saved. Please try again.");
      return false;
    } finally {
      setHoursSaving(false);
    }
  }

  async function deleteStudySession(id: number) {
    try {
      await studyApi.studyHours.remove(id);
      setStudySessions((current) => current.filter((session) => session.id !== id));
      setMessage("Study log removed");
    } catch {
      setMessage("That study log could not be removed.");
    }
  }

  async function addTask(input: TaskInput) {
    setTaskAdding(true);
    try {
      const data = await studyApi.tasks.create<{ task: StudyTask }>(input);
      setTasks((current) => [...current, data.task]);
      setMessage(`${subjectName(subjectLookup, input.subjectId)} task added`);
      return true;
    } catch (error) {
      setMessage(apiMessage(error, "Your task could not be saved."));
      return false;
    } finally {
      setTaskAdding(false);
    }
  }

  async function updateTask(id: number, input: Partial<TaskInput> & { completed?: boolean }) {
    setTaskBusyIds((current) => new Set(current).add(id));
    try {
      const data = await studyApi.tasks.update<{ task: StudyTask }>({ id, ...input });
      setTasks((current) => current.map((task) => task.id === id ? data.task : task));
      setMessage(input.completed === true ? "Task completed" : input.completed === false ? "Task reopened" : "Task updated");
      return true;
    } catch (error) {
      setMessage(apiMessage(error, "Your task could not be updated."));
      return false;
    } finally {
      setTaskBusyIds((current) => { const next = new Set(current); next.delete(id); return next; });
    }
  }

  async function deleteTask(id: number) {
    setTaskBusyIds((current) => new Set(current).add(id));
    try {
      await studyApi.tasks.remove(id);
      setTasks((current) => current.filter((task) => task.id !== id));
      setMessage("Task deleted");
    } catch {
      setMessage("That task could not be deleted.");
    } finally {
      setTaskBusyIds((current) => { const next = new Set(current); next.delete(id); return next; });
    }
  }

  async function addPastPaper(input: PastPaperInput) {
    setPaperSaving(true);
    try {
      const data = await studyApi.pastPapers.create<{ paper: PastPaper }>(input);
      setPastPapers((current) => [data.paper, ...current].sort((a, b) => b.attemptDate.localeCompare(a.attemptDate) || b.id - a.id));
      setMessage(input.status === "planned" ? "Past paper added to your plan" : `${subjectName(subjectLookup, input.subject)} ${input.paper} logged`);
      return true;
    } catch (error) {
      setMessage(apiMessage(error, "That past paper could not be saved."));
      return false;
    } finally {
      setPaperSaving(false);
    }
  }

  async function updatePastPaper(id: number, input: PastPaperInput) {
    setPaperSaving(true);
    setPaperBusyIds((current) => new Set(current).add(id));
    try {
      const data = await studyApi.pastPapers.update<{ paper: PastPaper }>({ id, ...input });
      setPastPapers((current) => current
        .map((paper) => paper.id === id ? data.paper : paper)
        .sort((a, b) => b.attemptDate.localeCompare(a.attemptDate) || b.id - a.id));
      setMessage("Past paper updated");
      return true;
    } catch (error) {
      setMessage(apiMessage(error, "That past paper could not be updated."));
      return false;
    } finally {
      setPaperSaving(false);
      setPaperBusyIds((current) => { const next = new Set(current); next.delete(id); return next; });
    }
  }

  async function savePaperMeta(paperId: string, difficulty: PaperDifficulty | null, resourceUrl: string | null) {
    try {
      const data = await studyApi.paperMeta.save<{ meta: PaperMeta }>({ paperId, difficulty, resourceUrl });
      setPaperMeta((current) => {
        const rest = current.filter((item) => item.paperId !== paperId);
        return data.meta.difficulty || data.meta.resourceUrl ? [...rest, data.meta] : rest;
      });
      return true;
    } catch (error) {
      setMessage(apiMessage(error, "Those paper details could not be saved."));
      return false;
    }
  }

  async function deletePastPaper(id: number) {
    setPaperBusyIds((current) => new Set(current).add(id));
    try {
      await studyApi.pastPapers.remove(id);
      setPastPapers((current) => current.filter((paper) => paper.id !== id));
      setMessage("Past paper removed");
    } catch {
      setMessage("That past paper could not be removed.");
    } finally {
      setPaperBusyIds((current) => { const next = new Set(current); next.delete(id); return next; });
    }
  }

  function toggleChapter(id: string) {
    setOpenChapters((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const dayHeading = new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <main className={`app-shell${menuOpen ? " menu-open" : ""}`}>
      {/* Backdrop for the drawer; display:none above the mobile breakpoint. */}
      <button
        type="button"
        className="mobile-scrim"
        // Not focusable while closed: it covers nothing and would be a dead tab stop.
        tabIndex={menuOpen ? 0 : -1}
        aria-label="Close navigation"
        onClick={() => setMenuOpen(false)}
      />
      <aside className="sidebar" id="main-navigation">
        <div className="brand-lockup">
          <div className="brand-mark"><MomentumMark /></div>
          <div><p className="eyebrow light">Focus. Study. Grow.</p><h1>Momentum</h1></div>
        </div>
        <nav aria-label="Main navigation">
          <button className={`nav-item ${activeView === "Today" ? "active" : ""}`} onClick={() => selectView("Today")}>
            <span className="nav-label"><Icon name="review" className="nav-symbol" />Review board</span>
            {(overdue.length + dueToday.length + dueTaskCount) > 0 && <b>{overdue.length + dueToday.length + dueTaskCount}</b>}
          </button>
          <button className={`nav-item ${activeView === "Tasks" ? "active" : ""}`} onClick={() => selectView("Tasks")}>
            <span className="nav-label"><Icon name="tasks" className="nav-symbol task-symbol" />Tasks</span>
            <small>{tasks.filter((task) => !task.completed).length} open</small>
          </button>
          <button className={`nav-item ${activeView === "Hours" ? "active" : ""}`} onClick={() => selectView("Hours")}>
            <span className="nav-label"><Icon name="hours" className="nav-symbol hours-symbol" />Study hours</span>
            <small>{formatStudyTime(todayStudyMinutes)}</small>
          </button>
          <button className={`nav-item ${activeView === "Papers" ? "active" : ""}`} onClick={() => selectView("Papers")}>
            <span className="nav-label"><Icon name="papers" className="nav-symbol paper-symbol" />Past papers</span>
            <small>{donePaperCount ? `${donePaperCount} done` : "Scores"}</small>
          </button>
          <button className={`nav-item ${activeView === "Goals" ? "active" : ""}`} onClick={() => selectView("Goals")}>
            <span className="nav-label"><Icon name="goals" className="nav-symbol goal-symbol" />Syllabus goals</span>
            <small>Timeline</small>
          </button>
          <button className={`nav-item ${activeView === "Exams" ? "active" : ""}`} onClick={() => selectView("Exams")}>
            <span className="nav-label"><Icon name="exams" className="nav-symbol goal-symbol" />Exams</span>
            <small>Countdown</small>
          </button>
          <button className={`nav-item ${activeView === "Calendar" ? "active" : ""}`} onClick={() => selectView("Calendar")}>
            <span className="nav-label"><Icon name="calendar" className="nav-symbol utility-symbol" />Calendar</span>
            <small>Plan</small>
          </button>
          <button className={`nav-item ${activeView === "Flashcards" ? "active" : ""}`} onClick={() => selectView("Flashcards")}>
            <span className="nav-label"><Icon name="flashcards" className="nav-symbol utility-symbol" />Flashcards</span>
            <small>Study</small>
          </button>
          <button className={`nav-item ${activeView === "Notes" ? "active" : ""}`} onClick={() => selectView("Notes")}>
            <span className="nav-label"><Icon name="notes" className="nav-symbol utility-symbol" />Notes library</span>
            <small>Files</small>
          </button>
          <button className={`nav-item ${activeView === "Subjects" ? "active" : ""}`} onClick={() => selectView("Subjects")}>
            <span className="nav-label"><Icon name="subjects" className="nav-symbol utility-symbol" />Subjects</span>
            <small>Setup</small>
          </button>
          <p className="nav-section">SUBJECTS</p>
          {trackedSubjects.map((subject) => {
            const subjectPoints = points.filter((topic) => topic.subjectId === subject.id);
            const asPoints = subjectPoints.filter((topic) => getTopicStage(topic, topics, subject) === "AS");
            const a2Points = subjectPoints.filter((topic) => getTopicStage(topic, topics, subject) === "A2");
            const stagePercent = (stagePoints: Topic[]) => syllabusProgress(stagePoints).percent;
            return (
              <button key={subject.id} className={`nav-item ${viewSubjectId(activeView) === subject.id ? "active" : ""}`} onClick={() => selectView({ subjectId: subject.id })}>
                <span className="nav-label"><i className={`subject-pin ${subject.tone}`} />{subject.name}</span>
                <small className="stage-progress">AS {stagePercent(asPoints)}% · A2 {stagePercent(a2Points)}%</small>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-note">
          <span className="pulse-dot" />
          <div><strong>Auto scheduling is on</strong><p>Goals → daily plan<br />Learning → 3 days<br />Practising → 7 days<br />Covered → 10 days<br />Exam ready → 14 days</p></div>
        </div>
        <div className="save-state"><span className="save-dot" />  Your progress saves automatically</div>
        {/* Plain form post so signing out works without client-side auth state. */}
        <form action="/auth/signout" method="post" className="sidebar-account">
          <button type="submit">Sign out</button>
        </form>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{dayHeading.toUpperCase()}</p>
            <h2>{query ? "Search results" : activeView === "Today" ? "Your review board" : activeView === "Tasks" ? "Your tasks" : activeView === "Hours" ? "Study hours" : activeView === "Papers" ? "Past papers" : activeView === "Goals" ? "Syllabus goals" : activeView === "Exams" ? "Exam planner" : activeView === "Calendar" ? "Study calendar" : activeView === "Flashcards" ? "Flashcard maker" : activeView === "Notes" ? "Notes library" : activeView === "Subjects" ? "Subjects" : subjectName(subjectLookup, viewSubjectId(activeView))}</h2>
            <p className="muted">{query ? `Matching “${query}” across your syllabus.` : activeView === "Today" ? "Know exactly what to review, without hunting through rows." : activeView === "Tasks" ? "Keep subject work and everything else on one list." : activeView === "Hours" ? "Log your YPT time and see your daily study rhythm." : activeView === "Papers" ? "Log every attempt, watch the scores move, and see where marks keep going." : activeView === "Goals" ? "Turn a finish date into a chapter-by-chapter plan." : activeView === "Exams" ? "Pick the topics an assessment actually covers, and get a revision run-up." : activeView === "Calendar" ? "See reviews, tasks, study sessions, milestones and deadlines in one place." : activeView === "Flashcards" ? "Create focused decks and test your recall." : activeView === "Notes" ? "Keep your study files organised by subject and stage." : activeView === "Subjects" ? "Add the subjects you study, and set how each one is structured." : "Work chapter by chapter, or update one syllabus point at a time."}</p>
          </div>
          {!(["Tasks", "Hours", "Papers", "Goals", "Exams", "Calendar", "Flashcards", "Notes", "Subjects"] as ActiveView[]).includes(activeView) && <label className="search-box">
            <Icon name="search" className="search-icon" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search topics" placeholder="Search topic, chapter or code" />
            {query && <button onClick={() => setQuery("")} aria-label="Clear search"><Icon name="close" /></button>}
          </label>}
        </header>

        {activeView === "Tasks" ? (
          <TasksView tasks={tasks} subjects={subjects} today={today} adding={taskAdding} busyIds={taskBusyIds} onAdd={addTask} onUpdate={updateTask} onDelete={deleteTask} />
        ) : activeView === "Flashcards" ? (
          <FlashcardsView topics={topics} subjects={subjects} onMessage={setMessage} />
        ) : activeView === "Notes" ? (
          <NotesView topics={topics} subjects={subjects} onMessage={setMessage} />
        ) : activeView === "Calendar" ? (
          <CalendarView topics={topics} subjects={subjectLookup} sessions={studySessions} tasks={tasks} today={today} onMessage={setMessage} />
        ) : activeView === "Goals" ? (
          <GoalPlanner topics={topics} subjects={subjects} sessions={studySessions} today={today} onMessage={setMessage} onScheduleChanged={refreshTopics} />
        ) : activeView === "Exams" ? (
          <ExamPlanner topics={topics} subjects={subjects} today={today} onMessage={setMessage} />
        ) : activeView === "Papers" ? (
          papersError ? <section className="empty-state"><strong>Your past papers could not load.</strong><p>Refresh the page to try again.</p></section> :
          <PastPapersView papers={pastPapers} meta={paperMeta} today={today} saving={paperSaving} busyIds={paperBusyIds} onAdd={addPastPaper} onUpdate={updatePastPaper} onDelete={deletePastPaper} onSaveMeta={savePaperMeta} />
        ) : activeView === "Hours" ? (
          hoursError ? <section className="empty-state"><strong>Your study hours could not load.</strong><p>Refresh the page to try again.</p></section> :
          <StudyHoursView sessions={studySessions} subjects={subjects} topics={topics} today={today} saving={hoursSaving} onAdd={addStudySession} onDelete={deleteStudySession} />
        ) : loadError ? (
          <section className="empty-state"><strong>Your tracker could not load.</strong><p>Refresh the page to try again.</p></section>
        ) : !topics.length ? (
          <section className="loading-state" aria-label="Loading study tracker"><div /><div /><div /></section>
        ) : query ? (
          <SearchView results={searchResults} subjects={subjectLookup} today={today} updating={updating} updateTopic={updateTopic} onOpenTimeline={setTimelineTopicId} />
        ) : activeView === "Today" ? (
          <>
            <section className="summary-grid" aria-label="Review summary">
              <button className={`summary-card urgent ${queueFilter === "overdue" ? "selected" : ""}`} onClick={() => { setQueueFilter(queueFilter === "overdue" ? "all" : "overdue"); setSelectedReviews(new Set()); }}>
                <span>Overdue</span><strong>{overdue.length}</strong><small>{overdue.length ? "Clear these first" : "You are caught up"}</small>
              </button>
              <button className={`summary-card today ${queueFilter === "today" ? "selected" : ""}`} onClick={() => { setQueueFilter(queueFilter === "today" ? "all" : "today"); setSelectedReviews(new Set()); }}>
                <span>Due today</span><strong>{dueToday.length}</strong><small>{dueToday.length ? "Ready for review" : "Nothing due today"}</small>
              </button>
              <button className={`summary-card upcoming ${queueFilter === "upcoming" ? "selected" : ""}`} onClick={() => { setQueueFilter(queueFilter === "upcoming" ? "all" : "upcoming"); setSelectedReviews(new Set()); }}>
                <span>Next 7 days</span><strong>{upcoming.length}</strong><small>Reviews and goal tasks</small>
              </button>
              <article className="summary-card ready">
                <span>Syllabus progress</span>
                <strong>{progress.percent}%</strong>
                <ProgressBar segments={progressBands} />
                <small>{progress.ready} exam ready · {progress.covered} covered · {progress.learning + progress.practising} in progress</small>
              </article>
            </section>

            <section className="hours-glance">
              <div className="hours-glance-mark"><Icon name="hours" /></div>
              <div><p className="eyebrow">STUDY HOURS</p><strong>{formatStudyTime(todayStudyMinutes)} today</strong><span>{formatStudyTime(weekStudyMinutes)} in the last 7 days</span></div>
              <button onClick={() => setActiveView("Hours")}>{todayStudyMinutes ? "Add more time" : "Log today’s YPT time"}</button>
            </section>

            <DueTasksPanel tasks={tasks} subjects={subjectLookup} today={today} busyIds={taskBusyIds} onUpdate={updateTask} onOpenTasks={() => setActiveView("Tasks")} />

            <section className="review-panel">
              <div className="section-heading">
                <div><p className="eyebrow">YOUR QUEUE</p><h3>{queueFilter === "all" ? "Review next" : queueFilter === "today" ? "Due today" : queueFilter === "overdue" ? "Overdue reviews" : "Coming up"}</h3></div>
                <div className="queue-heading-actions">
                  {queue.length > 0 && <button className="ghost-button" onClick={() => toggleReviewSelection(visibleQueueIds)}>{visibleQueueIds.every((id) => selectedReviews.has(id)) ? "Clear selection" : "Select all"}</button>}
                  {queueFilter !== "all" && <button className="ghost-button" onClick={() => { setQueueFilter("all"); setSelectedReviews(new Set()); }}>Show all</button>}
                </div>
              </div>
              {queue.length ? (
                <div className="queue-groups">
                  {queueGroups.map((group, index) => {
                    const ids = group.items.map((topic) => topic.id);
                    const selectedCount = ids.filter((id) => selectedReviews.has(id)).length;
                    const label = group.chapter?.title ?? group.items[0]?.section ?? "Other topics";
                    return (
                      <section className="queue-group" key={group.chapter?.id ?? `${label}-${index}`}>
                        <label className="queue-group-heading">
                          <input type="checkbox" checked={selectedCount === ids.length} onChange={() => toggleReviewSelection(ids)} aria-label={`Select all reviews in ${label}`} />
                          <i className={`subject-pin ${subjectLookup.get(group.items[0].subjectId)?.tone ?? "slate"}`} />
                          <span><small>{subjectName(subjectLookup, group.items[0].subjectId)} · {getTopicStage(group.items[0], topics, subjectLookup.get(group.items[0].subjectId))} · {group.chapter?.code ?? group.items[0].code}</small><strong>{label}</strong></span>
                          <b>{selectedCount ? `${selectedCount} of ${ids.length} selected` : `${ids.length} review${ids.length === 1 ? "" : "s"}`}</b>
                        </label>
                        <div className="review-list">
                          {group.items.map((topic) => (
                            <TopicRow key={topic.id} topic={topic} subjects={subjectLookup} today={today} updating={updating.has(topic.id)} updateTopic={updateTopic} selected={selectedReviews.has(topic.id)} onSelect={() => toggleReviewSelection([topic.id])} onOpenTimeline={setTimelineTopicId} />
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state compact"><span className="success-ring"><Icon name="check" /></span><strong>No reviews in this queue</strong><p>Choose a subject and change a status to start its schedule.</p></div>
              )}
              {selectedReviews.size > 0 && (
                <div className="bulk-review-bar" aria-label="Bulk review actions">
                  <strong>{selectedReviews.size} selected</strong>
                  <span>Update them together:</span>
                  <select value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value as StudyStatus)} aria-label="Status for selected reviews">
                    {STATUSES.map((status) => <option key={status}>{status}</option>)}
                  </select>
                  <button className="ghost-button" disabled={[...selectedReviews].some((id) => updating.has(id))} onClick={() => updateSelectedReviews({ status: bulkStatus })}>Set status</button>
                  <button className="primary-button" disabled={[...selectedReviews].some((id) => updating.has(id))} onClick={() => updateSelectedReviews({ reviewedNow: true })}>Reviewed selected</button>
                  <button className="clear-selection" onClick={() => setSelectedReviews(new Set())}>Clear</button>
                </div>
              )}
            </section>
          </>
        ) : activeView === "Subjects" ? (
          <SubjectSettings subjects={subjects} topics={topics} onMessage={setMessage} onChanged={(next) => { setSubjects(next); refreshTopics(); }} />
        ) : (
          <SubjectView
            subject={subjectLookup.get(viewSubjectId(activeView) ?? "") ?? null}
            subjects={subjectLookup}
            topics={topics}
            today={today}
            openChapters={openChapters}
            updating={updating}
            toggleChapter={toggleChapter}
            updateTopic={updateTopic}
            onOpenTimeline={setTimelineTopicId}
          />
        )}
      </section>

      {message && <div className="toast" role="status"><span><Icon name="check" /></span>{message}</div>}
      {timelineTopic && <TopicTimeline topic={timelineTopic} topics={topics} subjects={subjectLookup} onClose={() => setTimelineTopicId(null)} onMessage={setMessage} onTopicUpdated={(topicId, updatedAt) => setTopics((current) => current.map((topic) => topic.id === topicId ? { ...topic, updatedAt } : topic))} />}
      {/* Mobile only. The four most-used destinations, plus the drawer for the
          rest — ten sidebar entries do not fit across a phone. */}
      <nav className="bottom-nav" aria-label="Primary">
        <button
          className={`bottom-nav-item ${activeView === "Today" ? "active" : ""}`}
          aria-current={activeView === "Today" ? "page" : undefined}
          onClick={() => selectView("Today")}
        >
          <Icon name="review" />
          <span>Today</span>
          {overdue.length + dueToday.length + dueTaskCount > 0 && <b>{overdue.length + dueToday.length + dueTaskCount}</b>}
        </button>
        <button
          className={`bottom-nav-item ${activeView === "Tasks" ? "active" : ""}`}
          aria-current={activeView === "Tasks" ? "page" : undefined}
          onClick={() => selectView("Tasks")}
        >
          <Icon name="tasks" />
          <span>Tasks</span>
        </button>
        <button
          className={`bottom-nav-item ${activeView === "Hours" ? "active" : ""}`}
          aria-current={activeView === "Hours" ? "page" : undefined}
          onClick={() => selectView("Hours")}
        >
          <Icon name="hours" />
          <span>Hours</span>
        </button>
        <button
          className={`bottom-nav-item ${activeView === "Papers" ? "active" : ""}`}
          aria-current={activeView === "Papers" ? "page" : undefined}
          onClick={() => selectView("Papers")}
        >
          <Icon name="papers" />
          <span>Papers</span>
        </button>
        <button
          className={`bottom-nav-item ${menuOpen ? "active" : ""}`}
          aria-expanded={menuOpen}
          aria-controls="main-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Icon name="menu" />
          <span>More</span>
        </button>
      </nav>
    </main>
  );
}

function ProgressBar({ segments }: { segments: ReturnType<typeof progressSegments> }) {
  const filled = segments.reduce((sum, segment) => sum + segment.width, 0);
  return (
    <div className="progress-bar" role="img" aria-label={`${Math.round(filled)}% syllabus progress`}>
      {segments.map((segment) => (
        <i
          key={segment.status}
          className={`progress-band ${segmentSlug(segment.status)}`}
          style={{ width: `${segment.width}%` }}
          title={`${segment.count} ${segment.status}`}
        />
      ))}
    </div>
  );
}

function TopicRow({ topic, today, updating, updateTopic, selected, onSelect, onOpenTimeline, subjects }: {
  topic: Topic;
  subjects: Map<string, Subject>;
  today: string;
  updating: boolean;
  updateTopic: (topic: Topic, options: { status?: StudyStatus; reviewedNow?: boolean; wholeChapter?: boolean }) => void;
  selected?: boolean;
  onSelect?: () => void;
  onOpenTimeline: (id: string) => void;
}) {
  const dueDate = scheduledDate(topic);
  const isGoalTask = Boolean(topic.goalDue && dueDate === topic.goalDue);
  return (
    <article className={`review-row ${onSelect ? "selectable" : ""} ${selected ? "is-selected" : ""} ${updating ? "is-updating" : ""}`}>
      {onSelect ? <input className="review-check" type="checkbox" checked={selected} onChange={onSelect} aria-label={`Select ${topic.title}`} /> : <i className={`subject-pin ${subjects.get(topic.subjectId)?.tone ?? "slate"}`} />}
      <div className="review-copy">
        <span>{subjectName(subjects, topic.subjectId)} · {topic.code}{isGoalTask ? " · Goal plan" : ""}</span>
        <strong>{topic.title}</strong>
        <small className="topic-dates"><button onClick={() => onOpenTimeline(topic.id)}>View timeline</button><i />Updated {compactMoment(topic.updatedAt)}<i />Reviewed {compactMoment(topic.reviewedAt ?? topic.reviewedOn)}</small>
      </div>
      <span className={`date-badge ${dueDate && dueDate < today ? "overdue" : dueDate === today ? "due" : "soon"}`}>
        {dateLabel(dueDate, today)}
      </span>
      <select className={`status-select status-${statusSlug(topic.status)}`} aria-label={`Status for ${topic.title}`} value={topic.status} disabled={updating} onChange={(event) => updateTopic(topic, { status: event.target.value as StudyStatus })}>
        {STATUSES.map((status) => <option key={status}>{status}</option>)}
      </select>
      <button className="primary-button" disabled={updating} onClick={() => updateTopic(topic, { reviewedNow: true })}>{updating ? "Saving…" : "Reviewed now"}</button>
    </article>
  );
}

function SearchView({ results, subjects, today, updating, updateTopic, onOpenTimeline }: {
  results: Topic[];
  subjects: Map<string, Subject>;
  today: string;
  updating: Set<string>;
  updateTopic: (topic: Topic, options: { status?: StudyStatus; reviewedNow?: boolean; wholeChapter?: boolean }) => void;
  onOpenTimeline: (id: string) => void;
}) {
  return (
    <section className="review-panel">
      <div className="section-heading"><div><p className="eyebrow">ALL SUBJECTS</p><h3>{results.length} matches</h3></div></div>
      {results.length ? <div className="review-list">{results.map((topic) => (
        <TopicRow key={topic.id} topic={topic} subjects={subjects} today={today} updating={updating.has(topic.id)} updateTopic={updateTopic} onOpenTimeline={onOpenTimeline} />
      ))}</div> : <div className="empty-state compact"><strong>No matching syllabus points</strong><p>Try a broader topic name or syllabus code.</p></div>}
    </section>
  );
}

function SubjectView({ subject, subjects, topics, today, openChapters, updating, toggleChapter, updateTopic, onOpenTimeline }: {
  subject: Subject | null;
  subjects: Map<string, Subject>;
  topics: Topic[];
  today: string;
  openChapters: Set<string>;
  updating: Set<string>;
  toggleChapter: (id: string) => void;
  updateTopic: (topic: Topic, options: { status?: StudyStatus; reviewedNow?: boolean; wholeChapter?: boolean }) => void;
  onOpenTimeline: (id: string) => void;
}) {
  const [stage, setStage] = useState<SyllabusStage>("AS");
  if (!subject) return <section className="empty-state"><strong>That subject is no longer available.</strong><p>Pick another subject from the sidebar.</p></section>;
  const chapters = topics.filter((topic) => topic.subjectId === subject.id && topic.kind === "chapter" && getTopicStage(topic, topics, subject) === stage);
  const chapterIds = new Set(chapters.map((chapter) => chapter.id));
  const subjectPoints = topics.filter((topic) => topic.subjectId === subject.id && topic.kind === "point" && topic.parentId && chapterIds.has(topic.parentId));
  const scheduled = subjectPoints.filter((topic) => scheduledDate(topic)).length;
  const progress = syllabusProgress(subjectPoints);
  const progressBands = progressSegments(subjectPoints);
  const due = subjectPoints.filter((topic) => scheduledDate(topic) && scheduledDate(topic)! <= today).length;

  return (
    <>
      <section className="stage-toolbar" aria-label={`${subject.name} syllabus stage`}>
        <div><span>SYLLABUS STAGE</span><strong>Track AS and A2 separately</strong></div>
        <div className="stage-switch">
          <button className={stage === "AS" ? "active" : ""} onClick={() => setStage("AS")}><b>AS</b><span>First year</span></button>
          <button className={stage === "A2" ? "active" : ""} onClick={() => setStage("A2")}><b>A2</b><span>Second year</span></button>
        </div>
      </section>
      <section className="subject-overview">
        <div><span className={`large-subject-pin ${subject.tone}`} /> <strong>{chapters.length}</strong><small>chapters</small></div>
        <div><strong>{subjectPoints.length}</strong><small>syllabus points</small></div>
        <div><strong>{scheduled}</strong><small>being tracked</small></div>
        <div><strong>{due}</strong><small>due now</small></div>
        <div className="subject-progress">
          <span><b>{progress.percent}%</b> progress · {progress.readyPercent}% exam ready</span>
          <ProgressBar segments={progressBands} />
        </div>
      </section>
      <section className="chapter-stack">
        {chapters.map((chapter) => {
          const children = topics.filter((topic) => topic.parentId === chapter.id);
          const chapterProgress = syllabusProgress(children);
          const chapterDue = children.filter((topic) => scheduledDate(topic) && scheduledDate(topic)! <= today).length;
          const isOpen = openChapters.has(chapter.id);
          const isUpdating = updating.has(chapter.id);
          return (
            <article className={`chapter-card ${isOpen ? "open" : ""}`} key={chapter.id}>
              <header className="chapter-header">
                <button className="chapter-toggle" onClick={() => toggleChapter(chapter.id)} aria-expanded={isOpen}>
                  <Icon name="chevron-right" className="chevron" />
                  <span className="chapter-code">{chapter.code}</span>
                  <span className="chapter-title"><small>{chapter.section ?? chapter.paper ?? subject.name}</small><strong>{chapter.title}</strong></span>
                </button>
                <div className="chapter-stats"><span><b className="chapter-progress-percent">{chapterProgress.percent}%</b>{chapterProgress.coveredOrReady}/{children.length} covered</span>{chapterDue > 0 && <b>{chapterDue} due</b>}</div>
                <button className="chapter-timeline-button" onClick={() => onOpenTimeline(chapter.id)} aria-label={`View timeline for ${chapter.title}`}>Timeline</button>
                <select className={`status-select status-${statusSlug(chapter.status)}`} value={chapter.status} disabled={isUpdating} aria-label={`Apply status to ${chapter.title}`} onChange={(event) => updateTopic(chapter, { status: event.target.value as StudyStatus, wholeChapter: true })}>
                  {STATUSES.map((status) => <option key={status}>{status}</option>)}
                </select>
              </header>
              {isOpen && (
                <div className="chapter-body">
                  <div className="chapter-help"><span>Changes here affect individual points.</span><button disabled={isUpdating} onClick={() => updateTopic(chapter, { reviewedNow: true, wholeChapter: true })}>Review whole chapter now</button></div>
                  {children.map((topic) => <TopicRow key={topic.id} topic={topic} subjects={subjects} today={today} updating={updating.has(topic.id)} updateTopic={updateTopic} onOpenTimeline={onOpenTimeline} />)}
                </div>
              )}
            </article>
          );
        })}
      </section>
    </>
  );
}
