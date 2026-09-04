-- Separate scheduling from publishing. Automatic posts are queued in the
-- publishing platform; manual posts receive a deduplicated Slack reminder at
-- their planned publishing time.

begin;

alter table public.tasks
  add column if not exists scheduling_mode text;
alter table public.tasks
  add column if not exists manual_reminder_sent_at timestamptz;

alter table public.tasks
  drop constraint if exists tasks_format_check;
alter table public.tasks
  add constraint tasks_format_check check (
    format in ('reel', 'carousel', 'image', 'story')
  );

update public.tasks
set scheduling_mode = 'automatic'
where scheduling_mode is null
   or scheduling_mode not in ('automatic', 'manual');

alter table public.tasks
  alter column scheduling_mode set default 'automatic';
alter table public.tasks
  alter column scheduling_mode set not null;

alter table public.tasks
  drop constraint if exists tasks_scheduling_mode_check;
alter table public.tasks
  add constraint tasks_scheduling_mode_check check (
    scheduling_mode in ('automatic', 'manual')
  );

create index if not exists tasks_manual_post_reminder_queue_idx
  on public.tasks (scheduled_at)
  where scheduling_mode = 'manual'
    and publishing_status = 'scheduled'
    and posted_at is null
    and manual_reminder_sent_at is null;

commit;
