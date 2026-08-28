import type { Metadata } from "next";
import AuthAside from "../auth-aside";
import SignupForm from "./signup-form";

export const metadata: Metadata = {
  title: "Create your account · Momentum",
};

export default function SignupPage() {
  return (
    <main className="auth-shell">
      <AuthAside />
      <div className="auth-main">
        <SignupForm />
      </div>
    </main>
  );
}
