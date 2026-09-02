import type { MetadataRoute } from "next";
import { headers } from "next/headers";

/**
 * Crawlers get the landing page and the two account screens, and nothing else.
 *
 * Everything under /api answers with a learner's own data or refuses; the app
 * itself is behind a session and would only ever serve a crawler a redirect;
 * and /onboarding and /auth are steps in a flow rather than pages worth
 * indexing. Disallowing them keeps the index to the one page that is actually
 * addressed to a stranger.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host") ?? "localhost:3000";
  const origin = `${host.includes("localhost") ? "http" : "https"}://${host}`;

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/onboarding", "/auth/"],
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
