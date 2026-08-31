"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { googleSlidesEmbedUrl, loomEmbedUrl } from "@/lib/analytics-links";
import { supabase } from "@/lib/supabase";
import { useClientIdentity } from "../../_components/ClientIdentity";

type AnalyticsReport = {
  id: string;
  title: string;
  report_month: string;
  google_slides_url: string;
  loom_url: string | null;
  message: string | null;
};

function formatMonth(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 7)}-15T12:00:00`));
}

function BackIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function PlayIcon() {
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
      <circle cx="12" cy="12" r="9" />
      <path d="m10 8 6 4-6 4Z" />
    </svg>
  );
}

function MessageIcon() {
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
      <path d="M5 5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 3v-4.2A2 2 0 0 1 3 15V7a2 2 0 0 1 2-2Z" />
      <path d="M7 9h10M7 13h7" />
    </svg>
  );
}

export default function AnalyticsReportPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const { clientSlug, clientName } = useClientIdentity();
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadReport() {
      setIsLoading(true);
      setReport(null);

      if (!clientSlug) {
        setErrorMessage("Choose a client profile to view this report.");
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
        .from("client_analytics_reports")
        .select(
          "id, title, report_month, google_slides_url, loom_url, message",
        )
        .eq("id", reportId)
        .eq("client_id", client.id)
        .eq("is_published", true)
        .maybeSingle();

      if (!isActive) return;
      if (error || !data) {
        setErrorMessage(
          error
            ? `Could not load this report: ${error.message}`
            : "This report is not available for the selected client.",
        );
      } else {
        setReport(data as AnalyticsReport);
        setErrorMessage(null);
      }
      setIsLoading(false);
    }

    void loadReport();
    return () => {
      isActive = false;
    };
  }, [clientName, clientSlug, reportId]);

  const slidesEmbedUrl = report
    ? googleSlidesEmbedUrl(report.google_slides_url)
    : null;
  const loomVideoUrl = report ? loomEmbedUrl(report.loom_url) : null;

  return (
    <main className="min-h-screen px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <div className="mx-auto max-w-[1400px]">
        <Link
          href="/client-portal/analytics"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-semibold text-secondary-foreground transition hover:border-input hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <BackIcon />
          Back to Analytics
        </Link>

        {isLoading ? (
          <div className="mt-8">
            <div className="h-10 w-72 animate-pulse rounded-xl bg-muted" />
            <div className="mt-3 h-5 w-40 animate-pulse rounded-lg bg-muted" />
            <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="aspect-video animate-pulse rounded-[24px] bg-muted" />
              <div className="h-96 animate-pulse rounded-[24px] bg-muted" />
            </div>
          </div>
        ) : errorMessage || !report ? (
          <section className="mt-8 rounded-[24px] border border-accent bg-card p-8 text-center sm:p-12">
            <h1 className="text-2xl font-semibold text-foreground">
              Report unavailable
            </h1>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
              {errorMessage ?? "This report could not be found."}
            </p>
          </section>
        ) : (
          <>
            <header className="mt-8 flex flex-col gap-4 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                  Analytics · {formatMonth(report.report_month)}
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">
                  {report.title}
                </h1>
                <p className="mt-3 text-sm text-muted-foreground">
                  Use the controls below the deck to move through each slide.
                </p>
              </div>
              <a
                href={report.google_slides_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-card px-4 py-2.5 text-xs font-semibold text-secondary-foreground transition hover:bg-muted"
              >
                Open in Google Slides ↗
              </a>
            </header>

            <div className="mt-8 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
              <section
                aria-labelledby="slide-deck-heading"
                className="overflow-hidden rounded-[24px] border border-border bg-card shadow-[0_10px_34px_rgba(52,31,96,0.08)]"
              >
                <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">
                      Monthly deck
                    </p>
                    <h2
                      id="slide-deck-heading"
                      className="mt-0.5 text-sm font-semibold text-foreground"
                    >
                      Google Slides
                    </h2>
                  </div>
                  <span className="rounded-full bg-muted px-3 py-1.5 text-[10px] font-semibold text-secondary-foreground">
                    Page-by-page view
                  </span>
                </div>
                {slidesEmbedUrl ? (
                  <iframe
                    src={slidesEmbedUrl}
                    title={`${report.title} slide deck`}
                    allowFullScreen
                    className="aspect-video w-full border-0 bg-black"
                  />
                ) : (
                  <div className="flex aspect-video items-center justify-center px-6 text-center text-sm text-muted-foreground">
                    This Google Slides link cannot be embedded.
                  </div>
                )}
              </section>

              <aside className="grid gap-5">
                <section className="overflow-hidden rounded-[24px] border border-border bg-card shadow-[0_8px_28px_rgba(52,31,96,0.055)]">
                  <div className="flex items-center gap-3 border-b border-border px-5 py-4">
                    <span className="flex size-9 items-center justify-center rounded-xl bg-muted text-primary">
                      <PlayIcon />
                    </span>
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Video walkthrough
                      </p>
                      <h2 className="mt-0.5 text-sm font-semibold text-foreground">
                        Loom
                      </h2>
                    </div>
                  </div>
                  {loomVideoUrl ? (
                    <iframe
                      src={loomVideoUrl}
                      title={`${report.title} Loom walkthrough`}
                      allowFullScreen
                      className="aspect-video w-full border-0 bg-black"
                    />
                  ) : (
                    <div className="px-5 py-8 text-center">
                      <p className="text-sm text-muted-foreground">
                        No video walkthrough for this report.
                      </p>
                    </div>
                  )}
                </section>

                <section className="rounded-[24px] border border-border bg-card p-5 shadow-[0_8px_28px_rgba(52,31,96,0.055)]">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-xl bg-accent/40 text-accent-foreground">
                      <MessageIcon />
                    </span>
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        From Understory
                      </p>
                      <h2 className="mt-0.5 text-sm font-semibold text-foreground">
                        Message
                      </h2>
                    </div>
                  </div>
                  {report.message ? (
                    <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-secondary-foreground">
                      {report.message}
                    </p>
                  ) : (
                    <p className="mt-5 text-sm leading-6 text-muted-foreground">
                      No additional notes for this report.
                    </p>
                  )}
                </section>
              </aside>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
