import type { Env } from "../env.js";

/**
 * PAN verification.
 *
 * Protean (formerly NSDL) does not expose an open public API — direct access
 * needs a bulk-verification agreement. Everyone ships on top of an aggregator:
 * Cashfree Verification Suite, Signzy, HyperVerge, Digio or Karza/Perfios.
 * They all return roughly the same three things, so this adapter normalises
 * them and the rest of the codebase never learns which one we picked.
 *
 * Set PAN_PROVIDER=mock to develop without an account.
 */

export type PanOutcome = "verified" | "mismatch" | "failed";

export interface PanResult {
  outcome: PanOutcome;
  /** Name as it appears on the PAN record, when the provider returns it. */
  registered_name?: string;
  /** How closely it matched the name the organisation gave us, 0–1. */
  name_score?: number;
  raw: unknown;
}

/**
 * Compares the name on the PAN record with the legal name entered at signup.
 *
 * This is deliberately forgiving. Organisations write "Shri Ram Educational
 * Trust" where the PAN says "SHRIRAM EDUCATIONAL TRUST", and legal suffixes
 * drift constantly. A low score routes to human review — it never rejects on
 * its own, because a mismatch is usually clerical, not fraudulent.
 */
/**
 * Words that carry no identifying information for an Indian NGO. Almost every
 * organisation has one or more of these, so matching on them tells us nothing
 * and letting them count inflates scores between unrelated organisations.
 */
const GENERIC_TOKENS = new Set([
  "THE", "AND", "OF", "FOR", "SHRI", "SRI", "SMT",
  "FOUNDATION", "TRUST", "SOCIETY", "ASSOCIATION", "SAMITI", "SANSTHA",
  "SANSTHAN", "SANGH", "CHARITABLE", "WELFARE", "ORGANIZATION",
  "ORGANISATION", "INDIA", "INDIAN", "PUBLIC", "PRIVATE", "LIMITED", "LTD",
  "PVT", "NGO",
]);

function distinctiveTokens(name: string): Set<string> {
  return new Set(
    name
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1 && !GENERIC_TOKENS.has(t)),
  );
}

export function nameMatchScore(entered: string, registered: string): number {
  const a = distinctiveTokens(entered);
  const b = distinctiveTokens(registered);

  // If either name is nothing but generic words there is nothing to match on.
  // Returning 0 sends it to a human rather than guessing.
  if (a.size === 0 || b.size === 0) return 0;

  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  if (shared === 0) return 0;

  // Containment, not a symmetric coefficient. "Goonj" against "Goonj
  // Foundation" is the single commonest real pattern — an organisation enters
  // the short name it actually goes by while the PAN carries the full legal
  // name. A symmetric score punishes that, which would route a large share of
  // perfectly good registrations into manual review and make the queue
  // useless. Scoring against the shorter name treats a strict subset as the
  // strong evidence it is.
  const containment = shared / Math.min(a.size, b.size);

  // One shared distinctive word out of one is only convincing when that word
  // is substantial. "RAM" matching inside a longer name is weaker evidence
  // than "ARGHYAM" matching, so hold single-token matches to a lower ceiling
  // and let a reviewer confirm.
  if (Math.min(a.size, b.size) === 1) {
    const token = [...(a.size === 1 ? a : b)][0] ?? "";
    return token.length >= 5 ? containment : containment * 0.6;
  }

  return containment;
}

const MATCH_THRESHOLD = 0.7;

export async function verifyPan(env: Env, pan: string, legalName: string): Promise<PanResult> {
  if (env.PAN_PROVIDER === "mock" || !env.PAN_API_URL) {
    return mockVerify(pan, legalName);
  }

  try {
    const res = await fetch(env.PAN_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Most aggregators use a bearer token or an x-api-key pair. Adjust the
        // header and body shape when you pick one — this is the only place
        // that needs to change.
        authorization: `Bearer ${env.PAN_API_KEY}`,
      },
      body: JSON.stringify({ pan, name: legalName }),
    });

    if (!res.ok) {
      return { outcome: "failed", raw: { status: res.status, body: await res.text() } };
    }

    const body = (await res.json()) as Record<string, unknown>;
    const registered = String(body.registered_name ?? body.name ?? "");
    const valid = body.valid === true || body.status === "VALID";

    if (!valid) return { outcome: "failed", registered_name: registered, raw: body };

    const score = registered ? nameMatchScore(legalName, registered) : 1;
    return {
      outcome: score >= MATCH_THRESHOLD ? "verified" : "mismatch",
      registered_name: registered,
      name_score: score,
      raw: body,
    };
  } catch (err) {
    // Network failure is not the organisation's fault. Fail soft: the listing
    // stays pending and a retry is queued, rather than the signup being lost.
    return { outcome: "failed", raw: { error: String(err) } };
  }
}

/**
 * Mock provider. Deterministic so tests are stable:
 *   - PAN with 4th char 'P' (personal)  → failed
 *   - PAN ending in '9'                 → mismatch, to exercise the review path
 *   - anything else                     → verified
 */
function mockVerify(pan: string, legalName: string): PanResult {
  if (pan[3] === "P") {
    return { outcome: "failed", raw: { mock: true, reason: "individual PAN" } };
  }
  if (pan.endsWith("9")) {
    const registered = `${legalName.toUpperCase()} FOUNDATION`;
    return {
      outcome: "mismatch",
      registered_name: registered,
      name_score: nameMatchScore(legalName, registered),
      raw: { mock: true },
    };
  }
  return {
    outcome: "verified",
    registered_name: legalName.toUpperCase(),
    name_score: 1,
    raw: { mock: true },
  };
}

/** Never store a full PAN in a readable log or reference field. */
export function maskPan(pan: string): string {
  return `${pan.slice(0, 3)}****${pan.slice(-2)}`;
}
