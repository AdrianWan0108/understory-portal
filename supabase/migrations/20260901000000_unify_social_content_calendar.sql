-- Make content_calendar the canonical social workspace and split production,
-- approval, scheduling, and publishing into independent dimensions. Legacy
-- Internal Approval tasks and their foreign keys are intentionally retained.

begin;

alter table public.tasks
  add column if not exists production_status text;
alter table public.tasks
  add column if not exists publishing_status text;
alter table public.tasks
  add column if not exists purpose text;
alter table public.tasks
  add column if not exists content_pillar text;
alter table public.tasks
  add column if not exists platform text;
alter table public.tasks
  add column if not exists target_audience text;
alter table public.tasks
  add column if not exists cta text;
alter table public.tasks
  add column if not exists requires_filming boolean not null default false;
alter table public.tasks
  add column if not exists filming_details jsonb not null default '{}'::jsonb;
alter table public.tasks
  add column if not exists live_post_url text;

update public.tasks
set production_status = case status
  when 'in_progress' then 'in_progress'
  when 'for_review' then 'ready_for_review'
  when 'changes_requested' then 'changes_required'
  when 'needs_revision' then 'changes_required'
  when 'internal_approved' then 'complete'
  when 'external_approved' then 'complete'
  when 'approved' then 'complete'
  when 'scheduled' then 'complete'
  when 'posted' then 'complete'
  else 'not_started'
end
where production_status is null
   or production_status not in (
     'not_started',
     'in_progress',
     'ready_for_review',
     'changes_required',
     'complete'
   );

update public.tasks
set publishing_status = case
  when posted_at is not null or status = 'posted' then 'posted'
  when status = 'scheduled' then 'scheduled'
  else 'unscheduled'
end
where publishing_status is null
   or publishing_status not in ('unscheduled', 'scheduled', 'posted');

-- Preserve Reel production data in the new per-post filming object. The Reel
-- JSON remains in place for compatibility and final-deliverable previews.
update public.tasks
set
  requires_filming = true,
  filming_details = jsonb_strip_nulls(
    jsonb_build_object(
      'filmingDate', '',
      'participants', '[]'::jsonb,
      'needsModels', false,
      'preparation', '',
      'script', coalesce(reel_details ->> 'script', ''),
      'shotList', '',
      'rawFootageLinks', case
        when jsonb_typeof(reel_details -> 'footageLinks') = 'array'
          then reel_details -> 'footageLinks'
        else '[]'::jsonb
      end,
      'filmed', false
    )
  )
where format = 'reel'
  and filming_details = '{}'::jsonb
  and (
    nullif(reel_details ->> 'script', '') is not null
    or (
      jsonb_typeof(reel_details -> 'footageLinks') = 'array'
      and jsonb_array_length(reel_details -> 'footageLinks') > 0
    )
  );

alter table public.tasks
  alter column production_status set default 'not_started';
alter table public.tasks
  alter column production_status set not null;
alter table public.tasks
  alter column publishing_status set default 'unscheduled';
alter table public.tasks
  alter column publishing_status set not null;

alter table public.tasks
  drop constraint if exists tasks_production_status_check;
alter table public.tasks
  add constraint tasks_production_status_check check (
    production_status in (
      'not_started',
      'in_progress',
      'ready_for_review',
      'changes_required',
      'complete'
    )
  );

alter table public.tasks
  drop constraint if exists tasks_publishing_status_check;
alter table public.tasks
  add constraint tasks_publishing_status_check check (
    publishing_status in ('unscheduled', 'scheduled', 'posted')
  );

alter table public.tasks
  drop constraint if exists tasks_filming_details_object_check;
alter table public.tasks
  add constraint tasks_filming_details_object_check check (
    jsonb_typeof(filming_details) = 'object'
  );

-- A client that only had the legacy review workspace still needs a canonical
-- calendar. Existing content calendars remain the preferred parent.
insert into public.division_tasks (
  client_id,
  division,
  title,
  description,
  status,
  template_type,
  watcher_usernames
)
select distinct on (legacy.client_id)
  legacy.client_id,
  'social-media',
  'Social Content Calendar',
  'Plan, produce, approve, schedule, and archive social content in one workspace.',
  'production',
  'content_calendar',
  coalesce(legacy.watcher_usernames, array[]::text[])
from public.division_tasks legacy
where legacy.division = 'social-media'
  and legacy.template_type = 'internal_approval'
  and not exists (
    select 1
    from public.division_tasks calendar
    where calendar.client_id = legacy.client_id
      and calendar.division = 'social-media'
      and calendar.template_type = 'content_calendar'
  )
order by legacy.client_id, legacy.created_at asc;

with canonical_social_calendars as (
  select client_id, id as calendar_id
  from (
    select
      calendar.client_id,
      calendar.id,
      row_number() over (
        partition by calendar.client_id
        order by calendar.created_at asc, calendar.id asc
      ) as calendar_rank
    from public.division_tasks calendar
    where calendar.division = 'social-media'
      and calendar.template_type = 'content_calendar'
  ) ranked
  where calendar_rank = 1
)
update public.division_tasks calendar
set
  title = 'Social Content Calendar',
  description = coalesce(
    nullif(calendar.description, ''),
    'Plan, produce, approve, schedule, and archive social content in one workspace.'
  )
from canonical_social_calendars canonical
where calendar.id = canonical.calendar_id;

create unique index if not exists division_tasks_one_content_calendar_per_client_idx
  on public.division_tasks (client_id)
  where division = 'social-media'
    and template_type = 'content_calendar';

-- Move social posts to the canonical parent. Approval JSON, history, legacy
-- review linkage, media, slides, assignments, and timestamps are untouched.
with canonical_social_calendars as (
  select client_id, id as calendar_id
  from (
    select
      calendar.client_id,
      calendar.id,
      row_number() over (
        partition by calendar.client_id
        order by calendar.created_at asc, calendar.id asc
      ) as calendar_rank
    from public.division_tasks calendar
    where calendar.division = 'social-media'
      and calendar.template_type = 'content_calendar'
  ) ranked
  where calendar_rank = 1
)
update public.tasks post
set division_task_id = canonical.calendar_id
from canonical_social_calendars canonical
where post.client_id = canonical.client_id
  and post.division_task_id is distinct from canonical.calendar_id;

create index if not exists tasks_social_calendar_schedule_idx
  on public.tasks (division_task_id, scheduled_at)
  where publishing_status <> 'posted';

create index if not exists tasks_social_calendar_archive_idx
  on public.tasks (division_task_id, posted_at desc)
  where publishing_status = 'posted';

create index if not exists tasks_social_production_queue_idx
  on public.tasks (division_task_id, production_status, due_date);

-- Transition keys make actionable Slack events idempotent. A failed delivery
-- can be retried by deleting its row; no content data is involved.
create table if not exists public.social_notification_events (
  transition_key text primary key,
  task_id uuid not null references public.tasks(id) on delete cascade,
  event_type text not null,
  created_at timestamptz not null default now()
);

alter table public.social_notification_events enable row level security;

create index if not exists social_notification_events_task_idx
  on public.social_notification_events (task_id, created_at desc);

commit;
