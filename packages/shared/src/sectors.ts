/**
 * The sector taxonomy.
 *
 * This list is the single source of truth for the signup form, the search
 * filters and the database seed. If it drifts between those three places,
 * organisations become unfindable by the exact tag they selected — so it lives
 * here and is imported everywhere, and the SQL seed in 0001_init.sql must be
 * kept in step.
 *
 * Fixed list rather than free text, following NGO Darpan (~40 tags) and
 * Give.do (~25). Trimmed to 24 plus "other". Multi-select: organisations
 * routinely work across a dozen of these at once.
 */

export interface Sector {
  slug: string;
  label: string;
  /** Shown under the label in the signup form to reduce mis-tagging. */
  hint?: string;
}

export const SECTORS: readonly Sector[] = [
  { slug: "education", label: "Education & literacy", hint: "Schools, tutoring, adult literacy, teacher training" },
  { slug: "health", label: "Health & family welfare", hint: "Clinics, maternal health, public health campaigns" },
  { slug: "nutrition", label: "Nutrition & food security", hint: "Midday meals, malnutrition, ration access" },
  { slug: "children", label: "Children & child rights", hint: "Child protection, care homes, anti-trafficking" },
  { slug: "youth", label: "Youth development", hint: "Mentoring, sports, leadership programmes" },
  { slug: "women", label: "Women's development & empowerment", hint: "Safety, entrepreneurship, legal support" },
  { slug: "elderly", label: "Elderly care" },
  { slug: "disability", label: "Disability & inclusion", hint: "Accessibility, assistive tech, inclusive education" },
  { slug: "livelihoods", label: "Livelihoods & skill development", hint: "Vocational training, job placement" },
  { slug: "microfinance", label: "Microfinance & self-help groups" },
  { slug: "agriculture", label: "Agriculture & farmer welfare" },
  { slug: "environment", label: "Environment & forests", hint: "Conservation, afforestation, pollution" },
  { slug: "climate", label: "Climate & renewable energy" },
  { slug: "water", label: "Water, sanitation & hygiene", hint: "Drinking water, toilets, WASH programmes" },
  { slug: "rural", label: "Rural development" },
  { slug: "urban", label: "Urban poverty & housing", hint: "Slum development, homelessness, migrant workers" },
  { slug: "tribal", label: "Tribal affairs" },
  { slug: "caste-equity", label: "Caste equity & Dalit rights" },
  { slug: "minority", label: "Minority rights" },
  { slug: "human-rights", label: "Human rights & legal aid" },
  { slug: "governance", label: "Governance & transparency", hint: "RTI, accountability, civic participation" },
  { slug: "disaster", label: "Disaster relief & preparedness" },
  { slug: "arts", label: "Arts, culture & heritage" },
  { slug: "animal-welfare", label: "Animal welfare & wildlife" },
  { slug: "technology", label: "Science & technology" },
  { slug: "other", label: "Other", hint: "Tell us what you work on and we may add it as a tag" },
] as const;

export const SECTOR_SLUGS: readonly string[] = SECTORS.map((s) => s.slug);

const BY_SLUG = new Map(SECTORS.map((s) => [s.slug, s]));

export function sectorLabel(slug: string): string {
  return BY_SLUG.get(slug)?.label ?? slug;
}

export function isSectorSlug(value: string): boolean {
  return BY_SLUG.has(value);
}
