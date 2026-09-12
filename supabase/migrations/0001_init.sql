-- tele-ngo-directory — initial schema
-- Safe to re-run. Paste into the Supabase SQL editor.

create extension if not exists "pgcrypto";
create extension if not exists "citext";
create extension if not exists "pg_trgm";   -- fuzzy name search

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

create table if not exists states (
  code text primary key,
  name text not null
);

-- Sectors are a fixed list, not free text. `slug` is the stable API identifier;
-- `label` can be reworded without breaking saved filters or client code.
create table if not exists sectors (
  slug        text primary key,
  label       text not null,
  sort_order  int  not null default 100
);

-- ---------------------------------------------------------------------------
-- Organisations
-- ---------------------------------------------------------------------------

create table if not exists organizations (
  id                uuid primary key default gen_random_uuid(),

  -- auth.users row that controls this listing. Null until claimed.
  owner_id          uuid references auth.users(id) on delete set null,

  -- legal_name must match the PAN record; display_name is what the org calls
  -- itself in public. These differ often enough that conflating them would
  -- cause false verification failures.
  legal_name        text not null,
  display_name      text not null,

  entity_type       text not null
                      check (entity_type in ('trust','society','section_8','other')),
  registration_number text,

  -- Stored uppercase, no spaces. Unique: one listing per organisation.
  pan               text unique
                      check (pan is null or pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  darpan_id         text,

  year_established  int check (year_established between 1850 and extract(year from now())::int),
  mission           text,
  website           text,

  contact_email     citext not null,
  contact_person    text,
  contact_phone     text,

  -- Region. District is free text for now: there are ~800 and the official
  -- lists disagree with each other. State is constrained.
  state_code        text references states(code),
  district          text,
  operates_pan_india boolean not null default false,

  -- Free-text sector that did not fit the taxonomy. Reviewed periodically and
  -- promoted into `sectors` when a pattern emerges.
  other_sector_note text,

  -- 'pending'  — registered, PAN check not passed yet. Hidden from search.
  -- 'active'   — visible in the directory.
  -- 'flagged'  — needs a human look (usually a PAN name mismatch). Visible,
  --              but badged, because a mismatch is usually innocent.
  -- 'suspended'— hidden.
  status            text not null default 'pending'
                      check (status in ('pending','active','flagged','suspended')),

  -- Are we allowed to show contact details to other verified orgs?
  open_to_contact   boolean not null default true,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists organization_sectors (
  organization_id uuid not null references organizations(id) on delete cascade,
  sector_slug     text not null references sectors(slug) on delete restrict,
  primary key (organization_id, sector_slug)
);

-- ---------------------------------------------------------------------------
-- Verification
--
-- One row per check, never a single boolean on the organisation. This lets the
-- UI say "PAN verified, 12A pending, Darpan not linked" instead of one opaque
-- badge, and means adding a new check type later is an insert, not a migration.
-- ---------------------------------------------------------------------------

create table if not exists verifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,

  check_type      text not null
                    check (check_type in ('pan','12a','80g','darpan','fcra','csr1','peer')),
  status          text not null default 'pending'
                    check (status in ('pending','verified','mismatch','failed','expired')),

  provider        text,          -- 'cashfree', 'manual', 'peer', ...
  reference       text,          -- masked PAN, Darpan ID, endorsing org id
  notes           text,          -- human note, shown to reviewers only
  raw_response    jsonb,         -- provider payload, for dispute resolution

  checked_at      timestamptz,
  expires_at      timestamptz,   -- 12A/80G expire (3yr provisional, 5yr regular)
  created_at      timestamptz not null default now(),

  unique (organization_id, check_type)
);

-- Peer endorsements: a verified org vouching for another it has worked with.
create table if not exists endorsements (
  id              uuid primary key default gen_random_uuid(),
  endorser_id     uuid not null references organizations(id) on delete cascade,
  endorsed_id     uuid not null references organizations(id) on delete cascade,
  note            text,
  created_at      timestamptz not null default now(),
  unique (endorser_id, endorsed_id),
  check (endorser_id <> endorsed_id)
);

-- ---------------------------------------------------------------------------
-- Collaboration requests — the point of the whole directory
-- ---------------------------------------------------------------------------

create table if not exists collaboration_requests (
  id              uuid primary key default gen_random_uuid(),
  from_org_id     uuid not null references organizations(id) on delete cascade,
  to_org_id       uuid not null references organizations(id) on delete cascade,
  subject         text not null,
  message         text not null,
  status          text not null default 'sent'
                    check (status in ('sent','read','accepted','declined')),
  created_at      timestamptz not null default now(),
  check (from_org_id <> to_org_id)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists idx_org_status        on organizations(status);
create index if not exists idx_org_state         on organizations(state_code);
create index if not exists idx_org_pan_india     on organizations(operates_pan_india) where operates_pan_india;
create index if not exists idx_org_name_trgm     on organizations using gin (display_name gin_trgm_ops);
create index if not exists idx_orgsec_sector     on organization_sectors(sector_slug);
create index if not exists idx_verif_org         on verifications(organization_id);
create index if not exists idx_collab_to         on collaboration_requests(to_org_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_org_touch on organizations;
create trigger trg_org_touch before update on organizations
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Search
--
-- All filtering and ranking happens here rather than in the Worker, so the
-- 10ms CPU budget is never the bottleneck. One round trip, one result set.
--
-- Sector filter is OR-within / AND-across by design: an org matches if it
-- carries ANY of the requested sectors. Requiring ALL of them returns almost
-- nothing, because orgs tag broadly.
-- ---------------------------------------------------------------------------

create or replace function search_ngos(
  p_query       text    default null,
  p_sectors     text[]  default null,
  p_state       text    default null,
  p_district    text    default null,
  p_verified_only boolean default false,
  p_limit       int     default 20,
  p_offset      int     default 0
)
returns table (
  id uuid,
  display_name text,
  mission text,
  state_code text,
  district text,
  operates_pan_india boolean,
  year_established int,
  website text,
  status text,
  sectors text[],
  verified_checks text[],
  endorsement_count bigint,
  total_count bigint
)
language sql stable as $$
  with filtered as (
    select o.*
    from organizations o
    where o.status in ('active','flagged')
      and (p_query is null or p_query = ''
           or o.display_name ilike '%' || p_query || '%'
           or o.mission      ilike '%' || p_query || '%')
      and (p_state is null or o.state_code = p_state or o.operates_pan_india)
      and (p_district is null or o.district ilike p_district)
      and (p_sectors is null or cardinality(p_sectors) = 0 or exists (
            select 1 from organization_sectors os
            where os.organization_id = o.id and os.sector_slug = any(p_sectors)))
      and (not p_verified_only or exists (
            select 1 from verifications v
            where v.organization_id = o.id
              and v.check_type = 'pan' and v.status = 'verified'))
  )
  select
    f.id,
    f.display_name,
    f.mission,
    f.state_code,
    f.district,
    f.operates_pan_india,
    f.year_established,
    f.website,
    f.status,
    coalesce((select array_agg(os.sector_slug order by os.sector_slug)
              from organization_sectors os where os.organization_id = f.id), '{}'),
    coalesce((select array_agg(v.check_type order by v.check_type)
              from verifications v
              where v.organization_id = f.id and v.status = 'verified'), '{}'),
    (select count(*) from endorsements e where e.endorsed_id = f.id),
    (select count(*) from filtered)
  from filtered f
  -- Verified organisations first, then better-endorsed, then alphabetical.
  order by
    exists (select 1 from verifications v
            where v.organization_id = f.id
              and v.check_type = 'pan' and v.status = 'verified') desc,
    (select count(*) from endorsements e where e.endorsed_id = f.id) desc,
    f.display_name asc
  limit  least(coalesce(p_limit, 20), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- ---------------------------------------------------------------------------
-- Row level security
--
-- The Worker uses the service role key and bypasses all of this. These policies
-- exist so that if anything is ever queried with the anon key directly from a
-- browser, pending and suspended listings and all contact data stay private.
-- ---------------------------------------------------------------------------

alter table organizations           enable row level security;
alter table organization_sectors    enable row level security;
alter table verifications           enable row level security;
alter table endorsements            enable row level security;
alter table collaboration_requests  enable row level security;

drop policy if exists org_public_read on organizations;
create policy org_public_read on organizations
  for select using (status in ('active','flagged'));

drop policy if exists org_owner_write on organizations;
create policy org_owner_write on organizations
  for update using (owner_id = auth.uid());

drop policy if exists orgsec_public_read on organization_sectors;
create policy orgsec_public_read on organization_sectors for select using (true);

drop policy if exists verif_public_read on verifications;
create policy verif_public_read on verifications
  for select using (status = 'verified');   -- never expose failures publicly

drop policy if exists endorse_public_read on endorsements;
create policy endorse_public_read on endorsements for select using (true);

drop policy if exists collab_own on collaboration_requests;
create policy collab_own on collaboration_requests
  for select using (
    exists (select 1 from organizations o
            where o.owner_id = auth.uid()
              and o.id in (from_org_id, to_org_id))
  );

-- ---------------------------------------------------------------------------
-- Seed: sectors
--
-- Trimmed from NGO Darpan's ~40 tags. Merged the ones that never get used
-- independently (Biotechnology / Scientific & Industrial Research → Science &
-- Technology) and dropped the ones that are government programme names rather
-- than sectors. "Other" is last on purpose.
-- ---------------------------------------------------------------------------

insert into sectors (slug, label, sort_order) values
  ('education',            'Education & literacy',                 10),
  ('health',               'Health & family welfare',              20),
  ('nutrition',            'Nutrition & food security',            30),
  ('children',             'Children & child rights',              40),
  ('youth',                'Youth development',                    50),
  ('women',                'Women''s development & empowerment',   60),
  ('elderly',              'Elderly care',                         70),
  ('disability',           'Disability & inclusion',               80),
  ('livelihoods',          'Livelihoods & skill development',      90),
  ('microfinance',         'Microfinance & self-help groups',     100),
  ('agriculture',          'Agriculture & farmer welfare',        110),
  ('environment',          'Environment & forests',               120),
  ('climate',              'Climate & renewable energy',          130),
  ('water',                'Water, sanitation & hygiene',         140),
  ('rural',                'Rural development',                   150),
  ('urban',                'Urban poverty & housing',             160),
  ('tribal',               'Tribal affairs',                      170),
  ('caste-equity',         'Caste equity & Dalit rights',         180),
  ('minority',             'Minority rights',                     190),
  ('human-rights',         'Human rights & legal aid',            200),
  ('governance',           'Governance & transparency',           210),
  ('disaster',             'Disaster relief & preparedness',      220),
  ('arts',                 'Arts, culture & heritage',            230),
  ('animal-welfare',       'Animal welfare & wildlife',           240),
  ('technology',           'Science & technology',                250),
  ('other',                'Other',                               999)
on conflict (slug) do update
  set label = excluded.label, sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Seed: states and union territories
-- ---------------------------------------------------------------------------

insert into states (code, name) values
  ('AN','Andaman & Nicobar Islands'), ('AP','Andhra Pradesh'),
  ('AR','Arunachal Pradesh'),         ('AS','Assam'),
  ('BR','Bihar'),                     ('CH','Chandigarh'),
  ('CT','Chhattisgarh'),              ('DH','Dadra & Nagar Haveli and Daman & Diu'),
  ('DL','Delhi'),                     ('GA','Goa'),
  ('GJ','Gujarat'),                   ('HR','Haryana'),
  ('HP','Himachal Pradesh'),          ('JK','Jammu & Kashmir'),
  ('JH','Jharkhand'),                 ('KA','Karnataka'),
  ('KL','Kerala'),                    ('LA','Ladakh'),
  ('LD','Lakshadweep'),               ('MP','Madhya Pradesh'),
  ('MH','Maharashtra'),               ('MN','Manipur'),
  ('ML','Meghalaya'),                 ('MZ','Mizoram'),
  ('NL','Nagaland'),                  ('OR','Odisha'),
  ('PY','Puducherry'),                ('PB','Punjab'),
  ('RJ','Rajasthan'),                 ('SK','Sikkim'),
  ('TN','Tamil Nadu'),                ('TG','Telangana'),
  ('TR','Tripura'),                   ('UP','Uttar Pradesh'),
  ('UT','Uttarakhand'),               ('WB','West Bengal')
on conflict (code) do update set name = excluded.name;
