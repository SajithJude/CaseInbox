"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "./ui";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/chat", label: "Chat" },
  { href: "/case", label: "Case folder" },
  { href: "/connect", label: "Scan" },
  { href: "/settings", label: "Settings" },
];

export function AppNav({
  email,
  caseCount,
  isDemo,
}: {
  email: string;
  caseCount: number;
  isDemo: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-ink">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-600 text-sm text-white">
            CI
          </span>
          CaseInbox
        </Link>
        {isDemo && (
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
            Demo
          </span>
        )}
        <nav className="ml-4 flex items-center gap-1">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium",
                  active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
                )}
              >
                {l.label}
                {l.href === "/case" && caseCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-brand-600 px-1.5 text-xs text-white">
                    {caseCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-slate-500 sm:inline">{email}</span>
          <button
            onClick={signOut}
            disabled={signingOut}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </header>
  );
}
