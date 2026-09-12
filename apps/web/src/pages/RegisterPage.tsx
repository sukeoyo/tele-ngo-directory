import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { SECTORS, STATES, registerSchema } from "@tele/shared";
import type { RegisterResponse } from "@tele/shared";
import { ApiError, registerNgo } from "../lib/api.js";
import { Field } from "../components/Field.js";
import { Notice } from "../components/Notice.js";

type Form = {
  legal_name: string;
  display_name: string;
  entity_type: "trust" | "society" | "section_8" | "other";
  registration_number: string;
  pan: string;
  darpan_id: string;
  year_established: string;
  mission: string;
  website: string;
  contact_email: string;
  contact_person: string;
  contact_phone: string;
  state_code: string;
  district: string;
  operates_pan_india: boolean;
  sectors: string[];
  other_sector_note: string;
};

const EMPTY: Form = {
  legal_name: "",
  display_name: "",
  entity_type: "trust",
  registration_number: "",
  pan: "",
  darpan_id: "",
  year_established: "",
  mission: "",
  website: "",
  contact_email: "",
  contact_person: "",
  contact_phone: "",
  state_code: "",
  district: "",
  operates_pan_india: false,
  sectors: [],
  other_sector_note: "",
};

function toPayload(f: Form) {
  return {
    ...f,
    pan: f.pan.toUpperCase().replace(/\s+/g, ""),
    year_established: f.year_established ? Number(f.year_established) : undefined,
    state_code: f.state_code || undefined,
  };
}

