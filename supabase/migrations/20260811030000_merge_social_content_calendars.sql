-- Keep one canonical social content calendar per client. Move every nested
-- record before deleting duplicate calendar tasks so no posts are lost.

begin;

create temporary table canonical_content_calendars on commit drop as
select client_id, id as canonical_id
from (
  select
    calendar.client_id,
    calendar.id,
    row_number() over (
      partition by calendar.client_id
      order by
        (calendar.due_date is not null) desc,
        calendar.created_at desc,
        calendar.id desc
    ) as calendar_rank
  from public.division_tasks as calendar
  where calendar.division = 'social-media'
    and calendar.template_type = 'content_calendar'
) ranked
where calendar_rank = 1;

update public.tasks as post
set division_task_id = canonical.canonical_id
from public.division_tasks as duplicate
join canonical_content_calendars as canonical
  on canonical.client_id = duplicate.client_id
where post.division_task_id = duplicate.id
  and duplicate.division = 'social-media'
  and duplicate.template_type = 'content_calendar'
  and duplicate.id <> canonical.canonical_id;

update public.division_task_items as item
set division_task_id = canonical.canonical_id
from public.division_tasks as duplicate
join canonical_content_calendars as canonical
  on canonical.client_id = duplicate.client_id
where item.division_task_id = duplicate.id
  and duplicate.division = 'social-media'
  and duplicate.template_type = 'content_calendar'
  and duplicate.id <> canonical.canonical_id;

update public.social_research_entries as entry
set division_task_id = canonical.canonical_id
from public.division_tasks as duplicate
join canonical_content_calendars as canonical
  on canonical.client_id = duplicate.client_id
where entry.division_task_id = duplicate.id
  and duplicate.division = 'social-media'
  and duplicate.template_type = 'content_calendar'
  and duplicate.id <> canonical.canonical_id;

update public.division_tasks as calendar
set title = 'Content calendar'
from canonical_content_calendars as canonical
where calendar.id = canonical.canonical_id;

delete from public.division_tasks as duplicate
using canonical_content_calendars as canonical
where duplicate.client_id = canonical.client_id
  and duplicate.division = 'social-media'
  and duplicate.template_type = 'content_calendar'
  and duplicate.id <> canonical.canonical_id;

create unique index if not exists division_tasks_one_content_calendar_per_client_idx
  on public.division_tasks (client_id)
  where division = 'social-media'
    and template_type = 'content_calendar';

commit;
