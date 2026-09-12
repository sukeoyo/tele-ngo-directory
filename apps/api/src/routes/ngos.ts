import { Hono } from "hono";
import { contactSchema, endorseSchema, searchSchema } from "@tele/shared";
import type { NgoProfile, NgoSummary, SearchResponse, VerificationSummary } from "@tele/shared";
import type { Env } from "../env.js";
import { DbError, eq, insert, remove, rpc, select } from "../lib/db.js";
import { cacheGet, cacheSet, rateLimit } from "../lib/redis.js";
import { canContact, getViewer } from "../lib/auth.js";

export const ngos = new Hono<{ Bindings: Env }>();

type SearchRow = NgoSummary & { total_count: number };

ngos.get("/", async (c) => {
  const url = new URL(c.req.url);
  const parsed = searchSchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    sectors: url.searchParams.getAll("sectors").filter(Boolean),
    state: url.searchParams.get("state") ?? undefined,
    district: url.searchParams.get("district") ?? undefined,
    verified_only: url.searchParams.get("verified_only") === "true",
    limit: Number(url.searchParams.get("limit") ?? 20),
    offset: Number(url.searchParams.get("offset") ?? 0),
  });
  if (!parsed.success) {
    return c.json({ error: "Invalid search", issues: parsed.error.issues }, 400);
  }
  const input = parsed.data;

  const cacheKey = `search:${JSON.stringify({
    q: input.q ?? "",
    s: [...(input.sectors ?? [])].sort(),
    st: input.state ?? "",
    d: input.district ?? "",
    v: input.verified_only,
    l: input.limit,
    o: input.offset,
  })}`;
  const cached = await cacheGet<SearchResponse>(c.env, cacheKey);
  if (cached) return c.json(cached);

  const rows = await rpc<SearchRow[]>(c.env, "search_ngos", {
    p_query: input.q ?? null,
    p_sectors: input.sectors?.length ? input.sectors : null,
    p_state: input.state ?? null,
    p_district: input.district ?? null,
    p_verified_only: input.verified_only,
    p_limit: input.limit,
    p_offset: input.offset,
  });

  const response: SearchResponse = {
    results: rows.map(({ total_count, ...rest }) => rest),
    total: rows[0]?.total_count ?? 0,
    limit: input.limit,
    offset: input.offset,
  };
  await cacheSet(c.env, cacheKey, response, 60);
  return c.json(response);
});

interface ProfileRow {
  id: string;
  display_name: string;
  legal_name: string;
  mission: string | null;
  website: string | null;
  year_established: number | null;
  entity_type: NgoProfile["entity_type"];
  registration_number: string | null;
  darpan_id: string | null;
  state_code: string | null;
  district: string | null;
  operates_pan_india: boolean;
  status: NgoProfile["status"];
  open_to_contact: boolean;
  owner_id: string | null;
  contact_email: string;
  contact_person: string | null;
  contact_phone: string | null;
  organization_sectors: { sector_slug: string }[];
  verifications: VerificationSummary[];
  endorsements: {
    id: string;
    endorser_id: string;
    note: string | null;
    created_at: string;
    endorser: { display_name: string } | null;
  }[];
}

const PROFILE_SELECT =
  "id,display_name,legal_name,mission,website,year_established,entity_type,registration_number," +
  "darpan_id,state_code,district,operates_pan_india,status,open_to_contact,owner_id," +
  "contact_email,contact_person,contact_phone," +
  "organization_sectors(sector_slug)," +
  "verifications(check_type,status,checked_at,expires_at)," +
  "endorsements!endorsed_id(id,endorser_id,note,created_at,endorser:organizations!endorser_id(display_name))";

