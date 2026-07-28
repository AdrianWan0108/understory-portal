"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  TeamButton,
  TeamModal,
  teamInputClass,
} from "@/app/team-hub/_components/TeamHubUi";

type StaffRow = {
  id: string;
  teamUsername: string | null;
  name: string;
  title: string | null;
  avatarUrl: string | null;
  budgetId: string | null;
  budgetAmount: number;
  plannedHours: number;
  hourlyRate: number;
  loggedHours: number;
  estimatedCost: number;
  remainingBudget: number;
  remainingHours: number;
  utilizationPercent: number;
};

type TimeEntry = {
  id: string;
  staffProfileId: string;
  staffName: string;
  workDate: string;
  hours: number;
  workLabel: string;
  notes: string | null;
  createdAt: string;
};

type Snapshot = {
  month: string;
  currencyCode: string;
  summary: {
    totalBudget: number;
    totalPlannedHours: number;
    totalLoggedHours: number;
    totalEstimatedCost: number;
  };
  staff: StaffRow[];
  entries: TimeEntry[];
  error?: string;
};

type BudgetEditor = {
  staffProfileId: string;
  budgetAmount: string;
  plannedHours: string;
  hourlyRate: string;
};

type TimeEditor = {
  staffProfileId: string;
  workDate: string;
  hours: string;
  workLabel: string;
  notes: string;
};

function localMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function currency(value: number, currencyCode = "CAD") {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(value);
}

function hours(value: number) {
  return new Intl.NumberFormat("en-CA", {
    maximumFractionDigits: 2,
  }).format(value);
}

