# Product Requirements Document
## "CaseInbox" — Agentic Gmail Evidence Analyzer

**Version:** 1.0 (Draft)
**Date:** June 22, 2026
**Status:** For review
**Owner:** [You]

---

> **Important framing note.** This product helps a person search and organize **their own** mailbox to find and preserve emails that may matter in an employment dispute. It is an organization and triage tool. It is **not** legal advice, and the AI's labels are interpretations, not findings of fact. These constraints shape several requirements below (evidence integrity, disclaimers, the separation of original content from AI commentary). Treat them as core product requirements, not legal boilerplate.

---

## 1. Overview

### 1.1 Problem
People who have been mistreated at work (harassment, discrimination, threats, retaliation, hostile communication) often have the evidence sitting in their own inbox — but it's buried across hundreds or thousands of emails. Manually finding, reading, and organizing the relevant messages is slow, emotionally draining, and error-prone. Once found, those emails need to be preserved in a form that is credible (original content + full headers), not paraphrased screenshots.

### 1.2 Solution
A web app where a user connects their Gmail, the system scans and classifies their messages, and the user interacts through a **chat interface** with an agent that can search, retrieve, summarize, and flag emails. The user can build a collection of flagged emails and export them — with originals preserved intact — for their attorney.

### 1.3 Vision (one line)
*Connect your inbox, ask in plain language, and walk away with an organized, preserved set of the emails that matter — ready to hand to a lawyer.*

### 1.4 Why an "agent" and not just search
Gmail already has search. The value here is: (a) semantic understanding ("show me where my manager belittled me in front of others" returns results keyword search misses), (b) classification and severity scoring across the whole mailbox at once, (c) a conversational workflow where the user refines, asks follow-ups, and builds an evidence set without leaving the chat, and (d) one-click preservation/export.

---

## 2. Goals and Non-Goals

### 2.1 Goals
- Let any user sign up and securely connect their own Gmail.
- Scan a mailbox and classify emails into harm categories with severity scores and extracted rationale.
- Provide a chat agent that searches, retrieves, summarizes, and flags emails with citations to the source message.
- Let the user assemble a "case folder" of flagged emails.
- Export a preservation-grade package: original emails (with full headers) plus an optional AI-annotated summary, clearly separated.
- Deploy on Vercel and use the Gemini API.

### 2.2 Non-Goals (for v1)
- Not a lawyer, not legal advice, not a prediction of case outcome.
- Not connected to non-Gmail providers (Outlook/IMAP) in v1.
- No automated sending, deleting, or modifying of the user's emails (read-only).
- No case-management / billing / attorney-collaboration features in v1.
- No mobile native app (responsive web only).

---

## 3. Target Users & Personas

**Primary — "Dana, the terminated employee."** Recently let go, believes the treatment was unlawful, has a large inbox, limited technical skill, high stress. Needs results fast and needs to trust the tool with very sensitive content. Will likely show the output to an attorney.

**Secondary — "Marcus, the employment attorney."** May receive the exported package from a client. Cares about authenticity, complete headers, and a clear line between original content and AI interpretation. Not a direct user in v1 but the export must be credible to him.

**Tertiary — "Sam, the still-employed worker building a record."** Documenting ongoing mistreatment defensively. Same feature needs, different urgency.

---

## 4. Legal, Ethical & Trust Requirements (treat as first-class)

These are product requirements because the use case is sensitive and the output may end up in a dispute.

1. **Read-only by design.** The app requests only read scopes from Gmail and never modifies, sends, labels, or deletes the user's mail. This is both a trust and an evidence-integrity requirement.
2. **Originals are sacrosanct.** Exports must preserve the raw message including full headers (`From`, `To`, `Date`, `Message-ID`, `Received`, etc.). Never alter, "clean up," or reformat the original. Store/export the original `.eml`.
3. **Separate fact from interpretation.** Anywhere the AI's labels, severity scores, or summaries appear, they must be visually and textually distinct from verbatim original content and labeled "AI-generated analysis — not a legal finding."
4. **No fabrication.** The agent must only quote/cite emails that exist in the user's mailbox, always with a resolvable reference to the source message. It must never invent quotes or infer content not present.
5. **False positives expected.** Communicate that classification is imperfect; the user reviews and decides what to keep. Nothing is auto-submitted anywhere.
6. **In-product disclaimer.** A persistent, plain-language notice: this tool helps you organize your own emails and is not legal advice; consult a licensed employment attorney; do not delete or alter emails that may be relevant (potential spoliation).
7. **Data sensitivity.** Mailbox content may contain harassment, medical, financial, and third-party personal data. Apply data minimization, encryption, and strict access controls (Section 9).
8. **Gemini data handling.** Use a Gemini API configuration whose terms do **not** use customer content to train models (paid tier / appropriate data-governance settings). Do not run highly sensitive mailbox content through any free-tier configuration that may retain or train on it. (See Section 8.5.)

