export type VerificationCheck = "pan" | "12a" | "80g" | "darpan" | "fcra" | "csr1" | "peer";
export type VerificationStatus = "pending" | "verified" | "mismatch" | "failed" | "expired";
export type OrgStatus = "pending" | "active" | "flagged" | "suspended";
export type EntityType = "trust" | "society" | "section_8" | "other";
export type RequestStatus = "sent" | "read" | "accepted" | "declined";

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

export interface VerificationSummary {
  check_type: VerificationCheck;
  status: VerificationStatus;
  checked_at: string | null;
  expires_at: string | null;
}

export interface EndorsementSummary {
  id: string;
  endorser_id: string;
  endorser_name: string;
  note: string | null;
  created_at: string;
}

export interface NgoProfile {
  id: string;
  display_name: string;
  legal_name: string;
  mission: string | null;
  website: string | null;
  year_established: number | null;
  entity_type: EntityType;
  registration_number: string | null;
  darpan_id: string | null;
  state_code: string | null;
  district: string | null;
  operates_pan_india: boolean;
  status: OrgStatus;
  open_to_contact: boolean;
  sectors: string[];
  verifications: VerificationSummary[];
  endorsements: EndorsementSummary[];
  contact_visible: boolean;
  contact_email?: string;
  contact_person?: string;
  contact_phone?: string;
  viewer: {
    signed_in: boolean;
    can_contact: boolean;
    can_endorse: boolean;
    has_endorsed: boolean;
    is_owner: boolean;
  };
}

export interface RegisterResponse {
  id: string;
  status: OrgStatus;
  pan_verification: "verified" | "mismatch" | "failed" | "skipped";
  message: string;
}

export interface CollaborationRequest {
  id: string;
  from_org_id: string;
  from_org_name: string;
  to_org_id: string;
  to_org_name: string;
  subject: string;
  message: string;
  status: RequestStatus;
  created_at: string;
}

export interface MeResponse {
  email: string;
  org: (NgoSummary & {
    legal_name: string;
    contact_email: string;
    contact_person: string | null;
    contact_phone: string | null;
    open_to_contact: boolean;
    verifications: VerificationSummary[];
  }) | null;
  inbox: CollaborationRequest[];
  sent: CollaborationRequest[];
}
