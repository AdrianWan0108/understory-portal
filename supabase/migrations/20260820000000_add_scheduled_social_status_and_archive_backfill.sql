-- Add the scheduled workflow state in application code and canonicalize legacy
-- social-post rows. public.tasks.status is text and has no CHECK constraint, so
-- no status-column DDL is required here.

begin;

-- posted_at is authoritative for Archive membership.
update public.tasks
set status = 'posted'
where posted_at is not null
  and status is distinct from 'posted';

-- Keep stored values canonical while application normalization continues to
-- accept legacy payloads from older clients and environments.
update public.tasks
set status = 'internal_approved'
where posted_at is null
  and status = 'approved';

update public.tasks
set status = 'changes_requested'
where posted_at is null
  and status = 'needs_revision';

create index if not exists tasks_social_archive_client_idx
  on public.tasks (client_id, posted_at desc)
  where posted_at is not null;

commit;
