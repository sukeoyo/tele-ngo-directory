import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { sectorLabel, stateName } from "@tele/shared";
import type { NgoProfile } from "@tele/shared";
import { ApiError, contactNgo, endorseNgo, getNgo, unendorseNgo } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";
import { Badges, CHECK_LABEL } from "../components/Badges.js";
import { Field } from "../components/Field.js";
import { Notice } from "../components/Notice.js";

const ENTITY: Record<NgoProfile["entity_type"], string> = {
  trust: "Registered trust",
  society: "Registered society",
  section_8: "Section 8 company",
  other: "Other",
};

export function NgoPage() {
  const { id = "" } = useParams();
  const { token, ready, enabled } = useAuth();
  const [ngo, setNgo] = useState<NgoProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setNgo(await getNgo(id, token));
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? "This organisation is not listed." : "Could not load this organisation.");
    }
  }, [id, token]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  if (error) {
    return (
      <main className="page narrow">
        <h1>{error}</h1>
        <Link className="btn ghost" to="/">
          Back to the directory
        </Link>
      </main>
    );
  }
  if (!ngo) {
    return (
      <main className="page">
        <div className="skeleton" style={{ width: "40%", height: 28 }} />
        <div className="skeleton" style={{ width: "25%" }} />
        <div className="skeleton" style={{ width: "90%" }} />
      </main>
    );
  }

  const where = ngo.operates_pan_india
    ? "Works across India"
    : [ngo.district, stateName(ngo.state_code)].filter(Boolean).join(", ");
  const verifiedChecks = ngo.verifications.filter((v) => v.status === "verified").map((v) => v.check_type);

  return (
    <main className="page profile">
      <div className="profile-main">
        <p className="crumb">
          <Link to="/">Directory</Link> / {ngo.display_name}
        </p>
        <h1>{ngo.display_name}</h1>
        <p className="ngo-meta">
          {where}
          {ngo.year_established ? ` · Since ${ngo.year_established}` : ""} · {ENTITY[ngo.entity_type]}
        </p>
        <Badges checks={verifiedChecks} endorsementCount={ngo.endorsements.length} status={ngo.status} />

        {ngo.viewer.is_owner && (
          <Notice tone="info">
            This is your listing. <Link to="/dashboard">Edit it from your dashboard.</Link>
          </Notice>
        )}

        {ngo.mission && (
          <section>
            <h2>What they do</h2>
            <p className="ngo-mission">{ngo.mission}</p>
          </section>
        )}

        <section>
          <h2>Areas of work</h2>
          <div className="tags">
            {ngo.sectors.map((s) => (
              <Link key={s} to={`/?sector=${s}`} className="tag">
                {sectorLabel(s)}
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2>What we checked</h2>
          <ul className="checklist">
            {ngo.verifications.length === 0 && <li className="muted">No checks completed yet.</li>}
            {ngo.verifications.map((v) => (
              <li key={v.check_type} className={`is-${v.status}`}>
                <span className="dot" aria-hidden="true" />
                <span>
                  <strong>{CHECK_LABEL[v.check_type]}</strong>
                  {" · "}
                  {v.status === "verified" ? "verified" : v.status === "pending" ? "self-declared, pending review" : v.status}
                  {v.checked_at ? ` · ${new Date(v.checked_at).toLocaleDateString("en-IN", { year: "numeric", month: "short" })}` : ""}
                </span>
              </li>
            ))}
          </ul>
          {ngo.darpan_id && (
            <p className="muted small">
              NGO Darpan ID {ngo.darpan_id}. Look it up on{" "}
              <a href="https://ngodarpan.gov.in/" target="_blank" rel="noreferrer">
                ngodarpan.gov.in
              </a>
              .
            </p>
          )}
        </section>

        <Endorsements ngo={ngo} onChange={load} />
      </div>

      <aside className="profile-side">
        <ContactCard ngo={ngo} enabled={enabled} />
        <div className="card">
          <h3>Details</h3>
          <dl className="details">
            <dt>Legal name</dt>
            <dd>{ngo.legal_name}</dd>
            {ngo.registration_number && (
              <>
                <dt>Registration no.</dt>
                <dd>{ngo.registration_number}</dd>
              </>
            )}
            {ngo.website && (
              <>
                <dt>Website</dt>
                <dd>
                  <a href={ngo.website} target="_blank" rel="noreferrer">
                    {ngo.website.replace(/^https?:\/\//, "")}
                  </a>
                </dd>
              </>
            )}
          </dl>
        </div>
      </aside>
    </main>
  );
}

function ContactCard({ ngo, enabled }: { ngo: NgoProfile; enabled: boolean }) {
  const { token } = useAuth();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await contactNgo(ngo.id, { subject, message }, token);
      setDone(res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError("Could not send the request.", 0));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card contact">
      <h3>Contact</h3>
      {ngo.contact_visible ? (
        <dl className="details">
          {ngo.contact_person && (
            <>
              <dt>Person</dt>
              <dd>{ngo.contact_person}</dd>
            </>
          )}
          <dt>Email</dt>
          <dd>
            <a href={`mailto:${ngo.contact_email}`}>{ngo.contact_email}</a>
          </dd>
          {ngo.contact_phone && (
            <>
              <dt>Phone</dt>
              <dd>{ngo.contact_phone}</dd>
            </>
          )}
        </dl>
      ) : !ngo.viewer.signed_in ? (
        <p className="muted">
          Contact details are shared only with PAN-verified organisations.{" "}
          {enabled ? <Link to="/sign-in">Sign in</Link> : <Link to="/register">Register</Link>} to see them.
        </p>
      ) : !ngo.open_to_contact ? (
        <p className="muted">This organisation is not accepting requests right now.</p>
      ) : (
        <p className="muted">
          Your organisation needs a verified PAN before contact details are shared. <Link to="/dashboard">Check your status.</Link>
        </p>
      )}

      {ngo.viewer.can_contact && !done && (
        <form className="form compact" onSubmit={(e) => void send(e)}>
          <h4>Send a collaboration request</h4>
          <Field id="subject" label="Subject" required error={error?.fieldErrors.subject}>
            <input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={140} required />
          </Field>
          <Field id="message" label="Message" required hint="What you have in mind, where, and roughly when." error={error?.fieldErrors.message}>
            <textarea id="message" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} required />
          </Field>
          {error && error.issues.length === 0 && <Notice tone="error">{error.message}</Notice>}
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send request"}
          </button>
        </form>
      )}
      {done && <Notice tone="success">{done}</Notice>}
    </div>
  );
}

function Endorsements({ ngo, onChange }: { ngo: NgoProfile; onChange: () => Promise<void> }) {
  const { token } = useAuth();
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setOpen(false);
      setNote("");
      await onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h2>Peer endorsements</h2>
      <p className="muted small">Verified organisations that have worked with {ngo.display_name} and vouch for them.</p>
      {ngo.endorsements.length === 0 && <p className="muted">No endorsements yet.</p>}
      <ul className="endorsements">
        {ngo.endorsements.map((e) => (
          <li key={e.id}>
            <Link to={`/ngo/${e.endorser_id}`}>
              <strong>{e.endorser_name}</strong>
            </Link>
            {e.note && <p>{e.note}</p>}
          </li>
        ))}
      </ul>

      {ngo.viewer.can_endorse && token && (
        <div className="endorse-actions">
          {ngo.viewer.has_endorsed ? (
            <button className="btn ghost" disabled={busy} onClick={() => void act(() => unendorseNgo(ngo.id, token))}>
              Withdraw your endorsement
            </button>
          ) : open ? (
            <form
              className="form compact"
              onSubmit={(e) => {
                e.preventDefault();
                void act(() => endorseNgo(ngo.id, note, token));
              }}
            >
              <Field id="note" label="A line about how you worked together" hint="Optional. Shown publicly.">
                <textarea id="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
              </Field>
              <div className="row">
                <button className="btn" type="submit" disabled={busy}>
                  Confirm endorsement
                </button>
                <button className="btn ghost" type="button" onClick={() => setOpen(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button className="btn ghost" onClick={() => setOpen(true)}>
              Endorse this organisation
            </button>
          )}
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      )}
    </section>
  );
}
