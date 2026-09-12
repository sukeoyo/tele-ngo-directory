import type { SearchResponse, SearchInput } from "@tele/shared";

const BASE = import.meta.env.VITE_API_URL ?? "";

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly issues?: unknown) {
    super(message);
  }
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (body && typeof body === "object" && "error" in body && String(body.error)) ||
      "Could not reach the directory. Check your connection and try again.";
    throw new ApiError(message, res.status, (body as any)?.issues);
  }
  return body as T;
}

export function searchNgos(input: Partial<SearchInput>, signal?: AbortSignal): Promise<SearchResponse> {
  const params = new URLSearchParams();
  if (input.q) params.set("q", input.q);
  if (input.state) params.set("state", input.state);
  if (input.district) params.set("district", input.district);
  if (input.verified_only) params.set("verified_only", "true");
  if (input.limit) params.set("limit", String(input.limit));
  if (input.offset) params.set("offset", String(input.offset));
  for (const s of input.sectors ?? []) params.append("sectors", s);
  return json<SearchResponse>(`/api/ngos?${params}`, { signal });
}

export function registerNgo(payload: unknown) {
  return json(`/api/register`, { method: "POST", body: JSON.stringify(payload) });
}
