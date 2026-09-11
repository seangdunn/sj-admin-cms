"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { startMfaEnrollment, confirmMfaEnrollment } from "@/lib/cognito";
import { getSession } from "@/lib/session";

const ISSUER = "SJ Admin CMS";

export default function MfaSetup() {
  const [secret, setSecret] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "busy" | "enabled">("idle");
  const [error, setError] = useState<string | null>(null);

  async function startEnrollment() {
    const session = getSession();
    if (!session) return;
    setStatus("busy");
    setError(null);
    try {
      const secretCode = await startMfaEnrollment(session.accessToken);
      setSecret(secretCode);
      const otpauthUri = `otpauth://totp/${encodeURIComponent(ISSUER)}?secret=${secretCode}&issuer=${encodeURIComponent(ISSUER)}`;
      setQrDataUrl(await QRCode.toDataURL(otpauthUri));
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start MFA enrollment");
      setStatus("idle");
    }
  }

  async function verifyAndEnable() {
    const session = getSession();
    if (!session) return;
    setStatus("busy");
    setError(null);
    try {
      await confirmMfaEnrollment(session.accessToken, code.trim());
      setStatus("enabled");
    } catch {
      setError("Invalid code. Check your authenticator app and try again.");
      setStatus("idle");
    }
  }

  if (status === "enabled") {
    return <p className="text-sm text-green-700">MFA is now enabled on your account.</p>;
  }

  if (!secret) {
    return (
      <div>
        <p className="mb-3 text-sm text-gray-600">
          Add an authenticator app (Google Authenticator, 1Password, etc.) as a second sign-in step.
        </p>
        <button
          type="button"
          onClick={startEnrollment}
          disabled={status === "busy"}
          className="rounded bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {status === "busy" ? "Starting…" : "Enable MFA"}
        </button>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex max-w-sm flex-col gap-4">
      {qrDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrDataUrl} alt="Scan this QR code with your authenticator app" className="h-48 w-48" />
      )}
      <p className="text-xs text-gray-500">
        Can&apos;t scan? Enter this code manually: <code className="font-mono">{secret}</code>
      </p>
      <div>
        <label htmlFor="mfa-setup-code" className="mb-1 block text-sm font-medium text-gray-700">
          Enter the 6-digit code from your app to confirm
        </label>
        <input
          id="mfa-setup-code"
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-lg tracking-widest"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={verifyAndEnable}
        disabled={status === "busy" || code.length < 6}
        className="rounded bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {status === "busy" ? "Verifying…" : "Verify and enable"}
      </button>
    </div>
  );
}
