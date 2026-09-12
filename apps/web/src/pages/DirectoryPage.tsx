import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { sectorLabel, stateName } from "@tele/shared";
import type { NgoSummary } from "@tele/shared";
import { searchNgos, ApiError } from "../lib/api.js";
import { FilterRail, type Filters } from "../components/FilterRail.js";
import { Badges } from "../components/Badges.js";

const PAGE_SIZE = 20;

export function DirectoryPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const offset = Number(params.get("offset") ?? 0) || 0;
  const filters = useMemo<Filters>(
    () => ({
      sectors: params.getAll("sector"),
      state: params.get("state") ?? "",
      verifiedOnly: params.get("verified") === "1",
    }),
    [params],
  );

  const [input, setInput] = useState(query);
  const [results, setResults] = useState<NgoSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const write = useCallback(
    (next: { q?: string; filters?: Filters; offset?: number }) => {
      const p = new URLSearchParams();
      const q = next.q ?? query;
      const f = next.filters ?? filters;
      const o = next.offset ?? 0;
      if (q) p.set("q", q);
      if (f.state) p.set("state", f.state);
      if (f.verifiedOnly) p.set("verified", "1");
      for (const s of f.sectors) p.append("sector", s);
      if (o > 0) p.set("offset", String(o));
      setParams(p, { replace: true });
    },
    [query, filters, setParams],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if (input.trim() !== query) write({ q: input.trim() });
    }, 300);
    return () => clearTimeout(t);
  }, [input, query, write]);

  const run = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await searchNgos(
        {
          q: query || undefined,
          sectors: filters.sectors,
          state: filters.state || undefined,
          verified_only: filters.verifiedOnly,
          limit: PAGE_SIZE,
          offset,
        },
        controller.signal,
      );
      setResults(res.results);
      setTotal(res.total);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof ApiError ? err.message : "Could not load the directory.");
      setResults([]);
      setTotal(0);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [query, filters, offset]);

  useEffect(() => {
    void run();
    return () => abortRef.current?.abort();
  }, [run]);

  const showingTo = Math.min(offset + PAGE_SIZE, total);
  const hasFilters = query !== "" || filters.sectors.length > 0 || filters.state !== "" || filters.verifiedOnly;

  return (
    <>
      <section className="search-head">
        <div className="inner">
          <p className="eyebrow">Verified Indian NGOs, for Indian NGOs</p>
          <h1>Find an organisation working on what you work on.</h1>
          <form
            className="searchbar"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              write({ q: input.trim() });
            }}
          >
            <label htmlFor="q" className="visually-hidden">
              Search organisations
            </label>
            <input
              id="q"
              type="search"
              placeholder="Try: school nutrition, groundwater, disability"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              autoComplete="off"
            />
            <button type="submit">Search</button>
          </form>
          <p className="result-count" role="status" aria-live="polite">
            {loading ? (
              "Searching…"
            ) : total === 0 ? (
              "No organisations match yet"
            ) : (
              <>
                <strong>{total.toLocaleString("en-IN")}</strong> {total === 1 ? "organisation" : "organisations"}
                {filters.state ? ` working in ${stateName(filters.state)}` : ""}
                {query ? ` matching “${query}”` : ""}
              </>
            )}
          </p>
        </div>
      </section>

      <div className="layout">
        <FilterRail value={filters} onChange={(f) => write({ filters: f })} />

        <main className="results">
          {error && (
            <div className="state">
              <h2>The directory did not load</h2>
              <p>{error}</p>
              <button className="btn ghost" onClick={() => void run()}>
                Try again
              </button>
            </div>
          )}
          {!error && loading && results.length === 0 && <LoadingRows />}
          {!error && !loading && results.length === 0 && <EmptyState hasFilters={hasFilters} />}
          {results.map((ngo) => (
            <NgoRow key={ngo.id} ngo={ngo} />
          ))}

          {total > PAGE_SIZE && (
            <nav className="pager" aria-label="Pagination">
              <button className="btn ghost" disabled={offset === 0} onClick={() => write({ offset: Math.max(0, offset - PAGE_SIZE) })}>
                Previous
              </button>
              <span className="muted">
                {offset + 1}–{showingTo} of {total.toLocaleString("en-IN")}
              </span>
              <button className="btn ghost" disabled={showingTo >= total} onClick={() => write({ offset: offset + PAGE_SIZE })}>
                Next
              </button>
            </nav>
          )}
        </main>
      </div>
    </>
  );
}

function NgoRow({ ngo }: { ngo: NgoSummary }) {
  const where = ngo.operates_pan_india
    ? "Works across India"
    : [ngo.district, stateName(ngo.state_code)].filter(Boolean).join(", ");

  return (
    <article className="ngo-row">
      <h3>
        <Link to={`/ngo/${ngo.id}`}>{ngo.display_name}</Link>{" "}
        <Badges checks={ngo.verified_checks} endorsementCount={ngo.endorsement_count} status={ngo.status} />
      </h3>
      <p className="ngo-meta">
        {where}
        {ngo.year_established ? ` · Since ${ngo.year_established}` : ""}
      </p>
      {ngo.mission && <p className="ngo-mission">{truncate(ngo.mission, 260)}</p>}
      <div className="tags">
        {ngo.sectors.slice(0, 6).map((s) => (
          <span key={s} className="tag">
            {sectorLabel(s)}
          </span>
        ))}
        {ngo.sectors.length > 6 && <span className="tag">+{ngo.sectors.length - 6} more</span>}
      </div>
    </article>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="state">
      <h2>{hasFilters ? "Nothing matches those filters" : "The directory is empty"}</h2>
      <p>
        {hasFilters
          ? "Try removing a filter, or widening the region to all of India. Organisations that work nationally appear under every state."
          : "No organisations have registered yet. The first listing makes the directory useful for the second."}
      </p>
      <Link className="btn" to="/register">
        List your organisation
      </Link>
    </div>
  );
}

function LoadingRows() {
  return (
    <div aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="ngo-row">
          <div className="skeleton" style={{ width: "38%", height: 17 }} />
          <div className="skeleton" style={{ width: "22%" }} />
          <div className="skeleton" style={{ width: "92%" }} />
          <div className="skeleton" style={{ width: "70%" }} />
        </div>
      ))}
    </div>
  );
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}
