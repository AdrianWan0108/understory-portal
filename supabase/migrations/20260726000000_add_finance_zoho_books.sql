-- Secure, read-only Finance access and Zoho Books connection storage.
-- Apply deliberately with the Supabase CLI after reviewing the target project.

begin;

alter table public.profiles
  add column if not exists can_view_finance boolean not null default false;

create table if not exists public.finance_sessions (
  session_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists finance_sessions_user_id_idx
  on public.finance_sessions (user_id);
create index if not exists finance_sessions_expires_at_idx
  on public.finance_sessions (expires_at);

create table if not exists public.zoho_books_connections (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  organization_id text not null unique,
  organization_name text not null,
  organization_currency_code text not null default 'CAD',
  encrypted_access_token text not null,
  encrypted_refresh_token text not null,
  access_token_expires_at timestamptz not null,
  granted_scopes text[] not null default '{}',
  cached_dashboard jsonb,
  cache_expires_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.zoho_oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists zoho_oauth_states_expires_at_idx
  on public.zoho_oauth_states (expires_at);

alter table public.finance_sessions enable row level security;
alter table public.zoho_books_connections enable row level security;
alter table public.zoho_oauth_states enable row level security;

-- These tables are intentionally service-role-only. Finance data and token
-- material must never be queried directly by a browser Supabase client.
revoke all on table public.finance_sessions from anon, authenticated;
revoke all on table public.zoho_books_connections from anon, authenticated;
revoke all on table public.zoho_oauth_states from anon, authenticated;

create or replace function public.grant_finance_access_by_email(
  p_adrian_email text,
  p_karen_email text
)
returns table (full_name text, email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  adrian_profile public.profiles%rowtype;
  karen_profile public.profiles%rowtype;
begin
  select *
  into adrian_profile
  from public.profiles
  where lower(profiles.email) = lower(btrim(p_adrian_email));

  if adrian_profile.id is null then
    raise exception 'Adrian profile does not exist';
  end if;
  if adrian_profile.user_id is null then
    raise exception 'Adrian profile is not linked to a Supabase Auth user';
  end if;

  select *
  into karen_profile
  from public.profiles
  where lower(profiles.email) = lower(btrim(p_karen_email));

  if karen_profile.id is null then
    raise exception 'Karen profile does not exist';
  end if;
  if karen_profile.user_id is null then
    raise exception 'Karen profile is not linked to a Supabase Auth user';
  end if;
  if adrian_profile.id = karen_profile.id then
    raise exception 'Adrian and Karen emails resolve to the same profile';
  end if;

  update public.profiles set can_view_finance = false;
  update public.profiles
  set can_view_finance = true
  where id in (adrian_profile.id, karen_profile.id);

  return query
  select profiles.full_name, profiles.email
  from public.profiles
  where profiles.id in (adrian_profile.id, karen_profile.id)
  order by profiles.full_name;
end;
$$;

revoke all on function public.grant_finance_access_by_email(text, text)
  from public, anon, authenticated;
grant execute on function public.grant_finance_access_by_email(text, text)
  to service_role;

commit;
