-- Use clear staff-facing invoice statuses and keep them synchronized with the
-- matching payroll record when Finance marks it paid.

begin;

alter table public.staff_invoices
  drop constraint if exists staff_invoices_status_check;

update public.staff_invoices
set status = 'sent_to_finance'
where status = 'submitted';

alter table public.staff_invoices
  add constraint staff_invoices_status_check check (
    status in ('sent_to_finance', 'paid')
  );

create or replace function public.sync_staff_invoice_payroll_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_id uuid;
begin
  if new.invoice_file_url is null then
    return new;
  end if;

  begin
    invoice_id := substring(
      new.invoice_file_url
      from '/payroll/invoices/([0-9a-fA-F-]{36})/pdf$'
    )::uuid;
  exception when others then
    return new;
  end;

  if invoice_id is null then
    return new;
  end if;

  update public.staff_invoices
  set status = case
    when new.status = 'paid' then 'paid'
    else 'sent_to_finance'
  end
  where id = invoice_id;

  return new;
end;
$$;

revoke all on function public.sync_staff_invoice_payroll_status()
  from public, anon, authenticated;

drop trigger if exists sync_staff_invoice_payroll_status
  on public.team_payroll;
create trigger sync_staff_invoice_payroll_status
after insert or update of status, invoice_file_url
on public.team_payroll
for each row
execute function public.sync_staff_invoice_payroll_status();

commit;
