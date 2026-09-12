import type { Env } from "../env.js";
import { DbError } from "./errors.js";
import { demoRequest, isDemo } from "./demo.js";

export { DbError };

// PostgREST over fetch. Uses the service role key, so every handler does its own authorisation.
// Without SUPABASE_URL the same calls are served from the in-memory demo store.

async function request(env: Env, path: string, init: RequestInit): Promise<unknown> {
  if (isDemo(env)) return demoRequest(path, init);

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message =
      (body && typeof body === "object" && "message" in body && String(body.message)) ||
      `Database request failed (${res.status})`;
    throw new DbError(message, res.status, body);
  }
  return body;
}

export function rpc<T>(env: Env, fn: string, args: Record<string, unknown>): Promise<T> {
  return request(env, `/rpc/${fn}`, { method: "POST", body: JSON.stringify(args) }) as Promise<T>;
}

export function insert<T>(env: Env, table: string, rows: unknown, returning = true): Promise<T> {
  return request(env, `/${table}`, {
    method: "POST",
    headers: { prefer: returning ? "return=representation" : "return=minimal" },
    body: JSON.stringify(rows),
  }) as Promise<T>;
}

export function update<T>(env: Env, table: string, filter: string, patch: unknown): Promise<T> {
  return request(env, `/${table}?${filter}`, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(patch),
  }) as Promise<T>;
}

export function remove(env: Env, table: string, filter: string): Promise<unknown> {
  return request(env, `/${table}?${filter}`, {
    method: "DELETE",
    headers: { prefer: "return=minimal" },
  });
}

export function select<T>(env: Env, table: string, query: string): Promise<T> {
  return request(env, `/${table}?${query}`, { method: "GET" }) as Promise<T>;
}

export const eq = (value: string) => `eq.${encodeURIComponent(value)}`;
