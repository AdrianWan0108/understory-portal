-- Allow individual event deliverables to be sent to the client portal for
-- approval without treating them as checklist tasks or social posts.

begin;

alter table public.division_task_items
  add column if not exists sent_to_client_at timestamptz;
alter table public.division_task_items
  add column if not exists sent_to_client_by text;
alter table public.division_task_items
  add column if not exists client_approvals jsonb
    not null default '{}'::jsonb;
alter table public.division_task_items
  add column if not exists approval_history jsonb
    not null default '[]'::jsonb;

alter table public.division_task_items
  drop constraint if exists division_task_items_client_approvals_object_check;
alter table public.division_task_items
  add constraint division_task_items_client_approvals_object_check
  check (jsonb_typeof(client_approvals) = 'object');

alter table public.division_task_items
  drop constraint if exists division_task_items_approval_history_array_check;
alter table public.division_task_items
  add constraint division_task_items_approval_history_array_check
  check (jsonb_typeof(approval_history) = 'array');

create index if not exists division_task_items_client_approval_queue_idx
  on public.division_task_items (sent_to_client_at)
  where sent_to_client_at is not null;

commit;
