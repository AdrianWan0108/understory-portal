-- AI Workspace is service-role-only. Browser clients, including authenticated
-- Supabase users, never query these tables directly; the portal API checks the
-- verified auth user against profiles before using its service-role client.
begin;

create table public.ai_agents (
  key text primary key check (key in ('operations', 'content', 'research', 'creative', 'growth')),
  name text not null,
  responsibility text not null,
  visual_key text not null,
  created_at timestamptz not null default now()
);

insert into public.ai_agents (key, name, responsibility, visual_key) values
  ('operations', 'Operations Agent', 'Priorities, project reasoning, scope and risk.', 'operations'),
  ('content', 'Content Agent', 'Plans, copy, briefs and content record suggestions.', 'content'),
  ('research', 'Research Agent', 'Current research with sources and clear uncertainty.', 'research'),
  ('creative', 'Creative Designer', 'Design concepts, specifications and review.', 'creative'),
  ('growth', 'Growth Analyst', 'Interprets deterministic performance metrics and recommends actions.', 'growth');

create table public.ai_agent_configs (
  agent_key text primary key references public.ai_agents(key),
  enabled boolean not null default true,
  provider_routes jsonb not null default '{}'::jsonb check (jsonb_typeof(provider_routes) = 'object'),
  allowed_tools text[] not null default '{}'::text[],
  allowed_actions text[] not null default '{}'::text[],
  permitted_client_ids uuid[] not null default '{}'::uuid[],
  permitted_project_ids uuid[] not null default '{}'::uuid[],
  approval_policy text not null default 'Human approval for high-risk actions',
  provider_limits jsonb not null default '{}'::jsonb check (jsonb_typeof(provider_limits) = 'object'),
  agent_limit_usd numeric(12,4),
  slack_channel_id text,
  schedule_config jsonb not null default '{}'::jsonb check (jsonb_typeof(schedule_config) = 'object'),
  context_sources jsonb not null default '[]'::jsonb check (jsonb_typeof(context_sources) = 'array'),
  updated_at timestamptz not null default now()
);

insert into public.ai_agent_configs (agent_key, provider_routes, allowed_tools) values
  ('operations', '{"primary":{"provider":"anthropic","model":"claude-sonnet-4-5"},"structured":{"provider":"openai","model":"gpt-5.6-terra"},"external":{"provider":"perplexity","model":"sonar-pro","when":"current_external_information"}}', array['projects','tasks','clients']),
  ('content', '{"primary":{"provider":"openai","model":"gpt-5.6-terra"},"research":{"provider":"perplexity","model":"sonar-pro","when":"current_facts"},"qa":{"provider":"anthropic","model":"claude-sonnet-4-5"}}', array['content_calendar','brand_context']),
  ('research', '{"primary":{"provider":"perplexity","model":"sonar-pro"},"synthesis":{"provider":"anthropic","model":"claude-sonnet-4-5"},"structured":{"provider":"openai","model":"gpt-5.6-terra"}}', array['research_sources','clients']),
  ('creative', '{"primary":{"provider":"openai","model":"gpt-5.6-terra"},"references":{"provider":"perplexity","model":"sonar-pro","when":"requested"},"qa":{"provider":"anthropic","model":"claude-sonnet-4-5"}}', array['brand_context','figma_links']),
  ('growth', '{"interpretation":{"provider":"anthropic","model":"claude-sonnet-4-5"},"structured":{"provider":"openai","model":"gpt-5.6-terra"},"benchmarks":{"provider":"perplexity","model":"sonar-pro","when":"requested"}}', array['analytics_reports','deterministic_metrics']);

create table public.ai_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.division_tasks(id) on delete set null,
  content_item_id uuid references public.tasks(id) on delete set null,
  requested_by uuid not null references public.profiles(id),
  assigned_profile_id uuid references public.profiles(id),
  assigned_agent text not null references public.ai_agents(key),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  objective text not null check (char_length(btrim(objective)) between 1 and 10000),
  input_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(input_payload) = 'object'),
  context_references jsonb not null default '[]'::jsonb check (jsonb_typeof(context_references) = 'array'),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'queued' check (status in ('queued','running','waiting_for_input','waiting_for_approval','completed','failed','cancelled')),
  approval_status text not null default 'not_required' check (approval_status in ('not_required','pending','approved','changes_requested','rejected')),
  current_stage text,
  output_summary text,
  structured_output jsonb,
  output_schema text,
  output_version integer not null default 0 check (output_version >= 0),
  error_details text,
  slack_channel_id text,
  slack_thread_ts text,
  slack_message_ts text,
  slack_user_id text,
  slack_permalink text,
  portal_deep_link text not null,
  idempotency_key text not null unique,
  correlation_id uuid not null,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_tasks_queue_idx on public.ai_tasks(status, priority, requested_at desc);
