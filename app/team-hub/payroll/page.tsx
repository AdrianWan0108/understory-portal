"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";
import { ReceivedInvoicesPanel } from "../management/finance/_components/ReceivedInvoicesPanel";
import { useTeamIdentity } from "../_components/TeamIdentity";
import TimeLogForm from "./_components/TimeLogForm";
import MonthlyInvoiceWorkspace from "./_components/MonthlyInvoiceWorkspace";
import WeeklySummary from "./_components/WeeklySummary";

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function localMonth() {
  return localDate().slice(0, 7);
}

export default function TeamHubPayrollPage() {
  const { username, name, accessLevel } = useTeamIdentity();
  const [timeLogRefreshToken, setTimeLogRefreshToken] = useState(0);
  const [selectedWeekDate, setSelectedWeekDate] = useState(localDate);
  const [invoiceMonth, setInvoiceMonth] = useState(localMonth);

  const isTimeLoggingContractor =
    username === "Understory_Sure" || username === "Understory_Xiyangcen";

  useEffect(() => {
    setSelectedWeekDate(localDate());
    setInvoiceMonth(localMonth());
  }, [username]);

  return (
    <main className="px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <section>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7D4698]">
            Team Hub · Finance
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#28154F] sm:text-4xl">
            Payroll
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#75647F] sm:text-base">
            {accessLevel === "owner"
              ? "Review staff hours and invoice files in the secure Finance workspace."
              : `${name ?? "Your"} hours and invoice history are private to your session.`}
          </p>
        </section>

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
              onDeleted={() =>
                setTimeLogRefreshToken((current) => current + 1)
              }
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

        {accessLevel === "owner" && (
          <ReceivedInvoicesPanel endpoint="/api/team-hub/payroll/received-invoices" />
        )}
      </div>
    </main>
  );
}
