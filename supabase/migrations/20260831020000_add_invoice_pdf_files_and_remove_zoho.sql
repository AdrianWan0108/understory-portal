-- Persist generated staff invoice PDFs privately and retire the discontinued
-- Zoho Books integration. Finance sessions remain because they protect staff
-- payment details and can be reused for a future QuickBooks connection.

begin;

alter table public.staff_invoices
  add column if not exists pdf_storage_path text;

insert into storage.buckets (id, name, public)
values ('staff-invoice-files', 'staff-invoice-files', false)
on conflict (id) do update
set public = false;

-- The bucket intentionally has no anon/authenticated policies. Files are
-- served only through a Team Hub route after staff/owner authorization.
drop policy if exists "Public can view staff invoice files"
  on storage.objects;
drop policy if exists "Public can upload staff invoice files"
  on storage.objects;
drop policy if exists "Public can delete staff invoice files"
  on storage.objects;

-- Remove stored OAuth material before dropping the discontinued integration.
delete from public.zoho_oauth_states;
delete from public.zoho_books_connections;
drop table if exists public.zoho_oauth_states;
drop table if exists public.zoho_books_connections;

commit;
