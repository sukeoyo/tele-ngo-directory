import type { Env } from "../env.js";

// Upstash over REST. Every call fails open so Redis outages never take the site down.

async function command(env: Env, args: (string | number)[]): Promise<unknown> {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return null;
  try {
    const res = await fetch(env.UPSTASH_REDIS_REST_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(args),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: unknown };
    return body.result ?? null;
  } catch {
    return null;
  }
}

export async function cacheGet<T>(env: Env, key: string): Promise<T | null> {
  const raw = await command(env, ["GET", key]);
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSet(env: Env, key: string, value: unknown, ttlSeconds: number): Promise<void> {
  await command(env, ["SET", key, JSON.stringify(value), "EX", ttlSeconds]);
}

// Fixed-window limit. Returns true when allowed.
export async function rateLimit(
  env: Env,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const count = await command(env, ["INCR", key]);
  if (count === null) return true;
  if (count === 1) await command(env, ["EXPIRE", key, windowSeconds]);
  return Number(count) <= limit;
}
