/**
 * Stage rules used to be if-statements keyed on subject names. They are now
 * per-subject configuration, so a new subject can define its own AS/A2 split —
 * or opt out of stages entirely, which is what non-A-Level syllabuses need.
 */
export type SyllabusStage = "AS" | "A2";

export type StageSubject = {
  id: string;
  stages: string[];
  paperStages: Record<string, string>;
};

type StageTopic = {
  id: string;
  subjectId: string;
  paper: string | null;
  academicLevel: string | null;
  kind: "chapter" | "point";
  parentId: string | null;
};

export function subjectHasStages(subject: StageSubject | null | undefined) {
  return Boolean(subject && subject.stages.length > 1);
}

/** The stage a subject falls back to when nothing else identifies one. */
export function defaultStage(subject: StageSubject | null | undefined): SyllabusStage {
  const last = subject?.stages[subject.stages.length - 1];
  return last === "AS" ? "AS" : "A2";
}

function chapterStage(topic: StageTopic, subject: StageSubject | null | undefined): SyllabusStage {
  const level = topic.academicLevel ?? "";
  if (/^AS\b/i.test(level)) return "AS";
  if (/\bA2\b/i.test(level)) return "A2";

  const mapped = topic.paper ? subject?.paperStages[topic.paper] : undefined;
  if (mapped === "AS" || mapped === "A2") return mapped;

  if (/A Level/i.test(level)) return "A2";
  return defaultStage(subject);
}

export function getTopicStage(
  topic: StageTopic,
  topics: StageTopic[],
  subject: StageSubject | null | undefined,
): SyllabusStage {
  if (topic.kind === "chapter") return chapterStage(topic, subject);
  const chapter = topics.find((item) => item.id === topic.parentId);
  return chapter ? chapterStage(chapter, subject) : defaultStage(subject);
}

/**
 * IGCSE and O Level are single-stage. So are the UK A levels: AS has been a
 * separate qualification rather than the first half of one since 2015, so there
 * is no second year to split off — except AQA's, whose specifications mark the
 * content lying beyond the AS subset. That marking is the only place any UK
 * board states which year content belongs to, and it is what makes a
 * first-year/second-year split mean anything.
 */
const SINGLE_STAGE = /IGCSE|O Level|^(?:OCR|Edexcel) A Level$/i;

export function stagesForQualification(qualification: string) {
  return SINGLE_STAGE.test(qualification) ? ["A2"] : ["AS", "A2"];
}
