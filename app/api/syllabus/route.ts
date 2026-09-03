import { getSyllabusAssessment, getSyllabusContent, getSyllabusVersions } from "../../../lib/syllabus-db";
import { withWorkspace } from "../../../lib/auth";

export const runtime = "nodejs";

// The syllabus directory is shared reference data, so no workspace filter is
// applied — but it still requires a session, like every other endpoint.
export async function GET(request: Request) {
  return withWorkspace(async () => {
    try {
      const params = new URL(request.url).searchParams;
      const recordId = params.get("content");
      if (recordId) {
        return Response.json({ content: await getSyllabusContent(recordId) });
      }
      // What each paper of a syllabus is worth, for the grade planner.
      const code = params.get("assessment");
      if (code) {
        return Response.json({ assessment: await getSyllabusAssessment(code) });
      }
      return Response.json({ versions: await getSyllabusVersions() });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Could not load the syllabus directory." }, { status: 500 });
    }
  });
}
