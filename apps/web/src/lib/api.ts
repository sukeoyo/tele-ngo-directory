import type {
  CollaborationRequest,
  ContactInput,
  MeResponse,
  NgoProfile,
  RegisterResponse,
  SearchInput,
  SearchResponse,
  UpdateListingInput,
} from "@tele/shared";

const BASE = import.meta.env.VITE_API_URL ?? "";

export interface Issue {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly issues: Issue[] = []) {
    super(message);
  }
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries(this.issues.map((i) => [i.field, i.message]));
  }
}

function normaliseIssues(raw: unknown): Issue[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((i: { field?: string; path?: (string | number)[]; message?: string }) => ({
    field: i.field ?? (i.path ?? []).join("."),
    message: i.message ?? "Invalid value",
  }));
}

async function json<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) } });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const obj = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const message = typeof obj.error === "string" ? obj.error : "Could not reach the directory. Check your connection and try again.";
    throw new ApiError(message, res.status, normaliseIssues(obj.issues));
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

export const getNgo = (id: string, token?: string) => json<NgoProfile>(`/api/ngos/${id}`, {}, token);

export const registerNgo = (payload: unknown) =>
  json<RegisterResponse>("/api/register", { method: "POST", body: JSON.stringify(payload) });

export const contactNgo = (id: string, input: ContactInput, token: string) =>
  json<{ id: string; message: string }>(`/api/ngos/${id}/contact`, { method: "POST", body: JSON.stringify(input) }, token);

export const endorseNgo = (id: string, note: string, token: string) =>
  json<{ ok: true }>(`/api/ngos/${id}/endorse`, { method: "POST", body: JSON.stringify({ note }) }, token);

export const unendorseNgo = (id: string, token: string) =>
  json<{ ok: true }>(`/api/ngos/${id}/endorse`, { method: "DELETE" }, token);

export const getMe = (token: string) => json<MeResponse>("/api/me", {}, token);

export const updateMe = (patch: UpdateListingInput, token: string) =>
  json<unknown>("/api/me", { method: "PATCH", body: JSON.stringify(patch) }, token);

export const updateRequest = (id: string, status: CollaborationRequest["status"], token: string) =>
  json<{ ok: true }>(`/api/me/requests/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }, token);
