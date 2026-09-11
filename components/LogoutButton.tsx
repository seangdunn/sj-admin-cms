"use client";

import { useRouter } from "next/navigation";
import { getSession } from "@/lib/session";
import { signOut } from "@/lib/cognito";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const session = getSession();
    if (session) {
      await signOut(session.accessToken);
    }
    router.replace("/login");
  }

  return (
    <button type="button" onClick={handleLogout} className="text-sm text-gray-600 hover:text-gray-900">
      Log out
    </button>
  );
}
