begin;

alter table public.tasks
  add column if not exists creative_drive_link text;

-- Carousel copy belongs to its individual slides, not the whole post.
update public.tasks
set post_caption = ''
where format = 'carousel'
  and nullif(btrim(post_caption), '') is not null;

commit;
