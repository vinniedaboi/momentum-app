/**
 * Stage rules used to be if-statements keyed on subject names. They are now
 * per-subject configuration, so a new subject can define its own AS/A2 split —
 * or opt out of stages entirely, which is what non-A-Level syllabuses need.
 */

/**
 * What a subject calls one part of its course. The A levels split into AS and
 * A2, the IB Diploma into SL and HL, and subject settings lets a learner name
 * their own, so a stage is whichever label that subject carries rather than one
 * fixed pair.
 */
export type SyllabusStage = string;

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

/**
 * The stage pairs the app knows, and the stage unmarked content belongs to in
 * each. That fallback is not simply the last stage: an A Level syllabus marks
 * its AS content and leaves the rest to A2, while an IB course marks the
 * material only HL students take and leaves the rest to SL, which both levels
 * share. Anything else — a pair a learner typed in themselves — falls to its
 * last stage, the reading that matches how the presets are worded.
 */
const STAGE_SCALES: Array<{
  stages: string[];
  fallback: SyllabusStage;
  /** What each stage is, spelled out for a stage picker. */
  captions: Record<string, string>;
  /** Other spellings a syllabus uses for a stage. */
  aliases: Record<string, string[]>;
}> = [
  {
    stages: ["AS", "A2"],
    fallback: "A2",
    captions: { AS: "First year", A2: "Second year" },
    aliases: {},
  },
  {
    stages: ["SL", "HL"],
    fallback: "SL",
    captions: { SL: "Standard level", HL: "Higher level" },
    // Guides write "AHL" where a topic carries additional higher level content.
    aliases: { HL: ["AHL"] },
  },
];

/** Every stage name the app ships a scale for, for a picker with no subject behind it. */
export const KNOWN_STAGES: SyllabusStage[] = STAGE_SCALES.flatMap((scale) => scale.stages);

function scaleFor(stages: string[]) {
  return STAGE_SCALES.find((scale) =>
    scale.stages.length === stages.length && scale.stages.every((stage, index) => stage === stages[index]));
}

export function subjectHasStages(subject: StageSubject | null | undefined) {
  return Boolean(subject && subject.stages.length > 1);
}

/** The stage a subject falls back to when nothing else identifies one. */
export function defaultStage(subject: StageSubject | null | undefined): SyllabusStage {
  const stages = subject?.stages ?? [];
  return scaleFor(stages)?.fallback ?? stages[stages.length - 1] ?? "A2";
}

/** The stage a stage picker opens on. */
export function firstStage(subject: StageSubject | null | undefined): SyllabusStage {
  return subject?.stages[0] ?? defaultStage(subject);
}

/** The stage the picker should show, keeping a chosen one only while it applies. */
export function currentStage(subject: StageSubject | null | undefined, chosen: SyllabusStage) {
  return subject?.stages.includes(chosen) ? chosen : firstStage(subject);
}

/** What a stage is called in full, where its scale has a name for it. */
export function stageCaption(subject: StageSubject | null | undefined, stage: SyllabusStage) {
  return scaleFor(subject?.stages ?? [])?.captions[stage] ?? "";
}

/** Every spelling of `stage` a syllabus might mark its content with. */
function spellings(stage: SyllabusStage, subject: StageSubject | null | undefined) {
  return [stage, ...(scaleFor(subject?.stages ?? [])?.aliases[stage] ?? [])];
}

function marks(level: string, stage: SyllabusStage, subject: StageSubject | null | undefined) {
  return spellings(stage, subject).some((name) => new RegExp(`\\b${name}\\b`, "i").test(level));
}

function chapterStage(topic: StageTopic, subject: StageSubject | null | undefined): SyllabusStage {
  // A chapter that names one of the subject's own stages belongs to it.
  const level = topic.academicLevel ?? "";
  const named = subject?.stages.find((stage) => marks(level, stage, subject));
  if (named) return named;

  const mapped = topic.paper ? subject?.paperStages[topic.paper] : undefined;
  if (mapped && subject?.stages.includes(mapped)) return mapped;

  // Cambridge marks the second year of an A Level as "A Level", not "A2".
  if (/A Level/i.test(level) && subject?.stages.includes("A2")) return "A2";
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
 *
 * The IB Diploma splits by level rather than by year: every student takes the
 * SL course and HL adds to it. Which of its subjects offer both is per-subject
 * data the syllabus directory carries, so this is only the default for one it
 * has nothing to say about.
 */
const SINGLE_STAGE = /IGCSE|O Level|^(?:OCR|Edexcel) A Level$/i;
const LEVELLED = /^IB /i;

export function stagesForQualification(qualification: string) {
  if (LEVELLED.test(qualification)) return ["SL", "HL"];
  return SINGLE_STAGE.test(qualification) ? ["A2"] : ["AS", "A2"];
}
