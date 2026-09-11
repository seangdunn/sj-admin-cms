export interface Session {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

const SESSION_KEY = "sj-admin-cms.session";

// sessionStorage, not localStorage: static export means there's no server
// to set an httpOnly cookie, so this is the best available option —
// survives a refresh within the tab (unlike an in-memory-only approach,
// which would force re-login on every page load) and auto-clears on tab
// close. Wrapped in try/catch since it can throw or return null in a
// private window / with blocked site data — the app just degrades to
// "always redirected to login" rather than crashing.

export function saveSession(session: Session): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore — see comment above
  }
}

export function getSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

export function isSessionExpired(session: Session, bufferMs = 60_000): boolean {
  return Date.now() + bufferMs >= session.expiresAt;
}
