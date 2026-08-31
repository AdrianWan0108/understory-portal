-- Payroll records are audit history. Browser sessions may read or update the
-- legacy records, but they must not hard-delete them or their PDF files.
-- Finance corrections to submitted time continue through the protected
-- service-role Finance API.

begin;

revoke delete on table public.team_payroll from public, anon, authenticated;

drop policy if exists "Public can delete payroll invoices"
  on storage.objects;

commit;
