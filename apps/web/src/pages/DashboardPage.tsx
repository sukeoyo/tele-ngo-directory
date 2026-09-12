import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { sectorLabel, stateName } from "@tele/shared";
import type { CollaborationRequest, MeResponse } from "@tele/shared";
import { ApiError, getMe, updateMe, updateRequest } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";
import { CHECK_LABEL } from "../components/Badges.js";
import { Field } from "../components/Field.js";
import { Notice } from "../components/Notice.js";

const STATUS_COPY = {
  active: { tone: "success" as const, text: "Your listing is live and visible in the directory." },
  flagged: { tone: "warn" as const, text: "Your listing is live. The name on your PAN differs from the name you entered, so it is marked for review." },
  pending: { tone: "warn" as const, text: "Your listing is saved but not yet visible. PAN verification did not complete; a reviewer will follow up." },
  suspended: { tone: "error" as const, text: "Your listing has been suspended. Contact us if you think this is a mistake." },
};

export function DashboardPage() {
  const { ready, session, token, email } = useAuth();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setMe(await getMe(token));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your dashboard.");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!ready) return null;
  if (!session) return <Navigate to="/sign-in" replace />;

  if (error) {
    return (
      <main className="page narrow">
        <h1>Dashboard</h1>
        <Notice tone="error">{error}</Notice>
      </main>
    );
  }
  if (!me) return <main className="page narrow">Loading…</main>;

  if (!me.org) {
    return (
      <main className="page narrow">
        <h1>No listing linked to this account</h1>
        <p className="muted">
          You are signed in as <strong>{email}</strong>, but no organisation was registered with that email. Listings link to the contact
          email given at registration.
        </p>
        <div className="row">
          <Link className="btn" to="/register">
            List your organisation
          </Link>
        </div>
      </main>
    );
  }

  const org = me.org;
  const status = STATUS_COPY[org.status];
  const panVerified = org.verified_checks.includes("pan");

  return (
    <main className="page dashboard">
      <div className="dash-main">
        <p className="crumb">Signed in as {email}</p>
        <h1>{org.display_name}</h1>
        <Notice tone={status.tone}>{status.text}</Notice>

        <section className="card">
          <h2>Verification</h2>
          <ul className="checklist">
            {org.verifications.map((v) => (
              <li key={v.check_type} className={`is-${v.status}`}>
                <span className="dot" aria-hidden="true" />
                <span>
                  <strong>{CHECK_LABEL[v.check_type]}</strong> · {v.status}
                </span>
              </li>
            ))}
          </ul>
          {!panVerified && (
            <p className="muted small">Contact details of other organisations unlock once your PAN is verified.</p>
          )}
        </section>

        <ListingForm me={me} onSaved={load} />
      </div>

      <aside className="dash-side">
        <Inbox title="Requests received" items={me.inbox} incoming onChange={load} />
        <Inbox title="Requests sent" items={me.sent} />
      </aside>
    </main>
  );
}

function ListingForm({ me, onSaved }: { me: MeResponse; onSaved: () => Promise<void> }) {
  const { token } = useAuth();
  const org = me.org!;
  const [form, setForm] = useState({
    display_name: org.display_name,
    mission: org.mission ?? "",
    website: org.website ?? "",
    contact_person: org.contact_person ?? "",
    contact_phone: org.contact_phone ?? "",
    district: org.district ?? "",
    open_to_contact: org.open_to_contact,
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      await updateMe(form, token);
      setSaved(true);
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError("Could not save.", 0));
    } finally {
      setBusy(false);
    }
  };

  const where = org.operates_pan_india ? "Across India" : stateName(org.state_code);

  return (
    <section className="card">
      <h2>Your listing</h2>
      <p className="muted small">
        {where} · {org.sectors.map(sectorLabel).join(", ")}. Legal name, PAN, state and sectors are fixed after verification; write to us to change them.
      </p>
      <form className="form" onSubmit={(e) => void submit(e)}>
        <Field id="display_name" label="Name you go by" error={error?.fieldErrors.display_name}>
          <input id="display_name" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
        </Field>
        <Field id="mission" label="What you do" error={error?.fieldErrors.mission}>
          <textarea id="mission" rows={5} value={form.mission} onChange={(e) => setForm({ ...form, mission: e.target.value })} maxLength={1200} />
        </Field>
        <div className="grid-2">
          <Field id="website" label="Website" error={error?.fieldErrors.website}>
            <input id="website" type="url" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
          </Field>
          <Field id="district" label="District" error={error?.fieldErrors.district}>
            <input id="district" value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} />
          </Field>
        </div>
        <div className="grid-2">
          <Field id="contact_person" label="Contact person" error={error?.fieldErrors.contact_person}>
            <input id="contact_person" value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
          </Field>
          <Field id="contact_phone" label="Phone" error={error?.fieldErrors.contact_phone}>
            <input id="contact_phone" type="tel" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
          </Field>
        </div>
        <label className="check">
          <input type="checkbox" checked={form.open_to_contact} onChange={(e) => setForm({ ...form, open_to_contact: e.target.checked })} />
          <span>Share our contact details with verified organisations and accept collaboration requests</span>
        </label>
        {error && error.issues.length === 0 && <Notice tone="error">{error.message}</Notice>}
        {saved && <Notice tone="success">Saved.</Notice>}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </form>
    </section>
  );
}

function Inbox({
  title,
  items,
  incoming = false,
  onChange,
}: {
  title: string;
  items: CollaborationRequest[];
  incoming?: boolean;
  onChange?: () => Promise<void>;
}) {
  const { token } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);

  const setStatus = async (id: string, status: CollaborationRequest["status"]) => {
    if (!token) return;
    setBusyId(id);
    try {
      await updateRequest(id, status, token);
      await onChange?.();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="card">
      <h2>{title}</h2>
      {items.length === 0 && <p className="muted small">{incoming ? "Nothing yet. Requests from verified organisations land here." : "You have not sent any requests."}</p>}
      <ul className="requests">
        {items.map((r) => {
          const other = incoming ? r.from_org_name : r.to_org_name;
          const otherId = incoming ? r.from_org_id : r.to_org_id;
          return (
            <li key={r.id} className={`is-${r.status}`}>
              <div className="req-head">
                <Link to={`/ngo/${otherId}`}>
                  <strong>{other}</strong>
                </Link>
                <span className={`pill is-${r.status}`}>{r.status}</span>
              </div>
              <p className="req-subject">{r.subject}</p>
              <p className="req-body">{r.message}</p>
              <p className="muted small">{new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
              {incoming && (r.status === "sent" || r.status === "read") && (
                <div className="row">
                  <button className="btn small" disabled={busyId === r.id} onClick={() => void setStatus(r.id, "accepted")}>
                    Accept
                  </button>
                  <button className="btn ghost small" disabled={busyId === r.id} onClick={() => void setStatus(r.id, "declined")}>
                    Decline
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
