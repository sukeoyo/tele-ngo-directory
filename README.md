# Tele-Upchaar NGO Directory

A verified directory of Indian NGOs, built so organisations can find each other and collaborate.

Government data about NGOs is reasonably accessible. NGO-to-NGO discovery is not. Existing platforms serve donors (Give.do), compliance (NGO Darpan) or opportunity listings (NGOBOX). None help an organisation working on child nutrition in Bihar find a peer in the next district and actually reach them.

This is that missing layer: NGOs register themselves, are checked against PAN records, and can contact and endorse each other.

## What it does

- **Search and filter** by keyword, state and area of work. Verified organisations rank first.
- **Register** with a five-minute form. The organisation's PAN is verified automatically; a name mismatch flags the listing for review rather than rejecting it.
- **Sign in** with a one-time email link. The listing registered with that email is linked to the account.
- **Contact** other organisations. Contact details and collaboration requests are available only to organisations whose own PAN is verified.
- **Endorse** organisations you have worked with. Endorsements show on the profile and add a "Peer endorsed" badge.
- **Dashboard** to edit the listing, toggle contact sharing, and accept or decline requests.

## Architecture

| Layer    | Choice                    | Why                                                   |
| -------- | ------------------------- | ----------------------------------------------------- |
| Web      | Vite + React → CF Pages   | Static build, nothing to run                          |
| API      | Cloudflare Workers + Hono | Free tier; CPU budget excludes network wait           |
| Database | Supabase Postgres         | Bundles Auth and Storage, which we need anyway        |
| Auth     | Supabase magic link       | No passwords to leak; the Worker verifies the JWT     |
| Cache    | Upstash Redis (REST)      | Session cache, search cache, rate limits              |

Search, filtering and ranking happen in the `search_ngos` SQL function so the Worker does almost no compute.

```
packages/shared      Types, sector taxonomy, state list, zod schemas. Shared by API and web.
apps/api             Cloudflare Worker. REST API.
apps/web             Vite + React front end.
supabase/migrations  SQL, applied in filename order.
scripts/             Seed data and tests.
```

## Accounts you need

| Service                 | For                                   | Free tier | Sign up                              |
| ----------------------- | ------------------------------------- | --------- | ------------------------------------ |
| Supabase                | Postgres, auth, storage               | Yes       | https://supabase.com                 |
| Cloudflare              | Workers (API) and Pages (web)         | Yes       | https://dash.cloudflare.com/sign-up  |
| Upstash                 | Redis for cache and rate limits       | Yes       | https://upstash.com                  |
| PAN verification vendor | Real PAN checks (optional until launch) | No, ~₹2–3 per check | Cashfree, Signzy, Digio or Karza |

Redis is optional: without it the API still works, with no caching or rate limiting. PAN verification runs in mock mode until you configure a vendor.

## Local setup

Requires Node 22+.

```bash
npm install
cp apps/api/.dev.vars.example apps/api/.dev.vars
cp apps/web/.env.example apps/web/.env.local
```

### 1. Supabase

1. Create a project. Under **Project Settings → API** copy the project URL, the `anon` key and the `service_role` key.
2. In the SQL editor run `supabase/migrations/0001_init.sql`, then `0002_auth_and_requests.sql`. Both are idempotent.
3. Under **Authentication → URL Configuration** set the site URL to `http://localhost:5173` and add `http://localhost:5173/dashboard` to the redirect list. Add your production URL later.
4. Under **Authentication → Providers → Email**, keep magic links on and disable "Confirm email" if you want a single-step sign-in.

Put the URL and both keys in `apps/api/.dev.vars`. Put the URL and the **anon key only** in `apps/web/.env.local`.

### 2. Upstash (optional)

Create a Redis database, copy the REST URL and token into `apps/api/.dev.vars`.

### 3. Run

```bash
npm run dev:api    # http://localhost:8787
npm run dev:web    # http://localhost:5173
npm run seed       # six sample organisations
```

The web dev server proxies `/api` to the Worker.

### 4. Check

```bash
npm run typecheck
npm test
npm run build
```

## Deploying

**API.** `cd apps/api && npx wrangler login`, then set secrets:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put UPSTASH_REDIS_REST_URL
npx wrangler secret put UPSTASH_REDIS_REST_TOKEN
```

Set `ALLOWED_ORIGIN` in `wrangler.toml` to your Pages URL, then `npm run deploy:api`.

**Web.** Connect the repo to Cloudflare Pages. Build command `npm run build`, output directory `apps/web/dist`, root `/`. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as build variables. Edit `apps/web/public/_redirects` so `/api/*` points at your Worker URL.

## Security model

- The service role key lives only in the Worker. The browser gets the anon key, which row-level security restricts to public listing data.
- The Worker verifies every bearer token with Supabase Auth and resolves the caller's organisation server-side. Clients never send an org ID.
- Contact details are returned only when the viewer's organisation has a verified PAN and the listed organisation has opted in.
- Full PANs are stored in one column on one table. Verification records hold a masked reference.
- Registration is rate limited per IP, collaboration requests per organisation.
- `.gitignore` excludes every `.env*` and `.dev.vars*` file except the `.example` templates. Never commit real keys.

## Verification model

Tiered, and every check is its own row in `verifications`, so the UI can say what was checked instead of showing one badge.

| Tier | Check                                | Cost                   |
| ---- | ------------------------------------ | ---------------------- |
| 1    | Organisation PAN via KYC API         | ~₹2–3 per check        |
| 1    | Darpan ID, self-declared with link   | Free                   |
| 2    | Peer endorsement from a verified org | Free, scales with use  |
| 3    | 12A/80G status, financials, visits   | Staff time, later      |

A PAN name mismatch is a flag for review, not a rejection. Organisations routinely operate under a short public name while the PAN carries the full legal name.

## Sector taxonomy

Fixed multi-select list of 25 tags plus "Other", trimmed from NGO Darpan's ~40. "Other" captures free text; when several organisations type the same thing, promote it to a tag in a migration.

The sector filter is OR: selecting Education and Water returns organisations doing either. Organisations tag broadly, so AND returns almost nothing.

## Not built yet

- Document upload (registration certificate, 12A/80G) to Supabase Storage.
- Email notification when a collaboration request arrives. Requests currently appear in the dashboard only.
- Admin review queue for flagged and pending listings.
- 12A/80G lookup against the income tax portal.

## License

MIT
