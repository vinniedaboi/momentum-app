"use client";

import { useCallback, useEffect, useState } from "react";
import type { PaperMeta, PastPaper } from "../past-papers";
import type { PlannedExam } from "../exams";
import type { StudyGoal } from "../goals";
import type { GradeTarget } from "../grade-targets";
import type { StudySession } from "../study-hours";
import type { Subject } from "../subjects";
import type { StudyTask } from "../tasks";
import type { Topic } from "../topics";
import { api } from "./api";
import { studyApi } from "./endpoints";
import { useResource } from "./use-resource";

/**
 * Everything the shell loads on first paint.
 *
 * These were seven near-identical `useEffect`s in `study-tracker-app.tsx`, each
 * with its own fetch, its own status check and its own error flag. Collecting
 * them here leaves the component deciding what to render rather than how to
 * load it, and gives the topics sequencing one place to live.
 *
 * `onError` carries the two failures that have no placeholder in the layout and
 * so have to be announced; the rest are reported through their `failed` flag.
 */
export function useStudyWorkspace(onError: (message: string) => void) {
  const subjects = useResource(studyApi.subjects.path, "subjects", [] as Subject[],
    () => onError("Your subjects could not load."));
  const tasks = useResource(studyApi.tasks.path, "tasks", [] as StudyTask[],
    () => onError("Your tasks could not load."));
  const sessions = useResource(studyApi.studyHours.path, "sessions", [] as StudySession[]);
  // Read for their revision dates rather than for the planner, which loads its
  // own: an exam schedules work, and work with a date on it belongs on the board.
  const exams = useResource(studyApi.exams.path, "exams", [] as PlannedExam[]);
  const papers = useResource(studyApi.pastPapers.path, "papers", [] as PastPaper[]);
  const paperMeta = useResource(studyApi.paperMeta.path, "meta", [] as PaperMeta[]);
  // Read alongside the papers rather than only by the grade planner: the target
  // a paper is measured against belongs on the paper, wherever it is shown.
  const gradeTargets = useResource(studyApi.gradeTargets.path, "targets", [] as GradeTarget[]);

  // Topics cannot use useResource: reading the goals route is what applies any
  // pending schedule to the topic rows, so it has to complete first or the
  // first paint shows yesterday's due dates.
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicsFailed, setTopicsFailed] = useState(false);
  // Kept from the call below rather than fetched again: the board divides each
  // goal's weekly hours across the points it still has to cover, and the goal
  // planner reads the same list rather than requesting its own copy.
  const [goals, setGoals] = useState<StudyGoal[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(true);

  const reloadTopics = useCallback(async () => {
    try {
      const data = await api.get<{ topics: Topic[] }>(studyApi.topics.path);
      setTopics(data.topics);
      setTopicsFailed(false);
    } catch {
      setTopicsFailed(true);
    }
  }, []);

  const reloadGoals = useCallback(async () => {
    // A failure here is not fatal — the schedule is simply not refreshed, and
    // the topics still load — so it is swallowed rather than surfaced.
    const data = await api
      .get<{ goals: StudyGoal[] }>(studyApi.goals.path)
      .catch(() => null);
    if (data) setGoals(data.goals);
    // Only ever the first load: a refresh after a save keeps the planner on
    // screen rather than replacing it with its skeleton.
    setGoalsLoading(false);
    await reloadTopics();
  }, [reloadTopics]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reloadGoals();
  }, [reloadGoals]);

  return {
    subjects,
    tasks,
    sessions,
    exams,
    papers,
    paperMeta,
    gradeTargets,
    topics: { value: topics, setValue: setTopics, failed: topicsFailed, reload: reloadTopics },
    goals: { value: goals, loading: goalsLoading, reload: reloadGoals },
  };
}
