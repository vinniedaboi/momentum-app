"use client";

import { useCallback, useEffect, useState } from "react";
import type { PaperMeta, PastPaper } from "../past-papers";
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
  const papers = useResource(studyApi.pastPapers.path, "papers", [] as PastPaper[]);
  const paperMeta = useResource(studyApi.paperMeta.path, "meta", [] as PaperMeta[]);

  // Topics cannot use useResource: reading the goals route is what applies any
  // pending schedule to the topic rows, so it has to complete first or the
  // first paint shows yesterday's due dates.
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicsFailed, setTopicsFailed] = useState(false);

  const reloadTopics = useCallback(async () => {
    try {
      const data = await api.get<{ topics: Topic[] }>(studyApi.topics.path);
      setTopics(data.topics);
      setTopicsFailed(false);
    } catch {
      setTopicsFailed(true);
    }
  }, []);

  useEffect(() => {
    // A failure here is not fatal — the schedule is simply not refreshed, and
    // the topics still load — so it is swallowed rather than surfaced.
    void api
      .get(studyApi.goals.path)
      .catch(() => null)
      .then(reloadTopics);
  }, [reloadTopics]);

  return {
    subjects,
    tasks,
    sessions,
    papers,
    paperMeta,
    topics: { value: topics, setValue: setTopics, failed: topicsFailed, reload: reloadTopics },
  };
}
