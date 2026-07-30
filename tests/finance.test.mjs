import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateFinanceAccess,
  financePageDecision,
  shouldShowFinanceNavigation,
} from "../lib/finance-policy.ts";
import {
  buildFinanceDashboard,
  requestRefreshedZohoToken,
  safeConnectionStatus,
  validateOAuthStateRecord,
} from "../lib/zoho-core.ts";
import {
  calculateStaffBudgetProgress,
  staffMonthWindow,
  validateStaffBudgetInput,
  validateStaffTimeEntryInput,
} from "../lib/staff-hours-core.ts";
import {
  contractorWeeklyAllowance,
  contractorWeekTotals,
  payrollWeekWindow,
  validateContractorTimeEntryInput,
} from "../lib/payroll-time-logs-core.ts";
import { createHash } from "node:crypto";

const future = "2099-01-01T00:00:00.000Z";

test("Adrian can access Finance when his verified profile permission is set", () => {
  const result = evaluateFinanceAccess({
    sessionUserId: "adrian-auth-id",
    sessionExpiresAt: future,
    profile: {
      id: "adrian-profile",
      full_name: "Adrian",
      can_view_finance: true,
    },
  });
  assert.equal(result.kind, "allowed");
  assert.equal(result.name, "Adrian");
});

test("Karen can access Finance when her verified profile permission is set", () => {
  const result = evaluateFinanceAccess({
    sessionUserId: "karen-auth-id",
    sessionExpiresAt: future,
    profile: {
      id: "karen-profile",
      full_name: "Karen",
      can_view_finance: true,
    },
  });
  assert.equal(result.kind, "allowed");
  assert.equal(result.name, "Karen");
});

test("an ordinary authenticated user is forbidden", () => {
  const result = evaluateFinanceAccess({
    sessionUserId: "ordinary-user",
    sessionExpiresAt: future,
    profile: {
      id: "ordinary-profile",
      full_name: "Team member",
      can_view_finance: false,
    },
  });
  assert.equal(result.kind, "forbidden");
});

test("a request without a secure session is unauthenticated", () => {
  assert.equal(evaluateFinanceAccess({}).kind, "unauthenticated");
});

test("the Finance navigation item is hidden without verified access", () => {
  assert.equal(shouldShowFinanceNavigation("staff", false), false);
  assert.equal(shouldShowFinanceNavigation("owner", false), false);
  assert.equal(shouldShowFinanceNavigation("owner", true), true);
});

test("a manually entered Finance URL resolves to a forbidden decision", () => {
  assert.equal(
    financePageDecision({ kind: "unauthenticated" }),
    "forbidden",
  );
  assert.equal(financePageDecision({ kind: "forbidden" }), "forbidden");
});

test("OAuth state mismatch is rejected", () => {
  const expected = "correct-state";
  assert.equal(
    validateOAuthStateRecord({
      providedState: "wrong-state",
      expectedStateHash: createHash("sha256").update(expected).digest("hex"),
      expectedUserId: "user-1",
      currentUserId: "user-1",
      expiresAt: future,
    }),
    false,
  );
});

test("connection responses never return raw Zoho tokens", () => {
  const response = safeConnectionStatus({
    organization_name: "Understory",
    organization_id: "123",
    last_synced_at: null,
    updated_at: "2026-07-26T12:00:00.000Z",
    encrypted_access_token: "must-not-leak",
    encrypted_refresh_token: "must-not-leak",
  });
  assert.equal(response.connected, true);
  assert.equal(JSON.stringify(response).includes("must-not-leak"), false);
});

test("access-token refresh works with a mocked Zoho response", async () => {
  const calls = [];
  const token = await requestRefreshedZohoToken(
    async (url, options) => {
      calls.push({ url, options });
      return Response.json({
        access_token: "new-access-token",
        expires_in: 3600,
      });
    },
    {
      accountsDomain: "https://accounts.zohocloud.ca",
      clientId: "client",
      clientSecret: "secret",
      refreshToken: "refresh",
    },
  );
  assert.equal(token.access_token, "new-access-token");
  assert.equal(calls.length, 1);
  assert.match(String(calls[0].options.body), /grant_type=refresh_token/);
});

test("a disconnected Zoho account returns a safe empty status", () => {
  assert.deepEqual(safeConnectionStatus(null), {
    connected: false,
    organizationName: null,
    organizationId: null,
    lastSyncedAt: null,
  });
});

test("empty Zoho finance lists produce a valid zero dashboard", () => {
  const result = buildFinanceDashboard({
    invoices: [],
    expenses: [],
    bills: [],
    organizationCurrencyCode: "CAD",
    now: new Date("2026-07-26T12:00:00.000Z"),
  });
  assert.equal(result.invoicedThisMonth, 0);
  assert.equal(result.expensesThisMonth, 0);
  assert.deepEqual(result.recentInvoices, []);
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
