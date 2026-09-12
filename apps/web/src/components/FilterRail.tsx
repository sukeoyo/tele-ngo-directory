import { SECTORS, STATES } from "@tele/shared";

export interface Filters {
  sectors: string[];
  state: string;
  verifiedOnly: boolean;
}

interface Props {
  value: Filters;
  onChange: (next: Filters) => void;
}

export function FilterRail({ value, onChange }: Props) {
  const toggleSector = (slug: string) => {
    const on = value.sectors.includes(slug);
    onChange({
      ...value,
      sectors: on ? value.sectors.filter((s) => s !== slug) : [...value.sectors, slug],
    });
  };

  const active = value.sectors.length > 0 || value.state !== "" || value.verifiedOnly;

  return (
    <aside className="rail" aria-label="Filters">
      <div className="rail-group">
        <h2>
          <label htmlFor="state">Where they work</label>
        </h2>
        <select
          id="state"
          value={value.state}
          onChange={(e) => onChange({ ...value, state: e.target.value })}
        >
          <option value="">Anywhere in India</option>
          {STATES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
        {value.state && (
          <p className="ngo-meta" style={{ marginTop: 8, marginBottom: 0 }}>
            Includes organisations that work across all of India.
          </p>
        )}
      </div>

      <div className="rail-group">
        <h2>Areas of work</h2>
        <div className="sector-list">
          {SECTORS.filter((s) => s.slug !== "other").map((s) => {
            const on = value.sectors.includes(s.slug);
            return (
              <label key={s.slug} className={on ? "check on" : "check"}>
                <input type="checkbox" checked={on} onChange={() => toggleSector(s.slug)} />
                <span>{s.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="rail-group">
        <h2>Verification</h2>
        <label className={value.verifiedOnly ? "check on" : "check"}>
          <input
            type="checkbox"
            checked={value.verifiedOnly}
            onChange={(e) => onChange({ ...value, verifiedOnly: e.target.checked })}
          />
          <span>Only show PAN-verified organisations</span>
        </label>
      </div>

      {active && (
        <button
          className="clear"
          onClick={() => onChange({ sectors: [], state: "", verifiedOnly: false })}
        >
          Clear all filters
        </button>
      )}
    </aside>
  );
}
