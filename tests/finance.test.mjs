import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateFinanceAccess,
  financePageDecision,
  shouldShowFinanceNavigation,
} from "../lib/finance-policy.ts";
import {
  calculateStaffBudgetProgress,
  staffMonthWindow,
  validateStaffBudgetInput,
  validateStaffTimeEntryInput,
} from "../lib/staff-hours-core.ts";
import {
  contractorWeeklyAllowance,
  contractorWeekTotals,
  payrollMonthWindow,
  payrollWeekWindow,
  validateContractorTimeEntryInput,
} from "../lib/payroll-time-logs-core.ts";
import {
  maskPhoneNumber,
  privateProfileAccessCode,
} from "../lib/staff-private-profile-core.ts";
import { generateStaffInvoicePdf } from "../lib/staff-invoice-pdf.ts";

test("Adrian can access Finance with his Team Portal owner identity", () => {
  const result = evaluateFinanceAccess({
    username: "Understory_Adrian",
    name: "Adrian",
    accessLevel: "owner",
  });
  assert.equal(result.kind, "allowed");
  assert.equal(result.name, "Adrian");
});

test("Karen can access Finance with her Team Portal owner identity", () => {
  const result = evaluateFinanceAccess({
    username: "Understory_Karen",
    name: "Karen",
    accessLevel: "owner",
  });
  assert.equal(result.kind, "allowed");
  assert.equal(result.name, "Karen");
});

test("a staff Team Portal identity is forbidden", () => {
  const result = evaluateFinanceAccess({
    username: "Understory_Arion",
    name: "Arion",
    accessLevel: "staff",
  });
  assert.equal(result.kind, "forbidden");
});

test("a request without a Team Portal identity is unauthenticated", () => {
  assert.equal(evaluateFinanceAccess({}).kind, "unauthenticated");
});

test("the Finance navigation item is shown to owners only", () => {
  assert.equal(shouldShowFinanceNavigation("staff"), false);
  assert.equal(shouldShowFinanceNavigation("owner"), true);
});

test("a manually entered Finance URL resolves to a forbidden decision", () => {
  assert.equal(
    financePageDecision({ kind: "unauthenticated" }),
    "forbidden",
  );
  assert.equal(financePageDecision({ kind: "forbidden" }), "forbidden");
});

test("staff budget month windows use an exclusive next-month boundary", () => {
  assert.deepEqual(staffMonthWindow("2026-12"), {
    start: "2026-12-01",
    next: "2027-01-01",
  });
});

test("staff budgets validate monthly money, capacity, and rate values", () => {
  assert.deepEqual(
    validateStaffBudgetInput({
      staffProfileId: "58a1cae6-c3c6-4403-8c2c-f97ee8d149d2",
      month: "2026-07",
      budgetAmount: "4000",
      plannedHours: "80",
      hourlyRate: "45.50",
    }),
    {
      staffProfileId: "58a1cae6-c3c6-4403-8c2c-f97ee8d149d2",
      month: "2026-07",
      budgetAmount: 4000,
      plannedHours: 80,
      hourlyRate: 45.5,
    },
  );
});

test("time tracking rejects impossible hours and accepts a dated work entry", () => {
  assert.throws(
    () =>
      validateStaffTimeEntryInput({
        staffProfileId: "58a1cae6-c3c6-4403-8c2c-f97ee8d149d2",
        workDate: "2026-07-28",
        hours: 25,
        workLabel: "Client work",
      }),
    /between 0 and 24/,
  );
  assert.equal(
    validateStaffTimeEntryInput({
      staffProfileId: "58a1cae6-c3c6-4403-8c2c-f97ee8d149d2",
      workDate: "2026-07-28",
      hours: 2.5,
      workLabel: "Boardwalk social content",
      notes: "Drafted the August calendar.",
    }).hours,
    2.5,
  );
});

