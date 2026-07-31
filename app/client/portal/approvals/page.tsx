"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useClientIdentity } from "../_components/ClientIdentity";

type ApprovalStatus =
  | "approval_needed"
  | "revision_in_progress"
  | "up_to_date";

type ApprovalCategory = {
  id: string;
  client_id: string;
  name: string;
  status: ApprovalStatus;
  description: string | null;
  route_slug: string;
  created_at: string;
};

const statusStyles: Record<
  ApprovalStatus,
  { label: string; className: string; dotClassName: string }
> = {
  approval_needed: {
    label: "Approval needed",
    className: "border-accent bg-accent/45 text-accent-foreground",
    dotClassName: "bg-accent",
  },
  revision_in_progress: {
    label: "Revision in progress",
    className: "border-border bg-muted text-secondary-foreground",
    dotClassName: "bg-primary",
  },
  up_to_date: {
    label: "Up to date",
    className: "border-[#BFD8C7] bg-[#EAF5ED] text-[#356346]",
    dotClassName: "bg-[#4F8A62]",
  },
};

function CategoryIcon({ routeSlug }: { routeSlug: string }) {
  const paths: Record<string, React.ReactNode> = {
    "social-media": (
      <>
        <rect x="4" y="4" width="16" height="16" rx="4" />
        <circle cx="12" cy="12" r="3.2" />
        <circle cx="17.4" cy="6.7" r="0.8" fill="currentColor" stroke="none" />
      </>
    ),
    website: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M7 6.5h.01M10 6.5h.01" />
      </>
    ),
    "brand-palette": (
      <>
        <path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h3.5A5.5 5.5 0 0 0 21 7.5C21 5 17 3 12 3Z" />
        <circle cx="7.5" cy="9" r="1" fill="currentColor" stroke="none" />
        <circle cx="10" cy="6.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="14" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </>
    ),
  };

  return (
    <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-primary">
      <svg
        aria-hidden="true"
        className="size-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths[routeSlug] ?? <path d="M5 12h14M12 5v14" />}
      </svg>
    </span>
  );
}

function ArrowIcon() {
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
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export default function ApprovalsPage() {
  const { clientSlug, clientName } = useClientIdentity();
  const [categories, setCategories] = useState<ApprovalCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadCategories() {
      setIsLoading(true);
      setCategories([]);

      if (!clientSlug) {
        setErrorMessage("Choose a client profile to view approvals.");
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
        .from("client_approval_categories")
        .select(
          "id, client_id, name, status, description, route_slug, created_at",
        )
        .eq("client_id", client.id)
        .order("created_at", { ascending: true });

      if (!isActive) return;
      if (error) {
        setErrorMessage(`Could not load approval categories: ${error.message}`);
        setCategories([]);
      } else {
        setCategories((data ?? []) as ApprovalCategory[]);
        setErrorMessage(null);
      }

      setIsLoading(false);
    }

    void loadCategories();
    return () => {
      isActive = false;
    };
  }, [clientName, clientSlug]);

  return (
    <main className="min-h-screen px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <div className="mx-auto max-w-5xl">
        <header>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
            Client portal · {clientName ?? "Client"}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">
            Approvals
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Review work that needs a decision and track revisions already in
            progress.
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

        <section className="mt-10" aria-labelledby="approval-categories-heading">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">
                Review queue
              </p>
              <h2
                id="approval-categories-heading"
                className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-foreground"
              >
                Approval categories
              </h2>
            </div>
            {!isLoading && (
              <span className="rounded-full bg-muted px-3 py-1.5 text-[11px] font-semibold text-secondary-foreground">
                {categories.length} categories
              </span>
            )}
          </div>

          <div className="mt-5 overflow-hidden rounded-[24px] border border-border bg-card shadow-[0_8px_28px_rgba(52,31,96,0.055)]">
            {isLoading ? (
              <div className="divide-y divide-border">
                {Array.from({ length: 3 }, (_, index) => (
                  <div key={index} className="h-28 animate-pulse bg-card" />
                ))}
              </div>
            ) : categories.length > 0 ? (
              <div className="divide-y divide-border">
                {categories.map((category) => {
                  const status = statusStyles[category.status];

                  return (
                    <Link
                      key={category.id}
                      href={`/client-portal/approvals/${category.route_slug}`}
                      className="group flex flex-col gap-4 px-5 py-5 transition hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:flex-row sm:items-center sm:px-6"
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-4">
                        <CategoryIcon routeSlug={category.route_slug} />
                        <div className="min-w-0">
                          <h3 className="text-base font-semibold text-foreground">
                            {category.name}
                          </h3>
                          {category.description && (
                            <p className="mt-1 text-sm leading-6 text-muted-foreground">
                              {category.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-4 pl-[3.75rem] sm:shrink-0 sm:pl-0">
                        <span
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${status.className}`}
                        >
                          <span
                            className={`size-1.5 rounded-full ${status.dotClassName}`}
                          />
                          {status.label}
                        </span>
                        <span className="text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary">
                          <ArrowIcon />
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="px-6 py-12 text-center text-sm text-muted-foreground">
                No approvals yet. New approval categories will appear here
                when they are ready.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
