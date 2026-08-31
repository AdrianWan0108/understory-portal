"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from "react";
import { StaffHoursPanel } from "./StaffHoursPanel";
import { PaymentProfilesPanel } from "./PaymentProfilesPanel";

type Connection = {
  connected: boolean;
  organizationName: string | null;
  organizationId: string | null;
  lastSyncedAt: string | null;
};

type Dashboard = {
  currencyCode: string;
  invoicedThisMonth: number;
  expensesThisMonth: number;
  outstandingInvoiceBalance: number;
  unpaidBills: number;
  overdueInvoiceCount: number;
  recentInvoices: Array<{
    id: string;
    invoiceNumber: string;
    client: string;
    invoiceDate: string | null;
    dueDate: string | null;
    total: number;
    balance: number;
    currencyCode: string;
    status: string;
  }>;
  lastRefreshedAt: string;
};

type DashboardResponse = {
  connection?: Connection;
  dashboard?: Dashboard | null;
  error?: string;
  code?: string;
};

function currency(value: number, currencyCode: string) {
  try {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: currencyCode || "CAD",
      currencyDisplay: "narrowSymbol",
    }).format(value);
  } catch {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD",
    }).format(value);
  }
}

function date(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(parsed);
}

function dateTime(value: string | null) {
  if (!value) return "Never";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Unknown"
    : new Intl.DateTimeFormat("en-CA", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(parsed);
}

const metricLabels = [
  ["invoicedThisMonth", "Invoiced this month"],
  ["expensesThisMonth", "Expenses this month"],
  ["outstandingInvoiceBalance", "Outstanding invoice balance"],
  ["unpaidBills", "Unpaid vendor or contractor bills"],
] as const;

export function FinanceDashboard({ viewerName }: { viewerName: string }) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/team-hub/finance/dashboard", {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as DashboardResponse;
      if (!response.ok) {
        setError(body.error || "Could not load Finance data.");
        return;
      }
      setConnection(body.connection ?? null);
      setDashboard(body.dashboard ?? null);
      setError(null);
    } catch {
      setError("Could not reach the Finance service.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setError(null);
    try {
      const response = await fetch("/api/team-hub/finance/refresh", {
        method: "POST",
      });
      const body = (await response.json().catch(() => ({}))) as DashboardResponse;
      if (!response.ok) {
        setError(body.error || "Could not refresh Finance data.");
        return;
      }
      setConnection(body.connection ?? connection);
      setDashboard(body.dashboard ?? null);
    } catch {
      setError("Could not reach the Finance service.");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function connect() {
    if (isConnecting) return;
    setIsConnecting(true);
    setError(null);
    try {
      const response = await fetch("/api/team-hub/finance/zoho/start", {
        method: "POST",
      });
      const body = (await response.json().catch(() => ({}))) as {
        authorizationUrl?: string;
        error?: string;
      };
      if (!response.ok || !body.authorizationUrl) {
        setError(body.error || "Could not start the Zoho connection.");
        return;
      }
      window.location.assign(body.authorizationUrl);
    } catch {
      setError("Could not reach the Zoho connection service.");
    } finally {
      setIsConnecting(false);
    }
  }

  async function signOut() {
    await fetch("/api/team-hub/finance/session", { method: "DELETE" }).catch(
      () => null,
    );
    window.location.replace("/team-hub/management/finance/sign-in");
  }

  return (
    <main className="px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7D4698]">
              Management · Finance
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#28154F] sm:text-4xl">
              Finance
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#75647F]">
              Read-only accounting overview from Zoho Books. Signed in
              securely as {viewerName}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {connection?.connected && (
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={isRefreshing}
                className="rounded-full bg-[#341F60] px-5 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {isRefreshing ? "Refreshing…" : "Refresh"}
              </button>
            )}
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-full border border-[#CDBAD9] bg-white px-5 py-2.5 text-xs font-semibold text-[#5F3378]"
            >
              End Finance session
            </button>
          </div>
        </header>

        <StaffHoursPanel />
        <PaymentProfilesPanel />

        {error && (
          <p
            role="alert"
            className="mt-6 rounded-2xl border border-[#E4B9B9] bg-[#FFF0F0] px-5 py-4 text-sm text-[#8B3E3E]"
          >
            {error}
          </p>
        )}

        <section className="mt-8 rounded-[24px] border border-[#D7CBE0] bg-white p-5 shadow-[0_8px_28px_rgba(40,21,79,0.055)] sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8B7895]">
                Zoho connection
              </p>
              <p className="mt-2 text-lg font-semibold text-[#341F60]">
                {isLoading
                  ? "Checking connection…"
                  : connection?.connected
                    ? connection.organizationName
                    : "Not connected"}
              </p>
              <p className="mt-1 text-xs text-[#8B7895]">
                Last sync:{" "}
                {dateTime(
                  dashboard?.lastRefreshedAt ??
                    connection?.lastSyncedAt ??
                    null,
                )}
              </p>
            </div>
            {!isLoading && (
              <button
                type="button"
                onClick={() => void connect()}
                disabled={isConnecting}
                className="rounded-full border border-[#7D4698] px-5 py-2.5 text-xs font-semibold text-[#5F3378] disabled:opacity-50"
              >
                {isConnecting
                  ? "Opening Zoho…"
                  : connection?.connected
                    ? "Reconnect Zoho Books"
                    : "Connect Zoho Books"}
              </button>
            )}
          </div>
        </section>

        {isLoading ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-32 animate-pulse rounded-[22px] bg-[#EEE3FA]"
              />
            ))}
          </div>
        ) : dashboard ? (
          <>
            <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {metricLabels.map(([key, label]) => (
                <article
                  key={key}
                  className="rounded-[22px] border border-[#D7CBE0] bg-white p-5 shadow-[0_8px_24px_rgba(40,21,79,0.045)]"
                >
                  <p className="text-xs leading-5 text-[#75647F]">{label}</p>
                  <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#341F60]">
                    {currency(dashboard[key], dashboard.currencyCode)}
                  </p>
                </article>
              ))}
              <article className="rounded-[22px] border border-[#D7CBE0] bg-[#341F60] p-5 text-white shadow-[0_8px_24px_rgba(40,21,79,0.1)]">
                <p className="text-xs leading-5 text-[#DCCFE5]">
                  Overdue invoices
                </p>
                <p className="mt-3 text-3xl font-semibold">
                  {dashboard.overdueInvoiceCount}
                </p>
              </article>
            </section>

            <section className="mt-6 overflow-hidden rounded-[24px] border border-[#D7CBE0] bg-white shadow-[0_8px_28px_rgba(40,21,79,0.055)]">
              <div className="border-b border-[#E7DDEB] px-5 py-5 sm:px-6">
                <h2 className="text-lg font-semibold text-[#341F60]">
                  Recent invoices
                </h2>
              </div>
              {dashboard.recentInvoices.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[850px] text-left text-sm">
                    <thead className="bg-[#F8F4FA] text-[10px] uppercase tracking-[0.12em] text-[#8B7895]">
                      <tr>
                        <th className="px-5 py-3 font-bold">Invoice</th>
                        <th className="px-5 py-3 font-bold">Client</th>
                        <th className="px-5 py-3 font-bold">Date</th>
                        <th className="px-5 py-3 font-bold">Due</th>
                        <th className="px-5 py-3 text-right font-bold">Total</th>
                        <th className="px-5 py-3 text-right font-bold">
                          Outstanding
                        </th>
                        <th className="px-5 py-3 font-bold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEE5F1]">
                      {dashboard.recentInvoices.map((invoice) => (
                        <tr key={invoice.id}>
                          <td className="px-5 py-4 font-semibold text-[#341F60]">
                            {invoice.invoiceNumber}
                          </td>
                          <td className="px-5 py-4 text-[#5E4A69]">
                            {invoice.client}
                          </td>
                          <td className="px-5 py-4 text-[#75647F]">
                            {date(invoice.invoiceDate)}
                          </td>
                          <td className="px-5 py-4 text-[#75647F]">
                            {date(invoice.dueDate)}
                          </td>
                          <td className="px-5 py-4 text-right text-[#5E4A69]">
                            {currency(invoice.total, invoice.currencyCode)}
                          </td>
                          <td className="px-5 py-4 text-right text-[#5E4A69]">
                            {currency(invoice.balance, invoice.currencyCode)}
                          </td>
                          <td className="px-5 py-4">
                            <span className="rounded-full bg-[#EEE3FA] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#5F3378]">
                              {invoice.status.replaceAll("_", " ")}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="px-6 py-10 text-center text-sm text-[#8B7895]">
                  No invoices were returned by Zoho Books.
                </p>
              )}
            </section>
          </>
        ) : (
          !error && (
            <section className="mt-6 rounded-[24px] border border-dashed border-[#CDBAD9] bg-white/60 px-6 py-12 text-center">
              <h2 className="text-xl font-semibold text-[#341F60]">
                Connect Zoho Books to load Finance
              </h2>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#75647F]">
                The portal requests only organization, invoice, expense, and
                bill read scopes.
              </p>
              <button
                type="button"
                onClick={() => void connect()}
                disabled={isConnecting}
                className="mt-5 rounded-full bg-[#341F60] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {isConnecting ? "Opening Zoho…" : "Connect Zoho Books"}
              </button>
            </section>
          )
        )}
      </div>
    </main>
  );
}
