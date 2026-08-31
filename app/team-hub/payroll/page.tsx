"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { sendSlackNotification } from "@/lib/slack-notifications";
import {
  TEAM_IDENTITIES,
  useTeamIdentity,
} from "../_components/TeamIdentity";
import {
  TeamButton,
  TeamModal,
  teamInputClass,
} from "../_components/TeamHubUi";
import TimeLogForm from "./_components/TimeLogForm";
import MonthlyInvoiceWorkspace from "./_components/MonthlyInvoiceWorkspace";
import WeeklySummary, {
  type WeeklyTimeSummary,
} from "./_components/WeeklySummary";

const BUCKET = "payroll-invoices";
type PayrollStatus = "pending" | "paid";

type PayrollRecord = {
  id: string;
  staff_username: string;
  amount: number | null;
  status: PayrollStatus;
  pay_period: string | null;
  invoice_file_url: string | null;
  created_at: string;
};

type PayrollEditor = {
  record?: PayrollRecord;
  staffUsername: string;
  amount: string;
  status: PayrollStatus;
  payPeriod: string;
  file: File | null;
};

const profiles = Object.values(TEAM_IDENTITIES);
const staffProfiles = profiles.reduce<
  Record<string, { name: string; title: string }>
>((result, profile) => {
  result[profile.username] = { name: profile.name, title: profile.title };
  return result;
}, {});

function formatAmount(amount: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(amount);
}

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function localMonth() {
  return localDate().slice(0, 7);
}

function storagePath(url: string | null) {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  try {
    const parsed = new URL(url);
    const index = parsed.pathname.indexOf(marker);
    return index < 0
      ? null
      : decodeURIComponent(parsed.pathname.slice(index + marker.length));
  } catch {
    return null;
  }
}

