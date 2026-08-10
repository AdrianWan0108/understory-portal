-- Add Bruno, a new staff Video Editor, to the team profile directory used
-- across Team Hub pickers/avatars and Slack sync.
-- Mirrors the seed insert in 20260717000000_create_profiles_and_slack_sync.sql.

begin;

insert into public.profiles (
  team_username,
  full_name,
  role,
  title
)
values
  ('Understory_Bruno', 'Bruno', 'staff', 'Video Editor')
on conflict (team_username) where team_username is not null do update
set
  full_name = excluded.full_name,
  role = excluded.role,
  title = excluded.title;

commit;