test("staff budget progress reports utilization and budget variance", () => {
  assert.deepEqual(
    calculateStaffBudgetProgress({
      budgetAmount: 1000,
      plannedHours: 20,
      hourlyRate: 60,
      loggedHours: 22,
    }),
    {
      estimatedCost: 1320,
      remainingBudget: -320,
      remainingHours: -2,
      utilizationPercent: 110,
    },
  );
});

test("payroll week windows run Monday through Sunday across month boundaries", () => {
  assert.deepEqual(payrollWeekWindow("2026-08-01"), {
    start: "2026-07-27",
    end: "2026-08-02",
  });
});

test("payroll month windows use an exclusive next-month boundary", () => {
  assert.deepEqual(payrollMonthWindow("2026-12"), {
    month: "2026-12",
    start: "2026-12-01",
    next: "2027-01-01",
  });
});

test("contractor time entries are normalized and validated", () => {
  assert.deepEqual(
    validateContractorTimeEntryInput({
      workDate: "2026-07-30",
      hours: "2.257",
      workLabel: "  Campaign reporting  ",
      notes: "  July wrap-up  ",
    }),
    {
      workDate: "2026-07-30",
      hours: 2.26,
      workLabel: "Campaign reporting",
      notes: "July wrap-up",
    },
  );
  assert.throws(
    () =>
      validateContractorTimeEntryInput({
        workDate: "2026-07-30",
        hours: 0,
        workLabel: "Campaign reporting",
      }),
    /greater than zero/,
  );
});

test("contractor weekly totals flag cap overruns and calculate pay", () => {
  assert.deepEqual(
    contractorWeekTotals({
      loggedHours: 10.5,
      hourlyRate: 20,
      weeklyCap: 10,
    }),
    {
      loggedHours: 10.5,
      estimatedPay: 210,
      remainingHours: -0.5,
      isOverCap: true,
    },
  );
});

test("contractors cannot log more than their remaining weekly allowance", () => {
  assert.deepEqual(
    contractorWeeklyAllowance({
      loggedHours: 8,
      weeklyCap: 10,
      requestedHours: 2,
    }),
    { remainingHours: 2, canLog: true },
  );
  assert.deepEqual(
    contractorWeeklyAllowance({
      loggedHours: 8,
      weeklyCap: 10,
      requestedHours: 2.25,
    }),
    { remainingHours: 2, canLog: false },
  );
});

test("private profile access codes use normalized name and phone last four", () => {
  assert.equal(
    privateProfileAccessCode("Xi Yang Cen", "+1 (416) 555-0198"),
    "xiyangcen0198",
  );
  assert.equal(maskPhoneNumber("+1 (416) 555-0198"), "••• ••• 0198");
  assert.equal(privateProfileAccessCode("Xi Yang Cen", ""), null);
});

test("staff invoice generation returns a real PDF file", async () => {
  const bytes = await generateStaffInvoicePdf({
    invoiceNumber: "INV-TEST-202608",
    month: "2026-08",
    currencyCode: "CAD",
    totalHours: 2,
    totalAmount: 40,
    submittedAt: "2026-08-31T12:00:00.000Z",
    status: "in_progress",
    payee: {
      legalName: "Test Contractor",
      address: {
        line1: "1 Test Street",
        city: "Toronto",
        province: "ON",
        postalCode: "M1M 1M1",
        country: "Canada",
      },
      bankDetails: {
        bankName: "Test Bank",
        swiftCode: "TESTCA01",
        accountNumber: "123456789",
        institutionNumber: "001",
        branchAddress: "100 King Street West, Toronto, ON",
      },
    },
    lineItems: [
      {
        id: "entry-1",
        workDate: "2026-08-01",
        hours: 2,
        workLabel: "Design work",
        notes: null,
        rate: 20,
        amount: 40,
      },
    ],
  });
  assert.equal(Buffer.from(bytes.subarray(0, 4)).toString("ascii"), "%PDF");
  assert.ok(bytes.length > 500);
});