export function RegisterPage() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RegisterResponse | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const toggleSector = (slug: string) =>
    set("sectors", form.sectors.includes(slug) ? form.sectors.filter((s) => s !== slug) : [...form.sectors, slug]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setServerError(null);
    const parsed = registerSchema.safeParse(toPayload(form));
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".");
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      document.getElementById(Object.keys(next)[0] ?? "")?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      setResult(await registerNgo(parsed.data));
      window.scrollTo({ top: 0 });
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        setServerError(err.message);
      } else {
        setServerError("Could not reach the directory. Try again in a moment.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    const tone = result.status === "active" ? "success" : "warn";
    return (
      <main className="page narrow">
        <h1>{result.status === "active" ? "You are listed." : "Registration saved."}</h1>
        <Notice tone={tone}>{result.message}</Notice>
        <h2>Next step</h2>
        <p>
          Sign in with <strong>{form.contact_email}</strong> to manage your listing, read collaboration requests and endorse organisations
          you have worked with.
        </p>
        <div className="row">
          <Link className="btn" to="/sign-in">
            Sign in
          </Link>
          <Link className="btn ghost" to={`/ngo/${result.id}`}>
            View your listing
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page narrow">
      <h1>List your organisation</h1>
      <p className="muted">
        Takes about five minutes. We verify your organisation's PAN automatically; everything else is shown to other organisations as you
        enter it.
      </p>

      <form className="form" onSubmit={(e) => void submit(e)} noValidate>
        <fieldset>
          <legend>Identity</legend>
          <Field id="legal_name" label="Registered legal name" hint="Exactly as it appears on your PAN card and registration certificate." required error={errors.legal_name}>
            <input id="legal_name" value={form.legal_name} onChange={(e) => set("legal_name", e.target.value)} />
          </Field>
          <Field id="display_name" label="Name you go by" hint="What partners and the public call you. Can be shorter." required error={errors.display_name}>
            <input id="display_name" value={form.display_name} onChange={(e) => set("display_name", e.target.value)} />
          </Field>
          <div className="grid-2">
            <Field id="entity_type" label="Registered as" required error={errors.entity_type}>
              <select id="entity_type" value={form.entity_type} onChange={(e) => set("entity_type", e.target.value as Form["entity_type"])}>
                <option value="trust">Trust</option>
                <option value="society">Society</option>
                <option value="section_8">Section 8 company</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field id="registration_number" label="Registration number" error={errors.registration_number}>
              <input id="registration_number" value={form.registration_number} onChange={(e) => set("registration_number", e.target.value)} />
            </Field>
          </div>
          <div className="grid-2">
            <Field id="pan" label="Organisation PAN" hint="The PAN issued to the organisation, not to a trustee." required error={errors.pan}>
              <input id="pan" value={form.pan} onChange={(e) => set("pan", e.target.value.toUpperCase())} maxLength={10} className="mono" autoCapitalize="characters" />
            </Field>
            <Field id="darpan_id" label="NGO Darpan ID" hint="Optional. Shown on your profile with a link to verify." error={errors.darpan_id}>
              <input id="darpan_id" value={form.darpan_id} onChange={(e) => set("darpan_id", e.target.value)} />
            </Field>
          </div>
          <div className="grid-2">
            <Field id="year_established" label="Year established" error={errors.year_established}>
              <input id="year_established" inputMode="numeric" value={form.year_established} onChange={(e) => set("year_established", e.target.value.replace(/\D/g, "").slice(0, 4))} />
            </Field>
            <Field id="website" label="Website" error={errors.website}>
              <input id="website" type="url" placeholder="https://" value={form.website} onChange={(e) => set("website", e.target.value)} />
            </Field>
          </div>
        </fieldset>

        <fieldset>
          <legend>Work</legend>
          <Field id="mission" label="What you do" hint="Two or three sentences. This is the first thing other organisations read." required error={errors.mission}>
            <textarea id="mission" rows={5} value={form.mission} onChange={(e) => set("mission", e.target.value)} maxLength={1200} />
          </Field>
          <Field id="sectors" label="Areas of work" hint="Pick the ones you actually run programmes in, up to 12." required error={errors.sectors}>
            <div className="sector-grid" id="sectors">
              {SECTORS.map((s) => {
                const on = form.sectors.includes(s.slug);
                return (
                  <label key={s.slug} className={on ? "check on" : "check"}>
                    <input type="checkbox" checked={on} onChange={() => toggleSector(s.slug)} />
                    <span>
                      {s.label}
                      {s.hint && <small>{s.hint}</small>}
                    </span>
                  </label>
                );
              })}
            </div>
          </Field>
          {form.sectors.includes("other") && (
            <Field id="other_sector_note" label="What does “Other” mean for you?" required error={errors.other_sector_note}>
              <input id="other_sector_note" value={form.other_sector_note} onChange={(e) => set("other_sector_note", e.target.value)} maxLength={200} />
            </Field>
          )}
        </fieldset>

        <fieldset>
          <legend>Where</legend>
          <label className="check">
            <input type="checkbox" checked={form.operates_pan_india} onChange={(e) => set("operates_pan_india", e.target.checked)} />
            <span>We work across India</span>
          </label>
          <div className="grid-2">
            <Field id="state_code" label={form.operates_pan_india ? "Home state" : "State"} required={!form.operates_pan_india} error={errors.state_code}>
              <select id="state_code" value={form.state_code} onChange={(e) => set("state_code", e.target.value)}>
                <option value="">Select a state</option>
                {STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="district" label="District" error={errors.district}>
              <input id="district" value={form.district} onChange={(e) => set("district", e.target.value)} />
            </Field>
          </div>
        </fieldset>

        <fieldset>
          <legend>Contact</legend>
          <p className="hint">Shared only with PAN-verified organisations. You sign in with this email, so use one you can access.</p>
          <Field id="contact_email" label="Email" required error={errors.contact_email}>
            <input id="contact_email" type="email" value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} />
          </Field>
          <div className="grid-2">
            <Field id="contact_person" label="Contact person" error={errors.contact_person}>
              <input id="contact_person" value={form.contact_person} onChange={(e) => set("contact_person", e.target.value)} />
            </Field>
            <Field id="contact_phone" label="Phone" error={errors.contact_phone}>
              <input id="contact_phone" type="tel" value={form.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} />
            </Field>
          </div>
        </fieldset>

        {serverError && <Notice tone="error">{serverError}</Notice>}
        <button className="btn large" type="submit" disabled={busy}>
          {busy ? "Verifying PAN…" : "Register and verify"}
        </button>
        <p className="hint">By registering you confirm you are authorised to represent this organisation.</p>
      </form>
    </main>
  );
}