export default function TeamHubPayrollPage() {
  const { username, name, accessLevel, isReady } = useTeamIdentity();
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<PayrollEditor | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [timeLogRefreshToken, setTimeLogRefreshToken] = useState(0);
  const [selectedWeekDate, setSelectedWeekDate] = useState(localDate);
  const [invoiceMonth, setInvoiceMonth] = useState(localMonth);
  const [weeklySummary, setWeeklySummary] =
    useState<WeeklyTimeSummary | null>(null);

  const isTimeLoggingContractor =
    username === "Understory_Sure" || username === "Understory_Xiyangcen";
  const handleWeeklySummaryChange = useCallback(
    (summary: WeeklyTimeSummary | null) => {
      setWeeklySummary(summary);
    },
    [],
  );

  const loadPayroll = useCallback(async () => {
    if (!isReady || !username || !accessLevel) return;
    setIsLoading(true);
    setRecords([]);
    let query = supabase
      .from("team_payroll")
      .select(
        "id, staff_username, amount, status, pay_period, invoice_file_url, created_at",
      )
      .order("created_at", { ascending: false });
    if (accessLevel === "staff") {
      query = query.eq("staff_username", username);
    }
    const { data, error: loadError } = await query;
    if (loadError) {
      setError(`Could not load payroll: ${loadError.message}`);
    } else {
      setRecords((data ?? []) as PayrollRecord[]);
      setError(null);
    }
    setIsLoading(false);
  }, [accessLevel, isReady, username]);

  useEffect(() => {
    void loadPayroll();
  }, [loadPayroll]);

  useEffect(() => {
    setWeeklySummary(null);
    setSelectedWeekDate(localDate());
    setInvoiceMonth(localMonth());
  }, [username]);

  const groups = useMemo(() => {
    const grouped = new Map<string, PayrollRecord[]>();
    records.forEach((record) => {
      grouped.set(record.staff_username, [
        ...(grouped.get(record.staff_username) ?? []),
        record,
      ]);
    });
    return Array.from(grouped.entries()).map(([staffUsername, rows]) => ({
      staffUsername,
      rows,
      total: rows.reduce(
        (sum, record) => sum + Number(record.amount ?? 0),
        0,
      ),
    }));
  }, [records]);

  const grandTotal = records.reduce(
    (sum, record) => sum + Number(record.amount ?? 0),
    0,
  );
  const displayedTotal =
    accessLevel === "owner" || !isTimeLoggingContractor
      ? grandTotal
      : weeklySummary?.estimatedPay;

  async function saveRecord() {
    if (
      accessLevel !== "owner" ||
      !editor ||
      !editor.staffUsername ||
      !editor.amount ||
      Number.isNaN(Number(editor.amount)) ||
      !editor.payPeriod.trim() ||
      isSaving
    )
      return;

    setIsSaving(true);
    setError(null);
    let uploadedPath: string | null = null;
    try {
      let invoiceUrl = editor.record?.invoice_file_url ?? null;
      if (editor.file) {
        const isPdf =
          editor.file.type === "application/pdf" ||
          editor.file.name.toLowerCase().endsWith(".pdf");
        if (!isPdf) throw new Error("Payroll invoices must be PDF files.");
        uploadedPath = `${editor.staffUsername}/${crypto.randomUUID()}-${editor.file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(uploadedPath, editor.file, {
            contentType: "application/pdf",
            upsert: false,
          });
        if (uploadError) throw uploadError;
        invoiceUrl = supabase.storage.from(BUCKET).getPublicUrl(uploadedPath)
          .data.publicUrl;
      }

      const payload = {
        staff_username: editor.staffUsername,
        amount: Number(editor.amount),
        status: editor.status,
        pay_period: editor.payPeriod.trim(),
        invoice_file_url: invoiceUrl,
      };
      const { error: mutationError } = editor.record
        ? await supabase
            .from("team_payroll")
            .update(payload)
            .eq("id", editor.record.id)
        : await supabase.from("team_payroll").insert(payload);
      if (mutationError) throw mutationError;

      if (uploadedPath && editor.record?.invoice_file_url) {
        const previousPath = storagePath(editor.record.invoice_file_url);
        if (previousPath) {
          await supabase.storage.from(BUCKET).remove([previousPath]);
        }
      }
      if (editor.file) {
        void sendSlackNotification({
          type: "payroll_invoice",
          staffUsername: editor.staffUsername,
          amount: Number(editor.amount),
        });
      }
      setEditor(null);
      void loadPayroll();
    } catch (caught) {
      if (uploadedPath) {
        await supabase.storage.from(BUCKET).remove([uploadedPath]);
      }
      setError(
        caught instanceof Error ? caught.message : "Could not save payroll.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteRecord(record: PayrollRecord) {
    if (accessLevel !== "owner") return;
    if (deleteId !== record.id) {
      setDeleteId(record.id);
      return;
    }
    const { error: mutationError } = await supabase
      .from("team_payroll")
      .delete()
      .eq("id", record.id);
    if (mutationError) {
      setError(mutationError.message);
      return;
    }
    const path = storagePath(record.invoice_file_url);
    if (path) await supabase.storage.from(BUCKET).remove([path]);
    setDeleteId(null);
    void loadPayroll();
  }

  return (
    <main className="px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <section className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7D4698]">
              Team Hub · Finance
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#28154F] sm:text-4xl">
              Payroll
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#75647F] sm:text-base">
              {accessLevel === "owner"
                ? "Review and manage payroll records across the full Understory team."
                : `${name ?? "Your"} payroll history is read-only and private to your session.`}
            </p>
          </div>
          <div className="flex items-end gap-3">
            {!isLoading && (
              <div className="rounded-[20px] border border-[#D7CBE0] bg-white px-5 py-4 shadow-[0_6px_20px_rgba(40,21,79,0.05)]">
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#8B7895]">
                  {accessLevel === "owner"
                    ? "All records total"
                    : isTimeLoggingContractor
                      ? "This week's estimated pay"
                      : "Your total"}
                </p>
                <p className="mt-1 text-2xl font-semibold text-[#341F60]">
                  {displayedTotal === undefined
                    ? "—"
                    : formatAmount(displayedTotal)}
                </p>
              </div>
            )}
            {accessLevel === "owner" && (
              <TeamButton
                onClick={() =>
                  setEditor({
                    staffUsername: "Understory_Arion",
                    amount: "",
                    status: "pending",
                    payPeriod: "",
                    file: null,
                  })
                }
              >
                + Add payroll record
              </TeamButton>
            )}
          </div>
        </section>

        {error && (
          <div
            role="alert"
            className="mt-7 rounded-2xl border border-[#E4B9B9] bg-[#FFF0F0] px-4 py-3 text-sm text-[#8B3E3E]"
          >
            {error}
          </div>
        )}

        {isTimeLoggingContractor && (
          <section className="mt-9 grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <TimeLogForm
              key={`form-${username}`}
              onSaved={(workDate) => {
                setSelectedWeekDate(workDate);
                setInvoiceMonth(workDate.slice(0, 7));
                setTimeLogRefreshToken((current) => current + 1);
              }}
            />
            <WeeklySummary
              key={`summary-${username}`}
              refreshToken={timeLogRefreshToken}
              selectedDate={selectedWeekDate}
              onSelectedDateChange={setSelectedWeekDate}
              onSummaryChange={handleWeeklySummaryChange}
            />
          </section>
        )}

        {isTimeLoggingContractor && (
          <MonthlyInvoiceWorkspace
            key={`invoice-${username}`}
            month={invoiceMonth}
            onMonthChange={setInvoiceMonth}
            refreshToken={timeLogRefreshToken}
          />
        )}

        <section className="mt-9 space-y-6">
          {isLoading ? (
            <div className="h-52 animate-pulse rounded-[24px] border border-[#D7CBE0] bg-white" />
          ) : groups.length ? (
            groups.map((group) => {
              const profile = staffProfiles[group.staffUsername];
              return (
                <article
                  key={group.staffUsername}
                  className="overflow-hidden rounded-[24px] border border-[#D7CBE0] bg-white shadow-[0_8px_28px_rgba(40,21,79,0.055)]"
                >
                  <header className="flex items-center justify-between gap-4 border-b border-[#E5DBEA] bg-[#FFFDF8] px-5 py-5 sm:px-6">
                    <div>
                      <p className="text-lg font-semibold text-[#341F60]">
                        {profile?.name ?? group.staffUsername}
                      </p>
                      <p className="mt-1 text-xs text-[#75647F]">
                        {profile?.title ?? group.staffUsername}
                      </p>
                    </div>
                    <p className="text-lg font-semibold text-[#341F60]">
                      {formatAmount(group.total)}
                    </p>
                  </header>
                  <div className="divide-y divide-[#E9E0EF]">
                    {group.rows.map((record) => (
                      <div
                        key={record.id}
                        className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:px-6"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-[#341F60]">
                            {record.pay_period || "Pay period not set"}
                          </p>
                          <p className="mt-1 text-[11px] text-[#8B7895]">
                            {new Date(record.created_at).toLocaleDateString(
                              "en-CA",
                            )}
                          </p>
                        </div>
                        <p className="font-semibold text-[#341F60]">
                          {formatAmount(Number(record.amount ?? 0))}
                        </p>
                        <span
                          className={`w-fit rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase ${
                            record.status === "paid"
                              ? "border-[#BFD8C7] bg-[#EDF7EF] text-[#356346]"
                              : "border-[#E5C760] bg-[#FFF4C7] text-[#725A00]"
                          }`}
                        >
                          {record.status}
                        </span>
                        {record.invoice_file_url && (
                          <a
                            href={record.invoice_file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="w-fit rounded-full border border-[#CDBAD9] px-3.5 py-2 text-xs font-semibold text-[#7D4698] hover:bg-[#EEE3FA]"
                          >
                            View invoice ↗
                          </a>
                        )}
                        {accessLevel === "owner" && (
                          <div className="flex gap-2">
                            <TeamButton
                              tone="secondary"
                              onClick={() =>
                                setEditor({
                                  record,
                                  staffUsername: record.staff_username,
                                  amount: String(record.amount ?? ""),
                                  status: record.status,
                                  payPeriod: record.pay_period ?? "",
                                  file: null,
                                })
                              }
                            >
                              Edit
                            </TeamButton>
                            <TeamButton
                              tone="danger"
                              onClick={() => void deleteRecord(record)}
                            >
                              {deleteId === record.id
                                ? "Confirm delete?"
                                : "Delete"}
                            </TeamButton>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="rounded-[24px] border border-dashed border-[#CDBAD9] bg-white px-6 py-14 text-center text-sm text-[#75647F]">
              No payroll records yet.
            </div>
          )}
        </section>
      </div>

      <TeamModal
        open={Boolean(editor)}
        title={`${editor?.record ? "Edit" : "Add"} payroll record`}
        description="Owners can manage payment details and attach a PDF invoice."
        submitLabel={editor?.record ? "Save changes" : "Add record"}
        isSaving={isSaving}
        submitDisabled={
          !editor?.staffUsername ||
          !editor.amount ||
          !editor.payPeriod.trim()
        }
        onClose={() => setEditor(null)}
        onSubmit={(event) => {
          event.preventDefault();
          void saveRecord();
        }}
      >
        {editor && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-[#341F60]">
              Staff member
              <select
                value={editor.staffUsername}
                onChange={(event) =>
                  setEditor({
                    ...editor,
                    staffUsername: event.target.value,
                  })
                }
                className={`mt-2 ${teamInputClass}`}
              >
                {profiles.map((profile) => (
                  <option key={profile.username} value={profile.username}>
                    {profile.name} · {profile.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-[#341F60]">
              Amount (CAD)
              <input
                type="number"
                min="0"
                step="0.01"
                value={editor.amount}
                onChange={(event) =>
                  setEditor({ ...editor, amount: event.target.value })
                }
                className={`mt-2 ${teamInputClass}`}
              />
            </label>
            <label className="text-xs font-semibold text-[#341F60]">
              Status
              <select
                value={editor.status}
                onChange={(event) =>
                  setEditor({
                    ...editor,
                    status: event.target.value as PayrollStatus,
                  })
                }
                className={`mt-2 ${teamInputClass}`}
              >
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-[#341F60]">
              Pay period
              <input
                value={editor.payPeriod}
                onChange={(event) =>
                  setEditor({ ...editor, payPeriod: event.target.value })
                }
                placeholder="July 2026"
                className={`mt-2 ${teamInputClass}`}
              />
            </label>
            <label className="text-xs font-semibold text-[#341F60] sm:col-span-2">
              Invoice PDF
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) =>
                  setEditor({
                    ...editor,
                    file: event.target.files?.[0] ?? null,
                  })
                }
                className={`mt-2 ${teamInputClass}`}
              />
              {editor.record?.invoice_file_url && !editor.file && (
                <span className="mt-2 block text-[11px] text-[#75647F]">
                  The current invoice remains attached unless you select a new
                  PDF.
                </span>
              )}
            </label>
          </div>
        )}
      </TeamModal>
    </main>
  );
}
