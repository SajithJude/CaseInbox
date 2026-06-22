import JSZip from "jszip";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { requireUserId } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { handleError } from "@/lib/api";
import { DISCLAIMER_FULL, AI_NOTICE, CATEGORY_LABELS, type HarmCategory } from "@/lib/constants";
import { formatDateTime, parseAddress } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface FlatItem {
  email_id: string;
  user_note: string | null;
  added_at: string;
  gmail_message_id: string | null;
  thread_id: string | null;
  from_addr: string | null;
  to_addrs: string | null;
  cc_addrs: string | null;
  sent_at: string | null;
  subject: string | null;
  body_text: string | null;
  raw_eml: string | null;
  category: HarmCategory | null;
  severity: number | null;
  rationale: string | null;
  snippets: string[];
}

async function loadItems(userId: string): Promise<FlatItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("case_items")
    .select(
      "id,user_note,added_at,email:emails(id,gmail_message_id,thread_id,from_addr,to_addrs,cc_addrs,sent_at,subject,body_text,raw_eml,classification:classifications(category,severity,rationale,snippets))"
    )
    .eq("user_id", userId)
    .order("added_at", { ascending: false });

  if (error) throw new Error(error.message);

  type RawCls = {
    category: HarmCategory;
    severity: number | null;
    rationale: string | null;
    snippets: string[] | null;
  };
  type RawEmail = {
    id: string;
    gmail_message_id: string | null;
    thread_id: string | null;
    from_addr: string | null;
    to_addrs: string | null;
    cc_addrs: string | null;
    sent_at: string | null;
    subject: string | null;
    body_text: string | null;
    raw_eml: string | null;
    classification: RawCls[] | RawCls | null;
  };
  type RawRow = {
    id: string;
    user_note: string | null;
    added_at: string;
    email: RawEmail | RawEmail[] | null;
  };

  const rows = (data ?? []) as unknown as RawRow[];
  const out: FlatItem[] = [];
  for (const row of rows) {
    const email = Array.isArray(row.email) ? row.email[0] : row.email;
    if (!email) continue;
    const cls = Array.isArray(email.classification)
      ? email.classification[0]
      : email.classification ?? null;
    out.push({
      email_id: email.id,
      user_note: row.user_note,
      added_at: row.added_at,
      gmail_message_id: email.gmail_message_id,
      thread_id: email.thread_id,
      from_addr: email.from_addr,
      to_addrs: email.to_addrs,
      cc_addrs: email.cc_addrs,
      sent_at: email.sent_at,
      subject: email.subject,
      body_text: email.body_text,
      raw_eml: email.raw_eml,
      category: cls?.category ?? null,
      severity: typeof cls?.severity === "number" ? cls.severity : null,
      rationale: cls?.rationale ?? null,
      snippets: Array.isArray(cls?.snippets) ? (cls?.snippets as string[]) : [],
    });
  }
  return out;
}

// Build a minimal RFC822 message when no raw_eml is stored.
function reconstructEml(item: FlatItem): string {
  const date = item.sent_at ? new Date(item.sent_at).toUTCString() : "";
  const headers: string[] = [];
  if (item.from_addr) headers.push(`From: ${item.from_addr}`);
  if (item.to_addrs) headers.push(`To: ${item.to_addrs}`);
  if (item.cc_addrs) headers.push(`Cc: ${item.cc_addrs}`);
  if (date) headers.push(`Date: ${date}`);
  headers.push(`Subject: ${item.subject ?? ""}`);
  if (item.gmail_message_id) headers.push(`Message-ID: <${item.gmail_message_id}@mail.gmail.com>`);
  headers.push("MIME-Version: 1.0");
  headers.push('Content-Type: text/plain; charset="utf-8"');
  const body = (item.body_text ?? "").replace(/\r?\n/g, "\r\n");
  return headers.join("\r\n") + "\r\n\r\n" + body + "\r\n";
}

function safeFilePart(s: string | null | undefined): string {
  const base = (s ?? "").trim() || "message";
  return base
    .replace(/[^a-zA-Z0-9-_ ]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 60);
}

