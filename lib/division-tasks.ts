import type { WorkspaceClientSlug } from "@/lib/workspace-clients";

export const DIVISIONS = [
  "social-media",
  "website",
  "ads",
  "branding",
  "event",
] as const;

export type Division = (typeof DIVISIONS)[number];

export const DIVISION_LABELS: Record<Division, string> = {
  "social-media": "Social media",
  website: "Website",
  ads: "Ads",
  branding: "Branding",
  event: "Event",
};

export const DIVISION_DESCRIPTIONS: Record<Division, string> = {
  "social-media": "Content calendars, production, and social review work.",
  website: "Website planning, page production, QA, and launch work.",
  ads: "Campaign strategy, creative production, and paid-media assets.",
  branding: "Identity, collateral, and visual-system projects.",
  event: "Event planning, promotion, production, and launch materials.",
};

export const DIVISION_TASK_STATUSES = [
  "planning",
  "production",
  "review",
  "approved",
] as const;

export type DivisionTaskStatus = (typeof DIVISION_TASK_STATUSES)[number];

export const DIVISION_TASK_TEMPLATES = [
  "generic",
  "content_brief",
  "content_calendar",
  "internal_approval",
  "analytics_results_hub",
  "website_dashboard",
] as const;

export type DivisionTaskTemplate =
  (typeof DIVISION_TASK_TEMPLATES)[number];

export type ContentBriefData = {
  campaign_goal: string;
  target_audience: string;
  key_messages: string;
  content_pillars: string;
  due_date: string;
};

export const EMPTY_CONTENT_BRIEF_DATA: ContentBriefData = {
  campaign_goal: "",
  target_audience: "",
  key_messages: "",
  content_pillars: "",
  due_date: "",
};

export type FilmingCardData = {
  filming_date: string;
  participants: string[];
  needs_models: boolean;
  script: string;
  prep_work: string;
  footage_drive_link: string;
  filmed: boolean;
  source_reference_id: string;
  source_reference_url: string;
};

export const EMPTY_FILMING_CARD_DATA: FilmingCardData = {
  filming_date: "",
  participants: [],
  needs_models: false,
  script: "",
  prep_work: "",
  footage_drive_link: "",
  filmed: false,
  source_reference_id: "",
  source_reference_url: "",
};

export const FILMING_PARTICIPANTS_BY_CLIENT: Partial<
  Record<WorkspaceClientSlug, string[]>
> = {
  mvp: ["Dorothy", "Gary"],
};

export const DIVISION_TASK_STATUS_DETAILS: Record<
  DivisionTaskStatus,
  { label: string; className: string; dot: string }
> = {
  planning: {
    label: "Not started",
    className: "border-[#DDD5E1] bg-[#F5F2F6] text-[#695E70]",
    dot: "bg-[#9A8FA0]",
  },
  production: {
    label: "In progress",
    className: "border-[#E8CF91] bg-[#FFF4D2] text-[#7B5A08]",
    dot: "bg-[#D3A72B]",
  },
  review: {
    label: "Awaiting approvals",
    className: "border-[#BFCBE7] bg-[#EDF2FF] text-[#405A91]",
    dot: "bg-[#6683C1]",
  },
  approved: {
    label: "Approved",
    className: "border-[#BFD8C7] bg-[#EDF7EF] text-[#356346]",
    dot: "bg-[#6D967A]",
  },
};

export const FIGJAM_DIVISIONS: Division[] = ["ads", "branding", "event"];

export function isDivision(value: string): value is Division {
  return DIVISIONS.includes(value as Division);
}

export function isDivisionTaskStatus(
  value: string,
): value is DivisionTaskStatus {
  return DIVISION_TASK_STATUSES.includes(value as DivisionTaskStatus);
}

export function isDivisionTaskTemplate(
  value: string,
): value is DivisionTaskTemplate {
  return DIVISION_TASK_TEMPLATES.includes(value as DivisionTaskTemplate);
}

export function normalizeContentBriefData(
  value: unknown,
): ContentBriefData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...EMPTY_CONTENT_BRIEF_DATA };
  }

  const record = value as Record<string, unknown>;
  return {
    campaign_goal:
      typeof record.campaign_goal === "string" ? record.campaign_goal : "",
    target_audience:
      typeof record.target_audience === "string"
        ? record.target_audience
        : "",
    key_messages:
      typeof record.key_messages === "string" ? record.key_messages : "",
    content_pillars:
      typeof record.content_pillars === "string"
        ? record.content_pillars
        : "",
    due_date: typeof record.due_date === "string" ? record.due_date : "",
  };
}

export function normalizeFilmingCardData(
  value: unknown,
): FilmingCardData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...EMPTY_FILMING_CARD_DATA };
  }

  const record = value as Record<string, unknown>;
  return {
    filming_date:
      typeof record.filming_date === "string" ? record.filming_date : "",
    participants: Array.isArray(record.participants)
      ? record.participants.filter(
          (participant): participant is string =>
            typeof participant === "string",
        )
      : [],
    needs_models: record.needs_models === true,
    script: typeof record.script === "string" ? record.script : "",
    prep_work:
      typeof record.prep_work === "string" ? record.prep_work : "",
    footage_drive_link:
      typeof record.footage_drive_link === "string"
        ? record.footage_drive_link
        : "",
    filmed: record.filmed === true,
    source_reference_id:
      typeof record.source_reference_id === "string"
        ? record.source_reference_id
        : "",
    source_reference_url:
      typeof record.source_reference_url === "string"
        ? record.source_reference_url
        : "",
  };
}

export function specializedDivisionHref(
  division: Division,
  client: WorkspaceClientSlug,
  taskId?: string,
  templateType?: DivisionTaskTemplate,
) {
  if (
    division === "social-media" &&
    templateType === "content_calendar" &&
    taskId
  ) {
    return `/team-hub/projects/${encodeURIComponent(taskId)}/calendar?calendar=${encodeURIComponent(taskId)}`;
  }

  if (
    division === "social-media" &&
    templateType === "internal_approval" &&
    taskId
  ) {
    return `/team-hub/projects/${encodeURIComponent(taskId)}/internal-approval`;
  }

  if (division === "website") {
    const taskQuery = taskId
      ? `&task=${encodeURIComponent(taskId)}`
      : "";
    return `/team-hub/projects/website?client=${client}${taskQuery}`;
  }

  return null;
}