function monthLabel(value: string) {
  const parsed = new Date(`${value}-01T12:00:00Z`);
  return new Intl.DateTimeFormat("en-CA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function dateLabel(value: string) {
  const parsed = new Date(`${value}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function StaffHoursPanel() {
  const [month, setMonth] = useState(localMonth);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [budgetEditor, setBudgetEditor] = useState<BudgetEditor | null>(null);
  const [timeEditor, setTimeEditor] = useState<TimeEditor | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async (selectedMonth: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/team-hub/finance/staff-hours?month=${encodeURIComponent(selectedMonth)}`,
        { cache: "no-store" },
      );
      const body = (await response.json().catch(() => ({}))) as Snapshot;
      if (!response.ok) {
        setError(body.error || "Could not load staff budgets and hours.");
        return;
      }
      setSnapshot(body);
      setError(null);
    } catch {
      setError("Could not reach the staff hours service.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(month);
  }, [load, month]);

  const remainingBudget =
    (snapshot?.summary.totalBudget ?? 0) -
    (snapshot?.summary.totalEstimatedCost ?? 0);
  const hoursProgress =
    snapshot && snapshot.summary.totalPlannedHours > 0
      ? Math.round(
          (snapshot.summary.totalLoggedHours /
            snapshot.summary.totalPlannedHours) *
            1000,
        ) / 10
      : 0;

  const staffById = useMemo(
    () => new Map(snapshot?.staff.map((row) => [row.id, row]) ?? []),
    [snapshot],
  );

  function editBudget(row: StaffRow) {
    setBudgetEditor({
      staffProfileId: row.id,
      budgetAmount: String(row.budgetAmount || ""),
      plannedHours: String(row.plannedHours || ""),
      hourlyRate: String(row.hourlyRate || ""),
    });
  }

  function addTime(row?: StaffRow) {
    const staffProfileId = row?.id ?? snapshot?.staff[0]?.id ?? "";
    setTimeEditor({
      staffProfileId,
      workDate: month === localMonth() ? localDate() : `${month}-01`,
      hours: "",
      workLabel: "",
      notes: "",
    });
  }

  async function saveBudget() {
    if (!budgetEditor || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(
        "/api/team-hub/finance/staff-hours/budget",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            staffProfileId: budgetEditor.staffProfileId,
            month,
            budgetAmount: budgetEditor.budgetAmount,
            plannedHours: budgetEditor.plannedHours,
            hourlyRate: budgetEditor.hourlyRate,
          }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as Snapshot;
      if (!response.ok) throw new Error(body.error || "Could not save budget.");
      setSnapshot(body);
      setBudgetEditor(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save budget.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function saveTime() {
    if (!timeEditor || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(
        "/api/team-hub/finance/staff-hours/entries",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(timeEditor),
        },
      );
      const body = (await response.json().catch(() => ({}))) as Snapshot;
      if (!response.ok) {
        throw new Error(body.error || "Could not save time entry.");
      }
      if (body.month === month) setSnapshot(body);
      else setMonth(body.month);
      setTimeEditor(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save time entry.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteEntry(entry: TimeEntry) {
    if (deleteId !== entry.id) {
      setDeleteId(entry.id);
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/team-hub/finance/staff-hours/entries/${encodeURIComponent(entry.id)}?month=${encodeURIComponent(month)}`,
        { method: "DELETE" },
      );
      const body = (await response.json().catch(() => ({}))) as Snapshot;
      if (!response.ok) {
        throw new Error(body.error || "Could not delete time entry.");
      }
      setSnapshot(body);
      setDeleteId(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not delete time entry.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <section className="mt-8 overflow-hidden rounded-[26px] border border-[#D7CBE0] bg-white shadow-[0_10px_34px_rgba(40,21,79,0.065)]">
        <header className="border-b border-[#E7DDEB] bg-[#FFFDF8] px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7D4698]">
                Priority workspace
              </p>
              <h2 className="mt-1 text-xl font-semibold text-[#341F60]">
                Staff budgets &amp; hours
              </h2>
              <p className="mt-1 text-sm text-[#75647F]">
                Monthly allocation, planned capacity, logged time, and
                estimated labour cost.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#75647F]">
                Month
                <input
                  type="month"
                  value={month}
                  onChange={(event) => setMonth(event.target.value)}
                  className="mt-1 block rounded-xl border border-[#CDBAD9] bg-white px-3.5 py-2 text-sm font-semibold text-[#341F60] focus:border-[#7D4698] focus:outline-none focus:ring-2 focus:ring-[#EEE3FA]"
                />
              </label>
              <TeamButton
                type="button"
                onClick={() => addTime()}
                disabled={isLoading || !snapshot?.staff.length}
              >
                + Log hours
              </TeamButton>
            </div>
          </div>
        </header>

        {error && (
          <p
            role="alert"
            className="mx-5 mt-5 rounded-2xl border border-[#E4B9B9] bg-[#FFF0F0] px-4 py-3 text-sm text-[#8B3E3E] sm:mx-6"
          >
            {error}
          </p>
        )}

        {isLoading ? (
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4 sm:p-6">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-28 animate-pulse rounded-[20px] bg-[#EEE3FA]"
              />
            ))}
          </div>
        ) : snapshot ? (
          <>
            <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-5 sm:p-6">
              {[
                [
                  "Team budget",
                  currency(
                    snapshot.summary.totalBudget,
                    snapshot.currencyCode,
                  ),
                ],
                [
                  "Planned hours",
                  `${hours(snapshot.summary.totalPlannedHours)}h`,
                ],
                [
                  "Logged hours",
                  `${hours(snapshot.summary.totalLoggedHours)}h`,
                ],
                [
                  "Estimated cost",
                  currency(
                    snapshot.summary.totalEstimatedCost,
                    snapshot.currencyCode,
                  ),
                ],
                [
                  remainingBudget < 0 ? "Over budget" : "Budget remaining",
                  currency(Math.abs(remainingBudget), snapshot.currencyCode),
                ],
              ].map(([label, value], index) => (
                <article
                  key={label}
                  className={`rounded-[20px] border p-4 ${
                    index === 4 && remainingBudget < 0
                      ? "border-[#E4B9B9] bg-[#FFF0F0]"
                      : "border-[#E2D7E8] bg-[#FBF8FC]"
                  }`}
                >
                  <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#8B7895]">
                    {label}
                  </p>
                  <p
                    className={`mt-2 text-xl font-semibold ${
                      index === 4 && remainingBudget < 0
                        ? "text-[#8B3E3E]"
                        : "text-[#341F60]"
                    }`}
                  >
                    {value}
                  </p>
                </article>
              ))}
            </div>

            <div className="px-5 pb-2 sm:px-6">
              <div className="flex justify-between text-xs text-[#75647F]">
                <span>{monthLabel(month)} capacity</span>
                <span>{hoursProgress}% logged</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#EEE3FA]">
                <div
                  className={`h-full rounded-full ${
                    hoursProgress > 100 ? "bg-[#B85B5B]" : "bg-[#7D4698]"
                  }`}
                  style={{ width: `${Math.min(hoursProgress, 100)}%` }}
                />
              </div>
            </div>

            <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-2">
              {snapshot.staff.map((row) => {
                const isOverHours =
                  row.plannedHours > 0 &&
                  row.loggedHours > row.plannedHours;
                const isOverBudget =
                  row.budgetAmount > 0 && row.remainingBudget < 0;
                return (
                  <article
                    key={row.id}
                    className="rounded-[22px] border border-[#E2D7E8] p-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#341F60] text-xs font-semibold text-white">
                          {initials(row.name)}
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold text-[#341F60]">
                            {row.name}
                          </h3>
                          <p className="truncate text-xs text-[#8B7895]">
                            {row.title || "Staff"}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => editBudget(row)}
                        className="shrink-0 text-xs font-semibold text-[#7D4698] hover:underline"
                      >
                        {row.budgetId ? "Edit budget" : "Set budget"}
                      </button>
                    </div>

                    <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                      <div>
                        <dt className="text-[10px] uppercase tracking-[0.1em] text-[#8B7895]">
                          Monthly budget
                        </dt>
                        <dd className="mt-1 font-semibold text-[#341F60]">
                          {currency(row.budgetAmount)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-[0.1em] text-[#8B7895]">
                          Hourly rate
                        </dt>
                        <dd className="mt-1 font-semibold text-[#341F60]">
                          {currency(row.hourlyRate)}/h
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-[0.1em] text-[#8B7895]">
                          Hours
                        </dt>
                        <dd
                          className={`mt-1 font-semibold ${
                            isOverHours ? "text-[#9A4040]" : "text-[#341F60]"
                          }`}
                        >
                          {hours(row.loggedHours)}h /{" "}
                          {hours(row.plannedHours)}h
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-[0.1em] text-[#8B7895]">
                          Estimated cost
                        </dt>
                        <dd
                          className={`mt-1 font-semibold ${
                            isOverBudget ? "text-[#9A4040]" : "text-[#341F60]"
                          }`}
                        >
                          {currency(row.estimatedCost)}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#EEE3FA]">
                      <div
                        className={`h-full rounded-full ${
                          isOverHours ? "bg-[#B85B5B]" : "bg-[#7D4698]"
                        }`}
                        style={{
                          width: `${Math.min(row.utilizationPercent, 100)}%`,
                        }}
                      />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                      <span className="text-[#8B7895]">
                        {row.plannedHours
                          ? `${row.utilizationPercent}% utilized`
                          : "No plan set"}
                      </span>
                      <button
                        type="button"
                        onClick={() => addTime(row)}
                        className="font-semibold text-[#7D4698] hover:underline"
                      >
                        Log time
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            <section className="border-t border-[#E7DDEB]">
              <div className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6">
                <div>
                  <h3 className="font-semibold text-[#341F60]">
                    Time entry ledger
                  </h3>
                  <p className="mt-0.5 text-xs text-[#8B7895]">
                    {snapshot.entries.length} entries in {monthLabel(month)}
                  </p>
                </div>
                <TeamButton type="button" tone="secondary" onClick={() => addTime()}>
                  Add entry
                </TeamButton>
              </div>
              {snapshot.entries.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-[#F8F4FA] text-[10px] uppercase tracking-[0.11em] text-[#8B7895]">
                      <tr>
                        <th className="px-5 py-3 font-bold sm:px-6">Date</th>
                        <th className="px-5 py-3 font-bold">Staff</th>
                        <th className="px-5 py-3 font-bold">Work / project</th>
                        <th className="px-5 py-3 text-right font-bold">Hours</th>
                        <th className="px-5 py-3 font-bold">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEE5F1]">
                      {snapshot.entries.map((entry) => (
                        <tr key={entry.id}>
                          <td className="px-5 py-4 text-[#75647F] sm:px-6">
                            {dateLabel(entry.workDate)}
                          </td>
                          <td className="px-5 py-4 font-semibold text-[#341F60]">
                            {entry.staffName}
                          </td>
                          <td className="max-w-sm px-5 py-4">
                            <p className="font-medium text-[#5E4A69]">
                              {entry.workLabel}
                            </p>
                            {entry.notes && (
                              <p className="mt-1 truncate text-xs text-[#8B7895]">
                                {entry.notes}
                              </p>
                            )}
                          </td>
                          <td className="px-5 py-4 text-right font-semibold text-[#341F60]">
                            {hours(entry.hours)}h
                          </td>
                          <td className="px-5 py-4 text-right">
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => void deleteEntry(entry)}
                              className={`text-xs font-semibold ${
                                deleteId === entry.id
                                  ? "text-[#A23E3E]"
                                  : "text-[#8B7895] hover:text-[#A23E3E]"
                              }`}
                            >
                              {deleteId === entry.id
                                ? "Confirm delete"
                                : "Delete"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="px-6 py-10 text-center text-sm text-[#8B7895]">
                  No hours have been logged for {monthLabel(month)}.
                </p>
              )}
            </section>
          </>
        ) : null}
      </section>

      <TeamModal
        open={Boolean(budgetEditor)}
        title="Set staff budget"
        description={`${staffById.get(budgetEditor?.staffProfileId ?? "")?.name ?? "Staff"} · ${monthLabel(month)}`}
        submitLabel="Save budget"
        isSaving={isSaving}
        submitDisabled={
          !budgetEditor?.budgetAmount ||
          !budgetEditor?.plannedHours ||
          !budgetEditor?.hourlyRate
        }
        onClose={() => setBudgetEditor(null)}
        onSubmit={(event) => {
          event.preventDefault();
          void saveBudget();
        }}
      >
        {budgetEditor && (
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-xs font-semibold text-[#5F3378]">
              Monthly budget (CAD)
              <input
                type="number"
                min="0"
                step="0.01"
                value={budgetEditor.budgetAmount}
                onChange={(event) =>
                  setBudgetEditor({
                    ...budgetEditor,
                    budgetAmount: event.target.value,
                  })
                }
                className={`mt-2 ${teamInputClass}`}
                placeholder="4000"
              />
            </label>
            <label className="text-xs font-semibold text-[#5F3378]">
              Planned hours
              <input
                type="number"
                min="0"
                max="744"
                step="0.25"
                value={budgetEditor.plannedHours}
                onChange={(event) =>
                  setBudgetEditor({
                    ...budgetEditor,
                    plannedHours: event.target.value,
                  })
                }
                className={`mt-2 ${teamInputClass}`}
                placeholder="80"
              />
            </label>
            <label className="text-xs font-semibold text-[#5F3378]">
              Hourly rate (CAD)
              <input
                type="number"
                min="0"
                step="0.01"
                value={budgetEditor.hourlyRate}
                onChange={(event) =>
                  setBudgetEditor({
                    ...budgetEditor,
                    hourlyRate: event.target.value,
                  })
                }
                className={`mt-2 ${teamInputClass}`}
                placeholder="45"
              />
            </label>
          </div>
        )}
      </TeamModal>

      <TeamModal
        open={Boolean(timeEditor)}
        title="Log staff hours"
        description="Add a dated time entry. Only Finance-authorized owners can view or change it."
        submitLabel="Add time entry"
        isSaving={isSaving}
        submitDisabled={
          !timeEditor?.staffProfileId ||
          !timeEditor?.workDate ||
          !timeEditor?.hours ||
          !timeEditor?.workLabel.trim()
        }
        onClose={() => setTimeEditor(null)}
        onSubmit={(event) => {
          event.preventDefault();
          void saveTime();
        }}
      >
        {timeEditor && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="text-xs font-semibold text-[#5F3378]">
                Staff member
                <select
                  value={timeEditor.staffProfileId}
                  onChange={(event) =>
                    setTimeEditor({
                      ...timeEditor,
                      staffProfileId: event.target.value,
                    })
                  }
                  className={`mt-2 ${teamInputClass}`}
                >
                  {snapshot?.staff.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-[#5F3378]">
                Work date
                <input
                  type="date"
                  value={timeEditor.workDate}
                  onChange={(event) =>
                    setTimeEditor({
                      ...timeEditor,
                      workDate: event.target.value,
                    })
                  }
                  className={`mt-2 ${teamInputClass}`}
                />
              </label>
              <label className="text-xs font-semibold text-[#5F3378]">
                Hours
                <input
                  type="number"
                  min="0.01"
                  max="24"
                  step="0.25"
                  value={timeEditor.hours}
                  onChange={(event) =>
                    setTimeEditor({
                      ...timeEditor,
                      hours: event.target.value,
                    })
                  }
                  className={`mt-2 ${teamInputClass}`}
                  placeholder="2.5"
                />
              </label>
            </div>
            <label className="block text-xs font-semibold text-[#5F3378]">
              Work or project
              <input
                type="text"
                maxLength={120}
                value={timeEditor.workLabel}
                onChange={(event) =>
                  setTimeEditor({
                    ...timeEditor,
                    workLabel: event.target.value,
                  })
                }
                className={`mt-2 ${teamInputClass}`}
                placeholder="Boardwalk social content"
              />
            </label>
            <label className="block text-xs font-semibold text-[#5F3378]">
              Notes (optional)
              <textarea
                maxLength={500}
                rows={3}
                value={timeEditor.notes}
                onChange={(event) =>
                  setTimeEditor({ ...timeEditor, notes: event.target.value })
                }
                className={`mt-2 resize-y ${teamInputClass}`}
                placeholder="What was completed?"
              />
            </label>
          </div>
        )}
      </TeamModal>
    </>
  );
}
