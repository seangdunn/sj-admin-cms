"use client";

import Link from "next/link";
import type { PortfolioItem } from "@/lib/types";

interface PortfolioTableProps {
  items: PortfolioItem[];
  onDelete: (id: string) => void;
}

// A <table> reflows badly on narrow screens, so this renders two layouts
// and lets CSS pick one — a real table at sm+ , stacked cards below it —
// rather than squeezing columns via JS viewport detection.
export default function PortfolioTable({ items, onDelete }: PortfolioTableProps) {
  if (items.length === 0) {
    return (
      <div className="rounded border border-dashed border-gray-300 p-8 text-center">
        <p className="mb-3 text-sm text-gray-500">No portfolio items yet.</p>
        <Link
          href="/portfolio/new"
          className="inline-block rounded bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white"
        >
          Add item
        </Link>
      </div>
    );
  }

  return (
    <>
      <table className="hidden w-full text-left text-sm sm:table">
        <thead>
          <tr className="border-b border-gray-200 text-gray-500">
            <th className="py-2 pr-4 font-medium">Image</th>
            <th className="py-2 pr-4 font-medium">Title</th>
            <th className="py-2 pr-4 font-medium">Featured</th>
            <th className="py-2 pr-4 font-medium">Order</th>
            <th className="py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-gray-100">
              <td className="py-3 pr-4">
                {item.images[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.images[0]} alt="" className="h-12 w-16 rounded object-cover" />
                ) : (
                  <div className="h-12 w-16 rounded bg-gray-100" />
                )}
              </td>
              <td className="py-3 pr-4 font-medium text-gray-900">{item.title}</td>
              <td className="py-3 pr-4">
                {item.featured && (
                  <span className="rounded bg-[var(--color-accent)]/10 px-2 py-0.5 text-xs text-[var(--color-accent)]">
                    Featured
                  </span>
                )}
              </td>
              <td className="py-3 pr-4 text-gray-500">{item.order}</td>
              <td className="py-3">
                <div className="flex gap-3">
                  <Link href={`/portfolio/edit?id=${item.id}`} className="text-[var(--color-accent)]">
                    Edit
                  </Link>
                  <button type="button" onClick={() => onDelete(item.id)} className="text-red-600">
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-col gap-3 sm:hidden">
        {items.map((item) => (
          <div key={item.id} className="flex gap-3 rounded border border-gray-200 p-3">
            {item.images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.images[0]} alt="" className="h-16 w-20 flex-shrink-0 rounded object-cover" />
            ) : (
              <div className="h-16 w-20 flex-shrink-0 rounded bg-gray-100" />
            )}
            <div className="flex flex-1 flex-col">
              <span className="font-medium text-gray-900">{item.title}</span>
              <span className="text-xs text-gray-500">
                Order {item.order}
                {item.featured && " · Featured"}
              </span>
              <div className="mt-2 flex gap-4 text-sm">
                <Link href={`/portfolio/edit?id=${item.id}`} className="text-[var(--color-accent)]">
                  Edit
                </Link>
                <button type="button" onClick={() => onDelete(item.id)} className="text-red-600">
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
