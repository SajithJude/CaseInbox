import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase/server";
import type { Profile } from "./types";

// Returns the current auth user or null.
export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// Server-component / route guard. Redirects to /login when unauthenticated.
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

// Returns user id for API routes; throws (caught as 401) when missing.
export async function requireUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) {
    const err = new Error("Unauthorized");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }
  return user.id;
}

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return (data as Profile) ?? null;
}
