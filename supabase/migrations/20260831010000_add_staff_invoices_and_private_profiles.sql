-- Private staff payment profiles and generated monthly contractor invoices.
-- All sensitive rows are service-role-only and are never exposed through the
-- browser Supabase client. Payment details are encrypted by the application.

begin;

create table if not exists public.staff_private_profiles (
  staff_profile_id uuid primary key
    references public.profiles(id) on delete cascade,
  encrypted_details text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  staff_profile_id uuid not null
    references public.profiles(id) on delete restrict,
  staff_username text not null,
  staff_name text not null,
  invoice_month text not null check (
    invoice_month ~ '^\d{4}-(0[1-9]|1[0-2])$'
  ),
  currency_code text not null default 'CAD',
  hourly_rate numeric(10, 2) not null check (hourly_rate >= 0),
  total_hours numeric(8, 2) not null check (total_hours > 0),
  total_amount numeric(12, 2) not null check (total_amount >= 0),
  payee_details jsonb not null check (jsonb_typeof(payee_details) = 'object'),
  line_items jsonb not null check (jsonb_typeof(line_items) = 'array'),
  status text not null default 'submitted' check (
    status in ('submitted', 'paid')
  ),
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (staff_profile_id, invoice_month)
);

create index if not exists staff_invoices_username_submitted_idx
  on public.staff_invoices (staff_username, submitted_at desc);
create index if not exists staff_invoices_month_submitted_idx
  on public.staff_invoices (invoice_month, submitted_at desc);

alter table public.staff_private_profiles enable row level security;
alter table public.staff_invoices enable row level security;

revoke all on table public.staff_private_profiles from anon, authenticated;
revoke all on table public.staff_invoices from anon, authenticated;

-- Xiyangcen's supplied payment profile. The ciphertext is bound to the same
-- TOKEN_ENCRYPTION_KEY used by the portal's existing Finance integration.
insert into public.staff_private_profiles (
  staff_profile_id,
  encrypted_details
)
select
  profile.id,
  'v1.FzeEffNautvMgOh-.10tfn4MD8muAxTMi5fEvSQ.sb3uanjl-4LFNqlRwzciUOd-wWgbnd0x8oGwpd2a9Y1T0eNsqbK9LX_7fY0q6Ul88UVBDtuC9yqmrDi6zJNudiAgrUTSFodaCzlK7C2UpUNG7iHJkaK9Ei9xxaXCRikEQgRm_WI6Edq6bvE1-EsCpIivw6lFEqXrOBpBZ-38HuTHm6Xmi8XskUfcz050z5JHTBIyx08lCLVurwcCWpGnW5PrCEL9RiHZ9TLkmYPjfmnLTCNXQn-7HWX6Cl64aZa_6gJAL4QPKZW09DbeWKb3zuMZMqzpGdeOmfSphnjfPzOPTvJMTH0Ec70cXSmz4jFTCgv0AaBFvSqNtzsvj7drVIFP7ktxmIhSRTonFaSR5dNwaBF1MwGlRwNO-xSaM-W6XSlm7p7cUA6pJxtJl-vma5bF4H8906pesNSsghce4EZb0dOs'
from public.profiles as profile
where profile.team_username = 'Understory_Xiyangcen'
on conflict (staff_profile_id) do update
set
  encrypted_details = excluded.encrypted_details,
  updated_at = now();

commit;
