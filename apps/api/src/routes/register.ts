import { Hono } from "hono";
import { registerSchema } from "@tele/shared";
import type { RegisterResponse } from "@tele/shared";
import type { Env } from "../env.js";
import { insert, select, DbError } from "../lib/db.js";
import { rateLimit } from "../lib/redis.js";
import { verifyPan, maskPan } from "../lib/pan.js";

export const register = new Hono<{ Bindings: Env }>();

register.post("/", async (c) => {
  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  const allowed = await rateLimit(c.env, `rl:register:${ip}`, 5, 3600);
  if (!allowed) {
    return c.json(
      { error: "Too many registrations from this network. Try again in an hour." },
      429,
    );
  }

  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: "Expected a JSON body" }, 400);
  }

  const parsed = registerSchema.safeParse(payload);
  if (!parsed.success) {
    return c.json(
      {
        error: "Some details need fixing",
        issues: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      },
      400,
    );
  }
  const input = parsed.data;

  const existing = await select<{ id: string }[]>(
    c.env,
    "organizations",
    `pan=eq.${input.pan}&select=id`,
  );
  if (existing.length > 0) {
    return c.json(
      {
        error: "An organisation with this PAN is already listed.",
        hint: "If this is yours, use the sign-in link to claim it.",
      },
      409,
    );
  }

  const pan = await verifyPan(c.env, input.pan, input.legal_name);

  // Name mismatch goes live flagged for human review, never auto-rejected.
  const status =
    pan.outcome === "verified" ? "active" : pan.outcome === "mismatch" ? "flagged" : "pending";

  let orgId: string;
  try {
    const [org] = await insert<{ id: string }[]>(c.env, "organizations", {
      legal_name: input.legal_name,
      display_name: input.display_name,
      entity_type: input.entity_type,
      registration_number: input.registration_number || null,
      pan: input.pan,
      darpan_id: input.darpan_id || null,
      year_established: input.year_established ?? null,
      mission: input.mission,
      website: input.website || null,
      contact_email: input.contact_email,
      contact_person: input.contact_person || null,
      contact_phone: input.contact_phone || null,
      state_code: input.state_code ?? null,
      district: input.district || null,
      operates_pan_india: input.operates_pan_india,
      other_sector_note: input.other_sector_note || null,
      status,
    });
    orgId = org!.id;
  } catch (err) {
    if (err instanceof DbError && err.status === 409) {
      return c.json({ error: "An organisation with these details is already listed." }, 409);
    }
    throw err;
  }

  await insert(
    c.env,
    "organization_sectors",
    input.sectors.map((slug) => ({ organization_id: orgId, sector_slug: slug })),
    false,
  );

  await insert(
    c.env,
    "verifications",
    {
      organization_id: orgId,
      check_type: "pan",
      status: pan.outcome === "verified" ? "verified" : pan.outcome,
      provider: c.env.PAN_PROVIDER,
      reference: maskPan(input.pan),
      notes:
        pan.outcome === "mismatch"
          ? `Entered "${input.legal_name}", PAN reads "${pan.registered_name}" (score ${pan.name_score?.toFixed(2)})`
          : null,
      raw_response: pan.raw,
      checked_at: new Date().toISOString(),
    },
    false,
  );

  if (input.darpan_id) {
    await insert(
      c.env,
      "verifications",
      {
        organization_id: orgId,
        check_type: "darpan",
        status: "pending",
        provider: "self-declared",
        reference: input.darpan_id,
      },
      false,
    );
  }

  const message =
    status === "active"
      ? "Your organisation is listed and visible in the directory."
      : status === "flagged"
        ? "Your listing is live. The name on your PAN differs from what you entered, so we have marked it for review — this is usually just a difference between your legal and working name."
        : "We could not verify your PAN automatically. Your listing is saved and someone will review it within two working days.";

  const body: RegisterResponse = {
    id: orgId,
    status,
    pan_verification: pan.outcome,
    message,
  };
  return c.json(body, 201);
});
