import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { gmailConfigured, getAuthUrl } from "@/lib/gmail";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (!gmailConfigured()) {
    redirect("/connect?error=not_configured");
  }
  redirect(getAuthUrl(user.id));
}
