import { withWorkspace } from "../../../lib/auth";
import { completeOnboarding } from "../../../lib/profile-db";
import { createStarterSubjects, STARTER_SUBJECTS } from "../../../lib/subjects-db";
import { seedSubjectTopicsFromTemplate } from "../../../lib/topics-db";

export const runtime = "nodejs";

// Seeding several full A Level syllabuses is a few thousand inserts.
export const maxDuration = 60;

const STARTER_IDS = new Set(STARTER_SUBJECTS.map((subject) => subject.id));

export async function POST(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const body = await request.json() as {
        fullName?: string;
        qualification?: string;
        targetYear?: number;
        weeklyHoursTarget?: number;
        timezone?: string;
        subjectIds?: unknown;
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

      const subjectIds = Array.isArray(body.subjectIds)
        ? [...new Set(body.subjectIds.filter((id): id is string => typeof id === "string" && STARTER_IDS.has(id)))]
        : [];
      if (!subjectIds.length) {
        return Response.json({ error: "Pick at least one subject to track." }, { status: 400 });
      }

      await createStarterSubjects(workspaceId, subjectIds);
      for (const subjectId of subjectIds) {
        await seedSubjectTopicsFromTemplate(workspaceId, subjectId);
      }

      const profile = await completeOnboarding(workspaceId, {
        fullName,
        examBoard: body.qualification?.includes("Cambridge") ? "CAIE" : null,
        qualification: body.qualification?.trim().slice(0, 80) || null,
        targetYear,
        weeklyHoursTarget,
        timezone: body.timezone?.trim().slice(0, 60) || "Asia/Singapore",
      });

      return Response.json({ profile, subjects: subjectIds.length });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Your workspace could not be set up." }, { status: 500 });
    }
  });
}
