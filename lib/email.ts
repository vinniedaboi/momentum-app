import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Transactional email, through Brevo's HTTP API.
 *
 * The API rather than the SMTP relay Brevo also offers: a serverless function
 * is short-lived and would open, use and drop a TCP connection per send, which
 * is both slower and the shape of traffic that gets an account rate-limited.
 *
 * The From address must be on a domain Brevo has authenticated, or the mail is
 * signed by nobody and lands in spam. `momentumstudies.com` is authenticated on
 * this account; a gmail.com sender would fail DMARC alignment however verified
 * the address itself is.
 */

const ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const DEFAULT_SENDER = { name: "Momentum", email: "hello@momentumstudies.com" };

export type Mail = {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
  /** Grouped in Brevo's reporting, so a digest can be told from an activation mail. */
  tag: string;
};

function sender() {
  const email = process.env.REMINDER_FROM_EMAIL?.trim();
  const name = process.env.REMINDER_FROM_NAME?.trim();
  return {
    name: name || DEFAULT_SENDER.name,
    email: email || DEFAULT_SENDER.email,
  };
}

/** Sends one mail and returns Brevo's message id, or throws with what it said. */
export async function sendMail(mail: Mail): Promise<string | null> {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error("BREVO_API_KEY is not set.");

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "api-key": key,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: sender(),
      to: [{ email: mail.to, ...(mail.toName ? { name: mail.toName } : {}) }],
      subject: mail.subject,
      htmlContent: mail.html,
      textContent: mail.text,
      tags: [mail.tag],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Brevo refused the send (${response.status}): ${detail.slice(0, 300)}`);
  }
  const body = await response.json().catch(() => null) as { messageId?: string } | null;
  return body?.messageId ?? null;
}

/**
 * The unsubscribe link has to work with no session behind it — someone who
 * stopped opening the app is exactly who wants it, and asking them to sign in
 * first is how a working unsubscribe becomes a spam complaint.
 *
 * So the workspace id travels in the URL, signed. Signed rather than raw
 * because the id is a foreign key, not a secret: without a signature anyone
 * could turn off anyone else's mail by guessing.
 */
function signingKey() {
  const secret = process.env.REMINDER_SECRET;
  if (!secret) throw new Error("REMINDER_SECRET is not set.");
  return secret;
}

export function unsubscribeToken(workspaceId: string) {
  const mac = createHmac("sha256", signingKey()).update(workspaceId).digest("base64url");
  return `${workspaceId}.${mac}`;
}

/** The workspace a token names, or null if it was not signed by us. */
export function verifyUnsubscribeToken(token: string): string | null {
  const split = token.lastIndexOf(".");
  if (split <= 0) return null;
  const workspaceId = token.slice(0, split);
  const offered = Buffer.from(token.slice(split + 1));
  const expected = Buffer.from(createHmac("sha256", signingKey()).update(workspaceId).digest("base64url"));
  // Compared in constant time, and only once the lengths match — timingSafeEqual
  // throws rather than returning false when they do not.
  if (offered.length !== expected.length) return null;
  return timingSafeEqual(offered, expected) ? workspaceId : null;
}
