import { api } from "./api";

/**
 * Every route the browser talks to, and the shape of each call.
 *
 * This is the only module that knows an API path or an HTTP verb. Views ask for
 * `studyApi.tasks.create(input)` and get back the parsed payload; they never
 * assemble a URL, pick a method, or decide that a write is a PATCH rather than
 * a POST. Response types stay generic so the domain types can go on living
 * beside the views that render them.
 */

/** Some tables key on text, others on a bigint; the query string takes either. */
type Identifier = string | number;

const PATHS = {
  topics: "/api/topics",
  subjects: "/api/subjects",
  tasks: "/api/tasks",
  studyHours: "/api/study-hours",
  pastPapers: "/api/past-papers",
  paperMeta: "/api/paper-meta",
  paperCatalogue: "/api/paper-catalogue",
  goals: "/api/goals",
  exams: "/api/exams",
  flashcards: "/api/flashcards",
  notes: "/api/notes",
  topicActivity: "/api/topic-activity",
  syllabus: "/api/syllabus",
  onboarding: "/api/onboarding",
} as const;

const id = (path: string, value: Identifier) => `${path}?id=${encodeURIComponent(value)}`;

export const studyApi = {
  topics: {
    path: PATHS.topics,
    /** Status changes and review logging, for one topic or a selected set. */
    update: <T>(body: unknown) => api.patch<T>(PATHS.topics, body),
    /** Bulk syllabus import for a subject. */
    import: <T>(body: unknown) => api.post<T>(PATHS.topics, body),
  },

  subjects: {
    path: PATHS.subjects,
    create: <T>(body: unknown) => api.post<T>(PATHS.subjects, body),
    /** Also carries archive toggles and `{ order: id[] }` reordering. */
    update: <T>(body: unknown) => api.patch<T>(PATHS.subjects, body),
    remove: <T>(subjectId: Identifier) => api.remove<T>(id(PATHS.subjects, subjectId)),
  },

  tasks: {
    path: PATHS.tasks,
    create: <T>(body: unknown) => api.post<T>(PATHS.tasks, body),
    update: <T>(body: unknown) => api.patch<T>(PATHS.tasks, body),
    remove: <T>(taskId: Identifier) => api.remove<T>(id(PATHS.tasks, taskId)),
  },

  studyHours: {
    path: PATHS.studyHours,
    log: <T>(body: unknown) => api.post<T>(PATHS.studyHours, body),
    remove: <T>(sessionId: Identifier) => api.remove<T>(id(PATHS.studyHours, sessionId)),
  },

  pastPapers: {
    path: PATHS.pastPapers,
    create: <T>(body: unknown) => api.post<T>(PATHS.pastPapers, body),
    update: <T>(body: unknown) => api.patch<T>(PATHS.pastPapers, body),
    remove: <T>(paperId: Identifier) => api.remove<T>(id(PATHS.pastPapers, paperId)),
  },

  paperMeta: {
    path: PATHS.paperMeta,
    /** Difficulty and resource link. Upserts, so there is no separate update. */
    save: <T>(body: unknown) => api.post<T>(PATHS.paperMeta, body),
  },

  paperCatalogue: {
    /** The catalogue is paged and filtered, so the caller builds the query. */
    search: <T>(params: URLSearchParams) => api.get<T>(`${PATHS.paperCatalogue}?${params}`),
    directory: <T>() => api.get<T>(`${PATHS.paperCatalogue}?directory=1`),
  },

  goals: {
    path: PATHS.goals,
    /** Upserts the goal for one subject and stage, and re-paces its topics. */
    save: <T>(body: unknown) => api.post<T>(PATHS.goals, body),
    remove: <T>(subjectId: Identifier, stage: string) =>
      api.remove<T>(`${PATHS.goals}?subjectId=${encodeURIComponent(subjectId)}&stage=${encodeURIComponent(stage)}`),
  },

  exams: {
    path: PATHS.exams,
    create: <T>(body: unknown) => api.post<T>(PATHS.exams, body),
    update: <T>(body: unknown) => api.patch<T>(PATHS.exams, body),
    remove: <T>(examId: Identifier) => api.remove<T>(id(PATHS.exams, examId)),
  },

  flashcards: {
    path: PATHS.flashcards,
    /** Decks, cards, imports and ratings all post to the one route. */
    send: <T>(body: unknown) => api.post<T>(PATHS.flashcards, body),
    rate: <T>(body: unknown) => api.patch<T>(PATHS.flashcards, body),
    remove: <T>(kind: "deck" | "card", itemId: Identifier) =>
      api.remove<T>(`${PATHS.flashcards}?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(itemId)}`),
  },

  notes: {
    path: PATHS.notes,
    /** Multipart, because the note is a file. */
    upload: <T>(form: FormData) => api.upload<T>(PATHS.notes, form),
    remove: <T>(noteId: Identifier) => api.remove<T>(id(PATHS.notes, noteId)),
  },

  topicActivity: {
    /** Scoped to one topic, or to a chapter and everything under it. */
    list: <T>(query: string) => api.get<T>(`${PATHS.topicActivity}${query}`),
    addNote: <T>(body: unknown) => api.post<T>(PATHS.topicActivity, body),
  },

  syllabus: {
    versions: <T>() => api.get<T>(PATHS.syllabus),
    content: <T>(recordId: string) => api.get<T>(`${PATHS.syllabus}?content=${encodeURIComponent(recordId)}`),
  },

  onboarding: {
    complete: <T>(body: unknown) => api.post<T>(PATHS.onboarding, body),
    /** The chapters of the chosen syllabuses, read before any of them import. */
    chapters: <T>(keys: string[]) =>
      api.get<T>(`${PATHS.onboarding}?keys=${encodeURIComponent(keys.join(","))}`),
  },
} as const;
