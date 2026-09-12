import type { Env } from "../env.js";

/**
 * Thin PostgREST client.
 *
 * We talk to Supabase over HTTP rather than a TCP Postgres driver because
 * Workers have no TCP sockets. Using fetch directly instead of supabase-js
 * keeps the Worker bundle small and the request path obvious — there is no
 * connection pooling or retry behaviour hiding in a dependency.
 *
 * This uses the service role key and therefore bypasses row level security.
 * Every handler that touches it is responsible for its own authorisation.
 */

export class DbError extends Error {
  constructor(message: string, readonly status: number, readonly detail?: unknown) {
    super(message);
  }
}

async function request(env: Env, path: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
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

/** Calls a Postgres function. This is where search happens. */
export function rpc<T>(env: Env, fn: string, args: Record<string, unknown>): Promise<T> {
  return request(env, `/rpc/${fn}`, {
    method: "POST",
    body: JSON.stringify(args),
  }) as Promise<T>;
}

export function insert<T>(env: Env, table: string, rows: unknown, returning = true): Promise<T> {
  return request(env, `/${table}`, {
    method: "POST",
    headers: returning ? { prefer: "return=representation" } : { prefer: "return=minimal" },
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

export function select<T>(env: Env, table: string, query: string): Promise<T> {
  return request(env, `/${table}?${query}`, { method: "GET" }) as Promise<T>;
}
