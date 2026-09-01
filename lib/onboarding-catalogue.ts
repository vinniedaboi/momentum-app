import { catalogueSubjectDirectory } from "./catalogue-db";
import { series } from "./db";
import { getSyllabusContent, getSyllabusVersions } from "./syllabus-db";
import { seedTopics } from "./seed-data";
import { STARTER_SUBJECTS, subjectSlug, type SubjectTone } from "./subjects-db";
import { templateTopicCount } from "./topics-db";
import { stagesForQualification } from "../app/syllabus-stage";

/**
 * The subject list onboarding offers, merged from every source that can supply
 * a syllabus:
 *
 *   bundled  — the hand-checked trees in lib/seed-data.ts. Richest, but only
 *              four subjects.
 *   official — chapter/point trees parsed from Cambridge's own PDFs into
 *              syllabus_content.
 *   empty    — in the past-paper catalogue but with no syllabus yet. Still
 *              worth offering: papers, tasks and hours all work without one,
 *              and a syllabus can be imported later from subject settings.
 *
 * One card per subject. Where several sources cover the same syllabus code the
 * richest wins, so a learner never sees Mathematics listed twice.
 */

export type OnboardingSubject = {
  /** Stable id the client sends back; validated against this list server-side. */
  key: string;
  /**
   * The `subjects.id` this pick becomes. Bundled subjects keep their canonical
   * id because seed-data topic ids are prefixed with it (`mathematics-5`), and
   * one of them does not match its slug: Further Mathematics -> further-math.
   */
  subjectId: string;
  name: string;
  shortName: string | null;
  qualification: string;
  board: string;
  syllabusCode: string | null;
  stages: string[];
  paperStages: Record<string, string>;
  tone: SubjectTone;
  source: "bundled" | "official" | "empty";
  /** Set for `official`; identifies the syllabus_content rows to import. */
  recordId: string | null;
  /** Rows the syllabus will arrive with. */
  topicCount: number;
  /** Past papers in the shared catalogue, for context on the card. */
  papers: number;
};

const AUTO_TONES: SubjectTone[] = ["blue", "violet", "coral", "teal", "amber", "rose", "lime", "slate"];

function shortNameFor(subject: string) {
  const words = subject.split(/\s+/).filter(Boolean);
  if (words.length === 1) return subject.slice(0, 4);
  return words.map((word) => word[0]).join("").slice(0, 5);
}

export function onboardingKey(qualification: string, subject: string) {
  return `${subjectSlug(qualification)}:${subjectSlug(subject)}`;
}

/** Bundled templates, indexed by the syllabus code they correspond to. */
const BUNDLED_BY_CODE = new Map(
  STARTER_SUBJECTS.filter((subject) => subject.syllabusCode).map((subject) => [subject.syllabusCode!, subject]),
);

