import Link from "next/link";
import { DISCLAIMER_SHORT } from "@/lib/constants";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-slate-50">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-semibold text-ink">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-brand-600 text-white">CI</span>
          CaseInbox
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-ink">
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Get started
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-20 pt-16 text-center">
        <h1 className="text-balance text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          Find the emails that matter — and preserve them properly.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
          Connect your inbox, ask in plain language, and walk away with an organized, preserved set
          of the emails that matter — ready to hand to a lawyer.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/signup"
            className="rounded-lg bg-brand-600 px-5 py-3 text-sm font-medium text-white hover:bg-brand-700"
          >
            Create an account
          </Link>
          <Link
            href="/login?demo=1"
            className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-ink hover:bg-slate-50"
          >
            Try the live demo
          </Link>
        </div>

        <div className="mt-16 grid gap-4 text-left sm:grid-cols-3">
          {[
            ["Read-only & private", "Only the read-only Gmail scope. Nothing is sent, deleted, or altered. Tokens encrypted."],
            ["Classified for you", "Every in-scope email is tagged by category and severity with the exact offending snippet."],
            ["Preservation-grade export", "Export originals with full headers (.eml) plus an AI summary — clearly separated."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="font-medium text-ink">{t}</h3>
              <p className="mt-1 text-sm text-slate-600">{d}</p>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-16 max-w-2xl text-xs text-slate-400">{DISCLAIMER_SHORT}</p>
      </main>
    </div>
  );
}
