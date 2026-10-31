"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { request } from "../lib/api";
import { useSession } from "./AppShell";
export default function AuthForm({ register = false }: { register?: boolean }) {
  if (process.env.NEXT_PUBLIC_STATIC_DEMO === "true")
    return (
      <div className="page-container">
        <section className="panel empty-state">
          <h1>Published demo</h1>
          <p>
            GitHub Pages does not run the account API or database. Explore the
            published scenarios without signing in.
          </p>
          <Link className="button primary" href="/optimize">
            Explore scenarios
          </Link>
        </section>
      </div>
    );
  return <LiveAuthForm register={register} />;
}
function LiveAuthForm({ register = false }: { register?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { refresh } = useSession();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request(register ? "/auth/register" : "/auth/login", "POST", {
        email,
        password,
        ...(register ? { display_name: name } : {}),
      });
      await refresh();
      router.replace("/optimize");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <section className="panel auth-card">
        <span className="auth-icon">
          <LockKeyhole size={24} />
        </span>
        <span className="eyebrow">YOUR DECISIONS. YOUR WORKSPACE.</span>
        <h1>{register ? "Create your account." : "Welcome back."}</h1>
        <p>Save private scenarios and revisit your network decisions.</p>
        {error && (
          <div role="alert" className="error-panel">
            {error}
          </div>
        )}
        <form onSubmit={(e) => void submit(e)}>
          {register && (
            <label>
              Display name
              <input
                autoComplete="name"
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              minLength={register ? 10 : 1}
              maxLength={128}
              required
              autoComplete={register ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {register && (
            <p className="micro">
              Use at least 10 characters. No default credentials.
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
            <ArrowRight size={17} />
          </button>
        </form>
        <p>
          {register ? "Already have an account?" : "New to SAF Command?"}{" "}
          <Link href={register ? "/login" : "/register"}>
            {register ? "Sign in" : "Create an account"}
          </Link>
        </p>
        <Link href="/optimize" className="guest-link">
          Continue in the isolated guest workspace →
        </Link>
      </section>
    </div>
  );
}
