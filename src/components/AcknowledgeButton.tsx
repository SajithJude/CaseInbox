"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Spinner } from "./ui";

export function AcknowledgeButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function ack() {
    setLoading(true);
    await fetch("/api/disclaimer", { method: "POST" });
    router.push("/onboarding");
    router.refresh();
  }
  return (
    <Button onClick={ack} disabled={loading} className="w-full">
      {loading && <Spinner />}
      I understand — continue
    </Button>
  );
}
