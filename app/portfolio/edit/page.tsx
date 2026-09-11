"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import LogoutButton from "@/components/LogoutButton";
import PortfolioForm from "@/components/PortfolioForm";
import { apiClient } from "@/lib/api-client";
import type { PortfolioItem } from "@/lib/types";

// ?id= query param, not a dynamic route segment — static export can't
// generateStaticParams for content that only exists post-deploy in
// DynamoDB, so this stays a plain client-rendered route.
function EditForm() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const [item, setItem] = useState<PortfolioItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    apiClient
      .get<{ items: PortfolioItem[] }>("/api/v1/portfolio")
      .then((data) => {
        const found = data.items.find((i) => i.id === id);
        if (!found) {
          setError("Item not found.");
        } else {
          setItem(found);
        }
      })
      .catch(() => setError("Failed to load item."));
  }, [id]);

  if (!id) return <p className="text-sm text-red-600">Missing item id.</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!item) return <p className="text-sm text-gray-500">Loading…</p>;

  return <PortfolioForm initialItem={item} />;
}

export default function EditPortfolioItemPage() {
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
          <h1 className="mb-6 text-lg font-semibold text-gray-900">Edit Portfolio Item</h1>
          <Suspense fallback={<p className="text-sm text-gray-500">Loading…</p>}>
            <EditForm />
          </Suspense>
        </div>
      </main>
    </AuthGuard>
  );
}
