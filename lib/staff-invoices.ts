import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendSlackMessage } from "@/lib/slack";
import { payrollMonthWindow } from "@/lib/payroll-time-logs-core";
import { getPayrollMonthSnapshot } from "@/lib/payroll-time-logs";
import { getStaffPrivateProfile } from "@/lib/staff-private-profile";

type InvoiceRow = {
  id: string;
  invoice_number: string;
  staff_profile_id: string;
  staff_username: string;
  staff_name: string;
  invoice_month: string;
  currency_code: string;
  hourly_rate: number | string;
  total_hours: number | string;
  total_amount: number | string;
  payee_details: {
    legalName: string;
    address: {
      line1: string;
      line2?: string | null;
      city: string;
      province: string;
      postalCode: string;
      country: string;
    };
  };
  line_items: Array<{
    id: string;
    workDate: string;
    hours: number;
    workLabel: string;
    notes: string | null;
    rate: number;
    amount: number;
  }>;
  status: "submitted" | "paid";
  submitted_at: string;
};

export class StaffInvoiceError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 500, code = "STAFF_INVOICE_ERROR") {
    super(message);
    this.name = "StaffInvoiceError";
    this.status = status;
    this.code = code;
  }
}

function adminClient() {
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new StaffInvoiceError(
      "Staff invoices are not configured.",
      503,
      "NOT_CONFIGURED",
    );
  }
  return admin;
}

function number(value: number | string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function publicInvoice(row: InvoiceRow | null) {
  if (!row) return null;
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    staffProfileId: row.staff_profile_id,
    staffUsername: row.staff_username,
    staffName: row.staff_name,
    month: row.invoice_month,
    currencyCode: row.currency_code,
    hourlyRate: number(row.hourly_rate),
    totalHours: number(row.total_hours),
    totalAmount: number(row.total_amount),
    payee: row.payee_details,
    lineItems: row.line_items,
    status: row.status,
    submittedAt: row.submitted_at,
    href: `/team-hub/payroll/invoices/${row.id}`,
  };
}

async function invoiceForMonth(profileId: string, month: string) {
  const { data, error } = await adminClient()
    .from("staff_invoices")
    .select("*")
    .eq("staff_profile_id", profileId)
    .eq("invoice_month", month)
    .maybeSingle();
  if (error) {
    throw new StaffInvoiceError(
      "Invoice templates have not been set up yet.",
      503,
      "MIGRATION_REQUIRED",
    );
  }
  return (data as InvoiceRow | null) ?? null;
}

export async function getStaffInvoiceWorkspace(
  teamUsername: string,
  monthValue: unknown,
) {
  let month;
  try {
    month = payrollMonthWindow(monthValue).month;
  } catch (caught) {
    throw new StaffInvoiceError(
      caught instanceof Error ? caught.message : "Choose a valid month.",
      400,
      "INVALID_INPUT",
    );
  }
  const snapshot = await getPayrollMonthSnapshot(teamUsername, month);
  const invoice = await invoiceForMonth(snapshot.profile.id, month);
  return { ...snapshot, invoice: publicInvoice(invoice) };
}

