-- Deep-dive research profiles for existing clients, shown on the Team Hub
-- "Client info" page. One profile per row in public.clients, plus a photo
-- gallery of the business. Available to every team member (owner and
-- staff) to read and edit — unlike Sales/Management this is not
-- owner-restricted, so RLS stays the same permissive "allow all" shape used
-- across the rest of the Team Hub (see 20260717010000 for why: there is no
-- Supabase Auth session to check against).

begin;

insert into storage.buckets (id, name, public)
values ('client-profile-photos', 'client-profile-photos', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "Public can view client profile photos"
  on storage.objects;
create policy "Public can view client profile photos"
  on storage.objects
  for select
  to public
  using (bucket_id = 'client-profile-photos');

drop policy if exists "Public can upload client profile photos"
  on storage.objects;
create policy "Public can upload client profile photos"
  on storage.objects
  for insert
  to public
  with check (bucket_id = 'client-profile-photos');

drop policy if exists "Public can delete client profile photos"
  on storage.objects;
create policy "Public can delete client profile photos"
  on storage.objects
  for delete
  to public
  using (bucket_id = 'client-profile-photos');

create table if not exists public.client_profiles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique
    references public.clients(id) on delete cascade,
  industry text,
  founded text,
  location text,
  website text,
  overview text,
  owner_name text,
  owner_role text,
  owner_bio text,
  owner_contact text,
  target_audience text,
  unique_value_prop text,
  marketing_channels text,
  competitors text,
  brand_voice text,
  goals text,
  challenges text,
  notes text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.client_profiles enable row level security;

drop policy if exists "Allow all client profile access"
  on public.client_profiles;
create policy "Allow all client profile access"
  on public.client_profiles
  for all
  using (true)
  with check (true);

create table if not exists public.client_profile_photos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null
    references public.clients(id) on delete cascade,
  photo_url text not null,
  caption text,
  uploaded_by text,
  created_at timestamptz not null default now()
);

alter table public.client_profile_photos enable row level security;

drop policy if exists "Allow all client profile photo access"
  on public.client_profile_photos;
create policy "Allow all client profile photo access"
  on public.client_profile_photos
  for all
  using (true)
  with check (true);

create index if not exists client_profile_photos_client_created_at_idx
  on public.client_profile_photos (client_id, created_at desc);

commit;
