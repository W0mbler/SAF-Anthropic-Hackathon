import type { Session } from "./types";
let csrf = "";
let pendingSession: Promise<Session> | null = null;
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
function errorMessage(data: unknown): string {
  if (typeof data !== "object" || data === null)
    return "The server could not complete this request.";
  const item = data as {
    detail?: unknown;
    message?: unknown;
    error?: { message?: unknown };
  };
  if (typeof item.detail === "string") return item.detail;
  if (
    typeof item.detail === "object" &&
    item.detail !== null &&
    "message" in item.detail &&
    typeof item.detail.message === "string"
  )
    return item.detail.message;
  if (Array.isArray(item.detail))
    return item.detail
      .map((e) => `${e.loc?.slice(1).join(".") || "Input"}: ${e.msg}`)
      .join("; ");
  if (typeof item.message === "string") return item.message;
  if (typeof item.error?.message === "string") return item.error.message;
  return "The server could not complete this request.";
}
export function session(): Promise<Session> {
  if (pendingSession) return pendingSession;
  pendingSession = request<Session>("/auth/me")
    .then((value) => {
      csrf = value.csrf_token;
      return value;
    })
    .finally(() => {
      pendingSession = null;
    });
  return pendingSession;
}
export async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  if (method !== "GET" && !csrf) await session();
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(method !== "GET" ? { "X-CSRF-Token": csrf } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError("Cannot reach the API. Check the service and retry.", 0);
  }
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(errorMessage(value), response.status);
  if (value?.csrf_token) csrf = value.csrf_token;
  return value as T;
}
export async function downloadRun(id: string, format: "json" | "csv") {
  const response = await fetch(`/api/v1/runs/${id}/export?format=${format}`, {
    credentials: "same-origin",
  });
  if (!response.ok)
    throw new ApiError("Export could not be downloaded.", response.status);
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `saf-command-${id}.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
}
