"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { sendSlackNotification } from "@/lib/slack-notifications";
import { useAdmin } from "../_components/AdminContext";
import {
  AdminButton,
  AdminConfirmDialog,
  AdminEmpty,
  AdminMessage,
  AdminModal,
  AdminPageHeader,
  inputClass,
} from "../_components/AdminUi";

const BUCKET = "client-invoices";
type Status = "sent" | "received";
type Invoice = {
  id: string;
  invoice_number: string;
  description: string | null;
  amount: number;
  currency: string;
  status: Status;
  issued_date: string;
  due_date: string | null;
  file_url: string | null;
  file_name: string | null;
};

type InvoiceEditor = {
  invoice: Invoice;
  number: string;
  description: string;
  amount: string;
  status: Status;
  issuedDate: string;
  dueDate: string;
};

function dateValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function net15(value: string) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + 15);
  return date.toISOString().slice(0, 10);
}

function storagePath(url: string) {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  try {
    const parsed = new URL(url);
    const index = parsed.pathname.indexOf(marker);
    return index < 0
      ? null
      : decodeURIComponent(parsed.pathname.slice(index + marker.length));
  } catch {
    return null;
  }
}

export default function AdminInvoicesPage() {
  const { clientId, clientName, clientSlug } = useAdmin();
  const fileRef = useRef<HTMLInputElement>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [number, setNumber] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [issuedDate, setIssuedDate] = useState(dateValue());
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<Status>("sent");
  const [file, setFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editor, setEditor] = useState<InvoiceEditor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const totalOutstanding = useMemo(
    () =>
      invoices
        .filter((invoice) => invoice.status === "sent")
        .reduce((total, invoice) => total + Number(invoice.amount || 0), 0),
    [invoices],
  );

  const load = useCallback(async () => {
    if (!clientId) return;
    const { data, error: loadError } = await supabase
      .from("client_invoices")
      .select(
        "id, invoice_number, description, amount, currency, status, issued_date, due_date, file_url, file_name",
      )
      .eq("client_id", clientId)
      .order("issued_date", { ascending: false });
    if (loadError) setError(loadError.message);
    else setInvoices((data ?? []) as Invoice[]);
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addInvoice() {
    if (!clientId || !file || !number.trim() || !amount || !dueDate) return;
    setIsSaving(true);
    setError(null);
    const path = `${clientId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    try {
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
          contentType: "application/pdf",
          upsert: false,
        });
      if (uploadError) throw uploadError;
      const {
        data: { publicUrl },
      } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const { error: insertError } = await supabase
        .from("client_invoices")
        .insert({
          client_id: clientId,
          invoice_number: number.trim(),
          description: description.trim() || null,
          amount: Number(amount),
          currency: "CAD",
          status,
          issued_date: issuedDate,
          due_date: dueDate,
          file_url: publicUrl,
          file_name: file.name,
          uploaded_by: "Understory admin",
        });
      if (insertError) throw insertError;
      if (clientSlug) {
        void sendSlackNotification({
          type: "client_invoice",
          clientSlug,
          invoiceName: file.name,
          amount: Number(amount),
        });
      }
      setSuccess("Invoice added.");
      setNumber("");
      setDescription("");
      setAmount("");
      setIssuedDate(dateValue());
      setDueDate("");
      setStatus("sent");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      void load();
    } catch (caught) {
      await supabase.storage.from(BUCKET).remove([path]);
      setError(caught instanceof Error ? caught.message : "Could not save.");
    } finally {
      setIsSaving(false);
    }
  }

  async function editInvoice() {
    if (
      !editor ||
      !editor.number.trim() ||
      !editor.amount ||
      Number.isNaN(Number(editor.amount)) ||
      !editor.issuedDate ||
      !editor.dueDate ||
      isEditing
    )
      return;
    setIsEditing(true);
    setError(null);
    const { error: mutationError } = await supabase
      .from("client_invoices")
      .update({
        invoice_number: editor.number.trim(),
        description: editor.description.trim() || null,
        amount: Number(editor.amount),
        status: editor.status,
        issued_date: editor.issuedDate,
        due_date: editor.dueDate,
      })
      .eq("id", editor.invoice.id);
    setIsEditing(false);
    if (mutationError) {
      setError(mutationError.message);
      return;
    }
    setEditor(null);
    void load();
  }

  async function removeInvoice() {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    const invoice = deleteTarget;
    if (invoice.file_url) {
      const path = storagePath(invoice.file_url);
      if (path) {
        const { error: storageError } = await supabase.storage
          .from(BUCKET)
          .remove([path]);
        if (storageError) {
          setError(storageError.message);
          setIsDeleting(false);
          return;
        }
      }
    }
    const { error: mutationError } = await supabase
      .from("client_invoices")
      .delete()
      .eq("id", invoice.id);
    setIsDeleting(false);
    if (mutationError) {
      setError(mutationError.message);
      return;
    }
    setDeleteTarget(null);
    void load();
  }

  return (
    <main className="px-5 py-10 sm:px-8 lg:px-10">
      <AdminPageHeader
        title="Invoices"
        description={`Create and manage invoice records published to ${clientName ?? "this client"}.`}
        action={
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#8B7895]">
              Client portal outstanding
            </p>
            <p className="mt-1 text-2xl font-semibold text-[#341F60]">
              ${totalOutstanding.toLocaleString("en-CA", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </div>
        }
      />
      <AdminMessage error={error} success={success} />
      <section className="mt-7 rounded-[22px] border border-[#D7CBE0] bg-white p-5">
        <h2 className="text-lg font-semibold">Upload invoice</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <label className="text-xs font-semibold">
            Invoice number
            <input
              value={number}
              onChange={(event) => setNumber(event.target.value)}
              className={`mt-2 ${inputClass}`}
            />
          </label>
          <label className="text-xs font-semibold">
            Amount (CAD)
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className={`mt-2 ${inputClass}`}
            />
          </label>
          <label className="text-xs font-semibold">
            Status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as Status)}
              className={`mt-2 ${inputClass}`}
            >
              <option value="sent">Sent</option>
              <option value="received">Received</option>
            </select>
          </label>
          <label className="text-xs font-semibold">
            Issued date
            <input
              type="date"
              value={issuedDate}
              onChange={(event) => {
                setIssuedDate(event.target.value);
                setDueDate("");
              }}
              className={`mt-2 ${inputClass}`}
            />
          </label>
          <div>
            <p className="text-xs font-semibold">Due date</p>
            <AdminButton
              tone="secondary"
              className="mt-2"
              onClick={() => setDueDate(net15(issuedDate))}
            >
              Set Net 15
            </AdminButton>
            <p className="mt-2 text-xs text-[#75647F]">
              {dueDate || "Not calculated"}
            </p>
          </div>
          <label className="text-xs font-semibold">
            PDF
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className={`mt-2 ${inputClass}`}
            />
          </label>
          <label className="text-xs font-semibold sm:col-span-2 xl:col-span-3">
            Description
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={`mt-2 ${inputClass}`}
            />
          </label>
        </div>
        <AdminButton
          className="mt-5"
          onClick={() => void addInvoice()}
          disabled={
            isSaving || !number.trim() || !amount || !dueDate || !file
          }
        >
          {isSaving ? "Saving…" : "Upload invoice"}
        </AdminButton>
      </section>

      <div className="mt-8 space-y-3">
        {invoices.length ? (
          invoices.map((invoice) => (
            <article
              key={invoice.id}
              className="flex flex-col gap-4 rounded-[20px] border border-[#D7CBE0] bg-white p-5 lg:flex-row lg:items-center"
            >
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">
                  Invoice {invoice.invoice_number}
                </h2>
                <p className="mt-1 text-sm text-[#75647F]">
                  ${Number(invoice.amount).toFixed(2)} CAD · Issued{" "}
                  {invoice.issued_date} · Due {invoice.due_date || "—"}
                </p>
              </div>
              <select
                value={invoice.status}
                onChange={async (event) => {
                  const { error: mutationError } = await supabase
                    .from("client_invoices")
                    .update({ status: event.target.value as Status })
                    .eq("id", invoice.id);
                  if (mutationError) setError(mutationError.message);
                  else void load();
                }}
                className="rounded-xl border border-[#CDBAD9] bg-[#EEE3FA] px-3 py-2 text-xs font-semibold"
              >
                <option value="sent">Sent</option>
                <option value="received">Received</option>
              </select>
              {invoice.file_url && (
                <a
                  href={invoice.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-[#341F60] px-4 py-2.5 text-center text-xs font-semibold text-white"
                >
                  PDF ↗
                </a>
              )}
              <AdminButton
                tone="secondary"
                onClick={() =>
                  setEditor({
                    invoice,
                    number: invoice.invoice_number,
                    description: invoice.description ?? "",
                    amount: String(invoice.amount),
                    status: invoice.status,
                    issuedDate: invoice.issued_date,
                    dueDate: invoice.due_date ?? "",
                  })
                }
              >
                Edit
              </AdminButton>
              <AdminButton
                tone="danger"
                onClick={() => setDeleteTarget(invoice)}
              >
                Delete
              </AdminButton>
            </article>
          ))
        ) : (
          <AdminEmpty>No invoices yet.</AdminEmpty>
        )}
      </div>

      <AdminModal
        open={Boolean(editor)}
        title="Edit invoice"
        description="Update the invoice details published to the client portal."
        submitLabel="Save changes"
        isSaving={isEditing}
        submitDisabled={
          !editor?.number.trim() ||
          !editor.amount ||
          Number.isNaN(Number(editor.amount)) ||
          !editor.issuedDate ||
          !editor.dueDate
        }
        maxWidth="xl"
        onClose={() => setEditor(null)}
        onSubmit={(event) => {
          event.preventDefault();
          void editInvoice();
        }}
      >
        {editor && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-[#341F60]">
              Invoice number
              <input
                autoFocus
                value={editor.number}
                onChange={(event) =>
                  setEditor({ ...editor, number: event.target.value })
                }
                className={`mt-2 ${inputClass}`}
              />
            </label>
            <label className="text-xs font-semibold text-[#341F60]">
              Amount (CAD)
              <input
                type="number"
                min="0"
                step="0.01"
                value={editor.amount}
                onChange={(event) =>
                  setEditor({ ...editor, amount: event.target.value })
                }
                className={`mt-2 ${inputClass}`}
              />
            </label>
            <label className="text-xs font-semibold text-[#341F60]">
              Status
              <select
                value={editor.status}
                onChange={(event) =>
                  setEditor({
                    ...editor,
                    status: event.target.value as Status,
                  })
                }
                className={`mt-2 ${inputClass}`}
              >
                <option value="sent">Sent</option>
                <option value="received">Received</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-[#341F60]">
              Issued date
              <input
                type="date"
                value={editor.issuedDate}
                onChange={(event) =>
                  setEditor({ ...editor, issuedDate: event.target.value })
                }
                className={`mt-2 ${inputClass}`}
              />
            </label>
            <label className="text-xs font-semibold text-[#341F60]">
              Due date
              <input
                type="date"
                value={editor.dueDate}
                onChange={(event) =>
                  setEditor({ ...editor, dueDate: event.target.value })
                }
                className={`mt-2 ${inputClass}`}
              />
            </label>
            <div className="flex items-end">
              <AdminButton
                type="button"
                tone="secondary"
                onClick={() =>
                  setEditor({
                    ...editor,
                    dueDate: net15(editor.issuedDate),
                  })
                }
              >
                Set due date: Net 15
              </AdminButton>
            </div>
            <label className="text-xs font-semibold text-[#341F60] sm:col-span-2">
              Description
              <textarea
                rows={3}
                value={editor.description}
                onChange={(event) =>
                  setEditor({ ...editor, description: event.target.value })
                }
                className={`mt-2 resize-y ${inputClass}`}
              />
            </label>
          </div>
        )}
      </AdminModal>

      <AdminConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete invoice?"
        description={`This permanently removes invoice ${deleteTarget?.invoice_number ?? ""} and its uploaded PDF.`}
        isWorking={isDeleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void removeInvoice()}
      />
    </main>
  );
}
