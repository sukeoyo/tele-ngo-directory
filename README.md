# tele-ngo-directory

A directory for NGOs in India to find each other and collaborate.

Government data about NGOs is reasonably accessible; NGO-to-NGO discovery is not.
Existing platforms are built for donors (Give.do), for compliance (NGO Darpan), or
for broadcasting opportunities (NGOBOX). None are built for an organisation working
on child nutrition in Bihar to find a peer working on the same issue in the next
district and actually reach them.

This is that missing layer: a verified, searchable registry where NGOs register
themselves, are checked against public records, and can contact each other directly.

## Status

Pilot. Not deployed yet.

## Architecture

| Layer      | Choice                     | Why                                                      |
| ---------- | -------------------------- | -------------------------------------------------------- |
| Edge / CDN | Cloudflare                 | Free tier, India PoPs, DDoS protection                   |
| Web        | Vite + React → CF Pages    | Static build, nothing to run                             |
| API        | Cloudflare Workers + Hono  | Free tier; 10ms CPU budget excludes network wait         |
| Database   | Supabase Postgres          | Bundles Auth + Storage, which we need anyway             |
| Cache      | Upstash Redis (REST)       | HTTP-based, works from Workers; rate limiting + hot pages |

### Why Supabase over Neon

Neon is a better pure-Postgres product, but this project needs three things on day
one: a database, authentication (NGOs log in to manage their listing), and object
storage (registration certificates and PAN cards uploaded during verification).
Supabase ships all three on one free tier. With Neon we would bolt on a separate
auth provider and separate object storage — more services, more secrets, more to
break, for no pilot-stage benefit.

### Why the 10ms CPU limit is not a problem

The Workers CPU budget counts JavaScript execution, not time spent waiting on the
network. A Worker that calls a PAN verification API and waits two seconds for a
response spends almost no CPU. The limit only bites if we do heavy computation in
JS — so search filtering and ranking happen in Postgres (see the `search_ngos`
function in `supabase/migrations/0001_init.sql`), not in the Worker.

## Repository layout

```
packages/shared     Types, sector taxonomy, state list, validation schemas.
                    Imported by both the API and the web app so the sector list
                    can never drift between the signup form and the database.
apps/api            Cloudflare Worker. REST API.
apps/web            Vite + React front end.
supabase/migrations SQL migrations, applied in filename order.
```

## Local setup

Requires Node 20+.

```bash
npm install
cp .env.example .env
```

### 1. Database

Create a project at supabase.com, then run the contents of
`supabase/migrations/0001_init.sql` in the Supabase SQL editor. It is idempotent
and seeds the sector taxonomy and state list.

Copy the project URL and the **service role** key into `.env`. The service role key
bypasses row-level security and must only ever be used from the Worker, never from
the browser.

### 2. Run it

```bash
npm run dev:api    # Worker on http://localhost:8787
npm run dev:web    # Vite on http://localhost:5173
```

The web app proxies `/api` to the Worker in development, so there is no CORS setup
to do locally.

### 3. Seed some data

```bash
npm run seed
```

Inserts a handful of real, publicly-listed NGOs so search returns something while
you are building. Safe to re-run.

## Verification model

We do not attempt full financial due diligence. That is what sinks projects like
this. Instead, verification is tiered, and every check is stored as its own row in
`verifications` — never a single `is_verified` boolean on the organisation — so the
interface can show what was actually checked rather than one opaque badge.

| Tier | Check                                   | Cost to us         |
| ---- | --------------------------------------- | ------------------ |
| 0    | Documents uploaded, nothing verified    | Free               |
| 1    | Org PAN verified via KYC API            | ~₹2–3 per check    |
| 1    | 12A / 80G status, Darpan ID present     | Manual / linked    |
| 2    | Peer endorsement from a verified org    | Free, scales with us |
| 3    | Financials, site visit                  | Staff time, later  |

Tier 1 PAN verification is the guardrail at signup. Tier 2 peer endorsement is the
growth engine, and is the signal that actually matters for collaboration: an NGO
vouching for a peer it has worked with says more about partnership fitness than any
donor-facing seal.

**A name mismatch on PAN is a flag for review, not an auto-reject.** Organisations
frequently operate under a short public name while their PAN carries the full legal
name.

## Sector taxonomy

Fixed multi-select list, not free text, with an "Other" escape hatch that captures
free text for manual review. This mirrors NGO Darpan (~40 tags) and Give.do (~25),
trimmed to 24. Almost every NGO works across many sectors at once, so sectors are a
many-to-many join, not a single category column.

When several organisations type the same thing into "Other", promote it to a real
tag in a migration. The taxonomy should grow from observed data, not guesses.

## License

MIT
