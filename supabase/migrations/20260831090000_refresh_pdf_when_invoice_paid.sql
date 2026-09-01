-- Mark the stored PDF stale when Finance records a payment. The protected API
-- regenerates it immediately; pdf_version = 1 also provides lazy recovery if
-- storage is temporarily unavailable.

begin;

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
    ),
    pdf_version = 1
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
