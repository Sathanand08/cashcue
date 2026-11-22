/** Client-side helper for CashCue JSON APIs shaped as { data } | { error }. */

export type ApiErrorBody = {
  code: string;
  message: string;
  details?: unknown;
};

export class ApiRequestError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  let body: { data?: T; error?: ApiErrorBody } = {};
  try {
    body = (await res.json()) as { data?: T; error?: ApiErrorBody };
  } catch {
    throw new ApiRequestError("INTERNAL", "Invalid JSON response", res.status);
  }

  if (!res.ok || body.error) {
    throw new ApiRequestError(
      body.error?.code ?? "INTERNAL",
      body.error?.message ?? `Request failed (${res.status})`,
      res.status,
      body.error?.details,
    );
  }

  return body.data as T;
}
