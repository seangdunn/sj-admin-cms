"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getSession, isSessionExpired } from "@/lib/session";
import { refreshSession } from "@/lib/cognito";

export default function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const session = getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      if (isSessionExpired(session)) {
        try {
          await refreshSession(session.refreshToken);
        } catch {
          router.replace("/login");
          return;
        }
      }
      if (!cancelled) setChecked(true);
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
