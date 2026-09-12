import type { VerificationCheck } from "@tele/shared";

export const CHECK_LABEL: Record<VerificationCheck, string> = {
  pan: "PAN verified",
  "12a": "12A",
  "80g": "80G",
  darpan: "Darpan",
  fcra: "FCRA",
  csr1: "CSR-1",
  peer: "Peer endorsed",
};

interface Props {
  checks: VerificationCheck[];
  endorsementCount?: number;
  status?: string;
}

export function Badges({ checks, endorsementCount = 0, status }: Props) {
  const visible = checks.filter((c) => c !== "peer" || endorsementCount === 0);
  if (visible.length === 0 && endorsementCount === 0 && status !== "flagged") return null;

  return (
    <span className="badges">
      {visible.map((c) => (
        <span key={c} className="badge is-verified">
          {CHECK_LABEL[c] ?? c}
        </span>
      ))}
      {endorsementCount > 0 && (
        <span className="badge is-peer">
          {endorsementCount} {endorsementCount === 1 ? "endorsement" : "endorsements"}
        </span>
      )}
      {status === "flagged" && (
        <span className="badge is-review" title="The name on this organisation's PAN differs from the name they registered with.">
          Name under review
        </span>
      )}
    </span>
  );
}
