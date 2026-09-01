-- Track owner-confirmed invoice payments and remove the two obsolete
-- Xiyangcen invoice records identified by both immutable ID and invoice number.

begin;

alter table public.staff_invoices
  add column if not exists paid_at timestamptz;
alter table public.staff_invoices
  add column if not exists paid_by_team_username text;

update public.staff_invoices
set paid_at = coalesce(paid_at, submitted_at)
where status = 'paid';

delete from public.team_documents
where file_url in (
  '/api/team-hub/payroll/invoices/ad895552-92c5-4491-a047-7a3b66d38cef/pdf',
  '/api/team-hub/payroll/invoices/f65b31a8-c238-4099-8411-d4fa46837887/pdf'
);

delete from public.team_payroll
where invoice_file_url in (
  '/api/team-hub/payroll/invoices/ad895552-92c5-4491-a047-7a3b66d38cef/pdf',
  '/api/team-hub/payroll/invoices/f65b31a8-c238-4099-8411-d4fa46837887/pdf'
);

delete from public.staff_invoices
where (
    id = 'ad895552-92c5-4491-a047-7a3b66d38cef'
    and invoice_number = 'INV-XIYANGCEN-202607'
  )
  or (
    id = 'f65b31a8-c238-4099-8411-d4fa46837887'
    and invoice_number = 'INV-XIYANGCEN-202608'
  );

create or replace function public.mark_staff_invoice_paid(
  p_invoice_id uuid,
  p_paid_by_team_username text
)
returns public.staff_invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  paid_invoice public.staff_invoices;
begin
  update public.staff_invoices
  set
    status = 'paid',
    paid_at = coalesce(paid_at, now()),
    paid_by_team_username = coalesce(
      paid_by_team_username,
      nullif(btrim(p_paid_by_team_username), '')
    )
  where id = p_invoice_id
  returning * into paid_invoice;

  if paid_invoice.id is null then
    raise no_data_found using message = 'Invoice not found.';
  end if;

  update public.team_payroll
  set status = 'paid'
  where invoice_file_url =
    '/api/team-hub/payroll/invoices/' || p_invoice_id::text || '/pdf';

  return paid_invoice;
end;
$$;

revoke all on function public.mark_staff_invoice_paid(uuid, text)
  from public, anon, authenticated;
grant execute on function public.mark_staff_invoice_paid(uuid, text)
  to service_role;

commit;
