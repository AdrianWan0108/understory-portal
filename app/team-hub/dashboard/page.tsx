"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { teamNameForUsername } from "@/lib/team-assignments";
import {
  WORKSPACE_CLIENTS,
  isWorkspaceClientSlug,
} from "@/lib/workspace-clients";
import { useTeamIdentity } from "../_components/TeamIdentity";

type ClientRow = {
  id: string;
  name: string;
  slug: string;
};

type AssignedTask = {
  id: string;
  source: "project" | "item" | "website" | "social";
  title: string;
  clientName: string;
  clientSlug: string;
  status: string;
  href: string;
  createdAt: string;
  assigneeNames: string[];
};

type DivisionTaskItemRow = {
  id: string;
  title: string;
  completed: boolean;
  assignee_usernames: string[];
  created_at: string;
  division_tasks: {
    id: string;
    client_id: string;
    division: string;
    template_type: string;
  } | null;
};

type DivisionTaskRow = {
  id: string;
  client_id: string;
  division: string;
  title: string;
  status: string;
  template_type: string;
  assignee_usernames: string[];
  created_at: string;
};

type ActivityRow = {
  id: string;
  actor: string;
  action: string;
  target: string;
  client_slug: string | null;
  created_at: string;
};

type Meeting = {
  id: string;
  title: string;
  clientName: string;
  meetingDate: string;
  notes: string | null;
};

type DecisionItem = {
  id: string;
  kind: "task" | "approval" | "document" | "invoice";
  description: string;
  clientName: string;
  href: string;
  createdAt: string;
  priority: number;
};

type WebsiteTaskRow = {
  id: string;
  client_id: string;
  title: string;
  column_status: string;
  assigned_to: string | null;
  created_at: string;
};

type SocialTaskRow = {
  id: string;
  client_id: string;
  title: string;
  status: string;
  assigned_to: string | null;
  assignee_usernames: string[];
  created_at: string;
};

const statusLabels: Record<string, string> = {
  needs_content: "Needs content",
  ux_design: "UX design",
  ui_design: "UI design",
  in_progress: "In progress",
  qa_testing: "QA testing",
  review: "Needs review",
  in_review: "In review",
  for_review: "For review",
  needs_revision: "Needs revision",
  approved: "Approved",
  done: "Live",
  not_started: "Not started",
};

const decisionLabels = {
  task: "Review",
  approval: "Approval",
  document: "Document",
  invoice: "Invoice",
} as const;

function clientNameForSlug(slug: string | null) {
  if (isWorkspaceClientSlug(slug)) return WORKSPACE_CLIENTS[slug].name;
  return slug ? slug.replaceAll("-", " ") : "Internal";
}

