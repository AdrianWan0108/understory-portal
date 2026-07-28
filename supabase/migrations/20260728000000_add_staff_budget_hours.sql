-- Private staff budgeting and time tracking for the Finance workspace.
-- Browser roles receive no direct table access; all access goes through
-- Finance API routes backed by the service role and Finance sessions.

begin;

create table if not exists public.staff_monthly_budgets (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references public.profiles(id) on delete cascade,
  budget_month date not null,
  budget_amount numeric(12, 2) not null default 0
    check (budget_amount >= 0),
  planned_hours numeric(8, 2) not null default 0
    check (planned_hours >= 0),
  hourly_rate numeric(10, 2) not null default 0
    check (hourly_rate >= 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_monthly_budgets_month_start_check
    check (budget_month = date_trunc('month', budget_month)::date),
  constraint staff_monthly_budgets_profile_month_key
    unique (staff_profile_id, budget_month)
);

create table if not exists public.staff_time_entries (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  hours numeric(5, 2) not null check (hours > 0 and hours <= 24),
  work_label text not null check (
    char_length(btrim(work_label)) between 1 and 120
  ),
  notes text check (
    notes is null or char_length(notes) <= 500
  ),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists staff_monthly_budgets_month_idx
  on public.staff_monthly_budgets (budget_month, staff_profile_id);

create index if not exists staff_time_entries_month_staff_idx
  on public.staff_time_entries (work_date desc, staff_profile_id);

alter table public.staff_monthly_budgets enable row level security;
alter table public.staff_time_entries enable row level security;

revoke all on table public.staff_monthly_budgets from anon, authenticated;
revoke all on table public.staff_time_entries from anon, authenticated;

commit;
