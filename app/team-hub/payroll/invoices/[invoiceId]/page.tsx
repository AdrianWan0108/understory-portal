import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import {
  TEAM_IDENTITIES,
  TEAM_SESSION_COOKIE,
  getTeamIdentityForUsername,
} from "@/lib/team-auth";
import { getStaffInvoiceById } from "@/lib/staff-invoices";

function currency(value: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(value);
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function monthLabel(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T12:00:00.000Z`));
}

export default async function StaffInvoicePage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const cookieStore = await cookies();
  const identity = getTeamIdentityForUsername(
    cookieStore.get(TEAM_SESSION_COOKIE)?.value,
  );
  if (!identity) notFound();
  const caller = TEAM_IDENTITIES[identity];
  const { invoiceId } = await params;
  const invoice = await getStaffInvoiceById(invoiceId, caller);
  if (!invoice) notFound();

  const address = invoice.payee.address;
  return (
    <main className="px-5 py-8 sm:px-8 sm:py-12 lg:px-12 print:bg-white print:p-0">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex items-center justify-between gap-4 print:hidden">
          <Link
            href={caller.accessLevel === "owner" ? "/team-hub/documents" : "/team-hub/payroll"}
            className="text-sm font-semibold text-[#7D4698] hover:text-[#341F60]"
          >
            ← Back to {caller.accessLevel === "owner" ? "documents" : "payroll"}
          </Link>
          <a
            href={invoice.pdfHref}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-[#341F60] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(40,21,79,0.16)] transition hover:bg-[#28154F]"
          >
            Open saved PDF
          </a>
        </div>

        <article className="overflow-hidden rounded-[26px] border border-[#D7CBE0] bg-white shadow-[0_16px_50px_rgba(40,21,79,0.09)] print:rounded-none print:border-0 print:shadow-none">
          <header className="flex flex-col gap-8 border-b border-[#D7CBE0] bg-[#FFFDF8] px-7 py-8 sm:flex-row sm:items-start sm:justify-between sm:px-10 print:bg-white print:px-0 print:pt-0">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#7D4698]">
                Understory
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-[#28154F]">
                Invoice
              </h1>
              <p className="mt-3 text-sm text-[#75647F]">
                Independent contractor services
              </p>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-sm sm:text-right">
              <dt className="text-[#8B7895]">Invoice</dt>
              <dd className="font-semibold text-[#341F60]">
                {invoice.invoiceNumber}
              </dd>
              <dt className="text-[#8B7895]">Period</dt>
              <dd className="font-semibold text-[#341F60]">
                {monthLabel(invoice.month)}
              </dd>
              <dt className="text-[#8B7895]">Submitted</dt>
              <dd className="font-semibold text-[#341F60]">
                {new Date(invoice.submittedAt).toLocaleDateString("en-CA")}
              </dd>
              <dt className="text-[#8B7895]">Status</dt>
              <dd className="font-semibold capitalize text-[#356346]">
                {invoice.status}
              </dd>
            </dl>
          </header>

          <section className="grid gap-8 px-7 py-8 sm:grid-cols-2 sm:px-10 print:px-0">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#8B7895]">
                From
              </p>
              <p className="mt-2 font-semibold text-[#341F60]">
                {invoice.payee.legalName}
              </p>
              <address className="mt-1 not-italic text-sm leading-6 text-[#75647F]">
                {address.line1}
                {address.line2 ? <><br />{address.line2}</> : null}
                <br />
                {address.city}, {address.province} {address.postalCode}
                <br />
                {address.country}
              </address>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#8B7895]">
                Bill to
              </p>
              <p className="mt-2 font-semibold text-[#341F60]">
                Understory
              </p>
              <p className="mt-1 text-sm leading-6 text-[#75647F]">
                Attention: Karen &amp; Adrian
                <br />
                Finance
              </p>
            </div>
          </section>

          <section className="overflow-x-auto border-y border-[#D7CBE0]">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-[#F7F1FA] text-[9px] font-bold uppercase tracking-[0.14em] text-[#8B7895] print:bg-white">
                <tr>
                  <th className="px-7 py-3 sm:px-10 print:pl-0">Date</th>
                  <th className="px-5 py-3">Description</th>
                  <th className="px-5 py-3 text-right">Hours</th>
                  <th className="px-5 py-3 text-right">Rate</th>
                  <th className="px-7 py-3 text-right sm:px-10 print:pr-0">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9E0EF]">
                {invoice.lineItems.map((item) => (
                  <tr key={item.id}>
                    <td className="whitespace-nowrap px-7 py-4 text-[#75647F] sm:px-10 print:pl-0">
                      {dateLabel(item.workDate)}
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-[#341F60]">
                        {item.workLabel}
                      </p>
                      {item.notes && (
                        <p className="mt-1 text-xs leading-5 text-[#8B7895]">
                          {item.notes}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right text-[#5F3378]">
                      {item.hours}
                    </td>
                    <td className="px-5 py-4 text-right text-[#75647F]">
                      {currency(item.rate)}
                    </td>
                    <td className="px-7 py-4 text-right font-semibold text-[#341F60] sm:px-10 print:pr-0">
                      {currency(item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <footer className="flex flex-col gap-8 px-7 py-8 sm:flex-row sm:items-end sm:justify-between sm:px-10 print:px-0">
            <p className="max-w-md text-xs leading-5 text-[#8B7895]">
              Payment details are kept separately in the protected staff profile and are available only when Finance needs to issue payment.
            </p>
            <dl className="min-w-72 space-y-3 text-sm">
              <div className="flex justify-between gap-8">
                <dt className="text-[#75647F]">Total hours</dt>
                <dd className="font-semibold text-[#341F60]">
                  {invoice.totalHours}
                </dd>
              </div>
              <div className="flex justify-between gap-8 border-t border-[#D7CBE0] pt-3 text-lg">
                <dt className="font-semibold text-[#341F60]">Total due</dt>
                <dd className="font-semibold text-[#28154F]">
                  {currency(invoice.totalAmount)} CAD
                </dd>
              </div>
            </dl>
          </footer>
        </article>
      </div>
    </main>
  );
}
