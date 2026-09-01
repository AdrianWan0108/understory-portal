-- Version stored staff invoice PDFs so older files can be regenerated with
-- payment details the next time an authorized user opens them.

begin;

alter table public.staff_invoices
  add column if not exists pdf_version integer not null default 1
  check (pdf_version >= 1);

commit;
