-- Run this entire file once in the Supabase SQL Editor before opening the
-- Team Hub Payroll page. It creates the payroll table and invoice bucket,
-- enables permissive development policies, and seeds starter records.
-- It is safe to run again.

begin;

insert into storage.buckets (id, name, public)
values ('payroll-invoices', 'payroll-invoices', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "Public can view payroll invoices"
  on storage.objects;
create policy "Public can view payroll invoices"
  on storage.objects
  for select
  to public
  using (bucket_id = 'payroll-invoices');

drop policy if exists "Public can upload payroll invoices"
  on storage.objects;
create policy "Public can upload payroll invoices"
  on storage.objects
  for insert
  to public
  with check (bucket_id = 'payroll-invoices');

drop policy if exists "Public can delete payroll invoices"
  on storage.objects;
create policy "Public can delete payroll invoices"
  on storage.objects
  for delete
  to public
  using (bucket_id = 'payroll-invoices');

create table if not exists public.team_payroll (
  id uuid primary key default gen_random_uuid(),
  staff_username text not null,
  amount numeric(12, 2),
  status text check (status in ('pending', 'paid')),
  pay_period text,
  invoice_file_url text,
  created_at timestamptz default now()
);

alter table public.team_payroll
  add column if not exists invoice_file_url text;

alter table public.team_payroll enable row level security;

drop policy if exists "Allow all team payroll access"
  on public.team_payroll;
create policy "Allow all team payroll access"
  on public.team_payroll
  for all
  using (true)
  with check (true);

create index if not exists team_payroll_staff_created_at_idx
  on public.team_payroll (staff_username, created_at desc);

insert into public.team_payroll (
  staff_username,
  amount,
  status,
  pay_period
)
select
  seeded.staff_username,
  seeded.amount,
  seeded.status,
  seeded.pay_period
from (
  values
    ('Understory_Arion', 1500::numeric, 'paid', 'June 2026'),
    ('Understory_Sure', 800::numeric, 'pending', 'July 2026')
) as seeded(staff_username, amount, status, pay_period)
where not exists (
  select 1
  from public.team_payroll existing
  where existing.staff_username = seeded.staff_username
    and existing.pay_period = seeded.pay_period
);

commit;
