-- Auth claims, endorsement bookkeeping, inbox indexes. Safe to re-run.

create index if not exists idx_org_owner         on organizations(owner_id);
create index if not exists idx_org_contact_email on organizations(contact_email);
create index if not exists idx_collab_from       on collaboration_requests(from_org_id, created_at desc);
create index if not exists idx_endorse_endorsed  on endorsements(endorsed_id);

alter table collaboration_requests
  add column if not exists read_at    timestamptz,
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_collab_touch on collaboration_requests;
create trigger trg_collab_touch before update on collaboration_requests
  for each row execute function touch_updated_at();

-- Keep the 'peer' verification row in step with endorsements.
create or replace function sync_peer_verification() returns trigger
language plpgsql as $$
declare
  target uuid := coalesce(new.endorsed_id, old.endorsed_id);
  n int;
begin
  select count(*) into n from endorsements where endorsed_id = target;
  if n > 0 then
    insert into verifications (organization_id, check_type, status, provider, reference, checked_at)
    values (target, 'peer', 'verified', 'peer', n::text, now())
    on conflict (organization_id, check_type)
      do update set status = 'verified', reference = n::text, checked_at = now();
  else
    delete from verifications where organization_id = target and check_type = 'peer';
  end if;
  return null;
end $$;

drop trigger if exists trg_endorse_sync on endorsements;
create trigger trg_endorse_sync after insert or delete on endorsements
  for each row execute function sync_peer_verification();

-- Links a signed-in user to the listing registered with their email, once.
create or replace function claim_organization(p_user_id uuid, p_email citext)
returns uuid
language plpgsql security definer as $$
declare
  org_id uuid;
begin
  select id into org_id from organizations where owner_id = p_user_id limit 1;
  if org_id is not null then return org_id; end if;

  update organizations
     set owner_id = p_user_id
   where contact_email = p_email and owner_id is null
   returning id into org_id;
  return org_id;
end $$;

revoke all on function claim_organization(uuid, citext) from public, anon, authenticated;
