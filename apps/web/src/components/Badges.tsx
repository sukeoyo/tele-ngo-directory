import type { NgoSummary, VerificationCheck } from "@tele/shared";

const LABEL: Record<VerificationCheck, string> = {
  pan: "PAN verified",
  "12a": "12A",
  "80g": "80G",
  darpan: "Darpan",
  fcra: "FCRA",
  csr1: "CSR-1",
  peer: "Peer endorsed",
};

/**
 * Shows what was actually checked rather than one opaque "verified" tick.
 * An organisation can be entirely legitimate and lack 80G — it only matters
 * to donors — so bundling these into a single badge would mislead.
 */
export function Badges({ ngo }: { ngo: NgoSummary }) {
  const checks = ngo.verified_checks ?? [];
  if (checks.length === 0 && ngo.status !== "flagged") return null;

  return (
    <span className="badges">
      {checks.map((c) => (
        <span key={c} className="badge is-verified">
          {LABEL[c] ?? c}
        </span>
      ))}
      {ngo.endorsement_count > 0 && (
        <span className="badge is-verified">
          {ngo.endorsement_count} {ngo.endorsement_count === 1 ? "endorsement" : "endorsements"}
        </span>
      )}
      {ngo.status === "flagged" && (
        <span
          className="badge is-review"
          title="The name on this organisation's PAN differs from the name they registered with. Usually a legal-versus-working name difference."
        >
          Name under review
        </span>
      )}
    </span>
  );
}