export async function availableOnboardingSubjects(): Promise<OnboardingSubject[]> {
  const [directory, versions] = await series([
    () => catalogueSubjectDirectory(),
    () => getSyllabusVersions(),
  ]);

  // Best parsed version per syllabus code — current first, then latest, and
  // never one whose PDF has not been parsed yet.
  const officialByCode = new Map<string, (typeof versions)[number]>();
  for (const version of versions) {
    if (!version.chapters && !version.points) continue;
    const existing = officialByCode.get(version.syllabusCode);
    if (!existing || (version.isCurrent && !existing.isCurrent)) {
      officialByCode.set(version.syllabusCode, version);
    }
  }

  const seenCodes = new Set<string>();
  const subjects: OnboardingSubject[] = [];

  directory.forEach((entry, index) => {
    const code = entry.code || null;
    // The same code can appear under more than one qualification label; keep
    // the first, which the directory already orders sensibly.
    if (code && seenCodes.has(code)) return;
    if (code) seenCodes.add(code);

    const bundled = code ? BUNDLED_BY_CODE.get(code) : undefined;
    const official = code ? officialByCode.get(code) : undefined;

    const source: OnboardingSubject["source"] = bundled ? "bundled" : official ? "official" : "empty";
    const topicCount = bundled
      ? templateTopicCount(bundled.id)
      : official
        ? official.chapters + official.points
        : 0;

    subjects.push({
      key: onboardingKey(entry.qualification, entry.subject),
      subjectId: bundled?.id ?? subjectSlug(entry.subject),
      name: bundled?.name ?? entry.subject,
      shortName: bundled?.shortName ?? shortNameFor(entry.subject),
      qualification: entry.qualification,
      board: entry.board || "CAIE",
      syllabusCode: code,
      stages: bundled?.stages ?? entry.stages ?? stagesForQualification(entry.qualification),
      paperStages: bundled?.paperStages ?? {},
      tone: bundled?.tone ?? AUTO_TONES[index % AUTO_TONES.length],
      source,
      recordId: bundled ? null : official?.recordId ?? null,
      topicCount,
      papers: entry.papers,
    });
  });

  // A parsed syllabus with no papers in the catalogue would otherwise be
  // invisible — A Level Accounting (9706) is exactly that. The catalogue is the
  // main source, but the list is the union of both.
  for (const [code, version] of officialByCode) {
    if (seenCodes.has(code)) continue;
    seenCodes.add(code);
    subjects.push({
      key: onboardingKey(version.qualification, version.subject),
      subjectId: subjectSlug(version.subject),
      name: version.subject,
      shortName: shortNameFor(version.subject),
      qualification: version.qualification,
      board: version.board || "CAIE",
      syllabusCode: code,
      stages: version.stages ?? stagesForQualification(version.qualification),
      paperStages: {},
      tone: AUTO_TONES[subjects.length % AUTO_TONES.length],
      source: "official",
      recordId: version.recordId,
      topicCount: version.chapters + version.points,
      papers: 0,
    });
  }

  // A catch-all for revision that is not tied to a syllabus.
  const general = STARTER_SUBJECTS.find((subject) => subject.id === "general");
  if (general) {
    subjects.push({
      key: onboardingKey("General", general.name),
      subjectId: general.id,
      name: general.name,
      shortName: general.shortName,
      qualification: "General",
      board: "",
      syllabusCode: null,
      stages: general.stages,
      paperStages: general.paperStages,
      tone: general.tone,
      source: "empty",
      recordId: null,
      topicCount: 0,
      papers: 0,
    });
  }

  return subjects.sort(
    (a, b) => a.qualification.localeCompare(b.qualification) || a.name.localeCompare(b.name),
  );
}

/** A chapter a learner can say they are already working on, before it is imported. */
export type PreviewChapter = { code: string; title: string; points: number };
export type SubjectChapters = { key: string; subjectId: string; name: string; chapters: PreviewChapter[] };

/**
 * The chapters of the syllabuses a learner has picked, read before any of them
 * are imported.
 *
 * Onboarding asks what they are already working on, and it has to ask before the
 * import so that the import and the answer can be applied in one submission. The
 * two sources are read the same way they are seeded: an official syllabus from
 * `syllabus_content`, a bundled one from the template that ships with the app.
 */
export async function previewChapters(picks: OnboardingSubject[]): Promise<SubjectChapters[]> {
  const out: SubjectChapters[] = [];
  const seen = new Set<string>();

  for (const pick of picks) {
    if (seen.has(pick.subjectId)) continue;
    seen.add(pick.subjectId);

    let rows: Array<{ code: string; title: string; kind: "chapter" | "point"; parentCode: string | null }> = [];
    if (pick.source === "official" && pick.recordId) {
      rows = (await getSyllabusContent(pick.recordId)).map((row) => ({
        code: row.code, title: row.title, kind: row.kind, parentCode: row.parentCode,
      }));
    } else if (pick.source === "bundled") {
      rows = seedTopics
        .filter((topic) => subjectSlug(topic.subject) === pick.subjectId)
        .map((topic) => ({
          code: topic.code,
          title: topic.title,
          kind: topic.kind,
          // Seed topics carry a parent id rather than a parent code; the code is
          // what the chapter list is keyed on, so resolve it through the ids.
          parentCode: topic.parentId
            ? seedTopics.find((item) => item.id === topic.parentId)?.code ?? null
            : null,
        }));
    }

    const counts = new Map<string, number>();
    for (const row of rows) {
      if (row.kind !== "point" || !row.parentCode) continue;
      counts.set(row.parentCode, (counts.get(row.parentCode) ?? 0) + 1);
    }

    const chapters = rows
      .filter((row) => row.kind === "chapter")
      .map((row) => ({ code: row.code, title: row.title, points: counts.get(row.code) ?? 0 }))
      .filter((chapter) => chapter.points > 0);

    if (chapters.length) {
      out.push({ key: pick.key, subjectId: pick.subjectId, name: pick.name, chapters });
    }
  }
  return out;
}
