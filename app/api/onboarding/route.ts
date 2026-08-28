import { withWorkspace } from "../../../lib/auth";
import { completeOnboarding } from "../../../lib/profile-db";
import { createSubjects, type SubjectSpec } from "../../../lib/subjects-db";
import { importSubjectTopics, seedSubjectTopicsFromTemplate, type ImportTopicRow } from "../../../lib/topics-db";
import { availableOnboardingSubjects } from "../../../lib/onboarding-catalogue";
import { getSyllabusContent } from "../../../lib/syllabus-db";

export const runtime = "nodejs";

// Seeding several full A Level syllabuses is a few thousand inserts.
export const maxDuration = 60;

/** More than this in one sitting is a mis-click, not a course load. */
const MAX_SUBJECTS = 12;

export async function POST(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const body = await request.json() as {
        fullName?: string;
        qualification?: string;
        targetYear?: number;
        weeklyHoursTarget?: number;
        timezone?: string;
        subjectKeys?: unknown;
      };

      const fullName = body.fullName?.trim().slice(0, 80) ?? "";
      if (!fullName) return Response.json({ error: "Tell us what to call you." }, { status: 400 });

      const targetYear = Number(body.targetYear);
      if (!Number.isInteger(targetYear) || targetYear < 2000 || targetYear > 2100) {
        return Response.json({ error: "Choose a valid exam year." }, { status: 400 });
      }

      const weeklyHoursTarget = Number(body.weeklyHoursTarget);
      if (!Number.isInteger(weeklyHoursTarget) || weeklyHoursTarget < 1 || weeklyHoursTarget > 80) {
        return Response.json({ error: "Choose between 1 and 80 study hours per week." }, { status: 400 });
      }

      const requested = Array.isArray(body.subjectKeys)
        ? [...new Set(body.subjectKeys.filter((key): key is string => typeof key === "string"))]
        : [];
      if (!requested.length) {
        return Response.json({ error: "Pick at least one subject to track." }, { status: 400 });
      }
      if (requested.length > MAX_SUBJECTS) {
        return Response.json({ error: `Choose up to ${MAX_SUBJECTS} subjects.` }, { status: 400 });
      }

      // The client only ever sends keys from this list, so resolving against it
      // is both the lookup and the validation.
      const available = await availableOnboardingSubjects();
      const byKey = new Map(available.map((subject) => [subject.key, subject]));
      const picks = requested.map((key) => byKey.get(key)).filter((pick) => pick !== undefined);
      if (!picks.length) {
        return Response.json({ error: "Those subjects are not available." }, { status: 400 });
      }

      // Two picks can collide on subject id (the same syllabus under different
      // qualification labels); the first wins, matching what the list shows.
      const specs: SubjectSpec[] = [];
      const claimed = new Set<string>();
      for (const pick of picks) {
        if (claimed.has(pick.subjectId)) continue;
        claimed.add(pick.subjectId);
        specs.push({
          id: pick.subjectId,
          name: pick.name,
          shortName: pick.shortName,
          tone: pick.tone,
          board: pick.board || null,
          qualification: pick.qualification === "General" ? null : pick.qualification,
          syllabusCode: pick.syllabusCode,
          stages: pick.stages,
          paperStages: pick.paperStages,
        });
      }

      await createSubjects(workspaceId, specs);

      let topicsLoaded = 0;
      for (const pick of picks) {
        if (!claimed.delete(pick.subjectId)) continue;

        if (pick.source === "bundled") {
          const result = await seedSubjectTopicsFromTemplate(workspaceId, pick.subjectId);
          topicsLoaded += result.chapters + result.points;
          continue;
        }

        if (pick.source === "official" && pick.recordId) {
          const content = await getSyllabusContent(pick.recordId);
          const rows: ImportTopicRow[] = content.map((row) => ({
            code: row.code,
            title: row.title,
            kind: row.kind,
            parentCode: row.parentCode,
            paper: null,
            section: null,
            academicLevel: row.academicLevel,
          }));
          if (rows.length) {
            const result = await importSubjectTopics(workspaceId, pick.subjectId, rows);
            topicsLoaded += result.chapters + result.points;
          }
        }
        // `empty` subjects are created without a syllabus, on purpose.
      }

      const profile = await completeOnboarding(workspaceId, {
        fullName,
        examBoard: body.qualification?.includes("Cambridge") ? "CAIE" : null,
        qualification: body.qualification?.trim().slice(0, 80) || null,
        targetYear,
        weeklyHoursTarget,
        timezone: body.timezone?.trim().slice(0, 60) || "Asia/Singapore",
      });

      return Response.json({ profile, subjects: specs.length, topics: topicsLoaded });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Your workspace could not be set up." }, { status: 500 });
    }
  });
}
