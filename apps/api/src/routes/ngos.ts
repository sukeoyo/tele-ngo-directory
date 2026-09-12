import { Hono } from "hono";
import { searchSchema } from "@tele/shared";
import type { NgoSummary, SearchResponse } from "@tele/shared";
import type { Env } from "../env.js";
import { rpc, select } from "../lib/db.js";
import { cacheGet, cacheSet } from "../lib/redis.js";

export const ngos = new Hono<{ Bindings: Env }>();

/** Row shape from search_ngos — it carries total_count on every row. */
type SearchRow = NgoSummary & { total_count: number };

ngos.get("/", async (c) => {
  const url = new URL(c.req.url);

  const parsed = searchSchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    // Repeatable param: ?sectors=education&sectors=health
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

  // Cache on the normalised filter set, so ?state=BR&q= and ?q=&state=BR are
  // one entry. Sixty seconds is long enough to absorb a burst of pagination
  // and short enough that a newly verified listing shows up quickly.
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

ngos.get("/:id", async (c) => {
  const id = c.req.param("id");

  const rows = await select<Record<string, unknown>[]>(
    c.env,
    "organizations",
    `id=eq.${encodeURIComponent(id)}` +
      `&status=in.(active,flagged)` +
      // Contact details are deliberately included here but gated in the
      // response below — never send them to an anonymous caller.
      `&select=id,display_name,mission,website,year_established,entity_type,` +
      `state_code,district,operates_pan_india,status,open_to_contact,` +
      `contact_email,contact_person,` +
      `organization_sectors(sector_slug),` +
      `verifications(check_type,status,checked_at,expires_at)`,
  );

  const org = rows[0];
  if (!org) return c.json({ error: "Not found" }, 404);

  // Only organisations that are themselves signed in and verified get contact
  // details. Everyone else sees the listing and a prompt to register.
  const viewerOrgId = c.req.header("x-org-id");
  const canSeeContact = Boolean(viewerOrgId) && org.open_to_contact === true;

  if (!canSeeContact) {
    delete org.contact_email;
    delete org.contact_person;
  }

  return c.json({
    ...org,
    contact_visible: canSeeContact,
  });
});