function monthLabel(month: string) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00.000Z`));
}

async function ensureFinanceHubReferences(row: InvoiceRow) {
  const admin = adminClient();
  const href = `/team-hub/payroll/invoices/${row.id}`;
  const { data: existing, error: existingError } = await admin
    .from("team_documents")
    .select("owner_username")
    .eq("file_url", href)
    .in("owner_username", ["Understory_Karen", "Understory_Adrian"]);
  if (existingError) {
    throw new StaffInvoiceError(
      "The invoice was created, but Finance delivery could not be verified.",
      503,
      "DELIVERY_ERROR",
    );
  }

  const existingOwners = new Set(
    (existing ?? []).map((record) => record.owner_username),
  );
  const missing = ["Understory_Karen", "Understory_Adrian"].filter(
    (ownerUsername) => !existingOwners.has(ownerUsername),
  );
  if (missing.length) {
    const { error } = await admin.from("team_documents").insert(
      missing.map((ownerUsername) => ({
        owner_username: ownerUsername,
        file_url: href,
        document_name: `${row.staff_name} — ${monthLabel(row.invoice_month)} invoice`,
        category: "Staff invoice",
      })),
    );
    if (error) {
      throw new StaffInvoiceError(
        "The invoice was created, but it could not be delivered to Finance.",
        503,
        "DELIVERY_ERROR",
      );
    }
  }

  const { data: payroll } = await admin
    .from("team_payroll")
    .select("id")
    .eq("staff_username", row.staff_username)
    .eq("invoice_file_url", href)
    .maybeSingle();
  if (!payroll) {
    const { error } = await admin.from("team_payroll").insert({
      staff_username: row.staff_username,
      amount: number(row.total_amount),
      status: "pending",
      pay_period: monthLabel(row.invoice_month),
      invoice_file_url: href,
    });
    if (error) {
      throw new StaffInvoiceError(
        "The invoice reached Finance, but the payroll record could not be created.",
        503,
        "PAYROLL_DELIVERY_ERROR",
      );
    }
  }
}

export async function submitStaffInvoice(
  teamUsername: string,
  monthValue: unknown,
) {
  const workspace = await getStaffInvoiceWorkspace(teamUsername, monthValue);
  if (workspace.invoice) {
    const existing = await invoiceForMonth(workspace.profile.id, workspace.month);
    if (existing) await ensureFinanceHubReferences(existing);
    return { ...workspace, invoice: publicInvoice(existing) };
  }
  if (!workspace.entries.length || workspace.loggedHours <= 0) {
    throw new StaffInvoiceError(
      "Log at least one hour before sending an invoice.",
      422,
      "NO_TIME_ENTRIES",
    );
  }

  const privateProfile = await getStaffPrivateProfile(teamUsername);
  if (!privateProfile) {
    throw new StaffInvoiceError(
      "Finance must set up your legal name and payment address before you can send an invoice.",
      409,
      "PRIVATE_PROFILE_REQUIRED",
    );
  }

  const rate = workspace.hourlyRate;
  const lineItems = workspace.entries
    .slice()
    .sort((left, right) => left.workDate.localeCompare(right.workDate))
    .map((entry) => ({
      id: entry.id,
      workDate: entry.workDate,
      hours: entry.hours,
      workLabel: entry.workLabel,
      notes: entry.notes,
      rate,
      amount: Math.round(entry.hours * rate * 100) / 100,
    }));
  const invoiceNumber = `US-${teamUsername
    .replace(/^Understory_/i, "")
    .replace(/[^a-z\d]/gi, "")
    .toUpperCase()}-${workspace.month.replace("-", "")}`;
  const { data, error } = await adminClient()
    .from("staff_invoices")
    .insert({
      invoice_number: invoiceNumber,
      staff_profile_id: workspace.profile.id,
      staff_username: teamUsername,
      staff_name: workspace.profile.name,
      invoice_month: workspace.month,
      currency_code: "CAD",
      hourly_rate: rate,
      total_hours: workspace.loggedHours,
      total_amount: workspace.estimatedPay,
      payee_details: {
        legalName: privateProfile.details.legalName,
        address: privateProfile.details.payeeAddress,
      },
      line_items: lineItems,
      status: "submitted",
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new StaffInvoiceError(
      error?.code === "23505"
        ? "An invoice has already been sent for this month."
        : "Could not create the invoice.",
      error?.code === "23505" ? 409 : 503,
      error?.code === "23505" ? "ALREADY_SUBMITTED" : "STORAGE_ERROR",
    );
  }

  const invoice = data as InvoiceRow;
  await ensureFinanceHubReferences(invoice);
  try {
    await sendSlackMessage(
      "admin",
      `${invoice.staff_name} sent ${invoice.invoice_number} to Finance — $${number(invoice.total_amount).toFixed(2)} CAD for ${number(invoice.total_hours)} hours.`,
    );
  } catch {
    // The document hub is the source of truth; Slack is a best-effort alert.
  }

  return { ...workspace, invoice: publicInvoice(invoice) };
}

export async function getStaffInvoiceById(
  invoiceId: string,
  caller: { username: string; accessLevel: "owner" | "staff" },
) {
  if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) return null;
  const { data, error } = await adminClient()
    .from("staff_invoices")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as InvoiceRow;
  if (caller.accessLevel !== "owner" && row.staff_username !== caller.username) {
    return null;
  }
  return publicInvoice(row);
}

export function staffInvoiceRouteError(caught: unknown) {
  if (caught instanceof StaffInvoiceError) {
    return Response.json(
      { error: caught.message, code: caught.code },
      { status: caught.status },
    );
  }
  return Response.json(
    { error: "The staff invoice service could not complete the request." },
    { status: 500 },
  );
}
