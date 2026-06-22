import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { gmailConfigured, getAuthUrl } from "@/lib/gmail";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (!gmailConfigured()) {
    redirect("/connect?error=not_configured");
  }
  // Remember where to return after OAuth (agentic onboarding vs. manual connect).
  const from = new URL(req.url).searchParams.get("from") === "onboarding" ? "onboarding" : "connect";
  redirect(getAuthUrl(`${user!.id}:${from}`));
}
