# CaseInbox — Agentic Gmail Evidence Analyzer

Connect your inbox, ask in plain language, and walk away with an organized, preserved set of the
emails that matter — ready to hand to a lawyer. **This is an organization/triage tool, not legal
advice.** AI labels are interpretations, not findings of fact.

Built per `PRD_Email_Evidence_Analyzer.md`. Stack: **Next.js 15 (App Router) + React 19 + TypeScript
+ Tailwind**, **Supabase** (Postgres + Auth + Row-Level Security), and the **Gemini API** (BYO key).

---

## Quick start (runs today, no external setup)

```bash
npm install
npm run dev
# open http://localhost:3000  →  click "Try the live demo"
```

The app ships in **demo mode**: a pre-seeded sample mailbox (a realistic employment-dispute
scenario) lives in the connected Supabase project, and a confirmed demo account lets you explore
the entire flow immediately.

**Demo login**

| | |
|---|---|
| Email | `demo@caseinbox.app` |
| Password | `DemoPass123!` |

Or click **Try the live demo** on the landing/login page (one click, no typing).

The demo's chat agent and classifier work **without any API key** via a deterministic fallback, so
the full experience — dashboard, chat with citations, case folder, export — is functional out of
the box. Add a Gemini key in **Settings** to switch to live Gemini reasoning.

---

## What works end to end

- **Auth** — email/password signup & login, plus a one-click demo session. Per-user isolation via
  Postgres RLS (every table is scoped to `auth.uid()`).
- **Disclaimer gate** — first-run acknowledgement; a persistent banner on every screen.
- **Dashboard** — sortable/filterable table of classified emails (category, severity, sender, date)
  with a safe email viewer that separates the **verbatim original (+ full headers)** from the
  **AI analysis**.
- **Chat agent** — natural-language requests resolved through real tool calls
  (`search_emails`, `list_by_category`, `get_email`, `summarize_thread`, `flag_email`,
  `unflag_email`) over full-text + structured retrieval, with clickable citations to source emails.
  Streaming responses.
- **Case folder** — flag emails, add notes.
- **Export** — **Evidence package (.zip)**: each original `.eml` (headers intact) + `manifest.json`
  / `manifest.csv` + README. **Summary report (.pdf)**: verbatim original clearly separated from
  AI labels, with the standing disclaimer.
- **Scan/classify** — real Gmail read-only ingestion with a resumable, batched worker and a
  two-stage Gemini pipeline (Flash-Lite classification, Flash chat agent), wired behind env vars.

---

## Enabling real Gmail + Gemini (optional)

Everything below is already coded; you just supply credentials in `.env.local`.

### Gemini (per-user, bring-your-own-key)
Open **Settings → Gemini API key**, paste a key. It is encrypted at rest (AES-256-GCM) with
`APP_ENCRYPTION_KEY`. Use a paid / non-training configuration given the data sensitivity (PRD §4.8).

### Gmail (read-only)
1. In Google Cloud Console, create an **OAuth client (Web application)**.
2. Add scope `https://www.googleapis.com/auth/gmail.readonly`.
3. Add redirect URI `http://localhost:3000/api/gmail/callback`.
4. Put the client id/secret in `.env.local` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
5. Restart, go to **Scan → Connect Gmail**, pick a scope (sender/domain, dates, label), and run.

> `gmail.readonly` is a Google **restricted** scope. Public signups require OAuth verification
> (incl. a CASA security assessment); until then Google limits you to test users you add manually
> (PRD §8.7, §11). Demo mode sidesteps this for evaluation.

---

## Environment (`.env.local`)

Already populated for the connected Supabase project + demo. See `.env.example` for the full list.
Secrets (encryption key, OAuth secret, Gemini keys) are server-side only and never shipped to the
client.

---

## Architecture notes

- **Data model & RLS** — `supabase` migration `caseinbox_initial_schema` creates `profiles`,
  `user_settings`, `gmail_connections`, `scan_jobs`, `emails` (with a generated `tsvector` for
  full-text search), `classifications`, `case_items`, `conversations`, `chat_messages`. RLS policies
  restrict every row to its owner. A trigger auto-provisions `profiles` + `user_settings` on signup.
- **Retrieval (v1)** — structured filters on `classifications` + Postgres full-text search on the
  email body. No vector store (PRD §8.4); `pgvector` is the documented Phase-2 upgrade.
- **Background scanning** — the scan worker advances in small idempotent batches driven by client
  polling of `GET /api/scan/[id]`, designed to fit serverless time limits (PRD §8.6).
- **Evidence integrity** — originals (`raw_eml`, full headers) are stored verbatim and never
  altered; AI output is always visually and textually separated and labeled
  "AI-generated analysis — not a legal finding."
- **Safe rendering** — untrusted email HTML is sanitized (no scripts, no remote images/tracking
  pixels) before display (PRD §9.4).

## Project layout

```
src/
  app/
    (app)/            authenticated shell: dashboard, chat, case, connect, settings
    api/              auth, chat, emails, case, export, gmail, scan, settings, account, disclaimer
    login, signup, disclaimer, page.tsx (landing)
  components/         ui primitives + dashboard/chat/case/connect/settings views
  lib/                supabase clients, auth, gemini, gmail, agent (tools + run loop),
                      crypto, email-clean, settings, format, constants, types
```

## Scripts

```bash
npm run dev        # local dev
npm run build      # production build
npm run start      # serve production build
npm run typecheck  # tsc --noEmit
```

---

*Not legal advice. Consult a licensed employment attorney. Do not delete or alter emails that may
be relevant to a dispute.*
