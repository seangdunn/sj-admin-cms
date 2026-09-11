"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/session";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(getSession() ? "/portfolio" : "/login");
  }, [router]);

  return null;
}
