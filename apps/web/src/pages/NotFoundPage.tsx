import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main className="page narrow">
      <h1>Page not found</h1>
      <p className="muted">That link does not go anywhere.</p>
      <Link className="btn" to="/">
        Back to the directory
      </Link>
    </main>
  );
}
