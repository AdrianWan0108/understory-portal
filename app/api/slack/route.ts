import { type NextRequest, NextResponse } from "next/server";
import {
  getTeamIdentityForUsername,
  TEAM_IDENTITIES,
  TEAM_SESSION_COOKIE,
} from "@/lib/team-auth";
import { syncClientReview } from "@/lib/client-review-sync";
import { sendSlackMessage, type SlackWebhookTarget } from "@/lib/slack";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  WORKSPACE_CLIENTS,
  isWorkspaceClientSlug,
  type WorkspaceClientSlug,
} from "@/lib/workspace-clients";

type ClientReviewNotification = {
  type: "client_review";
  clientSlug: "mvp" | "boardwalk";
  action: "approved" | "requested_changes";
  title: string;
  reviewerName: string;
  comment?: string;
  assigneeNames?: string[];
};

type TaskReviewNotification = {
  type: "task_review";
  clientSlug: WorkspaceClientSlug;
  title: string;
};

type ClientInvoiceNotification = {
  type: "client_invoice";
  clientSlug: WorkspaceClientSlug;
  invoiceName: string;
  amount: number;
};

type PayrollInvoiceNotification = {
  type: "payroll_invoice";
  staffUsername: string;
  amount: number;
};

type SlackNotification =
  | ClientReviewNotification
  | TaskReviewNotification
  | ClientInvoiceNotification
  | PayrollInvoiceNotification;

const clientReviewers = {
  mvp: new Set(["Gary", "Dorothy"]),
  boardwalk: new Set(["Sarah"]),
} as const;

function cleanText(value: unknown, maximumLength = 200) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maximumLength) : null;
}

function readAmount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function clientWebhookTarget(
  clientSlug: WorkspaceClientSlug,
): SlackWebhookTarget | null {
  if (clientSlug === "mvp" || clientSlug === "boardwalk") {
    return clientSlug;
  }
  return null;
}

function teamProfileFromRequest(request: NextRequest) {
  const username = request.cookies.get(TEAM_SESSION_COOKIE)?.value;
  const identity = getTeamIdentityForUsername(username);
  return identity ? TEAM_IDENTITIES[identity] : null;
}

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}

function parseNotification(value: unknown): SlackNotification | null {
  if (!value || typeof value !== "object" || !("type" in value)) return null;

  const payload = value as Record<string, unknown>;

  if (payload.type === "client_review") {
    const title = cleanText(payload.title);
    const reviewerName = cleanText(payload.reviewerName, 80);
    const clientSlug = payload.clientSlug;
    const action = payload.action;
    const comment = cleanText(payload.comment, 500) ?? undefined;
    const assigneeNames = Array.isArray(payload.assigneeNames)
      ? payload.assigneeNames
          .map((name) => cleanText(name, 60))
          .filter((name): name is string => Boolean(name))
          .slice(0, 5)
      : undefined;

    if (
      (clientSlug !== "mvp" && clientSlug !== "boardwalk") ||
      (action !== "approved" && action !== "requested_changes") ||
      !title ||
      !reviewerName ||
      !clientReviewers[clientSlug].has(reviewerName)
    ) {
      return null;
    }

    return {
      type: "client_review",
      clientSlug,
      action,
      title,
      reviewerName,
      comment,
      assigneeNames,
    };
  }

  if (payload.type === "task_review") {
    const title = cleanText(payload.title);
    const clientSlug =
      typeof payload.clientSlug === "string" ? payload.clientSlug : null;

    if (!title || !isWorkspaceClientSlug(clientSlug)) return null;
    return { type: "task_review", clientSlug, title };
  }

  if (payload.type === "client_invoice") {
    const invoiceName = cleanText(payload.invoiceName);
    const amount = readAmount(payload.amount);
    const clientSlug =
      typeof payload.clientSlug === "string" ? payload.clientSlug : null;

    if (!invoiceName || amount === null || !isWorkspaceClientSlug(clientSlug)) {
      return null;
    }

    return { type: "client_invoice", clientSlug, invoiceName, amount };
  }

  if (payload.type === "payroll_invoice") {
    const staffUsername = cleanText(payload.staffUsername, 80);
    const amount = readAmount(payload.amount);

    if (!staffUsername || amount === null) return null;
    return { type: "payroll_invoice", staffUsername, amount };
  }

  return null;
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  }

  let notification: SlackNotification | null = null;

  try {
    notification = parseNotification(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  if (!notification) {
    return NextResponse.json(
      { error: "Invalid Slack notification payload." },
      { status: 400 },
    );
  }

  try {
    if (notification.type === "client_review") {
      const clientName = WORKSPACE_CLIENTS[notification.clientSlug].name;
      const supabaseAdmin = getSupabaseAdmin();
      if (!supabaseAdmin) {
        return NextResponse.json(
          { error: "Supabase server configuration is unavailable." },
          { status: 503 },
        );
      }

      await syncClientReview(
        { ...notification, clientName },
        {
          writeActivity: async (activity) => {
            const { error } = await supabaseAdmin
              .from("team_activity_log")
              .insert(activity);
            if (error) throw error;
          },
          sendSlackMessage,
        },
      );
    } else if (notification.type === "task_review") {
      const teamProfile = teamProfileFromRequest(request);
      if (!teamProfile) {
        return NextResponse.json(
          { error: "Team session required." },
          { status: 401 },
        );
      }

      const target = clientWebhookTarget(notification.clientSlug);
      if (!target) {
        return NextResponse.json({ sent: false, reason: "No client webhook." });
      }

      await sendSlackMessage(
        target,
        `${teamProfile.name} submitted '${notification.title}' for review.`,
      );
    } else if (notification.type === "client_invoice") {
      const clientName = WORKSPACE_CLIENTS[notification.clientSlug].name;
      await sendSlackMessage(
        "admin",
        `New invoice uploaded: '${notification.invoiceName}' — $${formatAmount(notification.amount)} for ${clientName}`,
      );
    } else {
      const uploaderProfile = teamProfileFromRequest(request);
      if (!uploaderProfile || uploaderProfile.accessLevel !== "owner") {
        return NextResponse.json(
          { error: "Owner team session required." },
          { status: 401 },
        );
      }

      const staffIdentity = getTeamIdentityForUsername(
        notification.staffUsername,
      );
      if (!staffIdentity) {
        return NextResponse.json(
          { error: "Unknown payroll staff member." },
          { status: 400 },
        );
      }

      await sendSlackMessage(
        "admin",
        `New payroll invoice: ${TEAM_IDENTITIES[staffIdentity].name} — $${formatAmount(notification.amount)}`,
      );
    }
  } catch (error) {
    console.error("Slack webhook request failed:", error);
    return NextResponse.json({ sent: false }, { status: 502 });
  }

  return NextResponse.json({
    sent: true,
    ...(notification.type === "client_review"
      ? { activityLogged: true }
      : {}),
  });
}
