import { z } from "zod";
import { SECTOR_SLUGS } from "./sectors.js";
import { STATES } from "./regions.js";

const STATE_CODES = STATES.map((s) => s.code) as [string, ...string[]];

/**
 * PAN format: five letters, four digits, one letter.
 * The fourth character encodes holder type — 'P' is an individual. An NGO's
 * PAN should be 'T' (trust), 'A' (association of persons), 'C' (company) or
 * 'F' (firm). A 'P' here means someone entered a personal PAN, which is the
 * single most common mistake at signup and worth catching before we spend a
 * verification API call on it.
 */
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const ORG_PAN_HOLDER_TYPES = new Set(["T", "A", "C", "F", "B", "L", "J", "G"]);

export const panSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(PAN_REGEX, "PAN must be 10 characters, like AAATA1234A")
  .refine((pan) => !pan.startsWith("XXXXX"), "Enter a real PAN")
  .refine(
    (pan) => ORG_PAN_HOLDER_TYPES.has(pan[3] ?? ""),
    "This looks like a personal PAN. Enter the PAN issued to the organisation.",
  );

export const registerSchema = z
  .object({
    legal_name: z
      .string()
      .trim()
      .min(3, "Enter the full registered name")
      .max(200)
      .describe("Exactly as it appears on the PAN and registration certificate"),

    display_name: z.string().trim().min(2, "Enter a name").max(120),

    entity_type: z.enum(["trust", "society", "section_8", "other"]),

    registration_number: z.string().trim().max(100).optional(),

    pan: panSchema,

    darpan_id: z
      .string()
      .trim()
      .max(60)
      .optional()
      .or(z.literal("")),

    year_established: z
      .number()
      .int()
      .min(1850)
      .max(new Date().getFullYear())
      .optional(),

    mission: z
      .string()
      .trim()
      .min(40, "Write at least a couple of sentences — this is what other organisations read first")
      .max(1200),

    website: z.string().trim().url("Enter a full URL including https://").optional().or(z.literal("")),

    contact_email: z.string().trim().toLowerCase().email("Enter a valid email"),
    contact_person: z.string().trim().max(120).optional(),
    contact_phone: z.string().trim().max(20).optional(),

    state_code: z.enum(STATE_CODES).optional(),
    district: z.string().trim().max(120).optional(),
    operates_pan_india: z.boolean().default(false),

    sectors: z
      .array(z.enum(SECTOR_SLUGS as [string, ...string[]]))
      .min(1, "Pick at least one area of work")
      .max(12, "Pick up to 12 — the ones you actually run programmes in"),

    other_sector_note: z.string().trim().max(200).optional(),
  })
  .refine((d) => d.operates_pan_india || !!d.state_code, {
    message: "Select a state, or tick that you work across India",
    path: ["state_code"],
  })
  .refine((d) => !d.sectors.includes("other") || !!d.other_sector_note?.trim(), {
    message: "Tell us what 'Other' means for your organisation",
    path: ["other_sector_note"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export const searchSchema = z.object({
  q: z.string().trim().max(120).optional(),
  sectors: z.array(z.string()).optional(),
  state: z.string().length(2).optional(),
  district: z.string().trim().max(120).optional(),
  verified_only: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

export type SearchInput = z.infer<typeof searchSchema>;

export const contactSchema = z.object({
  to_org_id: z.string().uuid(),
  from_org_id: z.string().uuid(),
  subject: z.string().trim().min(3).max(140),
  message: z.string().trim().min(20, "Say a bit about what you have in mind").max(2000),
});
