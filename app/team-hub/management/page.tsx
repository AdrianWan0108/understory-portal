"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { TEAM_IDENTITIES } from "@/lib/team-auth";
import { useTeamIdentity } from "../_components/TeamIdentity";

type SlackSyncResult = {
  profilesUpdated?: number;
  profilesChecked?: number;
  unmatchedProfiles?: unknown[];
  error?: string;
};

type UsageSummary = {
  monthlySpend: number;
  monthlyBudget: number;
  byUser: Array<{ teamUsername: string; cost: number; messages: number }>;
  byAgent: Array<{ agent: string; cost: number; messages: number }>;
};

const profileByUsername = Object.fromEntries(
  Object.values(TEAM_IDENTITIES).map((profile) => [profile.username, profile]),
);

function formatUsd(amount: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export default function TeamHubManagementPage() {
  const router = useRouter();
  const { accessLevel, isReady } = useTeamIdentity();
  const [isSyncingSlack, setIsSyncingSlack] = useState(false);
  const [slackSyncMessage, setSlackSyncMessage] = useState<{
    tone: "error" | "success";
    text: string;
  } | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);

  useEffect(() => {
    if (isReady && accessLevel && accessLevel !== "owner") {
      router.replace("/team-hub/dashboard");
    }
  }, [accessLevel, isReady, router]);

  const loadUsage = useCallback(async () => {
    if (!isReady || accessLevel !== "owner") return;
    const response = await fetch("/api/team-hub/assistant?usageSummary=1");
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setUsageError(body.error ?? "Could not load assistant usage.");
      return;
    }
    setUsage(body as UsageSummary);
    setUsageError(null);
  }, [accessLevel, isReady]);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  if (!isReady || accessLevel !== "owner") {
    return (
      <main className="px-5 py-10 sm:px-8 lg:px-12">
        <div className="mx-auto h-40 max-w-5xl animate-pulse rounded-[24px] bg-[#EEE3FA]" />
      </main>
    );
  }

  async function syncSlackProfiles() {
    if (isSyncingSlack) return;
    setIsSyncingSlack(true);
    setSlackSyncMessage(null);

    try {
      const response = await fetch("/api/sync-slack-profiles", {
        method: "POST",
      });
      const result = (await response.json()) as SlackSyncResult;

      if (!response.ok) {
        setSlackSyncMessage({
          tone: "error",
          text: result.error || "Slack profile sync failed.",
        });
        return;
      }

      const unmatched = result.unmatchedProfiles?.length ?? 0;
      setSlackSyncMessage({
        tone: "success",
        text: `Updated ${result.profilesUpdated ?? 0} of ${
          result.profilesChecked ?? 0
        } profiles${unmatched ? `; ${unmatched} still need mapping` : ""}.`,
      });
    } catch {
      setSlackSyncMessage({
        tone: "error",
        text: "Could not reach the Slack profile sync service.",
      });
    } finally {
      setIsSyncingSlack(false);
    }
  }

  return (
    <main className="px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <div className="mx-auto max-w-5xl">
        <header>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7D4698]">
            Owner access
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#28154F] sm:text-4xl">
            Management
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#75647F] sm:text-base">
            Open internal management tools available to Understory owners.
          </p>
        </header>

        <section className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/team-hub/management/finance/sign-in"
            className="group rounded-[24px] border border-[#D7CBE0] bg-white p-6 shadow-[0_8px_28px_rgba(40,21,79,0.055)] transition hover:-translate-y-1 hover:border-[#7D4698] hover:shadow-[0_14px_34px_rgba(40,21,79,0.11)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7D4698]"
          >
            <span className="flex size-11 items-center justify-center rounded-2xl bg-[#341F60] text-[#F4CE45]">
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
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M7 9h10M7 13h4M15 13h2M7 16h10" />
              </svg>
            </span>
            <h2 className="mt-5 text-lg font-semibold text-[#341F60]">
              Finance
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#75647F]">
              Review staff hours, invoice PDF files, budgets, and protected
              payment profiles.
            </p>
            <span className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-[#7D4698]">
              Secure Finance sign-in
              <span className="transition group-hover:translate-x-1">→</span>
            </span>
          </Link>

          <Link
            href="/admin"
            className="group rounded-[24px] border border-[#D7CBE0] bg-white p-6 shadow-[0_8px_28px_rgba(40,21,79,0.055)] transition hover:-translate-y-1 hover:border-[#7D4698] hover:shadow-[0_14px_34px_rgba(40,21,79,0.11)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7D4698]"
          >
            <span className="flex size-11 items-center justify-center rounded-2xl bg-[#341F60] text-[#F4CE45]">
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
                <path d="M4 7h16v12H4Z" />
                <path d="M8 7V5h8v2M8 12h8M8 16h5" />
              </svg>
            </span>
            <h2 className="mt-5 text-lg font-semibold text-[#341F60]">
              Admin console
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#75647F]">
              Manage client-facing data, projects, documents, invoices, and
              approvals.
            </p>
            <span className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-[#7D4698]">
              Open admin console
              <span className="transition group-hover:translate-x-1">→</span>
            </span>
          </Link>

          <article className="rounded-[24px] border border-[#D7CBE0] bg-white p-6 shadow-[0_8px_28px_rgba(40,21,79,0.055)]">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-[#341F60] text-[#F4CE45]">
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
                <path d="M8 8a4 4 0 1 1 8 0v2H8Z" />
                <path d="M5 21v-2a7 7 0 0 1 14 0v2M8 13h8" />
              </svg>
            </span>
            <h2 className="mt-5 text-lg font-semibold text-[#341F60]">
              Slack profiles
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#75647F]">
              Refresh team display names and profile photos stored in
              Supabase.
            </p>
            <button
              type="button"
              disabled={isSyncingSlack}
              onClick={() => void syncSlackProfiles()}
              className="mt-5 rounded-full bg-[#341F60] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#28154F] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSyncingSlack ? "Syncing…" : "Sync Slack profiles"}
            </button>
            {slackSyncMessage && (
              <p
                role={slackSyncMessage.tone === "error" ? "alert" : "status"}
                className={`mt-4 rounded-xl px-3.5 py-3 text-xs leading-5 ${
                  slackSyncMessage.tone === "error"
                    ? "bg-[#FFF0F0] text-[#8B3E3E]"
                    : "bg-[#EDF7EF] text-[#356346]"
                }`}
              >
                {slackSyncMessage.text}
              </p>
            )}
          </article>
        </section>

        <section className="mt-8 rounded-[24px] border border-[#D7CBE0] bg-white p-6 shadow-[0_8px_28px_rgba(40,21,79,0.055)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7D4698]">
            Owner access
          </p>
          <h2 className="mt-2 text-lg font-semibold text-[#341F60]">
            Claude assistant usage
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#75647F]">
            Spend across the whole team this month, from the assistant
            bubble on the Projects tab.
          </p>

          {usageError && (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-[#E4B9B9] bg-[#FFF0F0] px-4 py-3 text-sm text-[#8B3E3E]"
            >
              {usageError}
            </p>
          )}

          {usage && (
            <div className="mt-5">
              <div className="flex items-baseline justify-between">
                <p className="text-2xl font-semibold text-[#341F60]">
                  {formatUsd(usage.monthlySpend)}
                  <span className="ml-1.5 text-sm font-normal text-[#8B7895]">
                    of {formatUsd(usage.monthlyBudget)}
                  </span>
                </p>
                <p className="text-xs text-[#8B7895]">
                  {Math.min(
                    100,
                    Math.round(
                      (usage.monthlySpend / usage.monthlyBudget) * 100,
                    ),
                  )}
                  % used
                </p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#EEE3FA]">
                <div
                  className={`h-full rounded-full ${
                    usage.monthlySpend >= usage.monthlyBudget
                      ? "bg-[#C4574A]"
                      : "bg-[#7D4698]"
                  }`}
                  style={{
                    width: `${Math.min(
                      100,
                      (usage.monthlySpend / usage.monthlyBudget) * 100,
                    )}%`,
                  }}
                />
              </div>

              <div className="mt-6 grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8B7895]">
                    By team member
                  </p>
                  {usage.byUser.length ? (
                    <ul className="mt-2 space-y-2">
                      {usage.byUser
                        .sort((a, b) => b.cost - a.cost)
                        .map((row) => (
                          <li
                            key={row.teamUsername}
                            className="flex items-center justify-between text-sm"
                          >
                            <span className="text-[#341F60]">
                              {profileByUsername[row.teamUsername]?.name ??
                                row.teamUsername}
                            </span>
                            <span className="text-[#75647F]">
                              {formatUsd(row.cost)} · {row.messages} message
                              {row.messages === 1 ? "" : "s"}
                            </span>
                          </li>
                        ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-[#8B7895]">
                      No usage yet this month.
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8B7895]">
                    By agent
                  </p>
                  {usage.byAgent.length ? (
                    <ul className="mt-2 space-y-2">
                      {usage.byAgent.map((row) => (
                        <li
                          key={row.agent}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="capitalize text-[#341F60]">
                            {row.agent}
                          </span>
                          <span className="text-[#75647F]">
                            {formatUsd(row.cost)} · {row.messages} message
                            {row.messages === 1 ? "" : "s"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-[#8B7895]">
                      No usage yet this month.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
