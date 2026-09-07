-- Shared, client-scoped content memory plus source metadata for research replies.

begin;

create table if not exists public.assistant_memories (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  category text not null,
  content text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_memories_category_check check (
    category in ('brand_voice', 'audience', 'content_style', 'winning_idea', 'avoid', 'fact')
  ),
  constraint assistant_memories_content_length_check check (
    char_length(content) between 1 and 1000
  )
);

alter table public.assistant_memories enable row level security;

-- Memory is intentionally service-role only. The authenticated Team Hub API
-- verifies the team session before reading or mutating these rows.

create index if not exists assistant_memories_client_created_at_idx
  on public.assistant_memories (client_id, created_at desc);

alter table public.assistant_messages
  add column if not exists sources jsonb not null default '[]'::jsonb;

alter table public.assistant_usage
  add column if not exists provider text;

update public.assistant_usage
set provider = 'anthropic'
where provider is null;

commit;
