/**
 * The browser's side of the API.
 *
 * Every route in `app/api` answers with JSON, uses the status code to say
 * whether the call worked, and puts a human-readable sentence in `error` when
 * it did not. That contract was previously re-implemented at each of the fifty
 * or so call sites — check `response.ok`, `await response.json()`, read
 * `data.error`, remember the `content-type` header on writes. It lives here
 * instead, so the components are left holding data rather than transport.
 */

/** A non-2xx answer. `serverMessage` is set only when the route sent one. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly serverMessage?: string,
  ) {
    super(serverMessage ?? `The request failed (${status}).`);
    this.name = "ApiError";
  }
}

/**
 * The server's own wording when it sent one, the caller's fallback otherwise.
 * Routes phrase their failures for the reader ("Choose a valid subject."), so
 * showing that beats a generic message — but only when it really came back.
 */
export function apiMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.serverMessage ? error.serverMessage : fallback;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);

  // Deletes answer 200 with a body on some routes and no body on others, and a
  // proxy failure can produce an HTML error page, so parse defensively.
  const body = await response.text();
  let payload: unknown;
  try {
    payload = body ? JSON.parse(body) : undefined;
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : undefined;
    throw new ApiError(response.status, message);
  }

  return payload as T;
}

const asJson = (body: unknown): RequestInit => ({
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: "POST", ...asJson(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", ...asJson(body) }),
  remove: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  /** Multipart, so the browser sets the content type and its boundary. */
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: "POST", body: form }),
};
