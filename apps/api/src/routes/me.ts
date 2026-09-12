import { Hono } from "hono";
import { requestStatusSchema, updateListingSchema } from "@tele/shared";
import type { CollaborationRequest, MeResponse } from "@tele/shared";
import type { Env } from "../env.js";
import { eq, select, update } from "../lib/db.js";
import { getViewer } from "../lib/auth.js";

export const me = new Hono<{ Bindings: Env }>();

interface RequestRow {
  id: string;
  from_org_id: string;
  to_org_id: string;
  subject: string;
  message: string;
  status: CollaborationRequest["status"];
  created_at: string;
  from: { display_name: string } | null;
  to: { display_name: string } | null;
}

const REQUEST_SELECT =
  "id,from_org_id,to_org_id,subject,message,status,created_at," +
  "from:organizations!from_org_id(display_name),to:organizations!to_org_id(display_name)";

const toRequest = (r: RequestRow): CollaborationRequest => ({
  id: r.id,
  from_org_id: r.from_org_id,
  from_org_name: r.from?.display_name ?? "Unknown",
  to_org_id: r.to_org_id,
  to_org_name: r.to?.display_name ?? "Unknown",
  subject: r.subject,
  message: r.message,
  status: r.status,
  created_at: r.created_at,
});

me.get("/", async (c) => {
  const viewer = await getViewer(c);
  if (!viewer) return c.json({ error: "Sign in first." }, 401);

  if (!viewer.org) {
    const body: MeResponse = { email: viewer.email, org: null, inbox: [], sent: [] };
    return c.json(body);
  }

  const orgId = viewer.org.id;
  const [orgRows, inbox, sent] = await Promise.all([
    select<Record<string, unknown>[]>(
      c.env,
      "organizations",
      `id=${eq(orgId)}&select=id,display_name,legal_name,mission,state_code,district,operates_pan_india,` +
        `year_established,website,status,open_to_contact,contact_email,contact_person,contact_phone,` +
        `organization_sectors(sector_slug),verifications(check_type,status,checked_at,expires_at),` +
        `endorsements!endorsed_id(id)`,
    ),
    select<RequestRow[]>(c.env, "collaboration_requests", `to_org_id=${eq(orgId)}&select=${REQUEST_SELECT}&order=created_at.desc&limit=100`),
    select<RequestRow[]>(c.env, "collaboration_requests", `from_org_id=${eq(orgId)}&select=${REQUEST_SELECT}&order=created_at.desc&limit=100`),
  ]);

  const row = orgRows[0];
  if (!row) return c.json({ error: "Not found" }, 404);

  const sectors = (row.organization_sectors as { sector_slug: string }[]).map((s) => s.sector_slug);
  const verifications = row.verifications as MeResponse["org"] extends infer O ? O extends { verifications: infer V } ? V : never : never;
  const endorsementCount = (row.endorsements as unknown[]).length;
  const { organization_sectors, endorsements, ...rest } = row;

  const body: MeResponse = {
    email: viewer.email,
    org: {
      ...(rest as Omit<NonNullable<MeResponse["org"]>, "sectors" | "verified_checks" | "endorsement_count" | "verifications">),
      sectors,
      verifications,
      verified_checks: verifications.filter((v) => v.status === "verified").map((v) => v.check_type),
      endorsement_count: endorsementCount,
    },
    inbox: inbox.map(toRequest),
    sent: sent.map(toRequest),
  };
  return c.json(body);
});

me.patch("/", async (c) => {
  const viewer = await getViewer(c);
  if (!viewer?.org) return c.json({ error: "No listing linked to this account." }, 401);

  const parsed = updateListingSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Some details need fixing", issues: parsed.error.issues }, 400);
  }
  const patch = Object.fromEntries(
    Object.entries(parsed.data).map(([k, v]) => [k, v === "" ? null : v]),
  );
  if (Object.keys(patch).length === 0) return c.json({ error: "Nothing to update" }, 400);

  const [row] = await update<Record<string, unknown>[]>(c.env, "organizations", `id=${eq(viewer.org.id)}`, patch);
  return c.json(row ?? {});
});

me.patch("/requests/:id", async (c) => {
  const viewer = await getViewer(c);
  if (!viewer?.org) return c.json({ error: "No listing linked to this account." }, 401);

  const parsed = requestStatusSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid status" }, 400);

  const rows = await update<{ id: string }[]>(
    c.env,
    "collaboration_requests",
    `id=${eq(c.req.param("id"))}&to_org_id=${eq(viewer.org.id)}`,
    { status: parsed.data.status, ...(parsed.data.status === "read" ? { read_at: new Date().toISOString() } : {}) },
  );
  if (rows.length === 0) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});
