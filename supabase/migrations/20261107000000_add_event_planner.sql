-- Event Planner: a sixth AI Workspace agent plus the event board it watches.
-- Event plans and items are service-role-only, like the other AI tables: the
-- portal API checks an owner session before reading or changing them.
begin;

alter table public.ai_agents drop constraint if exists ai_agents_key_check;
alter table public.ai_agents add constraint ai_agents_key_check
  check (key in ('operations', 'content', 'research', 'creative', 'growth', 'events'));

insert into public.ai_agents (key, name, responsibility, visual_key) values
  ('events', 'Event Planner', 'Watches event plans: deadlines, blockers, reminders and what each person has to do next.', 'events')
on conflict (key) do nothing;

insert into public.ai_agent_configs (agent_key, provider_routes, allowed_tools, approval_policy, schedule_config) values
  ('events',
   '{"primary":{"provider":"anthropic","model":"claude-sonnet-4-5"}}',
   array['events', 'projects'],
   'Read-only. Never emails partners, messages clients or changes bookings. People update the event board.',
   '{"daily_brief":{"time":"09:00","timezone":"America/Toronto"}}')
on conflict (agent_key) do nothing;

create table public.event_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.division_tasks(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  start_date date not null,
  end_date date not null,
  timezone text not null default 'America/Toronto',
  status text not null default 'planning' check (status in ('planning', 'live', 'wrapped', 'cancelled')),
  slack_target text check (slack_target is null or slack_target in ('mvp', 'boardwalk', 'admin')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.event_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.event_plans(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 300),
  phase text not null default 'General' check (char_length(btrim(phase)) between 1 and 80),
  kind text not null default 'task' check (kind in ('task', 'decision', 'reminder', 'milestone')),
  owner text check (owner is null or char_length(owner) <= 80),
  due_date date,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'waiting', 'blocked', 'done', 'skipped')),
  blocker text check (blocker is null or char_length(blocker) <= 500),
  waiting_on text check (waiting_on is null or char_length(waiting_on) <= 200),
  notes text check (notes is null or char_length(notes) <= 2000),
  sort_order integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index event_plans_active_idx on public.event_plans(status, start_date);
create index event_plan_items_plan_idx on public.event_plan_items(plan_id, due_date, sort_order);

alter table public.event_plans enable row level security;
alter table public.event_plan_items enable row level security;
revoke all on public.event_plans, public.event_plan_items from anon, authenticated;

commit;
