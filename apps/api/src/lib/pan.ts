import type { Env } from "../env.js";

// PAN verification via an aggregator (Cashfree, Signzy, Digio, Karza). PAN_PROVIDER=mock for local dev.

export type PanOutcome = "verified" | "mismatch" | "failed";

export interface PanResult {
  outcome: PanOutcome;
  /** Name as it appears on the PAN record, when the provider returns it. */
  registered_name?: string;
  /** How closely it matched the name the organisation gave us, 0–1. */
  name_score?: number;
  raw: unknown;
}

// Words that carry no identifying information for an Indian NGO.
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

  if (a.size === 0 || b.size === 0) return 0;

  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  if (shared === 0) return 0;

  // Containment against the shorter name, not Dice: "Goonj" vs "GOONJ FOUNDATION" must pass.
  const containment = shared / Math.min(a.size, b.size);

  // A single short shared token is weak evidence; cap it so a reviewer confirms.
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
    return { outcome: "failed", raw: { error: String(err) } };
  }
}

// Mock: 4th char 'P' → failed, ends in '9' → mismatch, else verified.
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

export function maskPan(pan: string): string {
  return `${pan.slice(0, 3)}****${pan.slice(-2)}`;
}