create index ai_tasks_client_idx on public.ai_tasks(client_id, requested_at desc);
create index ai_tasks_project_idx on public.ai_tasks(project_id, requested_at desc);
create index ai_tasks_requester_idx on public.ai_tasks(requested_by, requested_at desc);
create index ai_tasks_content_idx on public.ai_tasks(content_item_id, requested_at desc);

create table public.ai_task_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.ai_tasks(id) on delete restrict,
  workflow_execution_id text,
  trigger_source text not null check (trigger_source in ('portal','slack','schedule','webhook','system_event')),
  status text not null default 'queued' check (status in ('queued','running','completed','failed','partial','refused','timed_out')),
  current_stage text,
  provider text check (provider is null or provider in ('anthropic','openai','perplexity','worker')),
  model text,
  input_references jsonb not null default '[]'::jsonb check (jsonb_typeof(input_references) = 'array'),
  output_version integer not null default 0,
  decision_summary text,
  tool_actions jsonb not null default '[]'::jsonb check (jsonb_typeof(tool_actions) = 'array'),
  error_message text,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  idempotency_key text not null unique,
  correlation_id uuid not null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index ai_task_runs_task_idx on public.ai_task_runs(task_id, created_at desc);

create table public.ai_task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.ai_tasks(id) on delete restrict,
  run_id uuid references public.ai_task_runs(id) on delete restrict,
  event_key text not null unique,
  idempotency_key text unique,
  kind text not null check (kind in ('created','dispatched','stage','output','failure','approval_requested','approval_decided','retry','slack','configuration')),
  summary text not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  actor_profile_id uuid references public.profiles(id),
  correlation_id uuid not null,
  created_at timestamptz not null default now()
);

create index ai_task_events_task_idx on public.ai_task_events(task_id, created_at desc);

create table public.ai_approvals (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.ai_tasks(id) on delete restrict,
  run_id uuid references public.ai_task_runs(id) on delete restrict,
  risk_level text not null check (risk_level in ('low','medium','high')),
  action_type text not null check (action_type in (
    'other','client_message','publish_content','schedule_content','promise_deadline','accept_scope','change_sow',
    'change_ad_budget','change_ad_targeting','change_ad_keyword','change_ad_creative','change_ad_campaign','change_conversion_settings',
    'delete_record','delete_file','create_invoice','create_vendor_bill','create_payment','create_refund','financial_adjustment','final_client_report'
  )),
  requested_action text not null,
  downstream_action text not null,
  output_preview text,
  status text not null default 'pending' check (status in ('pending','approved','changes_requested','rejected')),
  requested_by uuid references public.profiles(id),
  decided_by uuid references public.profiles(id),
  decision_comment text,
  decision_at timestamptz,
  resume_status text not null default 'not_sent' check (resume_status in ('not_sent','sent','failed')),
  resume_error text,
  idempotency_key text not null unique,
  correlation_id uuid not null,
  created_at timestamptz not null default now()
);

create index ai_approvals_inbox_idx on public.ai_approvals(status, created_at desc);

create table public.ai_provider_usage (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.ai_tasks(id) on delete restrict,
  run_id uuid not null references public.ai_task_runs(id) on delete restrict,
  provider text not null check (provider in ('anthropic','openai','perplexity','worker')),
  model text not null,
  stage text not null,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  credits numeric(12,4) check (credits is null or credits >= 0),
  cost_usd numeric(12,4) check (cost_usd is null or cost_usd >= 0),
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create index ai_provider_usage_date_idx on public.ai_provider_usage(created_at desc, provider);

create function public.ai_agent_monthly_cost(p_agent_key text) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(usage.cost_usd), 0)
  from public.ai_provider_usage usage
  join public.ai_tasks task on task.id = usage.task_id
  where task.assigned_agent = p_agent_key
    and usage.created_at >= date_trunc('month', now());