---

## 5. Functional Requirements

### 5.1 Authentication & accounts (multi-tenant signup)
- Email/password signup and login, plus "Sign in with Google."
- Because Gmail access requires Google OAuth anyway, "Sign in with Google" is the smoothest path, but keep an email/password option for users who want their app login separate from their Google identity.
- Per-user isolation: every user only ever sees their own data. Row-level security enforced at the database layer.
- Session management, password reset, email verification.
- Account deletion that purges all stored mailbox data and revokes tokens.

### 5.2 Gmail connection
- OAuth 2.0 authorization-code flow requesting the **read-only** Gmail scope (`https://www.googleapis.com/auth/gmail.readonly`).
- Store refresh/access tokens encrypted; refresh transparently.
- Let the user disconnect Gmail, which revokes the token and (optionally) purges synced content.
- **Scoping the scan:** before scanning, let the user narrow by (a) sender or domain (e.g., the employer's domain, a manager's address), (b) date range, (c) Gmail labels/folders, (d) keywords. This dramatically cuts cost, time, and noise and is the recommended default flow.

### 5.3 Ingestion & indexing
- Fetch the message list for the chosen scope (paginated).
- For each message: retrieve raw content, parse headers and body, strip quoted reply chains and signatures for analysis (but keep the full original for evidence).
- Compute embeddings for semantic search (see 8.4) and store a structured record per email.
- Show ingestion progress; this runs as a background job (see 8.6), not in a single request.
- Incremental re-sync to pick up new mail without re-processing everything.

### 5.4 Analysis engine (classification)
Two-stage design (detailed in Section 8.3):
- **Stage 1 — bulk classification.** Each in-scope email is classified into categories with a 0–10 severity score, a short rationale, and the exact offending snippet(s). Suggested categories:
  - Harassment / hostile language
  - Discrimination referencing a protected characteristic (race, sex, age, religion, disability, national origin, etc.)
  - Threats or intimidation
  - Retaliation (e.g., after a complaint)
  - Defamatory or demeaning statements
  - Inappropriate / unprofessional conduct
  - None / benign
- Results stored so the chat agent and the dashboard can filter and rank instantly without re-running the model.

### 5.5 Chat interface (the agent)
- A clean chat UI (message list, input box, streaming responses, citations).
- The user asks in natural language; the agent uses tools to fulfill requests:
  - `search_emails(query, filters)` — semantic + structured search.
  - `get_email(id)` — fetch full content of one message.
  - `summarize_thread(thread_id)` — summarize a conversation.
  - `list_by_category(category, min_severity)` — pull classified results.
  - `flag_email(id, note)` / `unflag_email(id)` — add/remove from the case folder.
  - `export_case(ids)` — kick off an export.
- **Every factual claim or quote in a response must cite the source email** (clickable; opens the original). No uncited assertions about mailbox content.
- Streaming responses for responsiveness.
- Conversation history persisted per user.

### 5.6 Dashboard / results view
- Sortable, filterable table of classified emails (category, severity, sender, date, snippet).
- Click a row to open the full original email (rendered safely; see 9.4).
- Flag/unflag from the table; flagged items populate the **Case Folder**.

### 5.7 Case folder & export
- A collection of flagged emails with optional per-item user notes.
- Export options:
  - **Evidence package (recommended):** a ZIP containing each original `.eml` (full headers intact) plus a manifest (CSV/JSON) listing sender, recipients, date, `Message-ID`, subject, and the user's note.
  - **Summary report (PDF):** human-readable, with each entry showing the verbatim original clearly separated from the AI's labels/summary, plus the standing disclaimer.
- The export must make the original-vs-interpretation distinction unmistakable.

---

## 6. Key User Flows

