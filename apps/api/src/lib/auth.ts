import type { Context } from "hono";
import type { Env } from "../env.js";
import { rpc, select } from "./db.js";
import { cacheGet, cacheSet } from "./redis.js";

export interface ViewerOrg {
  id: string;
  display_name: string;
  status: "pending" | "active" | "flagged" | "suspended";
  pan_verified: boolean;
}

export interface Viewer {
  user_id: string;
  email: string;
  org: ViewerOrg | null;
}

interface SupabaseUser {
  id: string;
  email?: string;
}

async function tokenKey(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return `sess:${[...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

async function fetchUser(env: Env, token: string): Promise<SupabaseUser | null> {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = (await res.json()) as SupabaseUser;
  return user?.id ? user : null;
}

async function loadOrg(env: Env, userId: string, email: string): Promise<ViewerOrg | null> {
  const orgId = await rpc<string | null>(env, "claim_organization", {
    p_user_id: userId,
    p_email: email,
  });
  if (!orgId) return null;

  const rows = await select<
    { id: string; display_name: string; status: ViewerOrg["status"]; verifications: { check_type: string; status: string }[] }[]
  >(env, "organizations", `id=eq.${orgId}&select=id,display_name,status,verifications(check_type,status)`);
  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    display_name: row.display_name,
    status: row.status,
    pan_verified: row.verifications.some((v) => v.check_type === "pan" && v.status === "verified"),
  };
}

export async function getViewer(c: Context<{ Bindings: Env }>): Promise<Viewer | null> {
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !c.env.SUPABASE_ANON_KEY) return null;

  const key = await tokenKey(token);
  const cached = await cacheGet<Viewer>(c.env, key);
  if (cached) return cached;

  const user = await fetchUser(c.env, token);
  if (!user?.email) return null;

  const viewer: Viewer = {
    user_id: user.id,
    email: user.email.toLowerCase(),
    org: await loadOrg(c.env, user.id, user.email.toLowerCase()),
  };
  await cacheSet(c.env, key, viewer, 60);
  return viewer;
}

export function canContact(viewer: Viewer | null): viewer is Viewer & { org: ViewerOrg } {
  return Boolean(viewer?.org?.pan_verified) && viewer!.org!.status !== "suspended";
}
