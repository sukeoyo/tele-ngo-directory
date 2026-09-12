import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase, authEnabled } from "./supabase.js";

export interface AuthSession {
  email: string;
  token: string;
}

interface AuthState {
  demo: boolean;
  ready: boolean;
  session: AuthSession | null;
  token: string | undefined;
  email: string | undefined;
  signIn: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const DEMO_KEY = "tele_demo_email";

// Without Supabase configured, sign-in is a local demo: the email you type is the account.
export function AuthProvider({ children }: { children: ReactNode }) {
  const demo = !authEnabled;
  const [session, setSession] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supabase) {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(DEMO_KEY);
      } catch {
        /* storage unavailable */
      }
      if (saved) setSession({ email: saved, token: `demo:${saved}` });
      setReady(true);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => {
      const s = data.session;
      setSession(s?.user.email ? { email: s.user.email, token: s.access_token } : null);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s?.user.email ? { email: s.user.email, token: s.access_token } : null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const value: AuthState = {
    demo,
    ready,
    session,
    token: session?.token,
    email: session?.email,
    signIn: async (email) => {
      const normalised = email.trim().toLowerCase();
      if (!supabase) {
        try {
          localStorage.setItem(DEMO_KEY, normalised);
        } catch {
          /* storage unavailable */
        }
        setSession({ email: normalised, token: `demo:${normalised}` });
        return;
      }
      const { error } = await supabase.auth.signInWithOtp({
        email: normalised,
        options: { emailRedirectTo: `${window.location.origin}/dashboard` },
      });
      if (error) throw new Error(error.message);
    },
    signOut: async () => {
      if (!supabase) {
        try {
          localStorage.removeItem(DEMO_KEY);
        } catch {
          /* storage unavailable */
        }
        setSession(null);
        return;
      }
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
