-- Finance now uses the existing Team Portal owner identity. Remove the
-- retired social-login session state and its one-time permission helper.

begin;

drop function if exists public.grant_finance_access_by_email(text, text);
drop table if exists public.finance_sessions;

alter table public.profiles
  drop column if exists can_view_finance;

-- Finance edits are audited against the Team Portal identity, so owners no
-- longer need an auth.users record left over from the retired social login.
alter table public.staff_monthly_budgets
  alter column created_by drop not null;
alter table public.staff_monthly_budgets
  add column if not exists created_by_team_username text;
alter table public.staff_monthly_budgets
  drop constraint if exists staff_monthly_budgets_creator_check;
alter table public.staff_monthly_budgets
  add constraint staff_monthly_budgets_creator_check check (
    created_by is not null
    or nullif(btrim(created_by_team_username), '') is not null
  );

alter table public.staff_time_entries
  add column if not exists created_by_team_username text;
alter table public.staff_time_entries
  drop constraint if exists staff_time_entries_creator_check;
alter table public.staff_time_entries
  add constraint staff_time_entries_creator_check check (
    created_by is not null
    or nullif(btrim(submitted_by_team_username), '') is not null
    or nullif(btrim(created_by_team_username), '') is not null
  );

commit;
