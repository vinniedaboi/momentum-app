import { withWorkspace } from "../../../lib/auth";
import { getHistory, getHistoryCounts, HISTORY_KINDS, type HistoryKind } from "../../../lib/history-db";

export const runtime = "nodejs";

/**
 * The activity feed, a page at a time.
 *
 * `before` is the timestamp of the last row already shown rather than an
 * offset: activity arrives at the top of this list, and an offset would repeat
 * or skip rows every time it did.
 */
export async function GET(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const params = new URL(request.url).searchParams;
      const before = params.get("before");
      const requested = (params.get("kinds") ?? "")
        .split(",").map((kind) => kind.trim()).filter(Boolean);
      const kinds = requested.filter((kind): kind is HistoryKind =>
        (HISTORY_KINDS as readonly string[]).includes(kind));

      const page = await getHistory(workspaceId, { before, kinds });
      // The counts do not change as you page, so they ride along only with the
      // first request rather than being recounted for every scroll.
      const counts = before ? undefined : await getHistoryCounts(workspaceId);

      return Response.json({ ...page, ...(counts ? { counts } : {}) });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Your history could not be loaded." }, { status: 500 });
    }
  });
}
