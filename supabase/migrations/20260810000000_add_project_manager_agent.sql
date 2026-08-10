-- Adds the "project_manager" assistant persona alongside the existing
-- content/research agents (see 20260720000000_add_team_hub_assistant.sql).

begin;

alter table public.assistant_conversations
  drop constraint if exists assistant_conversations_agent_check;
alter table public.assistant_conversations
  add constraint assistant_conversations_agent_check check (
    agent in ('content', 'research', 'project_manager')
  );

commit;
