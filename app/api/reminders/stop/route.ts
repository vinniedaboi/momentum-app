import { verifyUnsubscribeToken } from "../../../../lib/email";
import { stopReminders } from "../../../../lib/reminders-db";

export const runtime = "nodejs";

/**
 * Turns reminders off from the link in the footer of one.
 *
 * Reachable without a session on purpose, and listed in the proxy's public
 * prefixes for that reason. Someone who has stopped opening the app is exactly
 * who clicks this, and putting a sign-in page in front of it is how an
 * unsubscribe becomes a spam complaint instead.
 *
 * It answers with a page rather than JSON because a person is reading it.
 */
function page(title: string, body: string, status: number) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${title} · Momentum</title></head>`
    + `<body style="margin:0;background:#f4f7f1;font-family:-apple-system,Segoe UI,sans-serif">`
    + `<div style="max-width:440px;margin:0 auto;padding:80px 24px;text-align:center">`
    + `<p style="margin:0 0 24px;color:#2f7d6c;font-size:18px;font-weight:800">Momentum</p>`
    + `<h1 style="margin:0 0 12px;color:#263b35;font-size:22px">${title}</h1>`
    + `<p style="margin:0 0 24px;color:#687487;font-size:15px;line-height:1.6">${body}</p>`
    + `<a href="/" style="display:inline-block;background:#2f7d6c;color:#fff;text-decoration:none;`
    + `border-radius:8px;padding:12px 20px;font-size:14px;font-weight:700">Open Momentum</a>`
    + `</div></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  let workspaceId: string | null = null;
  try {
    workspaceId = verifyUnsubscribeToken(token);
  } catch {
    // REMINDER_SECRET missing. Nothing the reader can do, and nothing worth
    // telling them beyond that the link did not work.
    workspaceId = null;
  }

  if (!workspaceId) {
    return page(
      "That link did not work",
      "Email clients sometimes break long links. Try opening it again from the original message.",
      400,
    );
  }

  const stopped = await stopReminders(workspaceId);
  if (!stopped) {
    return page(
      "That link did not work",
      "Email clients sometimes break long links. Try opening it again from the original message.",
      400,
    );
  }
  return page("Reminders are off", "You will not get any more study reminders by email. Nothing else about your account has changed.", 200);
}
