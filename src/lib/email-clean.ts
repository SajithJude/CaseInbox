import sanitizeHtml from "sanitize-html";

// Strip quoted reply chains and signatures for the ANALYSIS copy only.
// The full original is always preserved separately (PRD §5.3, §4.2).
export function cleanForAnalysis(text: string): string {
  if (!text) return "";
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    // Stop at common quoted-reply markers.
    if (/^On .+ wrote:$/.test(t)) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(t)) break;
    if (/^_{5,}$/.test(t)) break;
    if (/^From: .+/.test(t) && out.length > 2) break;
    // Drop quoted lines and signature delimiter.
    if (t === "--") break;
    if (t.startsWith(">")) continue;
    out.push(line);
  }
  return out.join("\n").trim() || text.trim();
}

// Safe rendering of untrusted email HTML (PRD §9.4): no scripts, no remote
// tracking pixels, no event handlers. Returns sanitized HTML string.
export function sanitizeEmailHtml(html: string): string {
  if (!html) return "";
  return sanitizeHtml(html, {
    allowedTags: [
      "p","br","b","i","em","strong","u","a","ul","ol","li","blockquote",
      "h1","h2","h3","h4","h5","h6","pre","code","span","div","table","thead",
      "tbody","tr","td","th","hr",
    ],
    allowedAttributes: {
      a: ["href"],
      span: ["style"],
      div: ["style"],
      td: ["style"],
      th: ["style"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    // Block all images by default (prevents tracking pixels / remote loads).
    exclusiveFilter: (frame) => frame.tag === "img",
    transformTags: {
      a: (tagName, attribs) => ({
        tagName: "a",
        attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer nofollow" },
      }),
    },
  });
}
