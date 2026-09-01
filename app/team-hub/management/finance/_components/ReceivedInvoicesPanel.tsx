"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from "react";

type Invoice = {
  id: string;
  invoiceNumber: string;
  staffName: string;
  month: string;
  totalHours: number;
  totalAmount: number;
  status: "sent_to_finance" | "paid";
  submittedAt: string;
  paidAt: string | null;
  paidByTeamUsername: string | null;
  pdfHref: string;
};

function money(value: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(value);
}

function monthLabel(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T12:00:00.000Z`));
}

function teamName(value: string | null) {
  return value?.replace(/^Understory_/i, "") ?? "Finance";
}

export function ReceivedInvoicesPanel({
  endpoint = "/api/team-hub/finance/staff-invoices",
}: {
  endpoint?: string;
}) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingInvoiceId, setUpdatingInvoiceId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(endpoint, {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as {
        invoices?: Invoice[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error || "Could not load staff invoices.");
      }
      setInvoices(body.invoices ?? []);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load staff invoices.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markPaid(invoiceId: string) {
    if (updatingInvoiceId) return;
    setUpdatingInvoiceId(invoiceId);
    setError(null);
    try {
      const response = await fetch(
        `/api/team-hub/finance/staff-invoices/${invoiceId}`,
        { method: "PATCH" },
      );
      const body = (await response.json().catch(() => ({}))) as {
        invoice?: Invoice;
        error?: string;
      };
      if (!response.ok || !body.invoice) {
        throw new Error(body.error || "Could not mark the invoice as paid.");
      }
      setInvoices((current) =>
        current.map((invoice) =>
          invoice.id === body.invoice?.id ? body.invoice : invoice,
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not mark the invoice as paid.",
      );
    } finally {
      setUpdatingInvoiceId(null);
    }
  }

  return (
    <section className="mt-8 overflow-hidden rounded-[26px] border border-[#D7CBE0] bg-white shadow-[0_10px_34px_rgba(40,21,79,0.065)]">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#E7DDEB] bg-[#FFFDF8] px-5 py-5 sm:px-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7D4698]">
            Karen &amp; Adrian
          </p>
          <h2 className="mt-1 text-xl font-semibold text-[#341F60]">
            Open invoices
          </h2>
          <p className="mt-1 text-sm text-[#75647F]">
            Open each invoice to review it, then mark it paid for tracking.
            Paid invoices remain listed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={isLoading}
          className="rounded-full border border-[#CDBAD9] bg-white px-4 py-2 text-xs font-semibold text-[#7D4698] disabled:opacity-50"
        >
          Refresh
        </button>
      </header>

      {error && (
        <p
          role="alert"
          className="m-5 rounded-xl border border-[#E4B9B9] bg-[#FFF0F0] px-4 py-3 text-sm text-[#8B3E3E] sm:m-6"
        >
          {error}
        </p>
      )}

      {isLoading ? (
        <div className="m-5 h-32 animate-pulse rounded-2xl bg-[#EEE3FA] sm:m-6" />
      ) : invoices.length ? (
        <div className="divide-y divide-[#E7DDEA]">
          {invoices.map((invoice) => (
            <article
              key={invoice.id}
              className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:px-6"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#EEE3FA] text-[10px] font-bold text-[#7D4698]">
                PDF
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[#341F60]">
                  {invoice.staffName} · {monthLabel(invoice.month)}
                </p>
                <p className="mt-1 text-xs text-[#8B7895]">
                  {invoice.invoiceNumber} · {invoice.totalHours}h · Sent {new Date(invoice.submittedAt).toLocaleDateString("en-CA")}
                </p>
                {invoice.status === "paid" && invoice.paidAt ? (
                  <p className="mt-1 text-xs font-medium text-[#356346]">
                    Paid {new Date(invoice.paidAt).toLocaleDateString("en-CA")} by {teamName(invoice.paidByTeamUsername)}
                  </p>
                ) : null}
              </div>
              <p className="font-semibold text-[#341F60]">
                {money(invoice.totalAmount)}
              </p>
              <span className={`w-fit rounded-full border px-3 py-1.5 text-[9px] font-bold uppercase ${
                invoice.status === "paid"
                  ? "border-[#BFD8C7] bg-[#EDF7EF] text-[#356346]"
                  : "border-[#E8D4A2] bg-[#FFF8E7] text-[#806020]"
              }`}>
                {invoice.status === "paid" ? "Paid" : "Sent to Finance"}
              </span>
              <a
                href={invoice.pdfHref}
                target="_blank"
                rel="noreferrer"
                className="w-fit rounded-full bg-[#341F60] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#28154F]"
              >
                Open invoice
              </a>
              {invoice.status === "sent_to_finance" ? (
                <button
                  type="button"
                  onClick={() => void markPaid(invoice.id)}
                  disabled={updatingInvoiceId !== null}
                  className="w-fit rounded-full border border-[#BFD8C7] bg-[#EDF7EF] px-4 py-2.5 text-xs font-semibold text-[#356346] hover:bg-[#DFF0E3] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {updatingInvoiceId === invoice.id
                    ? "Marking paid…"
                    : "Mark paid"}
                </button>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="px-6 py-10 text-center text-sm text-[#75647F]">
          No invoices have been sent yet.
        </p>
      )}
    </section>
  );
}
