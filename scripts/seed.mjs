#!/usr/bin/env node
// Seeds the sample organisations into Supabase. Reads apps/api/.dev.vars or the environment. Safe to re-run.

import { readFileSync } from "node:fs";
import { SAMPLE_ORGS } from "../packages/shared/src/sample.ts";

function loadEnv() {
  try {
    for (const line of readFileSync(new URL("../apps/api/.dev.vars", import.meta.url), "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* no .env, rely on the environment */
  }
}
loadEnv();

const URL_BASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_BASE || !KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in apps/api/.dev.vars first.");
  process.exit(1);
}

const ORGS = SAMPLE_ORGS;

async function rest(path, init) {
  const res = await fetch(`${URL_BASE}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      authorization: `Bearer ${KEY}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

let added = 0;
let skipped = 0;

for (const { sectors, verified, ...org } of ORGS) {
  const existing = await rest(`/organizations?pan=eq.${org.pan}&select=id`);
  if (existing.length) {
    skipped++;
    continue;
  }

  const [row] = await rest(`/organizations`, {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({ ...org, status: "active" }),
  });

  await rest(`/organization_sectors`, {
    method: "POST",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify(sectors.map((s) => ({ organization_id: row.id, sector_slug: s }))),
  });

  await rest(`/verifications`, {
    method: "POST",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify(
      verified.map((check_type) => ({
        organization_id: row.id,
        check_type,
        status: "verified",
        provider: "seed",
        checked_at: new Date().toISOString(),
      })),
    ),
  });

  added++;
  console.log(`  added  ${org.display_name}`);
}

console.log(`\n${added} added, ${skipped} already present.`);
