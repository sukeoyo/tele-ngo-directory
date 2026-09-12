import type { EntityType, VerificationCheck } from "./types.js";

export interface SampleOrg {
  legal_name: string;
  display_name: string;
  entity_type: EntityType;
  pan: string;
  year_established: number;
  state_code: string;
  district: string;
  operates_pan_india: boolean;
  website: string | null;
  contact_email: string;
  contact_person: string | null;
  mission: string;
  sectors: string[];
  verified: VerificationCheck[];
}

// Real, publicly listed organisations with placeholder PANs. Used by the seed script and demo mode.
export const SAMPLE_ORGS: SampleOrg[] = [
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
    contact_person: "Partnerships desk",
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
    contact_person: "Collaborations team",
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
    website: null,
    contact_email: "info@example-sewa.org",
    contact_person: null,
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
    website: null,
    contact_email: "info@example-wti.org",
    contact_person: null,
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
    website: null,
    contact_email: "info@example-arghyam.org",
    contact_person: null,
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
    website: null,
    contact_email: "info@example-sightsavers.org",
    contact_person: null,
    mission:
      "Prevents avoidable blindness and supports people with visual impairment into education and employment. Runs eye health programmes in partnership with district hospitals.",
    sectors: ["health", "disability", "education"],
    verified: ["pan", "12a", "80g", "fcra"],
  },
];
