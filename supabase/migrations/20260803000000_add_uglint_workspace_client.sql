-- Add Uglint as an internal marketing workspace alongside client work.

begin;

insert into public.clients (name, slug)
values ('Uglint', 'uglint')
on conflict (slug) do update
set name = excluded.name;

commit;
