import { NextResponse } from "next/server";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// Wraps a route handler so thrown errors (incl. requireUserId's 401) become JSON.
export function handleError(err: unknown) {
  const status = (err as { status?: number })?.status ?? 500;
  const message = err instanceof Error ? err.message : "Unexpected error";
  return NextResponse.json({ error: message }, { status });
}
