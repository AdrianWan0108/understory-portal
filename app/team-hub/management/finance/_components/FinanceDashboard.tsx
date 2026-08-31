"use client";

import { PaymentProfilesPanel } from "./PaymentProfilesPanel";
import { ReceivedInvoicesPanel } from "./ReceivedInvoicesPanel";
import { StaffHoursPanel } from "./StaffHoursPanel";

export function FinanceDashboard({ viewerName }: { viewerName: string }) {
  async function signOut() {
    await fetch("/api/team-hub/finance/session", { method: "DELETE" }).catch(
      () => null,
    );
    window.location.replace("/team-hub/management/finance/sign-in");
  }

  return (
    <main className="px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7D4698]">
              Management · Finance
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#28154F] sm:text-4xl">
              Finance
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#75647F]">
              Staff hours, invoice files, budgets, and protected payment profiles. Signed in securely as {viewerName}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="w-fit rounded-full border border-[#CDBAD9] bg-white px-5 py-2.5 text-xs font-semibold text-[#5F3378]"
          >
            End Finance session
          </button>
        </header>

        <section className="mt-8 rounded-[22px] border border-[#D7CBE0] bg-[#FFFDF8] px-5 py-4 text-sm leading-6 text-[#75647F] sm:px-6">
          The previous Zoho Books connection has been removed. QuickBooks integration is not connected yet; staff invoice PDFs remain available in Karen and Adrian&apos;s Documents hubs.
        </section>

        <StaffHoursPanel />
        <ReceivedInvoicesPanel />
        <PaymentProfilesPanel />
      </div>
    </main>
  );
}