function csvEscape(value: string | null | undefined): string {
  const v = value ?? "";
  if (/[",\r\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

async function buildZip(items: FlatItem[]): Promise<Uint8Array> {
  const zip = new JSZip();
  const emailsFolder = zip.folder("emails");

  const manifest: Array<Record<string, string>> = [];
  const csvRows: string[] = [];
  const csvHeader = ["gmail_message_id", "from", "to", "cc", "date", "subject", "user_note"];
  csvRows.push(csvHeader.join(","));

  items.forEach((item, idx) => {
    const n = String(idx + 1).padStart(3, "0");
    const eml = item.raw_eml && item.raw_eml.trim().length > 0 ? item.raw_eml : reconstructEml(item);
    const fileName = `${n}_${safeFilePart(item.subject)}.eml`;
    if (emailsFolder) emailsFolder.file(fileName, eml);

    const row = {
      gmail_message_id: item.gmail_message_id ?? "",
      from: item.from_addr ?? "",
      to: item.to_addrs ?? "",
      cc: item.cc_addrs ?? "",
      date: item.sent_at ?? "",
      subject: item.subject ?? "",
      user_note: item.user_note ?? "",
    };
    manifest.push(row);
    csvRows.push(
      [
        csvEscape(row.gmail_message_id),
        csvEscape(row.from),
        csvEscape(row.to),
        csvEscape(row.cc),
        csvEscape(row.date),
        csvEscape(row.subject),
        csvEscape(row.user_note),
      ].join(",")
    );
  });

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("manifest.csv", csvRows.join("\r\n") + "\r\n");

  const readme = [
    "CaseInbox — Evidence package",
    "",
    "This archive contains verbatim copies of the emails you flagged into your case folder.",
    "Each file in the emails/ folder is an .eml original (RFC822), preserved as received,",
    "including full headers. AI analysis (categories, severity scores, rationales) is NOT",
    "included in this evidence package — it is interpretation, not a finding of fact.",
    "manifest.json and manifest.csv list the messages and any notes you added.",
    "",
    "----------------------------------------------------------------------",
    "",
    ...DISCLAIMER_FULL,
  ].join("\n");
  zip.file("README.txt", readme);

  const out = await zip.generateAsync({ type: "uint8array" });
  return out;
}

// ---- PDF helpers ----------------------------------------------------------

const PAGE_WIDTH = 595.28; // A4 portrait
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

interface PdfState {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;
}

function newPage(state: PdfState): void {
  state.page = state.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  state.y = PAGE_HEIGHT - MARGIN;
}

function ensureSpace(state: PdfState, needed: number): void {
  if (state.y - needed < MARGIN) {
    newPage(state);
  }
}

// Wrap a single logical line (no newlines) to a max width.
function wrapLine(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (text.length === 0) return [""];
  const words = text.split(/(\s+)/); // keep whitespace tokens
  const lines: string[] = [];
  let current = "";

  const pushCurrent = () => {
    lines.push(current);
    current = "";
  };

  for (const token of words) {
    const candidate = current + token;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    // token doesn't fit on current line
    if (current.trim().length > 0) {
      pushCurrent();
    } else {
      current = "";
    }
    // If the single token itself is too wide, hard-break by characters.
    if (font.widthOfTextAtSize(token, size) > maxWidth) {
      let chunk = "";
      for (const ch of token) {
        if (font.widthOfTextAtSize(chunk + ch, size) <= maxWidth) {
          chunk += ch;
        } else {
          if (chunk.length > 0) lines.push(chunk);
          chunk = ch;
        }
      }
      current = chunk;
    } else {
      current = token.replace(/^\s+/, "");
    }
  }
  if (current.length > 0 || lines.length === 0) lines.push(current);
  return lines;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const result: string[] = [];
  const paragraphs = (text ?? "").replace(/\r\n/g, "\n").split("\n");
  for (const para of paragraphs) {
    const wrapped = wrapLine(para, font, size, maxWidth);
    for (const w of wrapped) result.push(w);
  }
  return result;
}

interface DrawOpts {
  size?: number;
  bold?: boolean;
  color?: ReturnType<typeof rgb>;
  indent?: number;
  lineGap?: number;
  maxWidth?: number;
}

function drawParagraph(state: PdfState, text: string, opts: DrawOpts = {}): void {
  const size = opts.size ?? 10;
  const font = opts.bold ? state.bold : state.font;
  const color = opts.color ?? rgb(0.1, 0.12, 0.16);
  const indent = opts.indent ?? 0;
  const lineGap = opts.lineGap ?? 3;
  const maxWidth = (opts.maxWidth ?? CONTENT_WIDTH) - indent;
  const lineHeight = size + lineGap;
  const lines = wrapText(text, font, size, maxWidth);
  for (const line of lines) {
    ensureSpace(state, lineHeight);
    state.page.drawText(line, {
      x: MARGIN + indent,
      y: state.y - size,
      size,
      font,
      color,
    });
    state.y -= lineHeight;
  }
}

function spacer(state: PdfState, h: number): void {
  ensureSpace(state, h);
  state.y -= h;
}

function drawBoxedBlock(
  state: PdfState,
  lines: string[],
  size: number,
  bg: ReturnType<typeof rgb>,
  border: ReturnType<typeof rgb>
): void {
  const lineGap = 3;
  const lineHeight = size + lineGap;
  const pad = 8;

  let idx = 0;
  while (idx < lines.length) {
    // How many lines fit on the current page?
    const available = state.y - MARGIN - pad * 2;
    let fit = Math.max(1, Math.floor(available / lineHeight));
    if (fit <= 0) {
      newPage(state);
      continue;
    }
    const chunk = lines.slice(idx, idx + fit);
    if (chunk.length === 0) {
      newPage(state);
      continue;
    }
    const boxHeight = chunk.length * lineHeight + pad * 2;
    // If even one line cannot fit, start a fresh page.
    if (boxHeight > state.y - MARGIN && idx === 0 && state.y < PAGE_HEIGHT - MARGIN) {
      newPage(state);
      continue;
    }
    const top = state.y;
    state.page.drawRectangle({
      x: MARGIN,
      y: top - boxHeight,
      width: CONTENT_WIDTH,
      height: boxHeight,
      color: bg,
      borderColor: border,
      borderWidth: 0.75,
    });
    let textY = top - pad - size;
    for (const line of chunk) {
      state.page.drawText(line, {
        x: MARGIN + pad,
        y: textY,
        size,
        font: state.font,
        color: rgb(0.1, 0.12, 0.16),
      });
      textY -= lineHeight;
    }
    state.y = top - boxHeight;
    idx += chunk.length;
    if (idx < lines.length) {
      newPage(state);
    }
  }
}

async function buildPdf(items: FlatItem[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const state: PdfState = {
    doc,
    page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: PAGE_HEIGHT - MARGIN,
    font,
    bold,
  };

  // ---- Cover page ----
  drawParagraph(state, "CaseInbox — Case Summary", { size: 20, bold: true });
  spacer(state, 6);
  drawParagraph(state, `Generated ${formatDateTime(new Date().toISOString())}`, {
    size: 10,
    color: rgb(0.4, 0.45, 0.5),
  });
  drawParagraph(state, `${items.length} flagged ${items.length === 1 ? "email" : "emails"}`, {
    size: 10,
    color: rgb(0.4, 0.45, 0.5),
  });
  spacer(state, 14);

  drawParagraph(state, "Important", { size: 12, bold: true });
  spacer(state, 4);
  for (const para of DISCLAIMER_FULL) {
    drawParagraph(state, para, { size: 10, color: rgb(0.25, 0.28, 0.33) });
    spacer(state, 4);
  }
  spacer(state, 6);
  drawParagraph(state, AI_NOTICE, { size: 10, bold: true, color: rgb(0.55, 0.35, 0.05) });

  // ---- Per-email sections ----
  items.forEach((item, idx) => {
    newPage(state);

    drawParagraph(state, `Email ${idx + 1} of ${items.length}`, {
      size: 9,
      color: rgb(0.45, 0.5, 0.55),
    });
    spacer(state, 4);
    drawParagraph(state, item.subject || "(no subject)", { size: 14, bold: true });
    spacer(state, 8);

    // Original message header block (verbatim metadata)
    drawParagraph(state, "Original message (verbatim)", {
      size: 11,
      bold: true,
      color: rgb(0.1, 0.3, 0.25),
    });
    spacer(state, 4);

    const from = parseAddress(item.from_addr);
    const fromDisplay = item.from_addr
      ? from.name
        ? `${from.name} <${from.email}>`
        : from.email
      : "(unknown)";
    const headerLines = [
      `From:       ${fromDisplay}`,
      `To:         ${item.to_addrs ?? "(none)"}`,
      ...(item.cc_addrs ? [`Cc:         ${item.cc_addrs}`] : []),
      `Date:       ${item.sent_at ? formatDateTime(item.sent_at) : "(unknown)"}`,
      `Message-ID: ${item.gmail_message_id ?? "(unknown)"}`,
    ];
    for (const line of headerLines) {
      drawParagraph(state, line, { size: 9.5, color: rgb(0.2, 0.23, 0.28) });
    }
    spacer(state, 8);

    // Verbatim body in a delimited box
    drawParagraph(state, "Message body (verbatim):", {
      size: 9.5,
      bold: true,
      color: rgb(0.3, 0.33, 0.38),
    });
    spacer(state, 4);
    const bodyText = item.body_text && item.body_text.trim().length > 0 ? item.body_text : "(no plain-text body available)";
    const bodyLines = wrapText(bodyText, font, 9.5, CONTENT_WIDTH - 16);
    drawBoxedBlock(state, bodyLines, 9.5, rgb(0.97, 0.98, 0.99), rgb(0.82, 0.85, 0.88));
    spacer(state, 12);

    // AI analysis block — clearly separated
    drawParagraph(state, "AI-generated analysis — not a legal finding", {
      size: 11,
      bold: true,
      color: rgb(0.55, 0.35, 0.05),
    });
    spacer(state, 4);

    const categoryLabel = item.category
      ? CATEGORY_LABELS[item.category] ?? item.category
      : "(not classified)";
    drawParagraph(state, `Category: ${categoryLabel}`, { size: 10 });
    drawParagraph(
      state,
      `Severity: ${item.severity !== null ? `${item.severity}/10` : "(none)"}`,
      { size: 10 }
    );
    spacer(state, 4);
    drawParagraph(state, "Rationale:", { size: 10, bold: true });
    drawParagraph(state, item.rationale && item.rationale.trim().length > 0 ? item.rationale : "(none)", {
      size: 10,
      color: rgb(0.25, 0.28, 0.33),
    });

    if (item.snippets.length > 0) {
      spacer(state, 4);
      drawParagraph(state, "Cited snippets:", { size: 10, bold: true });
      for (const snip of item.snippets) {
        drawParagraph(state, `- ${snip}`, {
          size: 9.5,
          indent: 8,
          color: rgb(0.25, 0.28, 0.33),
        });
      }
    }

    spacer(state, 8);
    drawParagraph(state, "Your note:", { size: 10, bold: true });
    drawParagraph(
      state,
      item.user_note && item.user_note.trim().length > 0 ? item.user_note : "(none)",
      { size: 10, color: rgb(0.25, 0.28, 0.33) }
    );
  });

  const bytes = await doc.save();
  return bytes;
}

// Copy into a Uint8Array backed by a plain ArrayBuffer so it is accepted as a
// BlobPart (avoids the SharedArrayBuffer-union typing issue in newer TS libs).
function toBlobPart(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy as Uint8Array<ArrayBuffer>;
}

export async function GET(req: Request) {
  try {
    const uid = await requireUserId();
    const { searchParams } = new URL(req.url);
    const formatParam = (searchParams.get("format") ?? "zip").toLowerCase();
    const format = formatParam === "pdf" ? "pdf" : "zip";

    const items = await loadItems(uid);

    if (format === "pdf") {
      const bytes = await buildPdf(items);
      return new Response(new Blob([toBlobPart(bytes)], { type: "application/pdf" }), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="caseinbox-summary.pdf"',
          "Cache-Control": "no-store",
        },
      });
    }

    const bytes = await buildZip(items);
    return new Response(new Blob([toBlobPart(bytes)], { type: "application/zip" }), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="caseinbox-evidence.zip"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