ngos.get("/:id", async (c) => {
  const id = c.req.param("id");
  const viewer = await getViewer(c);

  const rows = await select<ProfileRow[]>(
    c.env,
    "organizations",
    `id=${eq(id)}&select=${PROFILE_SELECT}`,
  );
  const row = rows[0];
  const isOwner = Boolean(viewer && row && (row.owner_id === viewer.user_id || viewer.org?.id === row.id));
  if (!row || (!isOwner && !["active", "flagged"].includes(row.status))) {
    return c.json({ error: "Not found" }, 404);
  }

  const verified = canContact(viewer);
  const isSelf = viewer?.org?.id === row.id;
  const contactVisible = isOwner || (verified && row.open_to_contact && !isSelf);
  const hasEndorsed = Boolean(viewer?.org && row.endorsements.some((e) => e.endorser_id === viewer.org!.id));

  const { owner_id, contact_email, contact_person, contact_phone, organization_sectors, endorsements, verifications, ...rest } = row;

  const profile: NgoProfile = {
    ...rest,
    sectors: organization_sectors.map((s) => s.sector_slug).sort(),
    verifications: isOwner ? verifications : verifications.filter((v) => v.status === "verified"),
    endorsements: endorsements.map((e) => ({
      id: e.id,
      endorser_id: e.endorser_id,
      endorser_name: e.endorser?.display_name ?? "An organisation",
      note: e.note,
      created_at: e.created_at,
    })),
    contact_visible: contactVisible,
    ...(contactVisible ? { contact_email, contact_person: contact_person ?? undefined, contact_phone: contact_phone ?? undefined } : {}),
    viewer: {
      signed_in: Boolean(viewer),
      can_contact: verified && !isSelf && row.open_to_contact,
      can_endorse: verified && !isSelf,
      has_endorsed: hasEndorsed,
      is_owner: isOwner,
    },
  };
  return c.json(profile);
});

ngos.post("/:id/contact", async (c) => {
  const viewer = await getViewer(c);
  if (!viewer) return c.json({ error: "Sign in to contact organisations." }, 401);
  if (!canContact(viewer)) {
    return c.json({ error: "Only PAN-verified organisations can send collaboration requests." }, 403);
  }

  const toId = c.req.param("id");
  if (toId === viewer.org.id) return c.json({ error: "You cannot contact your own organisation." }, 400);

  const allowed = await rateLimit(c.env, `rl:contact:${viewer.org.id}`, 20, 86400);
  if (!allowed) return c.json({ error: "Daily limit reached. Try again tomorrow." }, 429);

  const parsed = contactSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Some details need fixing", issues: parsed.error.issues }, 400);
  }

  const target = await select<{ id: string; open_to_contact: boolean; status: string }[]>(
    c.env,
    "organizations",
    `id=${eq(toId)}&select=id,open_to_contact,status`,
  );
  const org = target[0];
  if (!org || !["active", "flagged"].includes(org.status)) return c.json({ error: "Not found" }, 404);
  if (!org.open_to_contact) return c.json({ error: "This organisation is not accepting requests." }, 403);

  const [request] = await insert<{ id: string }[]>(c.env, "collaboration_requests", {
    from_org_id: viewer.org.id,
    to_org_id: toId,
    subject: parsed.data.subject,
    message: parsed.data.message,
  });
  return c.json({ id: request!.id, message: "Your request has been sent." }, 201);
});

ngos.post("/:id/endorse", async (c) => {
  const viewer = await getViewer(c);
  if (!viewer) return c.json({ error: "Sign in to endorse organisations." }, 401);
  if (!canContact(viewer)) return c.json({ error: "Only PAN-verified organisations can endorse." }, 403);

  const endorsedId = c.req.param("id");
  if (endorsedId === viewer.org.id) return c.json({ error: "You cannot endorse your own organisation." }, 400);

  const parsed = endorseSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Note is too long", issues: parsed.error.issues }, 400);

  try {
    await insert(
      c.env,
      "endorsements",
      { endorser_id: viewer.org.id, endorsed_id: endorsedId, note: parsed.data.note || null },
      false,
    );
  } catch (err) {
    if (err instanceof DbError && err.status === 409) return c.json({ error: "Already endorsed." }, 409);
    if (err instanceof DbError && err.status === 404) return c.json({ error: "Not found" }, 404);
    throw err;
  }
  return c.json({ ok: true }, 201);
});

ngos.delete("/:id/endorse", async (c) => {
  const viewer = await getViewer(c);
  if (!viewer?.org) return c.json({ error: "Sign in first." }, 401);
  await remove(
    c.env,
    "endorsements",
    `endorser_id=${eq(viewer.org.id)}&endorsed_id=${eq(c.req.param("id"))}`,
  );
  return c.json({ ok: true });
});
