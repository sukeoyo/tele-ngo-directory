/** Shapes returned by the API. Mirrors the `search_ngos` return type. */

export type VerificationCheck = "pan" | "12a" | "80g" | "darpan" | "fcra" | "csr1" | "peer";

export type OrgStatus = "pending" | "active" | "flagged" | "suspended";

export interface NgoSummary {
  id: string;
  display_name: string;
  mission: string | null;
  state_code: string | null;
  district: string | null;
  operates_pan_india: boolean;
  year_established: number | null;
  website: string | null;
  status: OrgStatus;
  sectors: string[];
  verified_checks: VerificationCheck[];
  endorsement_count: number;
}

export interface SearchResponse {
  results: NgoSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface RegisterResponse {
  id: string;
  status: OrgStatus;
  /** What the PAN check concluded, so the UI can explain the outcome. */
  pan_verification: "verified" | "mismatch" | "failed" | "skipped";
  message: string;
}
