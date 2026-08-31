import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendSlackMessage } from "@/lib/slack";
import { payrollMonthWindow } from "@/lib/payroll-time-logs-core";
import { getPayrollMonthSnapshot } from "@/lib/payroll-time-logs";
import { getStaffPrivateProfile } from "@/lib/staff-private-profile";
import {
  generateStaffInvoicePdf,
  type StaffInvoicePdfData,
} from "@/lib/staff-invoice-pdf";

const INVOICE_BUCKET = "staff-invoice-files";

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
  status: "sent_to_finance" | "paid";
  submitted_at: string;
  pdf_storage_path: string | null;
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
    pdfHref: `/api/team-hub/payroll/invoices/${row.id}/pdf`,
    hasPdf: Boolean(row.pdf_storage_path),
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
  const href = `/api/team-hub/payroll/invoices/${row.id}/pdf`;
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

async function invoiceDraft(
  teamUsername: string,
  workspace: Awaited<ReturnType<typeof getStaffInvoiceWorkspace>>,
) {
  if (!workspace.entries.length || workspace.loggedHours <= 0) {
    throw new StaffInvoiceError(
      "Log at least one hour before previewing an invoice.",
      422,
      "NO_TIME_ENTRIES",
    );
  }

  const privateProfile = await getStaffPrivateProfile(teamUsername);
  if (!privateProfile) {
    throw new StaffInvoiceError(
      "Finance must set up your legal name and payment address before you can create an invoice PDF.",
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
  const invoiceNumber = `INV-${teamUsername
    .replace(/^Understory_/i, "")
    .replace(/[^a-z\d]/gi, "")
    .toUpperCase()}-${workspace.month.replace("-", "")}`;

  return {
    invoiceNumber,
    staffProfileId: workspace.profile.id,
    staffUsername: teamUsername,
    staffName: workspace.profile.name,
    month: workspace.month,
    currencyCode: "CAD",
    hourlyRate: rate,
    totalHours: workspace.loggedHours,
    totalAmount: workspace.estimatedPay,
    payee: {
      legalName: privateProfile.details.legalName,
      address: privateProfile.details.payeeAddress,
    },
    lineItems,
    submittedAt: new Date().toISOString(),
    status: "in_progress" as const,
  } satisfies StaffInvoicePdfData & {
    staffProfileId: string;
    staffUsername: string;
    staffName: string;
    hourlyRate: number;
  };
}

export async function getStaffInvoicePreview(
  teamUsername: string,
  monthValue: unknown,
) {
  const workspace = await getStaffInvoiceWorkspace(teamUsername, monthValue);
  if (workspace.invoice) {
    throw new StaffInvoiceError(
      "This invoice has already been sent. Open the saved PDF instead.",
      409,
      "ALREADY_SUBMITTED",
    );
  }
  const draft = await invoiceDraft(teamUsername, workspace);
  return {
    bytes: await generateStaffInvoicePdf(draft),
    filename: `${draft.invoiceNumber}.pdf`,
  };
}

async function ensureInvoicePdf(row: InvoiceRow) {
  if (row.pdf_storage_path) return row;
  const invoice = publicInvoice(row);
  if (!invoice) {
    throw new StaffInvoiceError(
      "The invoice PDF could not be prepared.",
      500,
      "PDF_ERROR",
    );
  }
  const bytes = await generateStaffInvoicePdf(invoice);
  const path = `${row.staff_profile_id}/${row.invoice_number}.pdf`;
  const admin = adminClient();
  const { error: uploadError } = await admin.storage
    .from(INVOICE_BUCKET)
    .upload(path, bytes, {
      contentType: "application/pdf",
      cacheControl: "private, max-age=0, no-store",
      upsert: true,
    });
  if (uploadError) {
    throw new StaffInvoiceError(
      "The invoice was created, but its PDF file could not be stored.",
      503,
      "PDF_STORAGE_ERROR",
    );
  }
  const { data, error } = await admin
    .from("staff_invoices")
    .update({ pdf_storage_path: path })
    .eq("id", row.id)
    .select("*")
    .single();
  if (error || !data) {
    throw new StaffInvoiceError(
      "The PDF was stored, but the invoice record could not be updated.",
      503,
      "PDF_STORAGE_ERROR",
    );
  }
  return data as InvoiceRow;
}

export async function submitStaffInvoice(
  teamUsername: string,
  monthValue: unknown,
) {
  const workspace = await getStaffInvoiceWorkspace(teamUsername, monthValue);
  if (workspace.invoice) {
    const existing = await invoiceForMonth(workspace.profile.id, workspace.month);
    if (existing) {
      const withPdf = await ensureInvoicePdf(existing);
      await ensureFinanceHubReferences(withPdf);
      return { ...workspace, invoice: publicInvoice(withPdf) };
    }
  }

  const draft = await invoiceDraft(teamUsername, workspace);
  const { data, error } = await adminClient()
    .from("staff_invoices")
    .insert({
      invoice_number: draft.invoiceNumber,
      staff_profile_id: draft.staffProfileId,
      staff_username: draft.staffUsername,
      staff_name: draft.staffName,
      invoice_month: draft.month,
      currency_code: draft.currencyCode,
      hourly_rate: draft.hourlyRate,
      total_hours: draft.totalHours,
      total_amount: draft.totalAmount,
      payee_details: draft.payee,
      line_items: draft.lineItems,
      status: "sent_to_finance",
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

  const invoice = await ensureInvoicePdf(data as InvoiceRow);
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

export async function getStaffInvoicePdf(
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
  let row = data as InvoiceRow;
  if (caller.accessLevel !== "owner" && row.staff_username !== caller.username) {
    return null;
  }
  row = await ensureInvoicePdf(row);
  const { data: file, error: downloadError } = await adminClient().storage
    .from(INVOICE_BUCKET)
    .download(row.pdf_storage_path!);
  if (downloadError || !file) {
    throw new StaffInvoiceError(
      "The saved invoice PDF could not be downloaded.",
      503,
      "PDF_STORAGE_ERROR",
    );
  }
  return {
    bytes: new Uint8Array(await file.arrayBuffer()),
    filename: `${row.invoice_number}.pdf`,
  };
}

export async function getFinanceStaffInvoices() {
  const { data, error } = await adminClient()
    .from("staff_invoices")
    .select("*")
    .order("submitted_at", { ascending: false });
  if (error) {
    throw new StaffInvoiceError(
      "Could not load received staff invoices.",
      503,
      "STORAGE_ERROR",
    );
  }
  return (data as InvoiceRow[]).map((row) => publicInvoice(row)!);
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