**Onboarding → first result**
1. Sign up / sign in.
2. Read and acknowledge the disclaimer.
3. (BYO-key model) Enter a Gemini API key, or (managed model) proceed.
4. Connect Gmail (OAuth, read-only).
5. Define scan scope (sender/domain, dates, labels).
6. Watch ingestion + classification progress.
7. Land on the dashboard with classified results; open chat to refine.

**Build a case folder**
1. In chat: "Show me the most hostile emails from [manager] in the last year."
2. Agent returns ranked results with citations.
3. User opens originals, flags the relevant ones, adds notes.
4. User asks for more angles ("anything mentioning my age?").
5. Case folder fills up.

**Export**
1. User reviews the case folder.
2. Clicks Export → chooses evidence package and/or PDF.
3. Downloads; takes it to their attorney.

---

## 7. UX / UI Requirements
- Calm, trustworthy, uncluttered. The user is stressed; avoid alarming visuals or "gotcha" framing.
- Persistent disclaimer accessible from every screen.
- Clear connection status (Gmail connected / scan in progress / X emails analyzed).
- Severity shown with restrained visual cues (e.g., a subtle scale), never sensationalized.
- Accessibility: keyboard navigable, sufficient contrast, screen-reader labels.
- Responsive (desktop-first; usable on mobile web).
- Empty/loading/error states designed, not afterthoughts (large mailboxes mean long waits).

---

## 8. Technical Architecture

### 8.1 Stack (Vercel-native)
- **Framework:** Next.js (App Router) + React + TypeScript. Deploys cleanly to Vercel.
- **Styling:** Tailwind CSS.
- **Auth:** Auth.js (NextAuth) with a Google OAuth provider (covers both app login and the Gmail scope) plus a credentials provider for email/password.
- **Database:** Postgres. Supabase or Vercel Postgres both work; Supabase is convenient (Postgres + auth + row-level security in one place).
- **Search/retrieval (v1):** Postgres itself — structured filters over the classification fields plus built-in **full-text search** (`tsvector`/`tsquery`). No separate vector store or embedding pipeline in v1. (See 8.4 for the rationale and the Phase-2 upgrade path to `pgvector`.)
- **Background processing:** a queue/worker for scanning (see 8.6), since Vercel serverless functions are time-limited.
- **AI:** Google Gemini API for classification and the chat agent.
- **Email access:** Gmail REST API via Google APIs client.

### 8.2 Data model (sketch)
- `users` — id, email, auth fields, created_at.
- `gmail_connections` — user_id, encrypted refresh/access tokens, scope, status.
- `scan_jobs` — user_id, scope params, status, progress, counts.
- `emails` — id, user_id, gmail_message_id, thread_id, from, to, cc, date, subject, body_text (cleaned analysis copy; also the source for full-text search), raw_eml_ref (pointer to stored original).
- `classifications` — email_id, category, severity (0–10), rationale, snippet(s), model_version, created_at.
- `case_items` — user_id, email_id, user_note, added_at.
- `chat_messages` — user_id, conversation_id, role, content, tool_calls, created_at.
- Enforce per-user row-level security on every table.

### 8.3 Analysis pipeline (two-stage)
**Stage 1 — bulk classification (cheap, high-volume).**
- Model: **Gemini 3.1 Flash-Lite** (`gemini-3.1-flash-lite`) — optimized for low-latency, high-volume, cost-sensitive work; ideal for classifying many emails.
- For each email, prompt the model with the cleaned body and a fixed instruction to return **structured JSON** (category, severity 0–10, rationale, exact snippet). Enforce a strict JSON schema and parse defensively (strip code fences, validate, retry on malformed output).
- Batch where possible; respect rate limits with a queue and backoff. Consider the Batch API for large mailboxes (async, ~50% cheaper) when latency isn't critical.
- Persist results to `classifications`.

