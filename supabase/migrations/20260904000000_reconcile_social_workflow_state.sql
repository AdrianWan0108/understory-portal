-- Reconcile legacy social records so production, approval, and publishing
-- cannot describe contradictory workflow stages.

begin;

update public.tasks post
set production_status = 'changes_required'
where post.sent_to_client_at is not null
  and post.production_status <> 'changes_required'
  and exists (
    select 1
    from public.division_tasks calendar
    where calendar.id = post.division_task_id
      and calendar.division = 'social-media'
      and calendar.template_type = 'content_calendar'
  )
  and exists (
    select 1
    from jsonb_each(coalesce(post.client_approvals, '{}'::jsonb)) approval
    where approval.value ->> 'status' = 'changes'
  );

update public.tasks post
set production_status = 'complete'
where post.sent_to_client_at is not null
  and post.production_status <> 'complete'
  and exists (
    select 1
    from public.division_tasks calendar
    where calendar.id = post.division_task_id
      and calendar.division = 'social-media'
      and calendar.template_type = 'content_calendar'
  )
  and not exists (
    select 1
    from jsonb_each(coalesce(post.client_approvals, '{}'::jsonb)) approval
    where approval.value ->> 'status' = 'changes'
  );

update public.tasks post
set
  status = 'posted',
  production_status = 'complete',
  publishing_status = 'posted',
  posted_at = coalesce(
    post.posted_at,
    post.scheduled_at,
    post.sent_to_client_at,
    now()
  ),
  posted_by = coalesce(post.posted_by, 'Recorded from live post URL')
where nullif(btrim(post.live_post_url), '') is not null
  and exists (
    select 1
    from public.division_tasks calendar
    where calendar.id = post.division_task_id
      and calendar.division = 'social-media'
      and calendar.template_type = 'content_calendar'
  )
  and (
    post.status <> 'posted'
    or post.production_status <> 'complete'
    or post.publishing_status <> 'posted'
    or post.posted_at is null
  );

commit;
