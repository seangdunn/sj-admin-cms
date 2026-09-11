"use client";

import { useState, type FormEvent } from "react";
import { respondToMfaChallenge, type MfaChallenge } from "@/lib/cognito";
import type { Session } from "@/lib/session";

interface MfaChallengeFormProps {
  challenge: MfaChallenge;
  onSuccess: (session: Session) => void;
}

export default function MfaChallengeForm({ challenge, onSuccess }: MfaChallengeFormProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const session = await respondToMfaChallenge(challenge, code.trim());
      onSuccess(session);
    } catch (err) {
      console.error("MFA challenge failed", {
        errorName: err instanceof Error ? err.name : "Unknown",
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      setError("Invalid or expired code. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-gray-600">Enter the 6-digit code from your authenticator app.</p>
      <div>
        <label htmlFor="mfa-code" className="mb-1 block text-sm font-medium text-gray-700">
          Authenticator code
        </label>
        <input
          id="mfa-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-lg tracking-widest"
          autoFocus
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting || code.length < 6}
        className="rounded bg-(--color-accent) px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitting ? "Verifying…" : "Verify"}
      </button>
    </form>
  );
}
