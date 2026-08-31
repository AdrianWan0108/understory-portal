"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useClientIdentity } from "../_components/ClientIdentity";

type AnalyticsReport = {
  id: string;
  title: string;
  report_month: string;
  loom_url: string | null;
  message: string | null;
};

function formatMonth(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 7)}-15T12:00:00`));
}

function ArrowIcon() {
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
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 19V10M10 19V5M16 19v-7M22 19V8" />
      <path d="M2 19h22" />
    </svg>
  );
}

export default function AnalyticsPage() {
  const { clientSlug, clientName } = useClientIdentity();
  const [reports, setReports] = useState<AnalyticsReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadReports() {
      setIsLoading(true);
      setReports([]);

      if (!clientSlug) {
        setErrorMessage("Choose a client profile to view analytics.");
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
        .select("id, title, report_month, loom_url, message")
        .eq("client_id", client.id)
        .eq("is_published", true)
        .order("report_month", { ascending: false });

      if (!isActive) return;
      if (error) {
        setErrorMessage(`Could not load analytics reports: ${error.message}`);
      } else {
        setReports((data ?? []) as AnalyticsReport[]);
        setErrorMessage(null);
      }
      setIsLoading(false);
    }

    void loadReports();
    return () => {
      isActive = false;
    };
  }, [clientName, clientSlug]);

  return (
    <main className="min-h-screen overflow-hidden px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <header>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
            Client portal · {clientName ?? "Client"}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">
            Analytics
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Choose a monthly report to review the full slide deck, walkthrough,
            and notes from Understory.
          </p>
        </header>

        {errorMessage && (
          <div
            role="alert"
            className="mt-7 rounded-2xl border border-accent bg-accent/20 px-4 py-3 text-sm leading-6 text-accent-foreground"
          >
            {errorMessage}
          </div>
        )}

        <section className="mt-10" aria-labelledby="analytics-reports-heading">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">
                Reporting library
              </p>
              <h2
                id="analytics-reports-heading"
                className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-foreground"
              >
                Monthly reports
              </h2>
            </div>
            {!isLoading && (
              <span className="rounded-full bg-muted px-3 py-1.5 text-[11px] font-semibold text-secondary-foreground">
                {reports.length} {reports.length === 1 ? "report" : "reports"}
              </span>
            )}
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {isLoading ? (
              Array.from({ length: 3 }, (_, index) => (
                <div
                  key={index}
                  className="h-64 animate-pulse rounded-[24px] border border-border bg-card"
                />
              ))
            ) : reports.length ? (
              reports.map((report, index) => (
                <Link
                  key={report.id}
                  href={`/client-portal/analytics/${report.id}`}
                  className="group overflow-hidden rounded-[24px] border border-border bg-card shadow-[0_8px_28px_rgba(52,31,96,0.055)] transition duration-300 hover:-translate-y-1 hover:border-input hover:shadow-[0_16px_36px_rgba(52,31,96,0.11)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                >
                  <span
                    className={`flex aspect-[16/8] flex-col justify-between p-5 ${
                      index % 3 === 0
                        ? "bg-primary text-primary-foreground"
                        : index % 3 === 1
                          ? "bg-foreground text-background"
                          : "bg-muted text-foreground"
                    }`}
                  >
                    <span className="flex items-center justify-between">
                      <span className="flex size-11 items-center justify-center rounded-2xl border border-current/15 bg-card/10">
                        <ChartIcon />
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.17em] opacity-65">
                        {formatMonth(report.report_month)}
                      </span>
                    </span>
                    <span className="text-2xl font-semibold leading-tight tracking-[-0.035em]">
                      {report.title}
                    </span>
                  </span>
                  <span className="flex items-center justify-between gap-4 px-5 py-4">
                    <span>
                      <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Google Slides
                      </span>
                      <span className="mt-1 block text-xs text-secondary-foreground">
                        {report.loom_url ? "Includes Loom walkthrough" : "Open full report"}
                      </span>
                    </span>
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                      <ArrowIcon />
                    </span>
                  </span>
                </Link>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-border bg-card px-6 py-14 text-center sm:col-span-2 xl:col-span-3">
                <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-primary">
                  <ChartIcon />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-foreground">
                  No reports yet
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Your published analytics reports will appear here.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