$$;
create function public.ai_provider_monthly_cost(p_provider text) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(cost_usd), 0)
  from public.ai_provider_usage
  where provider = p_provider and created_at >= date_trunc('month', now());
$$;
revoke all on function public.ai_agent_monthly_cost(text), public.ai_provider_monthly_cost(text) from public, anon, authenticated;
grant execute on function public.ai_agent_monthly_cost(text), public.ai_provider_monthly_cost(text) to service_role;

-- Design metadata is one-to-one with the existing social post. It is kept in
-- a service-only table because the current social post table is browser read.
create table public.ai_content_designs (
  content_item_id uuid primary key references public.tasks(id) on delete cascade,
  design_status text not null default 'not_started' check (
    design_status in ('not_started','ai_designing','ai_draft_ready','human_editing','internal_review','revisions','client_review','approved','exported')
  ),
  design_agent text references public.ai_agents(key),
  figma_file_url text,
  figma_frame_url text,
  design_version integer not null default 0 check (design_version >= 0),
  template_used text,
  asset_requirements jsonb not null default '[]'::jsonb check (jsonb_typeof(asset_requirements) = 'array'),
  ai_design_notes text,
  internal_design_feedback text,
  design_approved_by uuid references public.profiles(id),
  design_approved_at timestamptz,
  updated_at timestamptz not null default now()
);

-- RLS with no browser policies, plus revoked grants, gives defense in depth.
alter table public.ai_agents enable row level security;
alter table public.ai_agent_configs enable row level security;
alter table public.ai_tasks enable row level security;
alter table public.ai_task_runs enable row level security;
alter table public.ai_task_events enable row level security;
alter table public.ai_approvals enable row level security;
alter table public.ai_provider_usage enable row level security;
alter table public.ai_content_designs enable row level security;
revoke all on public.ai_agents, public.ai_agent_configs, public.ai_tasks,
  public.ai_task_runs, public.ai_task_events, public.ai_approvals,
  public.ai_provider_usage, public.ai_content_designs from anon, authenticated;
grant all on public.ai_agents, public.ai_agent_configs, public.ai_tasks,
  public.ai_task_runs, public.ai_task_events, public.ai_approvals,
  public.ai_provider_usage, public.ai_content_designs to service_role;

create function public.ai_events_are_immutable() returns trigger
language plpgsql as $$ begin raise exception 'AI audit events are immutable'; end $$;
create trigger ai_task_events_immutable before update or delete on public.ai_task_events
  for each row execute function public.ai_events_are_immutable();