**Stage 2 — agentic chat (smarter, lower-volume).**
- Model: **Gemini 3.5 Flash** (`gemini-3.5-flash`) — strong agentic/tool-use performance at low cost; good default for the chat agent. Use **Gemini 3.1 Pro** (`gemini-3.1-pro`) only if you need deeper reasoning on hard queries (it's pricier and paid-tier only).
- The agent runs a tool-calling loop: interpret the request → call `search_emails` / `get_email` / `flag_email` / etc. → synthesize a cited answer. (Gemini 3.5 Flash uses a `thinking_level` enum — `minimal|low|medium|high`; set deliberately, default `medium`.)
- Retrieval combines Postgres full-text search with structured filters from `classifications` (e.g., category = discrimination AND severity ≥ 7). Because Stage 1 already tagged every email with a category, severity, rationale, and snippet, most queries resolve to plain filters; full-text search covers keyword lookups over the body.

### 8.4 Retrieval strategy (why no vector store in v1)
The heavy lifting happens at **classification** time, not query time. Once each email carries a category, severity, rationale, and offending snippet, the large majority of user requests map cleanly to structured queries:
- "Most hostile emails from my manager" → filter `category IN (harassment, hostile)` ordered by severity/date.
- "Anything mentioning my age" → full-text search over `body_text` + category filter.
- "Everything flagged as a threat" → `category = 'threats'`.

So v1 retrieval = **structured filters on `classifications` + Postgres full-text search (`tsvector`/`tsquery`) on `body_text`.** No embeddings, no vector index, no extra pipeline to build or pay for. This is also a good fit for the expected data size: if users pre-filter scope (employer domain, specific senders, date range) before scanning — which is recommended anyway for cost and noise — most cases are hundreds to low-thousands of emails, where structured + keyword search is fast and sufficient.

**What a vector store would add (Phase 2, only if needed):** better recall on *paraphrased* queries where the wording never appears in the email (e.g., "where he belittled me" when the email never says "belittle"). Classification already absorbs much of this, since the model tags semantic intent at ingestion. If real usage shows queries that keyword + category filters keep missing — or you want a "find more emails like this one" feature, or you start supporting large un-prefiltered mailboxes — add `pgvector` with `gemini-embedding-2`. Since you're already on Postgres, that's an additive change, not a rewrite, which is exactly why it doesn't belong in the MVP.

### 8.5 Gemini API key model — choose one
- **Bring-your-own-key (recommended for MVP).** Each user supplies their own Gemini API key (stored encrypted). Pros: no API cost or quota management for you; aligns with "use gemini API key." Cons: a setup step for non-technical users; you must guide them through getting a key and warn them to use a configuration that doesn't train on their data.
- **Managed key.** You provide Gemini via your own key and meter/limit usage. Pros: frictionless onboarding. Cons: you bear cost and must implement per-user quotas, abuse protection, and billing.
- Whichever you pick, ensure the chosen tier/terms **do not use the content for model training**, given the data's sensitivity.

### 8.6 Background processing on Vercel (important constraint)
Scanning thousands of emails cannot finish inside a single Vercel function invocation (functions are time-limited — seconds, not minutes). Design for async from day one:
- Enqueue a scan job; process it in chunks via a background worker.
- Options: a hosted queue (e.g., Upstash QStash) triggering Vercel route handlers per batch; Vercel cron to drain a job queue; or Supabase Edge Functions / a small worker for the heavy loop. Use `waitUntil` for short post-response work only — not for long scans.
- Persist progress to `scan_jobs`; the UI polls or subscribes for live progress.
- Make every step idempotent and resumable (large mailboxes will hit rate limits and transient failures).

### 8.7 Gmail API considerations
- Use the read-only scope only.
- Pull message IDs (list) then fetch content; respect Gmail API quotas (per-user rate limits) with batching/backoff.
- Store the raw original for evidence; keep a cleaned copy for analysis.
- **Restricted-scope verification (major deployment dependency):** `gmail.readonly` is a Google "restricted" scope. To let the general public sign up, the app's OAuth consent screen must pass Google's verification, which for restricted scopes includes a security assessment (CASA). Until then, the app is limited to a small number of test users you add manually. **This affects timeline, cost, and the "anyone can sign up" requirement — plan for it early.**

### 8.8 High-level request flow
1. User connects Gmail → tokens stored encrypted.
2. User sets scope → `scan_job` created and enqueued.
3. Worker fetches in batches → stores originals + cleaned text → classifies (Flash-Lite) → writes results.
4. UI shows progress, then the dashboard.
5. Chat agent (3.5 Flash) answers via tool calls over full-text search + `classifications` filters, always citing sources.
6. User flags emails → case folder → export (ZIP of `.eml` + manifest, and/or PDF report).

---

## 9. Non-Functional Requirements

### 9.1 Security
- Encrypt OAuth tokens and any stored mailbox content at rest; TLS in transit.
- Secrets (Gemini keys, OAuth client secret, DB creds) only in server-side env vars / a secrets manager — **never** in client code or the repo.
- Row-level security so users can only ever access their own rows.
- Principle of least privilege on the database and API surface.

### 9.2 Privacy & data minimization
- Only ingest the scope the user selects; don't silently pull the whole mailbox.
- Let users delete individual synced emails, an entire scan, or their whole account, with real data purge and token revocation.
- Clear retention policy; document what's stored, where, and for how long.

### 9.3 Performance & scale
- Async scanning with visible progress; never block the UI on long jobs.
- Stream chat responses.
- Rate-limit handling and backoff for both Gmail and Gemini.
- Cache classification results so the dashboard/chat never re-run the model unnecessarily.

### 9.4 Safe rendering
- Email bodies are untrusted HTML. Render in a sandboxed/ sanitized way (strip scripts, isolate, block remote tracking pixels by default) to prevent XSS and tracking.

### 9.5 Reliability
- Idempotent, resumable jobs. Retries with backoff. Clear, honest error states ("12 of 800 emails failed to analyze — retry").

### 9.6 Cost control
- Pre-filtering scope is the biggest lever. Use Flash-Lite for bulk work, reserve Pro for hard chat queries, consider the Batch API for large scans, and send the model snippets rather than whole emails where a snippet suffices.

---

## 10. Scope: MVP vs. Later

### 10.1 MVP (v1)
- Email/password + Google sign-in; per-user isolation.
- Gmail read-only connect with scope selection.
- Async scan + Stage-1 classification.
- Dashboard with filter/sort and safe original viewing.
- Chat agent with search/get/flag tools and citations (full-text + structured retrieval).
- Case folder + export (ZIP of `.eml` + manifest; basic PDF).
- BYO Gemini key.
- Persistent disclaimer.
- Deployable on Vercel with background worker.

### 10.2 Phase 2
- Semantic search via `pgvector` + `gemini-embedding-2` — *if* usage shows paraphrased queries that full-text + category filters miss, or for a "find similar emails" feature.
- Managed Gemini key + usage limits/billing.
- Richer PDF reports; timeline view of a pattern of conduct.
- Thread-level and cross-thread pattern detection ("escalation over time").
- Saved searches, tagging, multiple case folders.
- Google OAuth restricted-scope verification completed for public signups.

### 10.3 Later
- Outlook / IMAP support.
- Attorney sharing / read-only collaboration links.
- Multi-language analysis.

---

## 11. Risks & Mitigations
- **OAuth restricted-scope verification blocks public signup.** → Start the verification/security-assessment process early; run a test-user allowlist until approved; budget time and money.
- **Vercel function timeouts on large scans.** → Async queue/worker architecture from day one; resumable, idempotent jobs.
- **AI false positives/negatives.** → Human-in-the-loop; user reviews and flags; never auto-conclude; show rationale and snippet so the user can judge.
- **Sensitive data exposure.** → Encryption, RLS, least privilege, training-free Gemini config, easy deletion.
- **User over-relies on AI labels as legal truth.** → Prominent, repeated disclaimer; clear "not legal advice"; recommend an attorney; separate originals from interpretation in every export.
- **API cost runaway on huge mailboxes.** → Scope pre-filtering, Flash-Lite for bulk, Batch API, caching, optional BYO-key so cost sits with the user.
- **Email HTML attacks.** → Sanitized/sandboxed rendering.

---

## 12. Success Metrics
- Time from signup to first useful result (target: minutes, not hours).
- % of scanned mailbox successfully classified without manual retry.
- Number of emails flagged into a case folder per active user.
- Export completion rate.
- Qualitative: do users (and their attorneys) trust the originals + headers in the export?

---

## 13. Open Questions
1. BYO Gemini key vs. managed key for launch?
2. How much mailbox content do we persist vs. fetch-on-demand to minimize stored sensitive data?
3. Do we pursue Google restricted-scope verification immediately, or launch to a test-user allowlist first?
4. PDF report depth for v1 — minimal vs. polished?
5. Default scan scope — force the user to narrow (sender/date) before any scan, to control cost and noise?

---

*This document specifies an organizational/triage tool for a person's own email. It is not legal advice and does not assess the merits of any claim. Users should consult a licensed employment attorney and avoid deleting or altering any emails that may be relevant to a dispute.*
