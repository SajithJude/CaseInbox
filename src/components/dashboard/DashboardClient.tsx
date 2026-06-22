"use client";

import * as React from "react";
import { Card, Input, Select, Label } from "@/components/ui";
import { CategoryBadge } from "@/components/CategoryBadge";
import { SeverityMeter } from "@/components/SeverityMeter";
import { AiNotice } from "@/components/AiNotice";
import { HARM_CATEGORIES, CATEGORY_SHORT, type HarmCategory } from "@/lib/constants";
import { formatDate, parseAddress } from "@/lib/format";
import type { EmailWithClassification } from "@/lib/types";
import { EmailDrawer } from "./EmailDrawer";

interface DashboardSummary {
  total: number;
  highSeverity: number;
  byCategory: Record<HarmCategory, number>;
}

type SortKey = "severity_desc" | "date_desc" | "date_asc";

export function DashboardClient({
  emails,
  summary,
  initialEmailId,
}: {
  emails: EmailWithClassification[];
  summary: DashboardSummary;
  initialEmailId?: string;
}) {
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<"all" | HarmCategory>("all");
  const [minSeverity, setMinSeverity] = React.useState(0);
  const [sort, setSort] = React.useState<SortKey>("severity_desc");
  const [openId, setOpenId] = React.useState<string | null>(initialEmailId ?? null);
  const [flaggedMap, setFlaggedMap] = React.useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    for (const e of emails) m[e.id] = Boolean(e.flagged);
    return m;
  });

  const topCategories = React.useMemo(() => {
    return (Object.entries(summary.byCategory) as [HarmCategory, number][])
      .filter(([cat, count]) => count > 0 && cat !== "benign")
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
  }, [summary.byCategory]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = emails.filter((e) => {
      if (q) {
        const from = (e.from_addr ?? "").toLowerCase();
        const subject = (e.subject ?? "").toLowerCase();
        if (!from.includes(q) && !subject.includes(q)) return false;
      }
      const sev = e.classification?.severity ?? 0;
      if (sev < minSeverity) return false;
      if (category !== "all") {
        if (!e.classification || e.classification.category !== category) return false;
      }
      return true;
    });

    const sorted = [...rows];
    sorted.sort((a, b) => {
      if (sort === "severity_desc") {
        return (b.classification?.severity ?? -1) - (a.classification?.severity ?? -1);
      }
      const ta = a.sent_at ? new Date(a.sent_at).getTime() : 0;
      const tb = b.sent_at ? new Date(b.sent_at).getTime() : 0;
      return sort === "date_asc" ? ta - tb : tb - ta;
    });
    return sorted;
  }, [emails, query, category, minSeverity, sort]);

  function handleFlagChange(emailId: string, flagged: boolean) {
    setFlaggedMap((prev) => ({ ...prev, [emailId]: flagged }));
  }

  return (
    <div>
      {/* Summary */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Analyzed</p>
            <AiNotice />
          </div>
          <p className="mt-2 text-3xl font-semibold text-ink">{summary.total}</p>
          <p className="mt-1 text-xs text-slate-500">messages with an AI label</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              High severity
            </p>
            <AiNotice />
          </div>
          <p className="mt-2 text-3xl font-semibold text-ink">{summary.highSeverity}</p>
          <p className="mt-1 text-xs text-slate-500">scored 7 or higher</p>
        </Card>

        <Card className="p-4 sm:col-span-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Top categories
            </p>
            <AiNotice />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {topCategories.length === 0 ? (
              <p className="text-sm text-slate-500">No categories of concern detected.</p>
            ) : (
              topCategories.map(([cat, count]) => (
                <span key={cat} className="inline-flex items-center gap-1.5">
                  <CategoryBadge category={cat} />
                  <span className="text-sm text-slate-600">{count}</span>
                </span>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Controls */}
      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div>
            <Label htmlFor="filter-text">Search sender or subject</Label>
            <Input
              id="filter-text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to filter"
            />
          </div>
          <div>
            <Label htmlFor="filter-category">Category</Label>
            <Select
              id="filter-category"
              className="w-full"
              value={category}
              onChange={(e) => setCategory(e.target.value as "all" | HarmCategory)}
            >
              <option value="all">All categories</option>
              {HARM_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_SHORT[cat]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="filter-severity">Min severity: {minSeverity}</Label>
            <input
              id="filter-severity"
              type="range"
              min={0}
              max={10}
              step={1}
              value={minSeverity}
              onChange={(e) => setMinSeverity(Number(e.target.value))}
              className="mt-2 w-full accent-brand-600"
            />
          </div>
          <div>
            <Label htmlFor="filter-sort">Sort</Label>
            <Select
              id="filter-sort"
              className="w-full"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              <option value="severity_desc">Severity (high to low)</option>
              <option value="date_desc">Date (newest first)</option>
              <option value="date_asc">Date (oldest first)</option>
            </Select>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">From</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Flagged</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                    No messages match these filters.
                  </td>
                </tr>
              ) : (
                filtered.map((e) => {
                  const from = parseAddress(e.from_addr);
                  const fromLabel = from.name || from.email || "—";
                  const isFlagged = flaggedMap[e.id];
                  return (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 align-middle" colSpan={6}>
                        <button
                          type="button"
                          onClick={() => setOpenId(e.id)}
                          className="grid w-full grid-cols-[minmax(140px,1fr)_minmax(110px,1fr)_minmax(120px,1fr)_minmax(90px,1fr)_2fr_minmax(70px,auto)] items-center gap-4 text-left"
                        >
                          <span>
                            {e.classification ? (
                              <SeverityMeter value={e.classification.severity} showLabel={false} />
                            ) : (
                              <span className="text-xs text-slate-400">Not analyzed</span>
                            )}
                          </span>
                          <span>
                            {e.classification ? (
                              <CategoryBadge category={e.classification.category} />
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </span>
                          <span className="truncate text-slate-700" title={e.from_addr ?? ""}>
                            {fromLabel}
                          </span>
                          <span className="text-slate-500">{formatDate(e.sent_at)}</span>
                          <span className="truncate text-slate-800" title={e.subject ?? ""}>
                            {e.subject || "(no subject)"}
                          </span>
                          <span>
                            {isFlagged ? (
                              <span
                                className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700"
                                aria-label="Flagged for case folder"
                              >
                                Flagged
                              </span>
                            ) : (
                              <span className="text-xs text-slate-300" aria-hidden="true">
                                —
                              </span>
                            )}
                          </span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <EmailDrawer
        emailId={openId}
        onClose={() => setOpenId(null)}
        onFlagChange={handleFlagChange}
      />
    </div>
  );
}
