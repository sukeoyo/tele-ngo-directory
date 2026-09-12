# tele-ngo-directory

Verified directory of Indian NGOs so organisations can find and contact each other. Brand: Tele-Upchaar (white, navy blue, mint green).

## Layout

- `packages/shared` — zod schemas, sector taxonomy, states, API types. Imported by both apps; never duplicate these lists.
- `apps/api` — Cloudflare Worker (Hono). Talks to Supabase over PostgREST with the service role key, so every handler authorises itself.
- `apps/web` — Vite + React + react-router. Supabase magic-link auth with the anon key.
- `supabase/migrations` — applied in filename order via the Supabase SQL editor.

## Commands

`npm run typecheck`, `npm test`, `npm run build`, `npm run dev:api`, `npm run dev:web`, `npm run seed`.

## Rules that are easy to break

- Verification is one row per check in `verifications`, never a boolean on `organizations`.
- A PAN name mismatch sets `status = 'flagged'` and stays visible. It is never an auto-reject.
- Name matching uses containment against the shorter name, not a symmetric score. See `scripts/pan-match.test.mjs`.
- Sector filter is OR: an org matches if it has any selected sector.
- Contact details are only returned to a signed-in org whose own PAN is verified. The check lives in `apps/api/src/lib/auth.ts` (`canContact`).
- Service role key never reaches the browser. Web gets only `VITE_*` variables.
- Search, filtering and ranking happen in the `search_ngos` SQL function, not in the Worker.
- Keep code comments minimal; explain non-obvious decisions in one line at the point of use.
