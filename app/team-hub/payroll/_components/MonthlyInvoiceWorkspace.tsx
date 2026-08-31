"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from "react";
import { TeamButton } from "@/app/team-hub/_components/TeamHubUi";

type Entry = {
  id: string;
  workDate: string;
  hours: number;
  workLabel: string;
  notes: string | null;
};

type Invoice = {
  id: string;
  invoiceNumber: string;
  status: "submitted" | "paid";
  submittedAt: string;
  href: string;
};

type Workspace = {
  month: string;
  hourlyRate: number;
  loggedHours: number;
  estimatedPay: number;
  entries: Entry[];
  invoice: Invoice | null;
  error?: string;
};

function localMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function currency(value: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(value);
}

function hours(value: number) {
  return new Intl.NumberFormat("en-CA", {
    maximumFractionDigits: 2,
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

export default function MonthlyInvoiceWorkspace({
  month,
  onMonthChange,
  refreshToken,
}: {
  month: string;
  onMonthChange: (month: string) => void;
  refreshToken: number;
}) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/team-hub/payroll/invoices?month=${encodeURIComponent(month)}`,
        { cache: "no-store" },
      );
      const body = (await response.json().catch(() => ({}))) as Workspace;
      if (!response.ok) {
        throw new Error(body.error || "Could not load monthly hours.");
      }
      setWorkspace(body);
      setError(null);
    } catch (caught) {
      setWorkspace(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load monthly hours.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  async function sendInvoice() {
    if (isSending || !workspace?.entries.length || workspace.invoice) return;
    setIsSending(true);
    setError(null);
    try {
      const response = await fetch("/api/team-hub/payroll/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });
      const body = (await response.json().catch(() => ({}))) as Workspace;
      if (!response.ok) {
        throw new Error(body.error || "Could not send the invoice.");
      }
      setWorkspace(body);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not send the invoice.",
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="mt-6 overflow-hidden rounded-[24px] border border-[#D7CBE0] bg-white shadow-[0_8px_28px_rgba(40,21,79,0.055)]">
      <header className="flex flex-col gap-4 border-b border-[#E5DBEA] bg-[#FFFDF8] px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7D4698]">
            Invoice workspace
          </p>
          <h2 className="mt-1 text-xl font-semibold text-[#341F60]">
            Monthly invoice template
          </h2>
          <p className="mt-1 text-sm leading-6 text-[#75647F]">
            Dates and work descriptions fill automatically from your saved hours.
          </p>
        </div>
        <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#75647F]">
          Invoice month
          <input
            type="month"
            value={month}
            max={localMonth()}
            onChange={(event) => onMonthChange(event.target.value)}
            className="mt-1 block rounded-xl border border-[#CDBAD9] bg-white px-3.5 py-2 text-sm font-semibold text-[#341F60] focus:border-[#7D4698] focus:outline-none focus:ring-2 focus:ring-[#EEE3FA]"
          />
        </label>
      </header>

      {error && (
        <p
          role="alert"
          className="m-5 rounded-2xl border border-[#E4B9B9] bg-[#FFF0F0] px-4 py-3 text-sm text-[#8B3E3E] sm:m-6"
        >
          {error}
        </p>
      )}

      {isLoading ? (
        <div className="m-5 h-44 animate-pulse rounded-[18px] bg-[#EEE3FA] sm:m-6" />
      ) : workspace ? (
        <>
          <div className="grid gap-3 px-5 py-5 sm:grid-cols-3 sm:px-6">
            <div className="rounded-[18px] bg-[#F7F1FA] p-4">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#8B7895]">
                Period
              </p>
              <p className="mt-2 font-semibold text-[#341F60]">
                {monthLabel(workspace.month)}
              </p>
            </div>
            <div className="rounded-[18px] bg-[#F7F1FA] p-4">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#8B7895]">
                Total hours
              </p>
              <p className="mt-2 text-xl font-semibold text-[#341F60]">
                {hours(workspace.loggedHours)}h
              </p>
            </div>
            <div className="rounded-[18px] bg-[#F7F1FA] p-4">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#8B7895]">
                Invoice total
              </p>
              <p className="mt-2 text-xl font-semibold text-[#341F60]">
                {currency(workspace.estimatedPay)}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto border-y border-[#E9E0EF]">
            {workspace.entries.length ? (
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="bg-[#FAF7FC] text-[9px] font-bold uppercase tracking-[0.14em] text-[#8B7895]">
                  <tr>
                    <th className="px-6 py-3">Work date</th>
                    <th className="px-6 py-3">Work performed</th>
                    <th className="px-6 py-3 text-right">Hours</th>
                    <th className="px-6 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9E0EF]">
                  {workspace.entries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="whitespace-nowrap px-6 py-4 text-[#75647F]">
                        {dateLabel(entry.workDate)}
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-[#341F60]">
                          {entry.workLabel}
                        </p>
                        {entry.notes && (
                          <p className="mt-1 text-xs text-[#8B7895]">
                            {entry.notes}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-[#5F3378]">
                        {hours(entry.hours)}
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-[#341F60]">
                        {currency(entry.hours * workspace.hourlyRate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-6 py-10 text-center text-sm text-[#75647F]">
                No saved hours for this month yet. New entries will appear here immediately.
              </p>
            )}
          </div>

          <footer className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              {workspace.invoice ? (
                <p className="text-sm text-[#356346]">
                  Sent to Karen and Adrian on{" "}
                  {new Date(workspace.invoice.submittedAt).toLocaleDateString("en-CA")}.
                  This month is now locked.
                </p>
              ) : (
                <p className="text-sm text-[#75647F]">
                  Review the entries, then send once your month is complete.
                </p>
              )}
            </div>
            {workspace.invoice ? (
              <a
                href={workspace.invoice.href}
                className="w-fit rounded-full border border-[#CDBAD9] px-4 py-2.5 text-xs font-semibold text-[#7D4698] hover:bg-[#EEE3FA]"
              >
                View invoice ↗
              </a>
            ) : (
              <TeamButton
                type="button"
                disabled={isSending || !workspace.entries.length}
                onClick={() => void sendInvoice()}
              >
                {isSending ? "Sending…" : "Send invoice to Finance"}
              </TeamButton>
            )}
          </footer>
        </>
      ) : null}
    </section>
  );
}
