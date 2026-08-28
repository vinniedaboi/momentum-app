import type { Metadata } from "next";
import AuthAside from "../auth-aside";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Sign in · Momentum",
};

/** Only same-origin paths are accepted, so `next` cannot become an open redirect. */
function safeNextPath(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="auth-shell">
      <AuthAside />
      <div className="auth-main">
        <LoginForm nextPath={safeNextPath(next)} />
      </div>
    </main>
  );
}
