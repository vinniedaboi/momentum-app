import { getReviewPace } from "../../../lib/profile-db";
import { setReviewPace } from "../../../lib/topics-db";
import { normalisePace } from "../../topics";
import { withWorkspace } from "../../../lib/auth";

export const runtime = "nodejs";

export async function GET() {
  return withWorkspace(async (workspaceId) => {
    try {
      return Response.json({ pace: await getReviewPace(workspaceId) });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Could not load your review pace." }, { status: 500 });
    }
  });
}

/**
 * Saving a pace also re-dates the points already scheduled, so the response
 * carries the pace that was stored rather than the one that was asked for:
 * `normalisePace` rounds and clamps, and the board should show what the
 * scheduler is actually using.
 */
export async function PATCH(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const body = await request.json() as { pace?: Record<string, unknown> };
      if (!body.pace || typeof body.pace !== "object") {
        return Response.json({ error: "Choose a review pace." }, { status: 400 });
      }
      return Response.json({ pace: await setReviewPace(workspaceId, normalisePace(body.pace)) });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Your review pace could not be saved." }, { status: 500 });
    }
  });
}
