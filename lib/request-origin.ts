import type { NextRequest } from "next/server";

/**
 * The origin the browser actually used.
 *
 * `request.nextUrl.origin` is the internal URL once the app is behind a proxy,
 * so on Vercel it can come back as the private host — or as `http://` on a site
 * served over HTTPS, which turns an auth redirect into a broken link. The
 * forwarded headers carry what the browser asked for, so they win.
 *
 * Deliberately not using NEXT_PUBLIC_SITE_URL here: preview deployments each
 * have their own origin, and sending a preview's sign-in back to production
 * would drop the session on the wrong domain.
 */
export function requestOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  if (!host) return request.nextUrl.origin;

  const forwardedProto = request.headers.get("x-forwarded-proto");
  // A comma-separated chain can arrive through more than one proxy hop.
  const proto = forwardedProto?.split(",")[0].trim()
    ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");

  return `${proto}://${host}`;
}
