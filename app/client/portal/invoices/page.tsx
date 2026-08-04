"use client";

// Invoice creation, editing, and status updates happen from the internal admin console (not yet built) — this client-facing page is read-only by design.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useClientIdentity } from "../_components/ClientIdentity";

type InvoiceStatus = "sent" | "received";

type ClientInvoice = {
  id: string;
  client_id: string;
  invoice_number: string;
  description: string | null;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  issued_date: string;
  due_date: string | null;
  file_url: string | null;
  file_name: string | null;
  created_at: string;
};

function localDateValue(date = new Date()) {
  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60 * 1000,
  );
  return localDate.toISOString().slice(0, 10);
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function formatCurrency(amount: number, currency = "CAD") {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
  }).format(Number(amount) || 0);
}

function isOverdue(invoice: ClientInvoice, today: string) {
  return (
    invoice.status === "sent" &&
    Boolean(invoice.due_date) &&
    (invoice.due_date as string) < today
  );
}

function StatusBadge({
  invoice,
  today,
}: {
  invoice: ClientInvoice;
  today: string;
}) {
  if (isOverdue(invoice, today)) {
    return (
      <span className="inline-flex rounded-full border border-[#E4B9B9] bg-[#FFF0F0] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9A4040]">
        Overdue
      </span>
    );
  }

  if (invoice.status === "received") {
    return (
      <span className="inline-flex rounded-full border border-[#BFD8C7] bg-[#EDF7EF] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#356346]">
        Received
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full border border-border bg-muted px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      Sent
    </span>
  );
}

function InvoiceIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  );
}

export default function InvoicesPage() {
  const { clientSlug, clientName } = useClientIdentity();
  const [invoices, setInvoices] = useState<ClientInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const today = localDateValue();
  const totalOutstanding = useMemo(
    () =>
      invoices
        .filter((invoice) => invoice.status === "sent")
        .reduce((total, invoice) => total + (Number(invoice.amount) || 0), 0),
    [invoices],
  );

  useEffect(() => {
    let isActive = true;

    async function loadInvoices() {
      setIsLoading(true);
      setInvoices([]);

      if (!clientSlug) {
        setErrorMessage("Choose a client profile to view invoices.");
        setIsLoading(false);
        return;
      }

      const { data: client, error: clientError } = await supabase
        .from("clients")
        .select("id")
        .eq("slug", clientSlug)
        .single();

      if (!isActive) return;
      if (clientError || !client) {
        setErrorMessage(
          `Could not load ${clientName ?? "the selected client"}: ${clientError?.message ?? "Client not found."}`,
        );
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("client_invoices")
        .select(
          "id, client_id, invoice_number, description, amount, currency, status, issued_date, due_date, file_url, file_name, created_at",
        )
        .eq("client_id", client.id)
        .order("issued_date", { ascending: false });

      if (!isActive) return;

      if (error) {
        setInvoices([]);
        setErrorMessage(`Could not load invoices: ${error.message}`);
      } else {
        setInvoices((data ?? []) as ClientInvoice[]);
        setErrorMessage(null);
      }
      setIsLoading(false);
    }

    void loadInvoices();
    return () => {
      isActive = false;
    };
  }, [clientName, clientSlug]);

  return (
    <main className="min-h-screen px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
              Client portal · {clientName ?? "Client"}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">
              Invoices
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              View invoice dates, payment receipt status, and downloadable PDFs.
            </p>
          </div>

          <div className="shrink-0 text-left sm:text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Total outstanding
            </p>
            <p className="mt-1.5 text-2xl font-semibold text-foreground">
              {isLoading ? "—" : formatCurrency(totalOutstanding)}
            </p>
          </div>
        </header>

        {errorMessage && (
          <div
            role="alert"
            className="mt-6 rounded-2xl border border-accent bg-accent/20 px-4 py-3 text-sm leading-6 text-accent-foreground"
          >
            {errorMessage}
          </div>
        )}

        <section className="mt-12" aria-labelledby="invoice-list-heading">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">
                Billing history
              </p>
              <h2
                id="invoice-list-heading"
                className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-foreground"
              >
                All invoices
              </h2>
            </div>
            {!isLoading && (
              <span className="rounded-full bg-muted px-3 py-1.5 text-[11px] font-semibold text-secondary-foreground">
                {invoices.length} invoices
              </span>
            )}
          </div>

          <div className="mt-5 space-y-3">
            {isLoading
              ? Array.from({ length: 3 }, (_, index) => (
                  <div
                    key={index}
                    className="h-32 animate-pulse rounded-[22px] border border-border bg-card"
                  />
                ))
              : invoices.map((invoice) => (
                  <article
                    key={invoice.id}
                    className="rounded-[22px] border border-border bg-card p-5 shadow-[0_8px_28px_rgba(52,31,96,0.05)] sm:p-6"
                  >
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-start gap-4">
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-primary">
                          <InvoiceIcon />
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-semibold text-foreground">
                            Invoice {invoice.invoice_number}
                          </h3>
                          {invoice.description && (
                            <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">
                              {invoice.description}
                            </p>
                          )}
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            Issued {formatDate(invoice.issued_date)}
                            {invoice.due_date
                              ? ` · Due ${formatDate(invoice.due_date)}`
                              : ""}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center justify-between gap-5 sm:justify-end">
                        <div className="text-left sm:text-right">
                          <p className="text-lg font-semibold text-foreground">
                            {formatCurrency(invoice.amount, invoice.currency)}
                          </p>
                          <div className="mt-1.5">
                            <StatusBadge invoice={invoice} today={today} />
                          </div>
                        </div>
                        {invoice.file_url && (
                          <a
                            href={invoice.file_url}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Open PDF for invoice ${invoice.invoice_number} in a new tab`}
                            className="rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold text-primary transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            Open PDF ↗
                          </a>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
          </div>

          {!isLoading && invoices.length === 0 && !errorMessage && (
            <div className="mt-5 rounded-[24px] border border-dashed border-border bg-card px-6 py-12 text-center">
              <p className="text-sm font-semibold text-foreground">
                No invoices are available yet.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Invoices and receipt statuses will appear here when published.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
