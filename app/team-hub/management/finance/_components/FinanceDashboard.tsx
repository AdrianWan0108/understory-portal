"use client";

import { PaymentProfilesPanel } from "./PaymentProfilesPanel";
import { ReceivedInvoicesPanel } from "./ReceivedInvoicesPanel";
import { StaffHoursPanel } from "./StaffHoursPanel";

export function FinanceDashboard({ viewerName }: { viewerName: string }) {
  return (
    <main className="px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <header>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7D4698]">
              Management · Finance
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#28154F] sm:text-4xl">
              Finance
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#75647F]">
              Staff hours, invoice files, budgets, and protected payment
              profiles for {viewerName}.
            </p>
          </div>
        </header>

        <section className="mt-8 rounded-[22px] border border-[#D7CBE0] bg-[#FFFDF8] px-5 py-4 text-sm leading-6 text-[#75647F] sm:px-6">
          QuickBooks integration is not connected yet. Staff invoice PDFs remain available in Karen and Adrian&apos;s Documents hubs.
        </section>

        <StaffHoursPanel />
        <ReceivedInvoicesPanel />
        <PaymentProfilesPanel />
      </div>
    </main>
  );
}