function formatStatus(status: string) {
  return (
    statusLabels[status] ??
    status
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function relativeDate(value: string) {
  const difference = new Date(value).getTime() - Date.now();
  const absoluteDifference = Math.abs(difference);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (absoluteDifference < 60 * 60 * 1000) {
    return formatter.format(Math.round(difference / (60 * 1000)), "minute");
  }
  if (absoluteDifference < 24 * 60 * 60 * 1000) {
    return formatter.format(
      Math.round(difference / (60 * 60 * 1000)),
      "hour",
    );
  }
  return formatter.format(
    Math.round(difference / (24 * 60 * 60 * 1000)),
    "day",
  );
}

function taskHref(source: "website" | "social", clientSlug: string) {
  if (!isWorkspaceClientSlug(clientSlug)) return "/team-hub/projects";
  return source === "website"
    ? `/team/website?client=${clientSlug}`
    : `/team/${clientSlug}/social-media/august-content-calendar`;
}

function divisionTaskHref(task: DivisionTaskRow, clientSlug: string) {
  if (task.template_type === "content_calendar") {
    return `/team-hub/projects/${encodeURIComponent(task.id)}/calendar?calendar=${encodeURIComponent(task.id)}`;
  }
  if (task.division === "website" && isWorkspaceClientSlug(clientSlug)) {
    return `/team-hub/projects/website?client=${clientSlug}&task=${encodeURIComponent(task.id)}`;
  }
  return `/team-hub/projects/${encodeURIComponent(task.id)}`;
}

function isToday(value: string) {
  const date = new Date(value);
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function Card({
  id,
  title,
  eyebrow,
  children,
}: {
  id?: string;
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 overflow-hidden rounded-[24px] border border-[#D7CBE0] bg-white shadow-[0_8px_28px_rgba(40,21,79,0.055)]"
    >
      <header className="border-b border-[#E7DDEA] bg-[linear-gradient(135deg,#FFFDF8,#F7F0FB)] px-5 py-5 sm:px-6">
        <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#8B7895]">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[#341F60]">
          {title}
        </h2>
      </header>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}

function SecondaryCard({
  id,
  title,
  eyebrow,
  children,
}: {
  id?: string;
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-[20px] border border-[#E1D7E6] bg-white/70 p-5"
    >
      <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[#9A88A4]">
        {eyebrow}
      </p>
      <h2 className="mt-1 text-base font-semibold tracking-[-0.02em] text-[#4B3765]">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DecisionPriorityPanel({
  decisions,
  isLoading,
  expanded,
  onOpen,
}: {
  decisions: DecisionItem[];
  isLoading: boolean;
  expanded: boolean;
  onOpen: () => void;
}) {
  const hasDecisions = !isLoading && decisions.length > 0;

  return (
    <section
      aria-labelledby="today-priority-title"
      className={`mt-8 overflow-hidden rounded-[28px] border shadow-[0_16px_48px_rgba(40,21,79,0.13)] ${
        hasDecisions
          ? "border-[#5A377A] bg-[#341F60] text-white"
          : "border-[#D7CBE0] bg-[linear-gradient(135deg,#FFFDF8,#F7F0FB)] text-[#341F60]"
      }`}
    >
      <div className="grid gap-6 p-6 sm:p-7 lg:grid-cols-[minmax(0,0.8fr)_minmax(360px,1.2fr)] lg:items-center">
        <div>
          <p
            className={`text-[10px] font-bold uppercase tracking-[0.2em] ${
              hasDecisions ? "text-[#F4CE45]" : "text-[#7D4698]"
            }`}
          >
            Today&rsquo;s priority
          </p>
          <div className="mt-3 flex items-end gap-4">
            <span className="text-5xl font-semibold leading-none tracking-[-0.06em] sm:text-6xl">
              {isLoading ? "—" : decisions.length}
            </span>
            <h2
              id="today-priority-title"
              className="pb-1 text-xl font-semibold tracking-[-0.03em] sm:text-2xl"
            >
              Needs your decision
            </h2>
          </div>
          <p
            className={`mt-4 max-w-xl text-sm leading-6 ${
              hasDecisions ? "text-white/68" : "text-[#75647F]"
            }`}
          >
            {hasDecisions
              ? "Start here: these reviews and approvals are waiting on you before work can move forward."
              : isLoading
                ? "Loading your decision queue."
                : "Nothing is blocked on your decision right now."}
          </p>
          <button
            type="button"
            onClick={onOpen}
            aria-expanded={expanded}
            className={`mt-5 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
              hasDecisions
                ? "bg-[#F4CE45] text-[#341F60] hover:bg-[#FFE57C] focus-visible:outline-[#F4CE45]"
                : "bg-[#341F60] text-white hover:bg-[#4B2A74] focus-visible:outline-[#7D4698]"
            }`}
          >
            Open full queue <span aria-hidden="true">→</span>
          </button>
        </div>

        {hasDecisions && (
          <div className="divide-y divide-white/10 rounded-2xl border border-white/12 bg-white/7 px-4">
            {decisions.slice(0, 3).map((decision) => (
              <Link
                key={decision.id}
                href={decision.href}
                className="group flex items-center gap-3 py-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4CE45]"
              >
                <span className="hidden w-16 shrink-0 rounded-full bg-white/10 px-2 py-1 text-center text-[8px] font-bold uppercase tracking-[0.1em] text-[#F4CE45] sm:inline">
                  {decisionLabels[decision.kind]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">
                    {decision.description}
                  </span>
                  <span className="mt-1 block text-[11px] text-white/55">
                    {decision.clientName} · {relativeDate(decision.createdAt)}
                  </span>
                </span>
                <span className="text-white/35 transition group-hover:translate-x-1 group-hover:text-[#F4CE45]">
                  →
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function PassiveSummary({
  href,
  value,
  label,
}: {
  href: string;
  value: string | number;
  label: string;
}) {
  const isEmpty = value === 0;
  return (
    <a
      href={href}
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition hover:border-[#BFA9CC] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7D4698] ${
        isEmpty
          ? "border-[#E7DDEA] bg-white/45 text-[#9A88A4]"
          : "border-[#D7CBE0] bg-[#FFFDF8] text-[#341F60]"
      }`}
    >
      <span className={`text-xl font-semibold ${isEmpty ? "opacity-55" : ""}`}>
        {value}
      </span>
      <span className="text-xs font-medium">{label}</span>
      <span aria-hidden="true" className="ml-auto text-[#AA98B4]">
        →
      </span>
    </a>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#D7CBE0] bg-[#FFFDF8] px-5 py-8 text-center text-sm leading-6 text-[#75647F]">
      {children}
    </div>
  );
}

function QuietEmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-[#E1D7E6] bg-[#FFFDF8]/60 px-4 py-4 text-xs leading-5 text-[#9A88A4]">
      {children}
    </p>
  );
}

function LoadingRows({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="h-[72px] animate-pulse rounded-2xl bg-[#F1EAF5]"
        />
      ))}
    </div>
  );
}

export default function TeamHubDashboardPage() {
  const { username, name, title, accessLevel, isReady } = useTeamIdentity();
  const [assignedTasks, setAssignedTasks] = useState<AssignedTask[]>([]);
  const [mentionedTasks, setMentionedTasks] = useState<AssignedTask[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [activityTodayCount, setActivityTodayCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadWarnings, setLoadWarnings] = useState<string[]>([]);
  const [isDecisionModalOpen, setIsDecisionModalOpen] = useState(false);

  const isOwner = accessLevel === "owner";

  useEffect(() => {
    if (!isReady || !username || !name || !accessLevel) return;

    let isActive = true;
    const activeUsername = username;
    const activeName = name;

    async function loadDashboard() {
      setIsLoading(true);
      setLoadWarnings([]);

      const [
        clientsResult,
        projectAssignedResult,
        socialAssignedResult,
        itemAssignedResult,
        projectMentionsResult,
        itemMentionsResult,
        websiteMentionsResult,
        socialMentionsResult,
        activityResult,
        meetingsResult,
        websiteReviewResult,
        socialReviewResult,
        documentsResult,
        invoicesResult,
        approvalsResult,
      ] = await Promise.all([
        supabase.from("clients").select("id, name, slug"),
        supabase
          .from("division_tasks")
          .select(
            "id, client_id, division, title, status, template_type, assignee_usernames, created_at",
          )
          .contains(
            isOwner ? "watcher_usernames" : "assignee_usernames",
            [activeUsername],
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("tasks")
          .select(
            "id, client_id, title, status, assigned_to, assignee_usernames, created_at",
          )
          .contains(
            isOwner ? "watcher_usernames" : "assignee_usernames",
            [activeUsername],
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("division_task_items")
          .select(
            "id, title, completed, assignee_usernames, created_at, division_tasks!inner(id, client_id, division, template_type)",
          )
          .contains(
            isOwner ? "watcher_usernames" : "assignee_usernames",
            [activeUsername],
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("division_tasks")
          .select(
            "id, client_id, division, title, status, template_type, assignee_usernames, created_at",
          )
          .contains("mentioned_usernames", [activeUsername])
          .order("created_at", { ascending: false }),
        supabase
          .from("division_task_items")
          .select(
            "id, title, completed, assignee_usernames, created_at, division_tasks!inner(id, client_id, division, template_type)",
          )
          .contains("mentioned_usernames", [activeUsername])
          .order("created_at", { ascending: false }),
        supabase
          .from("website_tasks")
          .select(
            "id, client_id, title, column_status, assigned_to, created_at",
          )
          .contains("mentioned_usernames", [activeUsername])
          .order("created_at", { ascending: false }),
        supabase
          .from("tasks")
          .select(
            "id, client_id, title, status, assigned_to, assignee_usernames, created_at",
          )
          .contains("mentioned_usernames", [activeUsername])
          .order("created_at", { ascending: false }),
        supabase
          .from("team_activity_log")
          .select("id, actor, action, target, client_slug, created_at")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("client_meetings")
          .select("id, client_id, title, meeting_date, notes")
          .gte("meeting_date", new Date().toISOString())
          .order("meeting_date", { ascending: true })
          .limit(6),
        isOwner
          ? supabase
              .from("website_tasks")
              .select(
                "id, client_id, title, column_status, assigned_to, created_at",
              )
              .in("column_status", ["review", "in_review", "for_review"])
              .order("created_at", { ascending: false })
              .limit(20)
          : Promise.resolve({ data: [], error: null }),
        isOwner
          ? supabase
              .from("tasks")
              .select("id, client_id, title, status, assigned_to, created_at")
              .in("status", ["for_review", "in_review"])
              .order("created_at", { ascending: false })
              .limit(20)
          : Promise.resolve({ data: [], error: null }),
        isOwner
          ? supabase
              .from("client_documents")
              .select("id, client_id, file_name, category, created_at")
              .order("created_at", { ascending: false })
              .limit(5)
          : Promise.resolve({ data: [], error: null }),
        isOwner
          ? supabase
              .from("client_invoices")
              .select(
                "id, client_id, invoice_number, file_name, status, created_at",
              )
              .order("created_at", { ascending: false })
              .limit(5)
          : Promise.resolve({ data: [], error: null }),
        isOwner
          ? supabase
              .from("client_approval_categories")
              .select(
                "id, client_id, name, description, route_slug, created_at",
              )
              .eq("status", "approval_needed")
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (!isActive) return;

      const clients = (clientsResult.data ?? []) as ClientRow[];
      const clientsById = new Map(clients.map((client) => [client.id, client]));
      const clientDetails = (clientId: string) =>
        clientsById.get(clientId) ?? {
          id: clientId,
          name: "Client",
          slug: "",
        };

      const projectAssigned = (projectAssignedResult.data ??
        []) as DivisionTaskRow[];
      const socialAssigned = (socialAssignedResult.data ??
        []) as SocialTaskRow[];
      const itemAssigned = (itemAssignedResult.data ??
        []) as unknown as DivisionTaskItemRow[];
      const nextAssignedTasks: AssignedTask[] = [
        ...projectAssigned.map((task) => {
          const client = clientDetails(task.client_id);
          return {
            id: `project-${task.id}`,
            source: "project" as const,
            title: task.title,
            clientName: client.name,
            clientSlug: client.slug,
            status: task.status,
            href: divisionTaskHref(task, client.slug),
            createdAt: task.created_at,
            assigneeNames: task.assignee_usernames
              .map(teamNameForUsername)
              .filter((value): value is string => Boolean(value)),
          };
        }),
        ...socialAssigned.map((task) => {
          const client = clientDetails(task.client_id);
          return {
            id: `social-${task.id}`,
            source: "social" as const,
            title: task.title,
            clientName: client.name,
            clientSlug: client.slug,
            status: task.status,
            href: taskHref("social", client.slug),
            createdAt: task.created_at,
            assigneeNames: task.assignee_usernames
              .map(teamNameForUsername)
              .filter((value): value is string => Boolean(value)),
          };
        }),
        ...itemAssigned.flatMap((item) => {
          const parent = item.division_tasks;
          if (!parent) return [];
          const client = clientDetails(parent.client_id);
          return [{
            id: `item-${item.id}`,
            source: "item" as const,
            title: item.title,
            clientName: client.name,
            clientSlug: client.slug,
            status: item.completed ? "done" : "not_started",
            href: divisionTaskHref(
              {
                ...parent,
                title: item.title,
                status: item.completed ? "done" : "not_started",
                assignee_usernames: item.assignee_usernames,
                created_at: item.created_at,
              },
              client.slug,
            ),
            createdAt: item.created_at,
            assigneeNames: item.assignee_usernames
              .map(teamNameForUsername)
              .filter((value): value is string => Boolean(value)),
          }];
        }),
      ].sort(
        (first, second) =>
          new Date(second.createdAt).getTime() -
          new Date(first.createdAt).getTime(),
      );

      const projectMentions = (projectMentionsResult.data ??
        []) as DivisionTaskRow[];
      const itemMentions = (itemMentionsResult.data ??
        []) as unknown as DivisionTaskItemRow[];
      const websiteMentions = (websiteMentionsResult.data ??
        []) as WebsiteTaskRow[];
      const socialMentions = (socialMentionsResult.data ??
        []) as SocialTaskRow[];
      const nextMentionedTasks: AssignedTask[] = [
        ...projectMentions.map((task) => {
          const client = clientDetails(task.client_id);
          return {
            id: `mention-project-${task.id}`,
            source: "project" as const,
            title: task.title,
            clientName: client.name,
            clientSlug: client.slug,
            status: task.status,
            href: divisionTaskHref(task, client.slug),
            createdAt: task.created_at,
            assigneeNames: task.assignee_usernames
              .map(teamNameForUsername)
              .filter((value): value is string => Boolean(value)),
          };
        }),
        ...itemMentions.flatMap((item) => {
          const parent = item.division_tasks;
          if (!parent) return [];
          const client = clientDetails(parent.client_id);
          return [
            {
              id: `mention-item-${item.id}`,
              source: "item" as const,
              title: item.title,
              clientName: client.name,
              clientSlug: client.slug,
              status: item.completed ? "done" : "not_started",
              href: divisionTaskHref(
                {
                  ...parent,
                  title: item.title,
                  status: item.completed ? "done" : "not_started",
                  assignee_usernames: item.assignee_usernames,
                  created_at: item.created_at,
                },
                client.slug,
              ),
              createdAt: item.created_at,
              assigneeNames: item.assignee_usernames
                .map(teamNameForUsername)
                .filter((value): value is string => Boolean(value)),
            },
          ];
        }),
        ...websiteMentions.map((task) => {
          const client = clientDetails(task.client_id);
          return {
            id: `mention-website-${task.id}`,
            source: "website" as const,
            title: task.title,
            clientName: client.name,
            clientSlug: client.slug,
            status: task.column_status,
            href: `${taskHref("website", client.slug)}&task=${encodeURIComponent(task.id)}`,
            createdAt: task.created_at,
            assigneeNames: task.assigned_to ? [task.assigned_to] : [],
          };
        }),
        ...socialMentions.map((task) => {
          const client = clientDetails(task.client_id);
          return {
            id: `mention-social-${task.id}`,
            source: "social" as const,
            title: task.title,
            clientName: client.name,
            clientSlug: client.slug,
            status: task.status,
            href: `${taskHref("social", client.slug)}?post=${encodeURIComponent(task.id)}`,
            createdAt: task.created_at,
            assigneeNames: task.assignee_usernames
              .map(teamNameForUsername)
              .filter((value): value is string => Boolean(value)),
          };
        }),
      ].sort(
        (first, second) =>
          new Date(second.createdAt).getTime() -
          new Date(first.createdAt).getTime(),
      );

      const assignedTitles = new Set(
        nextAssignedTasks.map((task) => task.title.trim().toLocaleLowerCase()),
      );
      const allRelevantActivities = (
        (activityResult.data ?? []) as ActivityRow[]
      ).filter(
        (activity) =>
          isOwner ||
          activity.actor.toLocaleLowerCase() ===
            activeName.toLocaleLowerCase() ||
          assignedTitles.has(activity.target.trim().toLocaleLowerCase()),
      );
      const nextActivities = allRelevantActivities.slice(0, 5);

      const nextMeetings = (
        (meetingsResult.data ?? []) as Array<{
          id: string;
          client_id: string;
          title: string;
          meeting_date: string;
          notes: string | null;
        }>
      ).map((meeting) => ({
        id: meeting.id,
        title: meeting.title,
        clientName: clientDetails(meeting.client_id).name,
        meetingDate: meeting.meeting_date,
        notes: meeting.notes,
      }));

      const nextDecisions: DecisionItem[] = [];

      if (isOwner) {
        ((websiteReviewResult.data ?? []) as WebsiteTaskRow[]).forEach(
          (task) => {
            const client = clientDetails(task.client_id);
            nextDecisions.push({
              id: `website-${task.id}`,
              kind: "task",
              description: `Review website task “${task.title}”`,
              clientName: client.name,
              href: taskHref("website", client.slug),
              createdAt: task.created_at,
              priority: 0,
            });
          },
        );
        ((socialReviewResult.data ?? []) as SocialTaskRow[]).forEach((task) => {
          const client = clientDetails(task.client_id);
          nextDecisions.push({
            id: `social-${task.id}`,
            kind: "task",
            description: `Review social task “${task.title}”`,
            clientName: client.name,
            href: taskHref("social", client.slug),
            createdAt: task.created_at,
            priority: 0,
          });
        });
        (
          (approvalsResult.data ?? []) as Array<{
            id: string;
            client_id: string;
            name: string;
            description: string | null;
            route_slug: string;
            created_at: string;
          }>
        ).forEach((approval) => {
          nextDecisions.push({
            id: `approval-${approval.id}`,
            kind: "approval",
            description: `${approval.name} approval needed${approval.description ? ` — ${approval.description}` : ""}`,
            clientName: clientDetails(approval.client_id).name,
            href: "/admin/approvals",
            createdAt: approval.created_at,
            priority: 1,
          });
        });
        (
          (documentsResult.data ?? []) as Array<{
            id: string;
            client_id: string;
            file_name: string | null;
            category: string | null;
            created_at: string;
          }>
        ).forEach((document) => {
          nextDecisions.push({
            id: `document-${document.id}`,
            kind: "document",
            description: `Recent document: ${document.file_name ?? document.category ?? "Untitled document"}`,
            clientName: clientDetails(document.client_id).name,
            href: "/admin/documents",
            createdAt: document.created_at,
            priority: 2,
          });
        });
        (
          (invoicesResult.data ?? []) as Array<{
            id: string;
            client_id: string;
            invoice_number: string;
            file_name: string | null;
            status: string;
            created_at: string;
          }>
        ).forEach((invoice) => {
          nextDecisions.push({
            id: `invoice-${invoice.id}`,
            kind: "invoice",
            description: `Recent invoice: ${invoice.file_name ?? `Invoice ${invoice.invoice_number}`}`,
            clientName: clientDetails(invoice.client_id).name,
            href: "/admin/invoices",
            createdAt: invoice.created_at,
            priority: 2,
          });
        });
      }

      nextDecisions.sort((first, second) => {
        if (first.priority !== second.priority) {
          return first.priority - second.priority;
        }
        return (
          new Date(second.createdAt).getTime() -
          new Date(first.createdAt).getTime()
        );
      });

      const warnings = [
        clientsResult.error && "client names",
        projectAssignedResult.error && "project assignments",
        socialAssignedResult.error && "social-media assignments",
        itemAssignedResult.error && "task item assignments",
        projectMentionsResult.error && "project mentions",
        itemMentionsResult.error && "task item mentions",
        websiteMentionsResult.error && "website task mentions",
        socialMentionsResult.error && "social-media mentions",
        activityResult.error && "project updates",
        meetingsResult.error && "upcoming meetings",
        websiteReviewResult.error && "website review items",
        socialReviewResult.error && "social-media review items",
        documentsResult.error && "recent documents",
        invoicesResult.error && "recent invoices",
        approvalsResult.error && "approval items",
      ].filter((warning): warning is string => Boolean(warning));

      setAssignedTasks(nextAssignedTasks);
      setMentionedTasks(nextMentionedTasks);
      setActivities(nextActivities);
      setActivityTodayCount(
        allRelevantActivities.filter((activity) => isToday(activity.created_at))
          .length,
      );
      setMeetings(nextMeetings);
      setDecisions(nextDecisions);
      setLoadWarnings(warnings);
      setIsLoading(false);
    }

    void loadDashboard();
    return () => {
      isActive = false;
    };
  }, [accessLevel, isOwner, isReady, name, username]);

  useEffect(() => {
    if (!isDecisionModalOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsDecisionModalOpen(false);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isDecisionModalOpen]);

  return (
    <main className="px-5 py-10 sm:px-8 sm:py-12 lg:px-12">
      <div className="mx-auto max-w-[1500px]">
        <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7D4698]">
              Team Hub · Your overview
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#28154F] sm:text-4xl">
              Welcome back, {name ?? "team member"}.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#75647F] sm:text-base">
              Your current priorities, updates, and company schedule in one
              place.
            </p>
          </div>
          <div className="self-start rounded-2xl border border-[#D7CBE0] bg-white px-4 py-3 shadow-[0_6px_20px_rgba(40,21,79,0.05)] sm:self-auto">
            <p className="text-sm font-semibold text-[#341F60]">{name}</p>
            <p className="mt-0.5 text-xs text-[#8B7895]">
              {title} · {isOwner ? "Owner access" : "Staff access"}
            </p>
          </div>
        </header>

        {loadWarnings.length > 0 && (
          <div
            role="status"
            className="mt-6 rounded-2xl border border-[#E5C990] bg-[#FFF7E6] px-4 py-3 text-sm leading-6 text-[#805A22]"
          >
            Some dashboard data could not be loaded:{" "}
            {loadWarnings.join(", ")}. If project updates are unavailable, run
            the new team activity SQL script in Supabase.
          </div>
        )}

        <div className="mt-8">
            {isOwner && (
              <>
                <DecisionPriorityPanel
                  decisions={decisions}
                  isLoading={isLoading}
                  expanded={isDecisionModalOpen}
                  onOpen={() => setIsDecisionModalOpen(true)}
                />
                <section
                  aria-label="Dashboard at a glance"
                  className="mt-4 grid gap-3 sm:grid-cols-3"
                >
                  <PassiveSummary
                    href="#assigned-tasks"
                    value={isLoading ? "—" : assignedTasks.length}
                    label="Tasks you’re watching"
                  />
                  <PassiveSummary
                    href="#recent-activity"
                    value={isLoading ? "—" : activityTodayCount}
                    label="Updates today"
                  />
                  <PassiveSummary
                    href="#upcoming-meetings"
                    value={isLoading ? "—" : meetings.length}
                    label="Upcoming meetings"
                  />
                </section>
              </>
            )}

        <div className="mt-8 grid gap-6 xl:grid-cols-5">
          <div className="xl:col-span-3">
          <Card
            id="mentions"
            title={`Mentions${isLoading ? "" : ` (${mentionedTasks.length})`}`}
            eyebrow="Someone tagged you"
          >
            {isLoading ? (
              <LoadingRows />
            ) : mentionedTasks.length > 0 ? (
              <div className="space-y-3">
                {mentionedTasks.map((task) => (
                  <Link
                    key={task.id}
                    href={task.href}
                    className="group flex items-center gap-3 rounded-2xl border border-[#E5DBEA] bg-[#FFFDF8] px-4 py-3.5 transition hover:border-[#BFA9CC] hover:bg-[#FAF5FC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7D4698]"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF1B7] text-sm font-bold text-[#725A00]">
                      @
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[#341F60]">
                        {task.title}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[#8B7895]">
                        <span>{task.clientName}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatStatus(task.status)}</span>
                      </span>
                    </span>
                    <span className="text-[#AA98B4] transition group-hover:translate-x-0.5 group-hover:text-[#7D4698]">
                      →
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState>No one has mentioned you in a task yet.</EmptyState>
            )}
          </Card>
          </div>

          <div className="xl:col-span-2">
          <Card
            id="assigned-tasks"
            title={isOwner ? "Tasks you’re watching" : "Tasks assigned to you"}
            eyebrow="Your work"
          >
            {isLoading ? (
              <LoadingRows />
            ) : assignedTasks.length > 0 ? (
              <div className="space-y-3">
                {assignedTasks.map((task) => (
                  <Link
                    key={task.id}
                    href={task.href}
                    className="group flex items-center gap-3 rounded-2xl border border-[#E5DBEA] bg-[#FFFDF8] px-4 py-3.5 transition hover:border-[#BFA9CC] hover:bg-[#FAF5FC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7D4698]"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#EEE3FA] text-sm font-semibold text-[#7D4698]">
                      {task.source === "project"
                        ? "P"
                        : task.source === "item"
                          ? "I"
                        : task.source === "website"
                          ? "W"
                          : "S"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[#341F60]">
                        {task.title}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[#8B7895]">
                        <span>{task.clientName}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatStatus(task.status)}</span>
                      </span>
                      {isOwner && (
                        <span className="mt-1 block truncate text-[11px] font-medium text-[#695677]">
                          In charge: {task.assigneeNames.join(", ") || "Unassigned"}
                        </span>
                      )}
                    </span>
                    <span className="text-[#AA98B4] transition group-hover:translate-x-0.5 group-hover:text-[#7D4698]">
                      →
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState>
                {isOwner
                  ? "No tasks are being watched right now."
                  : "No tasks assigned to you right now."}
              </EmptyState>
            )}
          </Card>
          </div>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          <SecondaryCard
            id="recent-activity"
            title="Project updates"
            eyebrow="Recent activity"
          >
            {isLoading ? (
              <LoadingRows />
            ) : activities.length > 0 ? (
              <ol className="space-y-4">
                {activities.map((activity) => (
                  <li key={activity.id} className="flex gap-3">
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[#7D4698]" />
                    <div className="min-w-0">
                      <p className="text-sm leading-6 text-[#5F4D70]">
                        <strong className="font-semibold text-[#341F60]">
                          {activity.actor}
                        </strong>{" "}
                        {activity.action}{" "}
                        <span className="font-medium text-[#341F60]">
                          “{activity.target}”
                        </span>
                      </p>
                      <p className="mt-1 text-[11px] text-[#9A88A4]">
                        {clientNameForSlug(activity.client_slug)} ·{" "}
                        {relativeDate(activity.created_at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <QuietEmptyState>
                No project updates related to your work yet.
              </QuietEmptyState>
            )}
          </SecondaryCard>

          <SecondaryCard
            id="upcoming-meetings"
            title="Upcoming meetings"
            eyebrow="Company schedule"
          >
            {isLoading ? (
              <LoadingRows />
            ) : meetings.length > 0 ? (
              <div className="space-y-3">
                {meetings.map((meeting) => (
                  <article
                    key={meeting.id}
                    className="rounded-2xl border border-[#E5DBEA] bg-[#FFFDF8] px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-[#341F60]">
                          {meeting.title}
                        </h3>
                        <p className="mt-1 text-[11px] font-medium text-[#7D4698]">
                          {meeting.clientName}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-[#FFF1B7] px-2.5 py-1 text-[10px] font-semibold text-[#725A00]">
                        {relativeDate(meeting.meetingDate)}
                      </span>
                    </div>
                    <p className="mt-3 text-xs font-medium text-[#695677]">
                      {formatDateTime(meeting.meetingDate)}
                    </p>
                    {meeting.notes && (
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#8B7895]">
                        {meeting.notes}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <QuietEmptyState>No upcoming meetings scheduled.</QuietEmptyState>
            )}
          </SecondaryCard>
        </div>
        </div>
      </div>

      {isOwner && isDecisionModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[#28154F]/65 px-4 py-8 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Close decision queue"
            className="absolute inset-0"
            onClick={() => setIsDecisionModalOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="decision-queue-title"
            className="relative z-10 w-full max-w-4xl overflow-hidden rounded-[28px] border border-white/30 bg-[#341F60] text-white shadow-[0_28px_90px_rgba(40,21,79,0.36)]"
          >
            <header className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-6 sm:px-7">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#F4CE45]">
                  Owner queue
                </p>
                <h2
                  id="decision-queue-title"
                  className="mt-1 text-2xl font-semibold tracking-[-0.03em]"
                >
                  Needs your decision
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">
                  Review-ready work, pending client approvals, and recent
                  uploads that may need attention.
                </p>
              </div>
              <button
                type="button"
                autoFocus
                onClick={() => setIsDecisionModalOpen(false)}
                className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-xl text-white transition hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4CE45]"
              >
                <span aria-hidden="true">×</span>
                <span className="sr-only">Close decision queue</span>
              </button>
            </header>
            <div className="max-h-[68vh] overflow-y-auto p-4 sm:p-5">
              {isLoading ? (
                <LoadingRows count={4} />
              ) : decisions.length > 0 ? (
                <div className="divide-y divide-white/10">
                  {decisions.map((decision) => (
                    <Link
                      key={decision.id}
                      href={decision.href}
                      onClick={() => setIsDecisionModalOpen(false)}
                      className="group flex items-center gap-4 rounded-xl px-3 py-4 transition hover:bg-white/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4CE45]"
                    >
                      <span className="hidden w-20 shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-center text-[9px] font-bold uppercase tracking-[0.12em] text-[#F4CE45] sm:inline">
                        {decisionLabels[decision.kind]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-white">
                          {decision.description}
                        </span>
                        <span className="mt-1 block text-xs text-white/55">
                          {decision.clientName} ·{" "}
                          {relativeDate(decision.createdAt)}
                        </span>
                      </span>
                      <span className="text-lg text-white/40 transition group-hover:translate-x-1 group-hover:text-[#F4CE45]">
                        →
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 px-5 py-10 text-center text-sm text-white/65">
                  Nothing needs your decision right now.
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
