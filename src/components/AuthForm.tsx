"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Input, Label, Spinner } from "./ui";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const demoEnabled = process.env.NEXT_PUBLIC_DEMO_ENABLED === "true";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Something went wrong.");
      return;
    }
    if (data.needsConfirmation) {
      setNotice("Check your email to confirm your account, then sign in.");
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function startDemo() {
    setDemoLoading(true);
    setError(null);
    const res = await fetch("/api/auth/demo", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setDemoLoading(false);
    if (!res.ok) {
      setError(data.error || "Demo is unavailable.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-semibold text-ink">
        {mode === "login" ? "Sign in" : "Create your account"}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        {mode === "login" ? "Welcome back." : "Connect your inbox and start organizing."}
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && <p className="text-sm text-emerald-600">{notice}</p>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading && <Spinner />}
          {mode === "login" ? "Sign in" : "Create account"}
        </Button>
      </form>

      {demoEnabled && (
        <>
          <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" />
          </div>
          <Button variant="secondary" onClick={startDemo} disabled={demoLoading} className="w-full">
            {demoLoading && <Spinner />}
            Explore the live demo
          </Button>
          <p className="mt-2 text-center text-xs text-slate-400">
            A seeded sample mailbox — no Gmail connection needed.
          </p>
        </>
      )}

      <p className="mt-6 text-center text-sm text-slate-500">
        {mode === "login" ? (
          <>
            New here?{" "}
            <Link href="/signup" className="font-medium text-brand-700 hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-brand-700 hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
