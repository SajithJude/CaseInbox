import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <Suspense fallback={null}>
        <AuthForm mode="login" />
      </Suspense>
    </div>
  );
}
