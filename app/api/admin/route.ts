import { withAdmin } from "../../../lib/admin";
import { getAdminActivity } from "../../../lib/admin-db";
import { HISTORY_KINDS, type HistoryKind } from "../../../lib/history-db";

export const runtime = "nodejs";

/**
 * The operator console's feed, a page at a time.
 *
 * Read-only by design: there is no POST here and there should not be one. A
 * console that can change other people's data is a much larger promise than one
 * that can only report on it, and nothing about "see what users are doing"
 * needs the ability to write.
 *
 * The accounts table is rendered by the page itself rather than fetched — it
 * does not page, so it has no reason to be a second round trip.
 */
export async function GET(request: Request) {
  return withAdmin(async () => {
    try {
      const params = new URL(request.url).searchParams;
      const before = params.get("before");
      const account = params.get("account");
      const requested = (params.get("kinds") ?? "")
        .split(",").map((kind) => kind.trim()).filter(Boolean);
      const kinds = requested.filter((kind): kind is HistoryKind =>
        (HISTORY_KINDS as readonly string[]).includes(kind));

      return Response.json(await getAdminActivity({ before, kinds, account }));
    } catch (error) {
      console.error(error);
      return Response.json({ error: "That activity could not be loaded." }, { status: 500 });
    }
  });
}