-- Apply one validated n8n event as one database transaction. The task row lock
-- serializes output versions; the event UUID makes a retried delivery a no-op.
create function public.ai_apply_task_event(p_event jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_task public.ai_tasks%rowtype;
  v_run public.ai_task_runs%rowtype;
  v_prior_event public.ai_task_events%rowtype;
  v_status text := p_event ->> 'status';
  v_next text;
  v_output jsonb := p_event -> 'output';
  v_approval jsonb := p_event -> 'approval';
  v_usage jsonb := p_event -> 'usage';
  v_slack jsonb := p_event -> 'slack';
  v_version integer;
  v_now timestamptz := now();
  v_kind text;
  v_transition_allowed boolean;
begin
  select * into v_task from public.ai_tasks
  where id = (p_event ->> 'task_id')::uuid for update;
  if not found then raise exception 'AI task not found'; end if;
  select * into v_run from public.ai_task_runs
  where id = (p_event ->> 'run_id')::uuid and task_id = v_task.id for update;
  if not found or v_run.correlation_id <> (p_event ->> 'correlation_id')::uuid
    or v_task.correlation_id <> (p_event ->> 'correlation_id')::uuid then
    raise exception 'AI run or correlation mismatch';
  end if;
  select * into v_prior_event from public.ai_task_events
    where event_key = p_event ->> 'event_id'
      or idempotency_key = p_event ->> 'idempotency_key';
  if found then
    if v_prior_event.task_id <> v_task.id or v_prior_event.run_id <> v_run.id then
      raise exception 'AI event idempotency key conflict';
    end if;
    return jsonb_build_object('duplicate', true, 'output_version', v_task.output_version);
  end if;
  if v_status = 'completed' and v_output is null and v_approval is null then
    raise exception 'Completed AI event requires output or approval';
  end if;
  v_next := case
    when v_approval is not null then 'waiting_for_approval'
    when v_status = 'running' then 'running'
    when v_status = 'completed' then 'completed'
    when v_status in ('failed', 'timed_out') then 'failed'
    when v_status in ('partial', 'refused') then 'waiting_for_input'
    else 'queued'
  end;
  v_transition_allowed := case v_task.status
    when 'queued' then
      v_next = any (array['running','waiting_for_input','failed','cancelled']::text[])
    when 'running' then
      v_next = any (array['waiting_for_input','waiting_for_approval','completed','failed','cancelled']::text[])
    when 'waiting_for_input' then
      v_next = any (array['queued','running','cancelled']::text[])
    when 'waiting_for_approval' then
      v_next = any (array['queued','running','completed','failed','cancelled']::text[])
    when 'failed' then
      v_next = any (array['queued','cancelled']::text[])
    else false
  end;

  if v_next <> v_task.status and not v_transition_allowed then
    raise exception 'Invalid AI task status transition';
  end if;
  v_version := v_task.output_version + case when v_output is null then 0 else 1 end;
  v_kind := case when v_approval is not null then 'approval_requested'
    when v_output is not null then 'output'
    when v_status in ('failed','timed_out') then 'failure'
    else 'stage' end;

  insert into public.ai_task_events (task_id, run_id, event_key, idempotency_key, kind, summary, metadata, correlation_id)
  values (v_task.id, v_run.id, p_event ->> 'event_id', p_event ->> 'idempotency_key', v_kind,
    coalesce(nullif(p_event ->> 'summary', ''), v_status || ' · ' || coalesce(p_event ->> 'stage', 'workflow')),
    jsonb_build_object('stage', p_event -> 'stage', 'output', v_output,
      'output_version', v_version, 'tool_actions', coalesce(p_event -> 'tool_actions', '[]'::jsonb)),
    v_task.correlation_id);

  update public.ai_task_runs set
    status = v_status,
    current_stage = p_event ->> 'stage',
    workflow_execution_id = coalesce(p_event ->> 'workflow_execution_id', workflow_execution_id),
    provider = coalesce(p_event ->> 'provider', provider),
    model = coalesce(p_event ->> 'model', model),
    decision_summary = p_event ->> 'decision_summary',
    input_references = coalesce(p_event -> 'input_references', input_references),
    tool_actions = coalesce(p_event -> 'tool_actions', '[]'::jsonb),
    latency_ms = (p_event ->> 'latency_ms')::integer,
    output_version = v_version,
    error_message = p_event ->> 'error_message',
    started_at = case when v_status = 'running' then coalesce(started_at, v_now) else started_at end,
    completed_at = case when v_status in ('completed','failed','partial','refused','timed_out') then v_now else completed_at end
  where id = v_run.id;

  update public.ai_tasks set
    status = v_next,
    current_stage = p_event ->> 'stage',
    updated_at = v_now,
    error_details = p_event ->> 'error_message',
    started_at = case when v_status = 'running' then coalesce(started_at, v_now) else started_at end,
    completed_at = case when v_next in ('completed','failed') then v_now else completed_at end,
    structured_output = case when v_output is not null then v_output else structured_output end,
    output_schema = case when v_output is not null then v_output ->> 'kind' else output_schema end,
    output_version = v_version,
    output_summary = case when v_output is not null then p_event ->> 'summary' else output_summary end,
    approval_status = case when v_approval is not null then 'pending' else approval_status end,
    slack_channel_id = case when v_slack is not null then v_slack ->> 'channel_id' else slack_channel_id end,
    slack_thread_ts = case when v_slack is not null then v_slack ->> 'thread_ts' else slack_thread_ts end,
    slack_message_ts = case when v_slack is not null then v_slack ->> 'message_ts' else slack_message_ts end,
    slack_user_id = case when v_slack is not null then v_slack ->> 'user_id' else slack_user_id end,
    slack_permalink = case when v_slack is not null then v_slack ->> 'permalink' else slack_permalink end
  where id = v_task.id;

  if v_approval is not null then
    insert into public.ai_approvals (task_id, run_id, risk_level, action_type, requested_action,
      downstream_action, output_preview, idempotency_key, correlation_id)
    values (v_task.id, v_run.id, v_approval ->> 'risk_level',
      v_approval ->> 'action_type', v_approval ->> 'requested_action', v_approval ->> 'downstream_action',
      v_approval ->> 'output_preview', (p_event ->> 'idempotency_key') || ':approval',
      v_task.correlation_id)
    on conflict (idempotency_key) do nothing;
  end if;
  if v_usage is not null and p_event ->> 'provider' is not null and p_event ->> 'model' is not null then
    insert into public.ai_provider_usage (task_id, run_id, provider, model, stage,
      input_tokens, output_tokens, credits, cost_usd, idempotency_key)
    values (v_task.id, v_run.id, p_event ->> 'provider', p_event ->> 'model',
      coalesce(p_event ->> 'stage', 'unknown'), (v_usage ->> 'input_tokens')::integer,
      (v_usage ->> 'output_tokens')::integer, (v_usage ->> 'credits')::numeric,
      (v_usage ->> 'cost_usd')::numeric, (p_event ->> 'idempotency_key') || ':usage')
    on conflict (idempotency_key) do nothing;
  end if;
  if (v_output ->> 'kind') = 'creative_brief' and v_task.content_item_id is not null then
    insert into public.ai_content_designs (content_item_id, design_agent, design_status,
      design_version, figma_file_url, figma_frame_url, asset_requirements, ai_design_notes)
    values (v_task.content_item_id, 'creative', 'ai_draft_ready', 1,
      case when p_event ->> 'provider' = 'worker' and v_output ->> 'delivery_status' = 'worker_delivered' then v_output ->> 'figma_file_url' end,
      case when p_event ->> 'provider' = 'worker' and v_output ->> 'delivery_status' = 'worker_delivered' then v_output ->> 'figma_frame_url' end,
      coalesce(v_output -> 'asset_requirements', '[]'::jsonb), v_output ->> 'concept')
    on conflict (content_item_id) do update set
      design_status = 'ai_draft_ready', design_version = public.ai_content_designs.design_version + 1,
      figma_file_url = coalesce(excluded.figma_file_url, public.ai_content_designs.figma_file_url),
      figma_frame_url = coalesce(excluded.figma_frame_url, public.ai_content_designs.figma_frame_url),
      asset_requirements = excluded.asset_requirements, ai_design_notes = excluded.ai_design_notes,
      design_approved_by = null, design_approved_at = null,
      updated_at = v_now;
  end if;
  return jsonb_build_object('accepted', true, 'output_version', v_version);
end;
$$;
revoke all on function public.ai_apply_task_event(jsonb) from public, anon, authenticated;
grant execute on function public.ai_apply_task_event(jsonb) to service_role;

create function public.ai_decide_approval(
  p_approval_id uuid, p_actor_id uuid, p_decision text, p_comment text, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_approval public.ai_approvals%rowtype;
  v_actor_name text;
  v_now timestamptz := now();
begin
  if p_decision not in ('approved','changes_requested','rejected') then
    raise exception 'Invalid AI approval decision';
  end if;
  select * into v_approval from public.ai_approvals where id = p_approval_id for update;
  if not found then raise exception 'AI approval not found'; end if;
  if v_approval.status <> 'pending' then
    return jsonb_build_object('duplicate', true, 'approval_id', v_approval.id,
      'task_id', v_approval.task_id, 'run_id', v_approval.run_id,
      'correlation_id', v_approval.correlation_id, 'status', v_approval.status,
      'action_type', v_approval.action_type, 'downstream_action', v_approval.downstream_action);
  end if;
  select full_name into v_actor_name from public.profiles where id = p_actor_id and role = 'owner';
  if v_actor_name is null then raise exception 'Owner profile required'; end if;
  update public.ai_approvals set status = p_decision, decided_by = p_actor_id,
    decision_comment = p_comment, decision_at = v_now where id = p_approval_id;
  insert into public.ai_task_events (task_id, run_id, event_key, idempotency_key, kind, summary,
    metadata, actor_profile_id, correlation_id)
  values (v_approval.task_id, v_approval.run_id, p_approval_id::text || ':decision',
    p_approval_id::text || ':decision',
    'approval_decided', v_actor_name || ' ' || replace(p_decision, '_', ' ') || '.',
    jsonb_build_object('decision', p_decision, 'comment', p_comment,
      'downstream_action', v_approval.downstream_action, 'idempotency_key', p_idempotency_key),
    p_actor_id, v_approval.correlation_id);
  update public.ai_tasks set approval_status = p_decision,
    status = case when p_decision = 'approved' then 'queued' else 'waiting_for_input' end,
    updated_at = v_now where id = v_approval.task_id;
  return jsonb_build_object('approval_id', v_approval.id, 'task_id', v_approval.task_id,
    'run_id', v_approval.run_id, 'correlation_id', v_approval.correlation_id,
    'status', p_decision, 'action_type', v_approval.action_type,
    'downstream_action', v_approval.downstream_action);
end;
$$;
revoke all on function public.ai_decide_approval(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.ai_decide_approval(uuid, uuid, text, text, text) to service_role;

create function public.ai_create_task(p_task jsonb, p_run jsonb, p_event jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_existing public.ai_tasks%rowtype;
begin
  select * into v_existing from public.ai_tasks
  where idempotency_key = p_task ->> 'idempotency_key';
  if found then
    return jsonb_build_object('id', v_existing.id, 'portal_deep_link', v_existing.portal_deep_link,
      'status', v_existing.status, 'run_id', (
        select id from public.ai_task_runs where task_id = v_existing.id order by created_at asc limit 1
      ), 'duplicate', true);
  end if;
  insert into public.ai_tasks (
    id, client_id, project_id, content_item_id, requested_by, assigned_profile_id,
    assigned_agent, title, objective, input_payload, context_references, priority,
    portal_deep_link, idempotency_key, correlation_id, slack_user_id
  ) values (
    (p_task ->> 'id')::uuid, (p_task ->> 'client_id')::uuid,
    (p_task ->> 'project_id')::uuid, (p_task ->> 'content_item_id')::uuid,
    (p_task ->> 'requested_by')::uuid, (p_task ->> 'assigned_profile_id')::uuid,
    p_task ->> 'assigned_agent', p_task ->> 'title', p_task ->> 'objective',
    coalesce(p_task -> 'input_payload', '{}'::jsonb),
    coalesce(p_task -> 'context_references', '[]'::jsonb),
    coalesce(p_task ->> 'priority', 'normal'), p_task ->> 'portal_deep_link',
    p_task ->> 'idempotency_key', (p_task ->> 'correlation_id')::uuid,
    p_task ->> 'slack_user_id'
  );
  insert into public.ai_task_runs (id, task_id, trigger_source, idempotency_key, correlation_id, input_references)
  values ((p_run ->> 'id')::uuid, (p_task ->> 'id')::uuid,
    p_run ->> 'trigger_source', p_run ->> 'idempotency_key',
    (p_task ->> 'correlation_id')::uuid, coalesce(p_task -> 'context_references', '[]'::jsonb));
  insert into public.ai_task_events (task_id, run_id, event_key, idempotency_key, kind, summary,
    actor_profile_id, correlation_id)
  values ((p_task ->> 'id')::uuid, (p_run ->> 'id')::uuid,
    p_event ->> 'event_key', p_event ->> 'event_key', 'created', p_event ->> 'summary',
    (p_task ->> 'requested_by')::uuid, (p_task ->> 'correlation_id')::uuid);
  return jsonb_build_object('id', p_task ->> 'id', 'portal_deep_link',
    p_task ->> 'portal_deep_link', 'status', 'queued', 'run_id', p_run ->> 'id', 'duplicate', false);
exception when unique_violation then
  select * into v_existing from public.ai_tasks
  where idempotency_key = p_task ->> 'idempotency_key';
  if found then
    return jsonb_build_object('id', v_existing.id, 'portal_deep_link', v_existing.portal_deep_link,
      'status', v_existing.status, 'run_id', (
        select id from public.ai_task_runs where task_id = v_existing.id order by created_at asc limit 1
      ), 'duplicate', true);
  end if;
  raise;
end;
$$;
revoke all on function public.ai_create_task(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.ai_create_task(jsonb, jsonb, jsonb) to service_role;

commit;
