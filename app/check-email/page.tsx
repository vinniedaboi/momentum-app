import type { Metadata } from "next";
import Link from "next/link";
import AuthAside from "../auth-aside";

export const metadata: Metadata = {
  title: "Confirm your email · Momentum",
};

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <main className="auth-shell">
      <AuthAside />
      <div className="auth-main">
        <div className="auth-card">
          <h2>Check your inbox</h2>
          <p className="muted">
            We sent a confirmation link{email ? ` to ${email}` : ""}. Open it to
            finish setting up your account.
          </p>
          <p className="auth-alert info">
            The link signs you in and takes you straight to onboarding. It can
            take a minute to arrive — check spam if you do not see it.
          </p>
          <p className="auth-swap">
            Already confirmed? <Link href="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
