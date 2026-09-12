#!/usr/bin/env node
/**
 * Seeds a handful of organisations so search returns something while you build.
 *
 * These are real, publicly-listed Indian NGOs, but the PANs are placeholders —
 * they are formatted correctly and will pass the mock verifier, and they are
 * not real PANs. Never put a real organisation's PAN in a seed file.
 *
 *   node scripts/seed.mjs
 *
 * Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env or the environment.
 * Safe to re-run: existing rows are skipped on PAN conflict.
 */

import { readFileSync } from "node:fs";

function loadEnv() {
  try {
    for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
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
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.");
  process.exit(1);
}

const ORGS = [
  {
    legal_name: "Pratham Education Foundation",
    display_name: "Pratham",
    entity_type: "trust",
    pan: "AAATP1234A",
    year_established: 1995,
    state_code: "MH",
    district: "Mumbai",
    operates_pan_india: true,
    website: "https://www.pratham.org",
    contact_email: "info@example-pratham.org",
    mission:
      "Improves the quality of education for children in under-served communities, with a focus on foundational reading and arithmetic. Runs teaching-at-the-right-level programmes in partnership with state governments and measures learning outcomes at scale.",
    sectors: ["education", "children", "youth"],
    verified: ["pan", "12a", "80g", "darpan"],
  },
  {
    legal_name: "Goonj Foundation",
    display_name: "Goonj",
    entity_type: "society",
    pan: "AAATG5678B",
    year_established: 1999,
    state_code: "DL",
    district: "New Delhi",
    operates_pan_india: true,
    website: "https://goonj.org",
    contact_email: "info@example-goonj.org",
    mission:
      "Treats urban surplus material as a development resource, channelling it to rural communities as a reward for village-led infrastructure work. Also runs disaster relief and menstrual hygiene programmes.",
    sectors: ["rural", "disaster", "women", "livelihoods"],
    verified: ["pan", "12a", "80g"],
  },
  {
    legal_name: "SEWA Bharat",
    display_name: "SEWA Bharat",
    entity_type: "society",
    pan: "AAATS9012C",
    year_established: 1984,
    state_code: "GJ",
    district: "Ahmedabad",
    operates_pan_india: false,
    contact_email: "info@example-sewa.org",
    mission:
      "A federation of Self-Employed Women's Associations organising women in the informal economy. Works on livelihood security, social protection and access to credit for workers who fall outside formal labour law.",
    sectors: ["women", "livelihoods", "microfinance", "human-rights"],
    verified: ["pan", "12a"],
  },
  {
    legal_name: "Wildlife Trust of India",
    display_name: "Wildlife Trust of India",
    entity_type: "trust",
    pan: "AAATW3456D",
    year_established: 1998,
    state_code: "UP",
    district: "Noida",
    operates_pan_india: true,
    contact_email: "info@example-wti.org",
    mission:
      "Conserves wildlife and its habitat, working on elephant corridors, rapid response to animal emergencies and anti-poaching enforcement alongside state forest departments.",
    sectors: ["animal-welfare", "environment"],
    verified: ["pan", "80g"],
  },
  {
    legal_name: "Arghyam Foundation",
    display_name: "Arghyam",
    entity_type: "trust",
    pan: "AAATA7890E",
    year_established: 2001,
    state_code: "KA",
    district: "Bengaluru",
    operates_pan_india: false,
    contact_email: "info@example-arghyam.org",
    mission:
      "Works on groundwater and sanitation, funding and building open data systems that let communities and local government manage aquifers rather than individual borewells.",
    sectors: ["water", "environment", "governance"],
    verified: ["pan", "12a", "80g"],
  },
  {
    legal_name: "Sightsavers India Trust",
    display_name: "Sightsavers India",
    entity_type: "trust",
    pan: "AAATS2345F",
    year_established: 1966,
    state_code: "MH",
    district: "Mumbai",
    operates_pan_india: true,
    contact_email: "info@example-sightsavers.org",
    mission:
      "Prevents avoidable blindness and supports people with visual impairment into education and employment. Runs eye health programmes in partnership with district hospitals.",
    sectors: ["health", "disability", "education"],
    verified: ["pan", "12a", "80g", "fcra"],
  },
];

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
