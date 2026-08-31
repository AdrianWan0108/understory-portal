"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from "react";
import { googleSlidesEmbedUrl, loomEmbedUrl } from "@/lib/analytics-links";
import { supabase } from "@/lib/supabase";
import { useAdmin } from "../_components/AdminContext";
import {
  AdminButton,
  AdminConfirmDialog,
  AdminEmpty,
  AdminMessage,
  AdminModal,
  AdminPageHeader,
  inputClass,
} from "../_components/AdminUi";

type AnalyticsReport = {
  id: string;
  title: string;
  report_month: string;
  google_slides_url: string;
  loom_url: string | null;
  message: string | null;
  is_published: boolean;
  created_at: string;
};

type ReportEditor = {
  id?: string;
  title: string;
  reportMonth: string;
  googleSlidesUrl: string;
  loomUrl: string;
  message: string;
  isPublished: boolean;
};

function currentReportDefaults(): ReportEditor {
  const now = new Date();
  const reportMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthLabel = new Intl.DateTimeFormat("en-CA", {
    month: "long",
    year: "numeric",
  }).format(now);

  return {
    title: `${monthLabel} Report`,
    reportMonth,
    googleSlidesUrl: "",
    loomUrl: "",
    message: "",
    isPublished: true,
  };
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 7)}-15T12:00:00`));
}

export default function AdminAnalyticsPage() {
  const { clientId, clientName } = useAdmin();
  const [reports, setReports] = useState<AnalyticsReport[]>([]);
  const [editor, setEditor] = useState<ReportEditor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AnalyticsReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clientId) return;
    setIsLoading(true);
    const { data, error: loadError } = await supabase
      .from("client_analytics_reports")
      .select(
        "id, title, report_month, google_slides_url, loom_url, message, is_published, created_at",
      )
      .eq("client_id", clientId)
      .order("report_month", { ascending: false });

    if (loadError) {
      setError(loadError.message);
      setReports([]);
    } else {
      setReports((data ?? []) as AnalyticsReport[]);
      setError(null);
    }
    setIsLoading(false);
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveReport() {
    if (!clientId || !editor || isSaving) return;

    const slidesLink = editor.googleSlidesUrl.trim();
    if (!googleSlidesEmbedUrl(slidesLink)) {
      setError("Enter a valid Google Slides link.");
      return;
    }
    if (editor.loomUrl.trim() && !loomEmbedUrl(editor.loomUrl.trim())) {
      setError("Enter a valid Loom share link, or leave it blank.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);
    const payload = {
      title: editor.title.trim(),
      report_month: `${editor.reportMonth}-01`,
      google_slides_url: slidesLink,
      loom_url: editor.loomUrl.trim() || null,
      message: editor.message.trim() || null,
      is_published: editor.isPublished,
      updated_at: new Date().toISOString(),
    };
    const { error: mutationError } = editor.id
      ? await supabase
          .from("client_analytics_reports")
          .update(payload)
          .eq("id", editor.id)
          .eq("client_id", clientId)
      : await supabase
          .from("client_analytics_reports")
          .insert({ client_id: clientId, ...payload });

    setIsSaving(false);
    if (mutationError) {
      setError(
        mutationError.code === "23505"
          ? "A report already exists for this month. Edit that report instead."
          : mutationError.message,
      );
      return;
    }

    setSuccess(editor.id ? "Report updated." : "Report created.");
    setEditor(null);
    void load();
  }

  async function deleteReport() {
    if (!clientId || !deleteTarget || isDeleting) return;
    setIsDeleting(true);
    setError(null);
    const { error: mutationError } = await supabase
      .from("client_analytics_reports")
      .delete()
      .eq("id", deleteTarget.id)
      .eq("client_id", clientId);
    setIsDeleting(false);

    if (mutationError) {
      setError(mutationError.message);
      return;
    }
    setSuccess("Report deleted.");
    setDeleteTarget(null);
    void load();
  }

  return (
    <main className="px-5 py-10 sm:px-8 lg:px-10">
      <AdminPageHeader
        title="Analytics"
        description={`Publish monthly Google Slides reports, Loom walkthroughs, and messages for ${clientName ?? "this client"}.`}
        action={
          <AdminButton onClick={() => setEditor(currentReportDefaults())}>
            + Add report
          </AdminButton>
        }
      />
      <AdminMessage error={error} success={success} />

      <section className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="h-64 animate-pulse rounded-[22px] border border-[#D7CBE0] bg-white"
            />
          ))
        ) : reports.length ? (
          reports.map((report, index) => (
            <article
              key={report.id}
              className="overflow-hidden rounded-[22px] border border-[#D7CBE0] bg-white"
            >
              <div
                className={`aspect-[16/8] p-5 text-white ${index % 2 ? "bg-[#7D4698]" : "bg-[#341F60]"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#F4CE45]">
                    Analytics report
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] ${
                      report.is_published
                        ? "bg-white/15 text-white"
                        : "bg-white text-[#5F3378]"
                    }`}
                  >
                    {report.is_published ? "Published" : "Draft"}
                  </span>
                </div>
                <h2 className="mt-8 text-xl font-semibold leading-tight">
                  {report.title}
                </h2>
                <p className="mt-2 text-xs text-white/70">
                  {formatMonth(report.report_month)}
                </p>
              </div>
              <div className="p-5">
                <p className="text-xs leading-5 text-[#75647F]">
                  {report.loom_url ? "Loom added" : "No Loom"} · {report.message ? "Message added" : "No message"}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <a
                    href={report.google_slides_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full bg-[#341F60] px-4 py-2.5 text-xs font-semibold text-white"
                  >
                    Open slides ↗
                  </a>
                  <AdminButton
                    tone="secondary"
                    onClick={() =>
                      setEditor({
                        id: report.id,
                        title: report.title,
                        reportMonth: report.report_month.slice(0, 7),
                        googleSlidesUrl: report.google_slides_url,
                        loomUrl: report.loom_url ?? "",
                        message: report.message ?? "",
                        isPublished: report.is_published,
                      })
                    }
                  >
                    Edit
                  </AdminButton>
                  <AdminButton
                    tone="danger"
                    onClick={() => setDeleteTarget(report)}
                  >
                    Delete
                  </AdminButton>
                </div>
              </div>
            </article>
          ))
        ) : (
          <AdminEmpty>No analytics reports yet.</AdminEmpty>
        )}
      </section>

      <AdminModal
        open={Boolean(editor)}
        title={`${editor?.id ? "Edit" : "Add"} analytics report`}
        description="Clients choose the report first, then view the Google Slides deck, Loom, and message together."
        submitLabel={editor?.id ? "Save changes" : "Add report"}
        isSaving={isSaving}
        submitDisabled={
          !editor?.title.trim() ||
          !editor?.reportMonth ||
          !editor?.googleSlidesUrl.trim()
        }
        maxWidth="xl"
        onClose={() => setEditor(null)}
        onSubmit={(event) => {
          event.preventDefault();
          void saveReport();
        }}
      >
        {editor && (
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="text-xs font-semibold text-[#341F60]">
              Report title
              <input
                autoFocus
                value={editor.title}
                onChange={(event) =>
                  setEditor({ ...editor, title: event.target.value })
                }
                className={`mt-2 ${inputClass}`}
                placeholder="August 2026 Report"
              />
            </label>
            <label className="text-xs font-semibold text-[#341F60]">
              Report month
              <input
                type="month"
                value={editor.reportMonth}
                onChange={(event) =>
                  setEditor({ ...editor, reportMonth: event.target.value })
                }
                className={`mt-2 ${inputClass}`}
              />
            </label>
            <label className="text-xs font-semibold text-[#341F60] sm:col-span-2">
              Google Slides link
              <input
                value={editor.googleSlidesUrl}
                onChange={(event) =>
                  setEditor({ ...editor, googleSlidesUrl: event.target.value })
                }
                className={`mt-2 ${inputClass}`}
                placeholder="https://docs.google.com/presentation/d/..."
              />
              <span className="mt-1.5 block font-normal leading-5 text-[#8B7995]">
                Set the deck to “Anyone with the link can view” so it can open inside the client portal.
              </span>
            </label>
            <label className="text-xs font-semibold text-[#341F60] sm:col-span-2">
              Loom link <span className="font-normal text-[#8B7995]">(optional)</span>
              <input
                value={editor.loomUrl}
                onChange={(event) =>
                  setEditor({ ...editor, loomUrl: event.target.value })
                }
                className={`mt-2 ${inputClass}`}
                placeholder="https://www.loom.com/share/..."
              />
            </label>
            <label className="text-xs font-semibold text-[#341F60] sm:col-span-2">
              Client message <span className="font-normal text-[#8B7995]">(optional)</span>
              <textarea
                value={editor.message}
                onChange={(event) =>
                  setEditor({ ...editor, message: event.target.value })
                }
                className={`mt-2 min-h-32 resize-y ${inputClass}`}
                placeholder="Add context, highlights, or next steps for the client."
              />
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-[#D7CBE0] bg-[#F7F2FA] px-4 py-3 text-xs font-semibold text-[#341F60] sm:col-span-2">
              <input
                type="checkbox"
                checked={editor.isPublished}
                onChange={(event) =>
                  setEditor({ ...editor, isPublished: event.target.checked })
                }
                className="size-4 accent-[#341F60]"
              />
              Publish this report in the client portal
            </label>
          </div>
        )}
      </AdminModal>

      <AdminConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete analytics report?"
        description={`This permanently removes “${deleteTarget?.title ?? "this report"}” from the client portal. The original Google Slides deck and Loom stay untouched.`}
        isWorking={isDeleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void deleteReport()}
      />
    </main>
  );
}
