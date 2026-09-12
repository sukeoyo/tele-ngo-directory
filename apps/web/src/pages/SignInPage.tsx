import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth.js";
import { Field } from "../components/Field.js";
import { Notice } from "../components/Notice.js";

export function SignInPage() {
  const { enabled, session, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session) return <Navigate to="/dashboard" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim().toLowerCase());
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page narrow">
      <h1>Sign in</h1>
      <p className="muted">
        Use the contact email you registered your organisation with. We will email you a one-time link, so there is no password.
      </p>

      {!enabled && <Notice tone="warn">Sign-in is not configured on this deployment yet.</Notice>}

      {sent ? (
        <Notice tone="success">
          <strong>Check your inbox.</strong> We sent a sign-in link to {email}. It expires in an hour.
        </Notice>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="form">
          <Field id="email" label="Email" required>
            <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {error && <Notice tone="error">{error}</Notice>}
          <button className="btn" type="submit" disabled={busy || !enabled}>
            {busy ? "Sending…" : "Email me a sign-in link"}
          </button>
        </form>
      )}

      <p className="muted" style={{ marginTop: 28 }}>
        Not listed yet? <Link to="/register">List your organisation</Link> first.
      </p>
    </main>
  );
}
