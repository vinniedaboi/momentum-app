import {
  getSessionBoundaries,
  getSyllabusAssessment,
  getSyllabusContent,
  getSyllabusSource,
  getSyllabusVersions,
} from "../../../lib/syllabus-db";
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
      // What each paper of a syllabus is worth, for the grade planner — and
      // the document those figures were read out of, so the screen showing them
      // can say where they came from and link the PDF rather than assert them.
      const code = params.get("assessment");
      if (code) {
        const [assessment, source] = await Promise.all([
          getSyllabusAssessment(code),
          getSyllabusSource(code),
        ]);
        return Response.json({ assessment, source });
      }
      // What each grade took in past sessions of a syllabus, so the grade
      // screen can offer the board's own boundaries rather than only the
      // standard bands. Scoped to one award, because AS and A Level are
      // different qualifications made of different papers.
      const boundaryCode = params.get("boundaries");
      if (boundaryCode) {
        const award = params.get("award") || "A Level";
        return Response.json({ sessions: await getSessionBoundaries(boundaryCode, award) });
      }
      return Response.json({ versions: await getSyllabusVersions() });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Could not load the syllabus directory." }, { status: 500 });
    }
  });
}
