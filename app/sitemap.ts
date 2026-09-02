import type { MetadataRoute } from "next";
import { headers } from "next/headers";

/**
 * The three pages a stranger can reach. The app is behind a session, so there
 * is nothing else to list — a sitemap naming pages that answer with a redirect
 * is worse than a short one.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get("host") ?? "localhost:3000";
  const origin = `${host.includes("localhost") ? "http" : "https"}://${host}`;
  const lastModified = new Date();

  return [
    { url: origin, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/signup`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${origin}/login`, lastModified, changeFrequency: "monthly", priority: 0.5 },
  ];
}
