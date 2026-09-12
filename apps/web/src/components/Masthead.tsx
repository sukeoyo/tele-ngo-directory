import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth.js";

export function Masthead() {
  const { enabled, session, signOut } = useAuth();

  return (
    <header className="masthead">
      <div className="inner">
        <Link className="wordmark" to="/">
          <span className="mark" aria-hidden="true" />
          <span>
            Tele-Upchaar <span className="wordmark-sub">NGO Directory</span>
          </span>
        </Link>
        <nav aria-label="Primary">
          <NavLink to="/" end>
            Directory
          </NavLink>
          <NavLink to="/register">List your organisation</NavLink>
          {enabled && !session && <NavLink to="/sign-in">Sign in</NavLink>}
          {session && (
            <>
              <NavLink to="/dashboard">Dashboard</NavLink>
              <button className="linkish" onClick={() => void signOut()}>
                Sign out
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
