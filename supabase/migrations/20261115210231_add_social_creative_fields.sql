-- Keep the Creative step focused on the copy and social accounts needed for
-- publishing. Existing Reel hooks are preserved when the new shared hook is
-- introduced; hashtags and collaborator usernames start empty.

begin;

alter table public.tasks
  add column if not exists hook text not null default '',
  add column if not exists hashtags text[] not null default '{}'::text[],
  add column if not exists collaborator_usernames text[] not null default '{}'::text[];

update public.tasks
set hook = coalesce(reel_details ->> 'hook', '')
where hook = ''
  and coalesce(reel_details ->> 'hook', '') <> '';

commit;
