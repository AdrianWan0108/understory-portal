-- Contractor self-service time logging for Team Hub Payroll.
-- Reuses staff_time_entries so contractor submissions are immediately visible
-- in the existing Finance staff-hours workspace.

begin;

alter table public.staff_time_entries
  alter column created_by drop not null;

alter table public.staff_time_entries
  add column if not exists submitted_by_team_username text;

alter table public.staff_time_entries
  drop constraint if exists staff_time_entries_creator_check;
alter table public.staff_time_entries
  add constraint staff_time_entries_creator_check check (
    created_by is not null
    or nullif(btrim(submitted_by_team_username), '') is not null
  );

create table if not exists public.contractor_settings (
  staff_profile_id uuid primary key
    references public.profiles(id) on delete cascade,
  hourly_rate numeric(10, 2) not null default 0
    check (hourly_rate >= 0),
  weekly_cap numeric(6, 2) not null default 0
    check (weekly_cap >= 0 and weekly_cap <= 168),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.contractor_settings enable row level security;
revoke all on table public.contractor_settings from anon, authenticated;

insert into public.contractor_settings (
  staff_profile_id,
  hourly_rate,
  weekly_cap,
  enabled
)
select
  profile.id,
  20,
  10,
  true
from public.profiles as profile
where profile.team_username in ('Understory_Sure', 'Understory_Xiyangcen')
on conflict (staff_profile_id) do nothing;

create index if not exists staff_time_entries_profile_work_date_idx
  on public.staff_time_entries (staff_profile_id, work_date desc);

-- The API checks this first to return a friendly remaining-hours message.
-- The trigger is the final, concurrency-safe guard against two submissions
-- taking the same contractor over their weekly cap.
create or replace function public.enforce_contractor_weekly_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  configured_cap numeric(6, 2);
  existing_hours numeric;
  expected_username text;
begin
  if new.submitted_by_team_username is null then
    return new;
  end if;

  select
    profile.team_username,
    settings.weekly_cap
  into
    expected_username,
    configured_cap
  from public.profiles as profile
  join public.contractor_settings as settings
    on settings.staff_profile_id = profile.id
  where profile.id = new.staff_profile_id
    and settings.enabled = true;

  if configured_cap is null
    or expected_username is distinct from new.submitted_by_team_username then
    raise exception 'Time logging is not enabled for this contractor.'
      using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      new.staff_profile_id::text
        || ':'
        || date_trunc('week', new.work_date)::date::text,
      0
    )
  );

  select coalesce(sum(entry.hours), 0)
  into existing_hours
  from public.staff_time_entries as entry
  where entry.staff_profile_id = new.staff_profile_id
    and entry.work_date >= date_trunc('week', new.work_date)::date
    and entry.work_date < (
      date_trunc('week', new.work_date)::date + interval '7 days'
    )
    and entry.id is distinct from new.id;

  if existing_hours + new.hours > configured_cap then
    raise exception 'Weekly time limit exceeded.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_contractor_weekly_cap()
  from public, anon, authenticated;

drop trigger if exists enforce_contractor_weekly_cap
  on public.staff_time_entries;
create trigger enforce_contractor_weekly_cap
before insert or update of staff_profile_id, work_date, hours,
  submitted_by_team_username
on public.staff_time_entries
for each row
execute function public.enforce_contractor_weekly_cap();

commit;
