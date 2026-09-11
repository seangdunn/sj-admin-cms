"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import LogoutButton from "@/components/LogoutButton";
import PortfolioTable from "@/components/PortfolioTable";
import { apiClient } from "@/lib/api-client";
import type { PortfolioItem } from "@/lib/types";

function PortfolioList() {
  const [items, setItems] = useState<PortfolioItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PortfolioItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    apiClient
      .get<{ items: PortfolioItem[] }>("/api/v1/portfolio")
      .then((data) => setItems(data.items))
      .catch(() => setError("Failed to load portfolio items."));
  }, []);

  function requestDelete(id: string) {
    setDeleteTarget(items?.find((i) => i.id === id) ?? null);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.del(`/api/v1/admin/portfolio/${deleteTarget.id}`);
      setItems((prev) => prev?.filter((i) => i.id !== deleteTarget.id) ?? null);
      setDeleteTarget(null);
    } catch {
      setError("Failed to delete item.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
        <span className="text-sm font-semibold text-gray-900">S&amp;J Admin</span>
        <div className="flex items-center gap-4">
          <Link href="/settings" prefetch={false} className="text-sm text-gray-600 hover:text-gray-900">
            Settings
          </Link>
          <LogoutButton />
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Portfolio Items</h1>
          <Link
            href="/portfolio/new"
            prefetch={false}
            className="rounded bg-(--color-accent) px-4 py-2 text-sm font-medium text-white"
          >
            Add item
          </Link>
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {items === null ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <PortfolioTable items={items} onDelete={requestDelete} />
        )}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm rounded bg-white p-6">
            <p className="mb-4 text-sm text-gray-900">
              Delete &ldquo;{deleteTarget.title}&rdquo;? This can&apos;t be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded px-4 py-2 text-sm text-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function PortfolioPage() {
  return (
    <AuthGuard>
      <PortfolioList />
    </AuthGuard>
  );
}
