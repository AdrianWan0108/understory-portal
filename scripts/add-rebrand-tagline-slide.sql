-- Run this file in the Supabase SQL Editor if scripts/seed.sql was run before
-- the rebrand tagline slide was added. It is safe to run again.

begin;

do $update$
declare
  rebrand_task_id tasks.id%type;
begin
  select tasks.id
  into rebrand_task_id
  from tasks
  join clients on clients.id = tasks.client_id
  where clients.slug = 'mvp'
    and tasks.assignee = 'Emilia'
    and tasks.title = 'Rebrand launch carousel'
  limit 1;

  if rebrand_task_id is null then
    raise exception 'Rebrand launch carousel task not found. Run scripts/seed.sql first.';
  end if;

  if not exists (
    select 1
    from task_slides
    where task_id = rebrand_task_id
      and on_screen_text = 'Motion creates vitality. Everyone is our MVP.'
  ) then
    -- Move slides away from their current numbers first so this also works
    -- when (task_id, slide_number) has a unique constraint.
    update task_slides
    set slide_number = slide_number + 100
    where task_id = rebrand_task_id
      and slide_number >= 2;

    update task_slides
    set slide_number = slide_number - 99
    where task_id = rebrand_task_id
      and slide_number >= 102;

    insert into task_slides (
      task_id,
      slide_number,
      on_screen_text,
      visual_note,
      slide_caption,
      warning_flag,
      image_url
    ) values (
      rebrand_task_id,
      2,
      'Motion creates vitality. Everyone is our MVP.',
      'Brand mark or simple typographic slide — clean, centered tagline treatment, brand color background',
      'This is what we stand for.',
      null,
      null
    );
  end if;
end
$update$;

commit;
