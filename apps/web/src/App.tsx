import { useCallback, useEffect, useRef, useState } from "react";
import { sectorLabel, stateName } from "@tele/shared";
import type { NgoSummary } from "@tele/shared";
import { searchNgos, ApiError } from "./lib/api.js";
import { FilterRail, type Filters } from "./components/FilterRail.js";
import { Badges } from "./components/Badges.js";

const PAGE_SIZE = 20;

export function App() {
  // `input` is what the person is typing; `query` is what we have searched for.
  // Keeping them separate is what makes debouncing feel right — the field never
  // lags behind the keyboard.
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>({ sectors: [], state: "", verifiedOnly: false });

  const [results, setResults] = useState<NgoSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  // Any change to the query or filters resets pagination — otherwise you land
  // on page 4 of a result set that now has one page.
  useEffect(() => {
    setOffset(0);
  }, [query, filters]);

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

  return (
    <>
      <header className="masthead">
        <a className="wordmark" href="/">
          Tele
        </a>
        <p>A directory of Indian NGOs, for Indian NGOs</p>
        <nav>
          <a className="link" href="/register">
            List your organisation
          </a>
        </nav>
      </header>

      <section className="search-head">
        <div className="inner">
          <h1>Find an organisation working on what you work on.</h1>

          <div className="searchbar">
            <label htmlFor="q" className="visually-hidden" style={{ display: "none" }}>
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
            <button onClick={() => setQuery(input.trim())}>Search</button>
          </div>

          <p className="result-count" role="status" aria-live="polite">
            {loading ? (
              "Searching…"
            ) : total === 0 ? (
              "No organisations match yet"
            ) : (
              <>
                <strong>{total.toLocaleString("en-IN")}</strong>{" "}
                {total === 1 ? "organisation" : "organisations"}
                {filters.state ? ` working in ${stateName(filters.state)}` : ""}
                {query ? ` matching “${query}”` : ""}
              </>
            )}
          </p>
        </div>
      </section>

      <div className="layout">
        <FilterRail value={filters} onChange={setFilters} />

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

          {!error && !loading && results.length === 0 && <EmptyState hasFilters={query !== "" || filters.sectors.length > 0} />}

          {results.map((ngo) => (
            <NgoRow key={ngo.id} ngo={ngo} />
          ))}

          {total > PAGE_SIZE && (
            <nav
              style={{ display: "flex", gap: 12, alignItems: "center", paddingTop: 24 }}
              aria-label="Pagination"
            >
              <button
                className="btn ghost"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Previous
              </button>
              <span className="ngo-meta" style={{ margin: 0 }}>
                {offset + 1}–{showingTo} of {total.toLocaleString("en-IN")}
              </span>
              <button
                className="btn ghost"
                disabled={showingTo >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
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
        <button onClick={() => (window.location.href = `/ngo/${ngo.id}`)}>{ngo.display_name}</button>{" "}
        <Badges ngo={ngo} />
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
      <a className="btn" href="/register">
        List your organisation
      </a>
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
