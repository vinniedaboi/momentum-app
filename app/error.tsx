"use client"; // Error boundaries must be Client Components.

import { useEffect } from "react";
import Link from "next/link";

/**
 * Catches uncaught exceptions from any page below the root layout.
 *
 * Without this file a server-side throw renders nothing at all, which on a
 * phone in dark mode looks exactly like a black screen — no message, no
 * reference, nothing to act on. A missing environment variable and a genuine
 * bug are indistinguishable in that state.
 *
 * `digest` is the only part of a Server Component error that survives the trip
 * to the browser: Next replaces the message with a generic one so a stack
 * trace cannot leak, and the digest is the hash that matches the entry in the
 * Vercel runtime log. Showing it turns "it broke" into a searchable key.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  /** Re-renders the segment. Named `retry` in Next 16; it was `reset` before. */
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="onboarding-shell">
      <div className="onboarding-card">
        <h2>Something went wrong</h2>
        <p className="muted">
          This page could not be loaded. It is usually temporary — trying again
          is worth a shot before anything else.
        </p>

        {error.digest ? (
          <p className="auth-alert error">
            Reference <strong>{error.digest}</strong> — quote this if you report
            the problem. It matches the server log entry for this exact failure.
          </p>
        ) : null}

        <button type="button" className="auth-submit" onClick={() => retry()}>
          Try again
        </button>

        <p className="auth-swap">
          Still stuck? <Link href="/login">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}
