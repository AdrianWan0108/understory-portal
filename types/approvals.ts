export type ApprovalCategory = "social_media" | "event";

export type ApprovalStatus =
  | "awaiting_review"
  | "changes_requested"
  | "approved";

export interface ApprovalItem {
  id: string;
  category: ApprovalCategory;
  client: string;
  title: string;
  caption?: string;
  thumbnailSrc?: string;
  status: ApprovalStatus;
  submittedAt: string;
}

export const categoryConfig: Record<
  ApprovalCategory,
  {
    label: string;
    icon: "instagram" | "calendar";
    groupClassName: string;
  }
> = {
  social_media: {
    label: "Social media",
    icon: "instagram",
    groupClassName: "border-[#E2C75E] bg-[#FFF3B8]/55",
  },
  event: {
    label: "Event",
    icon: "calendar",
    groupClassName: "border-[#A9CCDF] bg-[#EAF5FB]",
  },
};

export const statusConfig: Record<
  ApprovalStatus,
  { label: string; tone: "amber" | "red" | "green" }
> = {
  awaiting_review: { label: "Awaiting review", tone: "amber" },
  changes_requested: { label: "Changes requested", tone: "red" },
  approved: { label: "Approved", tone: "green" },
};
