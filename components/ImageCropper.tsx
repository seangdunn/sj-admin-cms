"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";

// Target ratio matches the marketing site gallery's declared
// width="2400" height="1672" (a CLS-prevention aspect ratio, not a literal
// file-size requirement) — every uploaded image ends up exactly this size
// regardless of source, so the gallery never jumps between case studies.
export const TARGET_WIDTH = 1920;
export const TARGET_HEIGHT = 1338;
const TARGET_ASPECT = TARGET_WIDTH / TARGET_HEIGHT;

type Mode = "crop" | "fit";

interface ImageCropperProps {
  file: File;
  onComplete: (blob: Blob, contentType: string) => void;
  onCancel: () => void;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Samples a pixel a few px in from the top-left corner (avoids
// compression artifacts right at the edge) — brand-board/mood-board
// source images already have their background extend to the edges, so
// this is usually exactly the right fill color with zero admin effort.
function sampleCornerColor(img: HTMLImageElement): string {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "#ffffff";
  ctx.drawImage(img, 0, 0);
  const x = Math.min(4, canvas.width - 1);
  const y = Math.min(4, canvas.height - 1);
  const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas export failed"))),
      "image/jpeg",
      0.85
    );
  });
}

export default function ImageCropper({ file, onComplete, onCancel }: ImageCropperProps) {
  const objectUrl = useMemo(() => URL.createObjectURL(file), [file]);
  const [mode, setMode] = useState<Mode>("crop");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [fillColor, setFillColor] = useState("#ffffff");
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadImage(objectUrl).then((img) => {
      if (cancelled) return;
      setSourceImage(img);
      // Portrait/near-square sources default to "fit" (cropping would cut
      // off real content, not just margin); clearly-landscape sources
      // default to "crop". Either mode stays manually selectable.
      const sourceAspect = img.naturalWidth / img.naturalHeight;
      setMode(sourceAspect < TARGET_ASPECT * 0.85 ? "fit" : "crop");
      setFillColor(sampleCornerColor(img));
    });
    return () => {
      cancelled = true;
      URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  async function handleConfirm() {
    if (!sourceImage) return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = TARGET_WIDTH;
      canvas.height = TARGET_HEIGHT;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not supported");

      if (mode === "crop" && croppedAreaPixels) {
        ctx.drawImage(
          sourceImage,
          croppedAreaPixels.x,
          croppedAreaPixels.y,
          croppedAreaPixels.width,
          croppedAreaPixels.height,
          0,
          0,
          TARGET_WIDTH,
          TARGET_HEIGHT
        );
      } else {
        ctx.fillStyle = fillColor;
        ctx.fillRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT);
        const sourceAspect = sourceImage.naturalWidth / sourceImage.naturalHeight;
        let drawWidth = TARGET_WIDTH;
        let drawHeight = TARGET_WIDTH / sourceAspect;
        if (drawHeight > TARGET_HEIGHT) {
          drawHeight = TARGET_HEIGHT;
          drawWidth = TARGET_HEIGHT * sourceAspect;
        }
        const dx = (TARGET_WIDTH - drawWidth) / 2;
        const dy = (TARGET_HEIGHT - drawHeight) / 2;
        ctx.drawImage(
          sourceImage,
          0,
          0,
          sourceImage.naturalWidth,
          sourceImage.naturalHeight,
          dx,
          dy,
          drawWidth,
          drawHeight
        );
      }

      const blob = await canvasToJpegBlob(canvas);
      onComplete(blob, "image/jpeg");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80 p-4">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("crop")}
            className={`rounded px-3 py-1.5 text-sm ${
              mode === "crop" ? "bg-(--color-accent) text-white" : "bg-white/10 text-white"
            }`}
          >
            Crop
          </button>
          <button
            type="button"
            onClick={() => setMode("fit")}
            className={`rounded px-3 py-1.5 text-sm ${
              mode === "fit" ? "bg-(--color-accent) text-white" : "bg-white/10 text-white"
            }`}
          >
            Fit with fill
          </button>
        </div>

        <div className="relative min-h-64 flex-1 overflow-hidden rounded bg-black">
          {mode === "crop" ? (
            <Cropper
              image={objectUrl}
              crop={crop}
              zoom={zoom}
              aspect={TARGET_ASPECT}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center"
              style={{ backgroundColor: fillColor }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={objectUrl} alt="" className="max-h-full max-w-full object-contain" />
            </div>
          )}
        </div>

        {mode === "fit" && (
          <label className="flex items-center gap-2 text-sm text-white">
            Fill color
            <input
              type="color"
              value={fillColor}
              onChange={(e) => setFillColor(e.target.value)}
              className="h-8 w-14 cursor-pointer rounded border-0"
            />
          </label>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded px-4 py-2 text-sm text-white">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy || !sourceImage || (mode === "crop" && !croppedAreaPixels)}
            className="rounded bg-(--color-accent) px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Processing…" : "Use this image"}
          </button>
        </div>
      </div>
    </div>
  );
}
