"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAdmin } from "../_components/AdminContext";
import {
  AdminButton,
  AdminConfirmDialog,
  AdminEmpty,
  AdminMessage,
  AdminPageHeader,
} from "../_components/AdminUi";

type ApprovalSource = "social" | "deliverable";
type PortalApproval = {
  id: string;
  source: ApprovalSource;
  category: "Social media" | "Branding" | "Event";
  title: string;
  status: "Awaiting review" | "Approved" | "Changes requested";
  workflowStatus: string | null;
  sentAt: string;
  workspaceId: string | null;
};

type SocialRow = {
  id: string;
  title: string;
  status: string;
  publishing_status: string;
  sent_to_client_at: string;
  client_approvals: unknown;
  division_task_id: string | null;
};

type DeliverableRow = {
  id: string;
  title: string;
  sent_to_client_at: string;
  client_approvals: unknown;
  division_task_id: string;
  division_tasks:
    | { division: "branding" | "event" }
    | Array<{ division: "branding" | "event" }>;
};

function approvalStatus(value: unknown): PortalApproval["status"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "Awaiting review";
  }
  const statuses = Object.values(value).flatMap((decision) => {
    if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
      return [];
    }
    const status = (decision as Record<string, unknown>).status;
    return status === "approved" || status === "changes" ? [status] : [];
  });
  if (statuses.includes("changes")) return "Changes requested";
  if (statuses.length > 0 && statuses.every((status) => status === "approved")) {
    return "Approved";
  }
  return "Awaiting review";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function AdminApprovalsPage() {
  const { clientId, clientName } = useAdmin();
  const [approvals, setApprovals] = useState<PortalApproval[]>([]);
  const [removeTarget, setRemoveTarget] = useState<PortalApproval | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clientId) return;
    const [socialResult, deliverableResult] = await Promise.all([
      supabase
        .from("tasks")
        .select(
          "id, title, status, publishing_status, sent_to_client_at, client_approvals, division_task_id",
        )
        .eq("client_id", clientId)
        .not("sent_to_client_at", "is", null)
        .is("posted_at", null)
        .order("sent_to_client_at", { ascending: false }),
      supabase
        .from("division_task_items")
        .select(
          "id, title, sent_to_client_at, client_approvals, division_task_id, division_tasks!inner(client_id, division)",
        )
        .eq("division_tasks.client_id", clientId)
        .in("division_tasks.division", ["branding", "event"])
        .not("sent_to_client_at", "is", null)
        .order("sent_to_client_at", { ascending: false }),
    ]);
    const loadError = socialResult.error ?? deliverableResult.error;
    if (loadError) {
      setError(loadError.message);
      setApprovals([]);
      return;
    }

    const social = ((socialResult.data ?? []) as unknown as SocialRow[]).map(
      (row): PortalApproval => ({
        id: row.id,
        source: "social",
        category: "Social media",
        title: row.title,
        status: approvalStatus(row.client_approvals),
        workflowStatus: row.publishing_status,
        sentAt: row.sent_to_client_at,
        workspaceId: row.division_task_id,
      }),
    );
    const deliverables = (
      (deliverableResult.data ?? []) as unknown as DeliverableRow[]
    ).map((row): PortalApproval => {
      const parent = Array.isArray(row.division_tasks)
        ? row.division_tasks[0]
        : row.division_tasks;
      return {
        id: row.id,
        source: "deliverable",
        category: parent?.division === "branding" ? "Branding" : "Event",
        title: row.title,
        status: approvalStatus(row.client_approvals),
        workflowStatus: null,
        sentAt: row.sent_to_client_at,
        workspaceId: row.division_task_id,
      };
    });
    setApprovals(
      [...social, ...deliverables].sort((a, b) =>
        b.sentAt.localeCompare(a.sentAt),
      ),
    );
    setError(null);
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function removeFromPortal() {
    if (!removeTarget || isRemoving) return;
    if (removeTarget.workflowStatus === "scheduled") {
      setError(
        "Remove this post from Meta’s queue and move it back to client approved in Social Content Calendar first.",
      );
      return;
    }
    setIsRemoving(true);
    const { error: mutationError } = await supabase
      .from(
        removeTarget.source === "social" ? "tasks" : "division_task_items",
      )
      .update({ sent_to_client_at: null, sent_to_client_by: null, client_approvals: {} })
      .eq("id", removeTarget.id);
    setIsRemoving(false);
    if (mutationError) {
      setError(mutationError.message);
      return;
    }
    setSuccess(`${removeTarget.title} was removed from the client review queue.`);
    setRemoveTarget(null);
    void load();
  }

  const pendingCount = approvals.filter(
    (approval) => approval.status === "Awaiting review",
  ).length;

  return (
    <main className="px-5 py-10 sm:px-8 lg:px-10">
      <AdminPageHeader
        title="Approvals"
        description={`The live review cards currently published to ${clientName ?? "this client"}’s portal.`}
      />
      <AdminMessage error={error} success={success} />

      <div className="mt-7 flex flex-wrap gap-3">
        <span className="rounded-full bg-[#EEE3FA] px-3 py-1.5 text-xs font-semibold text-[#5F3378]">
          {approvals.length} on portal
        </span>
        <span className="rounded-full bg-[#FFF4D2] px-3 py-1.5 text-xs font-semibold text-[#7B5A08]">
          {pendingCount} awaiting review
        </span>
      </div>

      <div className="mt-5 overflow-hidden rounded-[22px] border border-[#D7CBE0] bg-white">
        {approvals.length > 0 ? (
          <div className="divide-y divide-[#E4D9EA]">
            {approvals.map((approval) => (
              <article
                key={`${approval.source}-${approval.id}`}
                className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7D4698]">
                    {approval.category}
                  </p>
                  <h2 className="mt-1 text-base font-semibold text-[#341F60]">
                    {approval.title}
                  </h2>
                  <p className="mt-1 text-xs text-[#75647F]">
                    Sent {formatDate(approval.sentAt)}
                  </p>
                </div>
                <span
                  className={`w-fit rounded-full px-3 py-1.5 text-xs font-semibold ${
                    approval.status === "Approved"
                      ? "bg-[#EAF5ED] text-[#356346]"
                      : approval.status === "Changes requested"
                        ? "bg-[#F8ECE8] text-[#875344]"
                        : "bg-[#FFF4D2] text-[#7B5A08]"
                  }`}
                >
                  {approval.status}
                </span>
                <div className="flex flex-wrap gap-2">
                  {approval.workspaceId && (
                    <Link
                      href={
                        approval.source === "social"
                          ? `/team-hub/projects/${approval.workspaceId}/calendar?post=${encodeURIComponent(approval.id)}`
                          : `/team-hub/projects/${approval.workspaceId}`
                      }
                      className="rounded-full bg-[#341F60] px-4 py-2.5 text-xs font-semibold text-white"
                    >
                      Open workspace ↗
                    </Link>
                  )}
                  <AdminButton
                    tone="danger"
                    disabled={approval.workflowStatus === "scheduled"}
                    onClick={() => setRemoveTarget(approval)}
                  >
                    {approval.workflowStatus === "scheduled"
                      ? "Queued in Meta"
                      : "Remove from portal"}
                  </AdminButton>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <AdminEmpty>No items are currently published for review.</AdminEmpty>
        )}
      </div>

      <AdminConfirmDialog
        open={Boolean(removeTarget)}
        title="Remove from client portal?"
        description={`This removes “${removeTarget?.title ?? "this item"}” from the client review queue. Its Team Hub work and approval history remain available.`}
        isWorking={isRemoving}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => void removeFromPortal()}
      />
    </main>
  );
}
