"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api-client";
import { uploadImage } from "@/lib/uploads";
import type { PortfolioItem } from "@/lib/types";
import ImageCropper from "./ImageCropper";

interface PortfolioFormProps {
  initialItem?: PortfolioItem;
}

export default function PortfolioForm({ initialItem }: PortfolioFormProps) {
  const router = useRouter();
  const isEdit = Boolean(initialItem);

  const [title, setTitle] = useState(initialItem?.title ?? "");
  const [description, setDescription] = useState(initialItem?.description ?? "");
  const [featured, setFeatured] = useState(initialItem?.featured ?? false);
  const [order, setOrder] = useState(initialItem?.order ?? 0);
  const [images, setImages] = useState<string[]>(initialItem?.images ?? []);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setPendingFile(file);
    e.target.value = "";
  }

  async function handleCropComplete(blob: Blob, contentType: string) {
    setPendingFile(null);
    setUploading(true);
    setFormError(null);
    try {
      const publicUrl = await uploadImage(blob, contentType);
      setImages((prev) => [...prev, publicUrl]);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Image upload failed");
    } finally {
      setUploading(false);
    }
  }

  function removeImage(url: string) {
    setImages((prev) => prev.filter((img) => img !== url));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);
    setSubmitting(true);

    const payload = { title, description, images, featured, order };

    try {
      if (isEdit && initialItem) {
        await apiClient.put(`/api/v1/admin/portfolio/${initialItem.id}`, payload);
      } else {
        await apiClient.post("/api/v1/admin/portfolio", payload);
      }
      router.push("/portfolio");
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        setFieldErrors(err.fieldErrors);
      } else {
        setFormError(err instanceof Error ? err.message : "Failed to save");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-5">
      <div>
        <label htmlFor="title" className="mb-1 block text-sm font-medium text-gray-700">
          Title
        </label>
        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2"
        />
        {fieldErrors.title && <p className="mt-1 text-sm text-red-600">{fieldErrors.title}</p>}
      </div>

      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium text-gray-700">
          Description
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="w-full rounded border border-gray-300 px-3 py-2"
        />
        {fieldErrors.description && (
          <p className="mt-1 text-sm text-red-600">{fieldErrors.description}</p>
        )}
      </div>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
          Featured
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          Order
          <input
            type="number"
            value={order}
            onChange={(e) => setOrder(Number(e.target.value))}
            className="w-20 rounded border border-gray-300 px-2 py-1"
          />
        </label>
      </div>
      {fieldErrors.order && <p className="text-sm text-red-600">{fieldErrors.order}</p>}

      <div>
        <span className="mb-1 block text-sm font-medium text-gray-700">Images</span>
        <div className="mb-3 flex flex-wrap gap-3">
          {images.map((url) => (
            <div key={url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-20 w-28 rounded object-cover" />
              <button
                type="button"
                onClick={() => removeImage(url)}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs text-white"
                aria-label="Remove image"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <label className="inline-block cursor-pointer rounded border border-gray-300 px-3 py-2 text-sm text-gray-700">
          {uploading ? "Uploading…" : "Add image"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleFileSelect}
            disabled={uploading}
            className="hidden"
          />
        </label>
        {fieldErrors.images && <p className="mt-1 text-sm text-red-600">{fieldErrors.images}</p>}
      </div>

      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/portfolio")}
          className="rounded px-4 py-2 text-sm text-gray-600"
        >
          Cancel
        </button>
      </div>

      {pendingFile && (
        <ImageCropper file={pendingFile} onComplete={handleCropComplete} onCancel={() => setPendingFile(null)} />
      )}
    </form>
  );
}
