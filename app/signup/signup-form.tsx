"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

export default function SignupForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }

    setPending(true);
    setError(null);

    // The origin the user actually signed up on is the only one their session
    // can land on. NEXT_PUBLIC_SITE_URL is inlined at build time, so a stale or
    // local value silently sends every production confirmation to the wrong
    // host — and preview deployments each need their own origin anyway. Same
    // reasoning as lib/request-origin.ts on the receiving end.
    const origin = window.location.origin;

    const supabase = createSupabaseBrowserClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: `${origin}/auth/callback?next=/onboarding`,
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setPending(false);
      return;
    }

    // With email confirmation enabled Supabase returns a user but no session,
    // so the account is not usable until the link is clicked. With it disabled
    // the session arrives immediately and onboarding can start right away.
    if (data.session) {
      router.replace("/onboarding");
      router.refresh();
      return;
    }

    router.replace(`/check-email?email=${encodeURIComponent(email)}`);
  }

  return (
    <form className="auth-card" onSubmit={handleSubmit}>
      <h2>Start your revision plan</h2>
      <p className="muted">Free, with no limits on subjects, topics or papers.</p>

      {error ? <p className="auth-alert error">{error}</p> : null}

      <div className="auth-field">
        <label htmlFor="fullName">Your name</label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="Alex Tan"
        />
      </div>

      <div className="auth-field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@school.edu"
        />
      </div>

      <div className="auth-field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="At least 8 characters"
        />
        <small>At least 8 characters.</small>
      </div>

      <button className="auth-submit" type="submit" disabled={pending}>
        {pending ? "Creating your account…" : "Create account"}
      </button>

      <p className="auth-swap">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </form>
  );
}
