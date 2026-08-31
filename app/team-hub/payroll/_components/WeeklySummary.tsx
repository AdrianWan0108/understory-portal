"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from "react";

export type WeeklyTimeSummary = {
  week: { start: string; end: string };
  hourlyRate: number;
  weeklyCap: number;
  loggedHours: number;
  estimatedPay: number;
  remainingHours: number;
  isOverCap: boolean;
  entries: Array<{
    id: string;
    workDate: string;
    hours: number;
    workLabel: string;
    notes: string | null;
    canDelete: boolean;
  }>;
};

type WeeklySummaryProps = {
  refreshToken: number;
  selectedDate: string;
  onSelectedDateChange: (value: string) => void;
  onDeleted: () => void;
};

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
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

function dateLabel(value: string, includeYear = false) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

export default function WeeklySummary({
  refreshToken,
  selectedDate,
  onSelectedDateChange,
  onDeleted,
}: WeeklySummaryProps) {
  const [summary, setSummary] = useState<WeeklyTimeSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/team-hub/payroll/time-logs?week=${encodeURIComponent(selectedDate)}`,
        { cache: "no-store" },
      );
      const body = (await response.json().catch(() => ({}))) as
        | WeeklyTimeSummary
        | { error?: string };
      if (!response.ok) {
        throw new Error(
          "error" in body && body.error
            ? body.error
            : "Could not load your weekly summary.",
        );
      }
      const nextSummary = body as WeeklyTimeSummary;
      setSummary(nextSummary);
      setError(null);
    } catch (caught) {
      setSummary(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load your weekly summary.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  async function deleteEntry(
    entry: WeeklyTimeSummary["entries"][number],
  ) {
    if (deleteId !== entry.id) {
      setDeleteId(entry.id);
      setActionError(null);
      return;
    }
    if (deletingId) return;

    setDeletingId(entry.id);
    setActionError(null);
    try {
      const response = await fetch(
        `/api/team-hub/payroll/time-logs/${encodeURIComponent(entry.id)}`,
        { method: "DELETE" },
      );
      const body = (await response.json().catch(() => ({}))) as
        | WeeklyTimeSummary
        | { error?: string };
      if (!response.ok) {
        throw new Error(
          "error" in body && body.error
            ? body.error
            : "Could not delete the time entry.",
        );
      }
      setSummary(body as WeeklyTimeSummary);
      setDeleteId(null);
      onDeleted();
    } catch (caught) {
      setActionError(
        caught instanceof Error
          ? caught.message
          : "Could not delete the time entry.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-[24px] border border-[#D7CBE0] bg-white shadow-[0_8px_28px_rgba(40,21,79,0.055)]">
      <header className="border-b border-[#E5DBEA] bg-[#FFFDF8] px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7D4698]">
            Selected week
          </p>
          <label className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#75647F]">
            Week containing
            <input
              type="date"
              value={selectedDate}
              max={localDate()}
              onChange={(event) => onSelectedDateChange(event.target.value)}
              className="ml-2 rounded-lg border border-[#CDBAD9] bg-white px-2.5 py-1.5 text-[11px] font-semibold normal-case tracking-normal text-[#341F60] focus:border-[#7D4698] focus:outline-none"
            />
          </label>
        </div>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[#341F60]">
              Weekly summary
            </h2>
            {summary && (
              <p className="mt-1 text-xs text-[#75647F]">
                {dateLabel(summary.week.start)}–{dateLabel(summary.week.end, true)}
              </p>
            )}
          </div>
          {summary && (
            <p className="text-sm font-semibold text-[#5F3378]">
              {currency(summary.hourlyRate)}/hour
            </p>
          )}
        </div>
      </header>

      {isLoading ? (
        <div className="grid gap-3 p-5 sm:grid-cols-3 sm:p-6">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-[18px] bg-[#EEE3FA]"
            />
          ))}
        </div>
      ) : error ? (
        <p
          role="alert"
          className="m-5 rounded-2xl border border-[#E4B9B9] bg-[#FFF0F0] px-4 py-3 text-sm text-[#8B3E3E] sm:m-6"
        >
          {error}
        </p>
      ) : summary ? (
        <>
          <div className="grid gap-3 p-5 sm:grid-cols-3 sm:p-6">
            <div className="rounded-[18px] bg-[#F7F1FA] p-4">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#8B7895]">
                Logged
              </p>
              <p className="mt-2 text-2xl font-semibold text-[#341F60]">
                {hours(summary.loggedHours)}h
              </p>
            </div>
            <div className="rounded-[18px] bg-[#F7F1FA] p-4">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#8B7895]">
                Weekly cap
              </p>
              <p className="mt-2 text-2xl font-semibold text-[#341F60]">
                {hours(summary.weeklyCap)}h
              </p>
            </div>
            <div className="rounded-[18px] bg-[#F7F1FA] p-4">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#8B7895]">
                Estimated pay
              </p>
              <p className="mt-2 text-2xl font-semibold text-[#341F60]">
                {currency(summary.estimatedPay)}
              </p>
            </div>
          </div>

          <div className="px-5 pb-5 sm:px-6 sm:pb-6">
            <div
              className={`rounded-2xl border px-4 py-3 text-sm ${
                summary.isOverCap
                  ? "border-[#E4B9B9] bg-[#FFF0F0] text-[#8B3E3E]"
                  : "border-[#BFD8C7] bg-[#EDF7EF] text-[#356346]"
              }`}
            >
              {summary.isOverCap
                ? `${hours(Math.abs(summary.remainingHours))} hours over your weekly cap. Please check in with Karen.`
                : `${hours(summary.remainingHours)} hours remaining this week.`}
            </div>
          </div>

          <div className="border-t border-[#E9E0EF]">
            {actionError && (
              <p
                role="alert"
                className="mx-5 mt-5 rounded-2xl border border-[#E4B9B9] bg-[#FFF0F0] px-4 py-3 text-sm text-[#8B3E3E] sm:mx-6"
              >
                {actionError}
              </p>
            )}
            {summary.entries.length ? (
              <div className="divide-y divide-[#E9E0EF]">
                {summary.entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start justify-between gap-4 px-5 py-4 sm:px-6"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#341F60]">
                        {entry.workLabel}
                      </p>
                      <p className="mt-1 text-xs text-[#8B7895]">
                        {dateLabel(entry.workDate, true)}
                        {entry.notes ? ` · ${entry.notes}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <p className="text-sm font-semibold text-[#5F3378]">
                        {hours(entry.hours)}h
                      </p>
                      {entry.canDelete && (
                        <button
                          type="button"
                          disabled={Boolean(deletingId)}
                          onClick={() => void deleteEntry(entry)}
                          className="rounded-full border border-[#E2BABA] bg-white px-3 py-1.5 text-[10px] font-semibold text-[#9A4040] transition hover:bg-[#FFF0F0] disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {deletingId === entry.id
                            ? "Deleting…"
                            : deleteId === entry.id
                              ? "Confirm delete?"
                              : "Delete"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-5 py-8 text-center text-sm text-[#75647F] sm:px-6">
                No hours logged for this week yet.
              </p>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
