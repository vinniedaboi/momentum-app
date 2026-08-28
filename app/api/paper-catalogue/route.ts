import { catalogueFacets, catalogueRowsByIds, catalogueSubjectDirectory, queryCatalogue } from "../../../lib/catalogue-db";
import { withWorkspace } from "../../../lib/auth";

export const runtime = "nodejs";

const MAX_PAGE_SIZE = 100;

function list(params: URLSearchParams, key: string) {
  return (params.get(key) ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 60);
}

// The paper catalogue is shared reference data, so no workspace filter is
// applied — but it still requires a session, like every other endpoint.
export async function GET(request: Request) {
  return withWorkspace(async () => {
    try {
      const params = new URL(request.url).searchParams;

      if (params.get("directory") === "1") {
        return Response.json({ subjects: await catalogueSubjectDirectory() });
      }

      if (params.get("facets") === "1") {
        return Response.json({
          facets: await catalogueFacets(
            params.get("qualification") ?? undefined,
            params.get("subject") ?? undefined,
          ),
        });
      }

      const ids = list(params, "ids");
      if (params.get("byIds") === "1") {
        return Response.json({ rows: await catalogueRowsByIds(ids) });
      }

      const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(params.get("pageSize")) || 25));
      const page = Math.max(1, Number(params.get("page")) || 1);

      const { total, rows } = await queryCatalogue({
        qualification: params.get("qualification") || undefined,
        subject: params.get("subject") || undefined,
        stage: params.get("stage") || undefined,
        years: list(params, "years").map(Number).filter(Number.isFinite),
        seasons: list(params, "seasons"),
        components: list(params, "components"),
        variants: list(params, "variants"),
        difficulties: list(params, "difficulties"),
        ids,
        search: params.get("search")?.trim().slice(0, 80) || undefined,
        sort: params.get("sort") ?? "year-desc",
        page,
        pageSize,
      });

      return Response.json({ total, rows, page, pageSize });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Could not load the paper catalogue." }, { status: 500 });
    }
  });
}
