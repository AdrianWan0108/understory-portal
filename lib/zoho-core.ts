import { createHash, timingSafeEqual } from "node:crypto";

export const ZOHO_READ_ONLY_SCOPES = [
  "ZohoBooks.settings.READ",
  "ZohoBooks.invoices.READ",
  "ZohoBooks.expenses.READ",
  "ZohoBooks.bills.READ",
] as const;

export type ZohoTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  api_domain?: string;
  token_type?: string;
  error?: string;
};

export type ZohoInvoice = {
  invoice_id: string;
  invoice_number?: string;
  customer_name?: string;
  date?: string;
  due_date?: string;
  total?: number | string;
  balance?: number | string;
  bcy_total?: number | string;
  bcy_balance?: number | string;
  currency_code?: string;
  status?: string;
};

export type ZohoExpense = {
  expense_id: string;
  date?: string;
  total?: number | string;
  bcy_total?: number | string;
  currency_code?: string;
  status?: string;
};

export type ZohoBill = {
  bill_id: string;
  date?: string;
  due_date?: string;
  total?: number | string;
  balance?: number | string;
  bcy_balance?: number | string;
  currency_code?: string;
  status?: string;
};

export type FinanceDashboard = {
  currencyCode: string;
  invoicedThisMonth: number;
  expensesThisMonth: number;
  outstandingInvoiceBalance: number;
  unpaidBills: number;
  overdueInvoiceCount: number;
  recentInvoices: Array<{
    id: string;
    invoiceNumber: string;
    client: string;
    invoiceDate: string | null;
    dueDate: string | null;
    total: number;
    balance: number;
    currencyCode: string;
    status: string;
  }>;
  lastRefreshedAt: string;
};

function amount(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthBounds(now: Date) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function isWithin(date: string | undefined, start: string, end: string) {
  return Boolean(date && date >= start && date <= end);
}

function isExcludedStatus(status: string | undefined) {
  return ["void", "draft", "paid"].includes((status ?? "").toLowerCase());
}

export function buildFinanceDashboard(input: {
  invoices: ZohoInvoice[];
  expenses: ZohoExpense[];
  bills: ZohoBill[];
  organizationCurrencyCode: string;
  now?: Date;
}): FinanceDashboard {
  const now = input.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const { start, end } = monthBounds(now);
  const baseCurrency = input.organizationCurrencyCode || "CAD";

  const invoicedThisMonth = input.invoices
    .filter(
      (invoice) =>
        isWithin(invoice.date, start, end) &&
        !["void", "draft"].includes((invoice.status ?? "").toLowerCase()),
    )
    .reduce(
      (sum, invoice) => sum + amount(invoice.bcy_total ?? invoice.total),
      0,
    );
  const expensesThisMonth = input.expenses
    .filter((expense) => isWithin(expense.date, start, end))
    .reduce(
      (sum, expense) => sum + amount(expense.bcy_total ?? expense.total),
      0,
    );
  const outstandingInvoiceBalance = input.invoices
    .filter((invoice) => !isExcludedStatus(invoice.status))
    .reduce(
      (sum, invoice) => sum + amount(invoice.bcy_balance ?? invoice.balance),
      0,
    );
  const unpaidBills = input.bills
    .filter((bill) => !isExcludedStatus(bill.status))
    .reduce(
      (sum, bill) => sum + amount(bill.bcy_balance ?? bill.balance),
      0,
    );
  const overdueInvoiceCount = input.invoices.filter(
    (invoice) =>
      !isExcludedStatus(invoice.status) &&
      amount(invoice.balance) > 0 &&
      Boolean(invoice.due_date && invoice.due_date < today),
  ).length;

  const recentInvoices = input.invoices
    .filter(
      (invoice) =>
        !["void", "draft"].includes((invoice.status ?? "").toLowerCase()),
    )
    .slice()
    .sort((left, right) =>
      (right.date ?? "").localeCompare(left.date ?? ""),
    )
    .slice(0, 10)
    .map((invoice) => ({
      id: invoice.invoice_id,
      invoiceNumber: invoice.invoice_number || "—",
      client: invoice.customer_name || "Unknown client",
      invoiceDate: invoice.date ?? null,
      dueDate: invoice.due_date ?? null,
      total: amount(invoice.total),
      balance: amount(invoice.balance),
      currencyCode: invoice.currency_code || baseCurrency,
      status: invoice.status || "unknown",
    }));

  return {
    currencyCode: baseCurrency,
    invoicedThisMonth,
    expensesThisMonth,
    outstandingInvoiceBalance,
    unpaidBills,
    overdueInvoiceCount,
    recentInvoices,
    lastRefreshedAt: now.toISOString(),
  };
}

export function validateOAuthStateRecord(input: {
  providedState: string;
  expectedStateHash?: string | null;
  expectedUserId?: string | null;
  currentUserId: string;
  expiresAt?: string | null;
  consumedAt?: string | null;
  now?: number;
}) {
  if (
    !input.providedState ||
    !input.expectedStateHash ||
    !input.expectedUserId ||
    input.expectedUserId !== input.currentUserId ||
    input.consumedAt ||
    !input.expiresAt ||
    Date.parse(input.expiresAt) <= (input.now ?? Date.now())
  ) {
    return false;
  }

  const actual = Buffer.from(
    createHash("sha256").update(input.providedState).digest("hex"),
    "utf8",
  );
  const expected = Buffer.from(input.expectedStateHash, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function safeConnectionStatus(
  connection:
    | {
        organization_name: string;
        organization_id: string;
        last_synced_at: string | null;
        updated_at: string;
      }
    | null,
) {
  if (!connection) {
    return {
      connected: false as const,
      organizationName: null,
      organizationId: null,
      lastSyncedAt: null,
    };
  }
  return {
    connected: true as const,
    organizationName: connection.organization_name,
    organizationId: connection.organization_id,
    lastSyncedAt: connection.last_synced_at,
    updatedAt: connection.updated_at,
  };
}

export async function requestRefreshedZohoToken(
  fetcher: typeof fetch,
  input: {
    accountsDomain: string;
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  },
) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken,
  });
  const response = await fetcher(
    `${input.accountsDomain.replace(/\/$/, "")}/oauth/v2/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    },
  );
  const payload = (await response.json().catch(() => ({}))) as ZohoTokenResponse;

  if (!response.ok || payload.error || !payload.access_token) {
    throw new Error("Zoho access could not be refreshed. Reconnect Zoho Books.");
  }
  return payload;
}
