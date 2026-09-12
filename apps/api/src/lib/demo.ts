import { SAMPLE_ORGS } from "@tele/shared";
import type { Env } from "../env.js";
import { DbError } from "./errors.js";

// In-memory stand-in for PostgREST so the app runs with no accounts. Resets when the Worker restarts.

type Row = Record<string, unknown>;

interface Store {
  organizations: Row[];
  organization_sectors: Row[];
  verifications: Row[];
  endorsements: Row[];
  collaboration_requests: Row[];
}

const DEFAULTS: Partial<Record<keyof Store, Row>> = {
  organizations: { owner_id: null, open_to_contact: true, registration_number: null, darpan_id: null, contact_person: null, contact_phone: null, website: null, district: null, other_sector_note: null },
  verifications: { status: "pending", provider: null, reference: null, notes: null, raw_response: null, checked_at: null, expires_at: null },
  endorsements: { note: null },
  collaboration_requests: { status: "sent", read_at: null },
};

const UNIQUE: Record<string, string[][]> = {
  organizations: [["pan"]],
  organization_sectors: [["organization_id", "sector_slug"]],
  verifications: [["organization_id", "check_type"]],
  endorsements: [["endorser_id", "endorsed_id"]],
};

let store: Store | null = null;

export const isDemo = (env: Env) => !env.SUPABASE_URL;

function seed(): Store {
  const s: Store = { organizations: [], organization_sectors: [], verifications: [], endorsements: [], collaboration_requests: [] };
  const now = new Date().toISOString();
  for (const { sectors, verified, ...org } of SAMPLE_ORGS) {
    const id = crypto.randomUUID();
    s.organizations.push({
      id,
      ...org,
      registration_number: null,
      darpan_id: verified.includes("darpan") ? "DL/2017/0123456" : null,
      contact_phone: null,
      other_sector_note: null,
      owner_id: null,
      status: "active",
      open_to_contact: true,
      created_at: now,
      updated_at: now,
    });
    for (const sector_slug of sectors) s.organization_sectors.push({ organization_id: id, sector_slug });
    for (const check_type of verified) {
      s.verifications.push({ id: crypto.randomUUID(), organization_id: id, check_type, status: "verified", provider: "seed", reference: null, notes: null, checked_at: now, expires_at: null, created_at: now });
    }
  }
  const [pratham, goonj, sewa] = s.organizations;
  if (pratham && goonj && sewa) {
    s.endorsements.push({ id: crypto.randomUUID(), endorser_id: pratham.id, endorsed_id: goonj.id, note: "Ran joint relief camps in Bihar in 2024.", created_at: now });
    s.endorsements.push({ id: crypto.randomUUID(), endorser_id: sewa.id, endorsed_id: goonj.id, note: null, created_at: now });
    syncPeer(s, goonj.id as string);
  }
  return s;
}

const db = () => (store ??= seed());

function syncPeer(s: Store, orgId: string) {
  const n = s.endorsements.filter((e) => e.endorsed_id === orgId).length;
  s.verifications = s.verifications.filter((v) => !(v.organization_id === orgId && v.check_type === "peer"));
  if (n > 0) {
    s.verifications.push({ id: crypto.randomUUID(), organization_id: orgId, check_type: "peer", status: "verified", provider: "peer", reference: String(n), notes: null, checked_at: new Date().toISOString(), expires_at: null, created_at: new Date().toISOString() });
  }
}

const name = (s: Store, id: unknown) => {
  const org = s.organizations.find((o) => o.id === id);
  return org ? { display_name: org.display_name } : null;
};

function embed(s: Store, table: string, row: Row): Row {
  if (table === "organizations") {
    return {
      ...row,
      organization_sectors: s.organization_sectors.filter((x) => x.organization_id === row.id),
      verifications: s.verifications.filter((x) => x.organization_id === row.id),
      endorsements: s.endorsements
        .filter((x) => x.endorsed_id === row.id)
        .map((e) => ({ ...e, endorser: name(s, e.endorser_id) })),
    };
  }
  if (table === "collaboration_requests") {
    return { ...row, from: name(s, row.from_org_id), to: name(s, row.to_org_id) };
  }
  return row;
}

function matcher(params: URLSearchParams): (row: Row) => boolean {
  const tests: ((row: Row) => boolean)[] = [];
  for (const [key, raw] of params) {
    if (["select", "order", "limit", "offset"].includes(key)) continue;
    const dot = raw.indexOf(".");
    const op = raw.slice(0, dot);
    const value = raw.slice(dot + 1);
    if (op === "eq") tests.push((r) => String(r[key] ?? "") === value);
    else if (op === "in") {
      const set = new Set(value.replace(/^\(|\)$/g, "").split(","));
      tests.push((r) => set.has(String(r[key])));
    } else if (op === "is" && value === "null") tests.push((r) => r[key] == null);
  }
  return (row) => tests.every((t) => t(row));
}

function checkUnique(s: Store, table: keyof Store, row: Row) {
  for (const cols of UNIQUE[table] ?? []) {
    if (s[table].some((r) => cols.every((c) => r[c] === row[c]))) {
      throw new DbError("duplicate key value violates unique constraint", 409);
    }
  }
}

