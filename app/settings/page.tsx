"use client";

import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import LogoutButton from "@/components/LogoutButton";
import MfaSetup from "@/components/MfaSetup";

export default function SettingsPage() {
  return (
    <AuthGuard>
      <main className="min-h-screen bg-gray-50">
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
          <Link href="/portfolio" className="text-sm font-semibold text-gray-900">
            S&amp;J Admin
          </Link>
          <LogoutButton />
        </header>
        <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
          <h1 className="mb-6 text-lg font-semibold text-gray-900">Settings</h1>
          <MfaSetup />
        </div>
      </main>
    </AuthGuard>
  );
}
