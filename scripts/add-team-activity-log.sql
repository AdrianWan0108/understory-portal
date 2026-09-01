-- Run this entire file in the Supabase SQL Editor before opening the Team
-- Dashboard. It creates the shared activity feed and adds a few starter rows.
-- It is safe to run again.
--
-- DEVELOPMENT PROTOTYPE ONLY: access is enforced in the app layer. Replace
-- this permissive policy with Supabase Auth and role-based RLS before
-- production.

begin;

create table if not exists public.team_activity_log (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  target text not null,
  client_slug text,
  created_at timestamptz default now()
);

alter table public.team_activity_log enable row level security;

drop policy if exists "Allow all team activity access"
  on public.team_activity_log;
create policy "Allow all team activity access"
  on public.team_activity_log
  for all
  using (true)
  with check (true);

create index if not exists team_activity_log_created_at_idx
  on public.team_activity_log (created_at desc);

create index if not exists team_activity_log_client_created_at_idx
  on public.team_activity_log (client_slug, created_at desc);

insert into public.team_activity_log (
  actor,
  action,
  target,
  client_slug,
  created_at
)
select
  seeded.actor,
  seeded.action,
  seeded.target,
  seeded.client_slug,
  seeded.created_at
from (
  values
    (
      'Dorothy',
      'requested changes on',
      'Pilates myth-busting carousel',
      'mvp',
      now() - interval '25 minutes'
    ),
    (
      'Arion',
      'submitted',
      'Polestar training page',
      'mvp',
      now() - interval '2 hours'
    ),
    (
      'Sure',
      'updated the campaign brief for',
      'Nano Vista trunk show event page',
      'boardwalk',
      now() - interval '1 day'
    ),
    (
      'Adrian',
      'moved to review',
      'Homepage needs-based funnel',
      'mvp',
      now() - interval '2 days'
    )
) as seeded(actor, action, target, client_slug, created_at)
where not exists (
  select 1
  from public.team_activity_log existing
  where existing.actor = seeded.actor
    and existing.action = seeded.action
    and existing.target = seeded.target
    and existing.client_slug is not distinct from seeded.client_slug
);

commit;
