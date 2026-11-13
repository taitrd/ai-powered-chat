/**
 * HTTP client layer. Every backend call goes through here, so the base URL,
 * auth headers and error parsing live in one place.
 */
import { apiBaseUrl } from "../../lib/config/api";

/** A failed API call, with the backend's error message when it sent one. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Machine-readable reason from the backend, e.g. "daily_limit". */
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// --- Credentials -------------------------------------------------------------

let devUser = "dev";
let accessToken: string | null = null;

/** Local development only: act as this user (sent as `X-Dev-User`). */
export function setDevUser(user: string): void {
  devUser = user;
}

/** Cognito access token, or null when signed out. */
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

function headers(): Record<string, string> {
  const result: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) {
    result.Authorization = `Bearer ${accessToken}`;
  } else {
    result["X-Dev-User"] = devUser;
  }
  return result;
}

// --- Errors ------------------------------------------------------------------

/**
 * Reads FastAPI's error body. `detail` is a string for most errors, and a list of
 * field errors for validation failures (422).
 */
export async function parseError(
  response: Response,
  fallback: string,
): Promise<ApiError> {
  let message = fallback;
  let code: string | undefined;
  try {
    const body = await response.json();
    if (typeof body?.code === "string") code = body.code;
    if (typeof body?.detail === "string") {
      message = body.detail;
    } else if (typeof body?.detail?.message === "string") {
      message = body.detail.message;
      if (typeof body.detail.code === "string") code = body.detail.code;
    } else if (Array.isArray(body?.detail) && body.detail[0]?.msg) {
      message = body.detail.map((d: { msg: string }) => d.msg).join("; ");
    }
  } catch {
    // Body wasn't JSON: keep the fallback message.
  }
  return new ApiError(message, response.status, code);
}

// --- Requests ----------------------------------------------------------------

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
  /** Message to show when the backend doesn't send one. */
  errorMessage?: string;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = `${apiBaseUrl}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `${url}?${search}` : url;
}

/** Sends a request and returns the raw response. Use for streaming. */
export function send(
  path: string,
  options: RequestOptions = {},
): Promise<Response> {
  return fetch(buildUrl(path, options.query), {
    method: options.method ?? "GET",
    headers: headers(),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });
}

/** Sends a request and returns the parsed JSON body. Throws `ApiError` on failure. */
export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const response = await send(path, options);
  if (!response.ok) {
    throw await parseError(
      response,
      options.errorMessage ?? `Request failed (${response.status})`,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const http = {
  get: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "GET" }),
  post: <T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, "method" | "body">,
  ) => request<T>(path, { ...options, method: "POST", body }),
  patch: <T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, "method" | "body">,
  ) => request<T>(path, { ...options, method: "PATCH", body }),
  delete: <T = void>(
    path: string,
    options?: Omit<RequestOptions, "method" | "body">,
  ) => request<T>(path, { ...options, method: "DELETE" }),
};
