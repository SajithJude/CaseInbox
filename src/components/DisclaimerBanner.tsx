"use client";

import { useState } from "react";
import { DISCLAIMER_SHORT, DISCLAIMER_FULL } from "@/lib/constants";

// Persistent, plain-language disclaimer accessible from every screen (PRD §4.6, §7).
export function DisclaimerBanner() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-800">
        <span className="font-medium">Not legal advice.</span> CaseInbox organizes your own
        emails; AI labels are interpretations, not legal findings.{" "}
        <button onClick={() => setOpen(true)} className="font-medium underline underline-offset-2">
          Read the full notice
        </button>
      </div>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-w-lg rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-lg font-semibold text-ink">Important notice</h2>
            <ul className="space-y-3 text-sm text-slate-600">
              {DISCLAIMER_FULL.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-slate-400">{DISCLAIMER_SHORT}</p>
            <div className="mt-5 text-right">
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                I understand
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
