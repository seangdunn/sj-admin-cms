import { env } from "./env";
import { getSession, isSessionExpired, type Session } from "./session";
import { refreshSession } from "./cognito";

export class ApiError extends Error {
  status: number;
  fieldErrors?: Record<string, string>;

  constructor(status: number, message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

async function getValidSession(): Promise<Session | null> {
  const session = getSession();
  if (!session) return null;
  if (!isSessionExpired(session)) return session;
  try {
    return await refreshSession(session.refreshToken);
  } catch {
    return null;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** Attach the Authorization header. Required for every /api/v1/admin/* route. */
  auth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = false } = options;
  const headers: Record<string, string> = {};

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (auth) {
    const session = await getValidSession();
    if (!session) {
      throw new ApiError(401, "Not signed in");
    }
    headers.Authorization = `Bearer ${session.idToken}`;
  }

  const response = await fetch(`${env.apiUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const fieldErrors =
      data && typeof data.errors === "object" && data.errors !== null ? data.errors : undefined;
    const message =
      (fieldErrors && (Object.values(fieldErrors)[0] as string | undefined)) ||
      data?.error ||
      `Request failed with status ${response.status}`;
    throw new ApiError(response.status, message, fieldErrors);
  }

  return data as T;
}

export const apiClient = {
  get: <T>(path: string, auth = false) => request<T>(path, { method: "GET", auth }),
  post: <T>(path: string, body: unknown, auth = true) =>
    request<T>(path, { method: "POST", body, auth }),
  put: <T>(path: string, body: unknown, auth = true) =>
    request<T>(path, { method: "PUT", body, auth }),
  del: <T>(path: string, auth = true) => request<T>(path, { method: "DELETE", auth }),
};
