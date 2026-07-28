"use client";

import { useState } from "react";

export function FinanceSignIn() {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function signInWithGitHub() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/team-hub/finance/session/github", {
        method: "POST",
      });
      const body = (await response.json().catch(() => ({}))) as {
        authorizationUrl?: string;
        error?: string;
      };
      if (!response.ok || !body.authorizationUrl) {
        setError(body.error || "Finance sign-in failed.");
        return;
      }
      window.location.assign(body.authorizationUrl);
    } catch {
      setError("Could not reach the Finance sign-in service.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <div className="mx-auto max-w-xl">
        <header>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7D4698]">
            Management · Finance
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#28154F] sm:text-4xl">
            Secure Finance sign-in
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#75647F] sm:text-base">
            Continue with the GitHub account connected to Supabase. The portal
            verifies your Finance permission before creating an eight-hour,
            HttpOnly session.
          </p>
        </header>

        <section className="mt-8 rounded-[24px] border border-[#D7CBE0] bg-white p-6 shadow-[0_8px_28px_rgba(40,21,79,0.055)] sm:p-8">
          <div className="rounded-2xl bg-[#F8F4FA] px-5 py-4">
            <p className="text-sm font-semibold text-[#341F60]">
              GitHub authentication
            </p>
            <p className="mt-1 text-xs leading-5 text-[#75647F]">
              GitHub credentials are entered only on GitHub. Supabase returns a
              one-time code that is exchanged securely by the portal.
            </p>
          </div>
          {error && (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-[#E4B9B9] bg-[#FFF0F0] px-4 py-3 text-sm text-[#8B3E3E]"
            >
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={() => void signInWithGitHub()}
            disabled={isSubmitting}
            className="mt-6 flex w-full items-center justify-center gap-3 rounded-full bg-[#24292F] px-5 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg
              aria-hidden="true"
              className="size-5"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 2C6.48 2 2 6.58 2 12.23c0 4.52 2.87 8.35 6.84 9.71.5.1.68-.22.68-.49 0-.24-.01-1.05-.01-1.9-2.78.62-3.37-1.21-3.37-1.21-.45-1.18-1.11-1.49-1.11-1.49-.91-.63.07-.62.07-.62 1 .08 1.53 1.06 1.53 1.06.9 1.56 2.35 1.11 2.92.85.09-.66.35-1.11.64-1.36-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.35 9.35 0 0 1 12 6.97a9.3 9.3 0 0 1 2.5.35c1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.8-4.57 5.05.36.32.68.94.68 1.89 0 1.37-.01 2.47-.01 2.81 0 .27.18.59.69.49A10.24 10.24 0 0 0 22 12.23C22 6.58 17.52 2 12 2Z" />
            </svg>
            {isSubmitting ? "Opening GitHub…" : "Continue with GitHub"}
          </button>
        </section>
      </div>
    </main>
  );
}