function search(s: Store, a: Record<string, unknown>): Row[] {
  const q = String(a.p_query ?? "").toLowerCase();
  const sectors = Array.isArray(a.p_sectors) && a.p_sectors.length ? new Set(a.p_sectors as string[]) : null;
  const panVerified = (id: unknown) => s.verifications.some((v) => v.organization_id === id && v.check_type === "pan" && v.status === "verified");
  const endorsements = (id: unknown) => s.endorsements.filter((e) => e.endorsed_id === id).length;

  const rows = s.organizations
    .filter((o) => ["active", "flagged"].includes(String(o.status)))
    .filter((o) => !q || String(o.display_name).toLowerCase().includes(q) || String(o.mission ?? "").toLowerCase().includes(q))
    .filter((o) => !a.p_state || o.state_code === a.p_state || o.operates_pan_india === true)
    .filter((o) => !a.p_district || String(o.district ?? "").toLowerCase() === String(a.p_district).toLowerCase())
    .filter((o) => !sectors || s.organization_sectors.some((x) => x.organization_id === o.id && sectors.has(String(x.sector_slug))))
    .filter((o) => !a.p_verified_only || panVerified(o.id))
    .sort((x, y) =>
      Number(panVerified(y.id)) - Number(panVerified(x.id)) ||
      endorsements(y.id) - endorsements(x.id) ||
      String(x.display_name).localeCompare(String(y.display_name)),
    );

  const limit = Math.min(Number(a.p_limit ?? 20), 100);
  const offset = Math.max(Number(a.p_offset ?? 0), 0);
  return rows.slice(offset, offset + limit).map((o) => ({
    id: o.id,
    display_name: o.display_name,
    mission: o.mission,
    state_code: o.state_code,
    district: o.district,
    operates_pan_india: o.operates_pan_india,
    year_established: o.year_established,
    website: o.website,
    status: o.status,
    sectors: s.organization_sectors.filter((x) => x.organization_id === o.id).map((x) => x.sector_slug).sort(),
    verified_checks: s.verifications.filter((v) => v.organization_id === o.id && v.status === "verified").map((v) => v.check_type).sort(),
    endorsement_count: endorsements(o.id),
    total_count: rows.length,
  }));
}

function claim(s: Store, a: Record<string, unknown>): string | null {
  const owned = s.organizations.find((o) => o.owner_id === a.p_user_id);
  if (owned) return owned.id as string;
  const email = String(a.p_email ?? "").toLowerCase();
  const org = s.organizations.find((o) => String(o.contact_email).toLowerCase() === email && o.owner_id == null);
  if (!org) return null;
  org.owner_id = a.p_user_id;
  return org.id as string;
}

export async function demoRequest(path: string, init: RequestInit): Promise<unknown> {
  const s = db();
  const [rawPath = "", qs = ""] = path.split("?");
  const method = (init.method ?? "GET").toUpperCase();
  const body = init.body ? (JSON.parse(String(init.body)) as unknown) : null;
  const params = new URLSearchParams(qs);
  const returning = String((init.headers as Record<string, string> | undefined)?.prefer ?? "").includes("representation");

  if (rawPath.startsWith("/rpc/")) {
    const fn = rawPath.slice(5);
    const args = (body ?? {}) as Record<string, unknown>;
    if (fn === "search_ngos") return search(s, args);
    if (fn === "claim_organization") return claim(s, args);
    throw new DbError(`Unknown function ${fn}`, 404);
  }

  const table = rawPath.slice(1) as keyof Store;
  if (!(table in s)) throw new DbError(`Unknown table ${table}`, 404);
  const matches = matcher(params);

  if (method === "GET") {
    let rows = s[table].filter(matches);
    if (params.get("order")?.endsWith(".desc")) rows = [...rows].reverse();
    const limit = Number(params.get("limit") ?? 0);
    if (limit) rows = rows.slice(0, limit);
    return rows.map((r) => embed(s, table, r));
  }

  if (method === "POST") {
    const now = new Date().toISOString();
    const incoming = (Array.isArray(body) ? body : [body]) as Row[];
    const created: Row[] = [];
    for (const r of incoming) {
      const row: Row = { id: crypto.randomUUID(), created_at: now, updated_at: now, ...DEFAULTS[table], ...r };
      checkUnique(s, table, row);
      created.push(row);
    }
    s[table].push(...created);
    if (table === "endorsements") for (const r of created) syncPeer(s, r.endorsed_id as string);
    return returning ? created : null;
  }

  if (method === "PATCH") {
    const rows = s[table].filter(matches);
    for (const r of rows) Object.assign(r, body as Row, { updated_at: new Date().toISOString() });
    return rows.map((r) => embed(s, table, r));
  }

  if (method === "DELETE") {
    const gone = s[table].filter(matches);
    (s[table] as Row[]) = s[table].filter((r) => !matches(r));
    if (table === "endorsements") for (const r of gone) syncPeer(s, r.endorsed_id as string);
    return null;
  }

  throw new DbError(`Unsupported method ${method}`, 405);
}
