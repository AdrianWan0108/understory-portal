"use client";

/* eslint-disable @next/next/no-img-element */

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  readTeamSessionProfile,
  type TeamAccessLevel,
} from "@/app/team-hub/_components/TeamIdentity";
import {
  TeamButton,
  TeamModal,
  teamInputClass,
} from "@/app/team-hub/_components/TeamHubUi";
import {
  TaskPeopleButton,
  TaskPeopleModal,
  useTaskTeamMembers,
  type TaskTeamMember,
} from "@/app/team-hub/projects/_components/TaskPeoplePicker";
import {
  WORKSPACE_CLIENTS,
  isWorkspaceClientSlug,
} from "@/lib/workspace-clients";
import { projectClientInitial } from "@/lib/project-client-theme";
import { sendSlackNotification } from "@/lib/slack-notifications";
import {
  normalizeAssigneeUsernames,
  teamNameForUsername,
  teamUsernameForName,
} from "@/lib/team-assignments";
import {
  EMPTY_REEL_DETAILS,
  PROJECT_ASSIGNEES,
  SOCIAL_POST_FORMATS,
  SOCIAL_POST_FORMAT_LABELS,
  isSocialPostFormat,
  normalizeReelDetails,
  type ReelDetails,
  type SocialPostFormat,
} from "@/lib/social-content";
import { UnderstoryBrand } from "../../../_components/UnderstoryBrand";

const SLIDE_IMAGE_BUCKET = "client-assets";
const MAX_SLIDE_IMAGE_BYTES = 20 * 1024 * 1024;

type PostStatus =
  | "not_started"
  | "for_review"
  | "needs_revision"
  | "approved";

type ReferencePlatform = "pinterest" | "instagram" | "other";

type SlideReference = {
  id: string;
  url: string;
  platform: ReferencePlatform;
};

type Slide = {
  id: string;
  slideNumber: number;
  onScreenText: string;
  visualNote: string;
  slideCaption?: string;
  warningFlag?: string;
  imageUrl?: string;
  references: SlideReference[];
};

type Post = {
  id: number;
  databaseId: string;
  title: string;
  brief: string;
  status: PostStatus;
  format: SocialPostFormat;
  postCaption: string;
  visualNote: string;
  reelDetails: ReelDetails;
  assignedTo: string | null;
  assigneeUsernames: string[];
  watcherUsernames: string[];
  slides: Slide[];
};

type SlideReferenceRow = {
  id: string;
  url: string;
  platform: string;
};

type TaskSlideRow = {
  id: string;
  slide_number: number;
  on_screen_text: string;
  visual_note: string;
  slide_caption: string | null;
  warning_flag: string | null;
  image_url: string | null;
  slide_references: SlideReferenceRow[] | null;
};

function isReferencePlatform(value: string): value is ReferencePlatform {
  return value === "pinterest" || value === "instagram" || value === "other";
}

function detectReferencePlatform(url: string): ReferencePlatform {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname.includes("pinterest.") || hostname.includes("pin.it")) {
      return "pinterest";
    }
    if (hostname.includes("instagram.com")) return "instagram";
    return "other";
  } catch {
    return "other";
  }
}

type TaskRow = {
  id: string;
  title: string;
  brief: string;
  status: string;
  format: string;
  post_caption: string;
  visual_note: string | null;
  reel_details: unknown;
  assigned_to: string | null;
  assignee_usernames: string[] | null;
  watcher_usernames: string[] | null;
  created_at: string;
  task_slides: TaskSlideRow[] | null;
};

function isPostStatus(status: string): status is PostStatus {
  return ["not_started", "for_review", "needs_revision", "approved"].includes(
    status,
  );
}

function mapTaskRows(rows: TaskRow[]): Post[] {
  return rows.map((task, index) => ({
    id: index + 1,
    databaseId: task.id,
    title: task.title,
    brief: task.brief,
    status: isPostStatus(task.status) ? task.status : "not_started",
    format: isSocialPostFormat(task.format) ? task.format : "carousel",
    postCaption: task.post_caption,
    visualNote: task.visual_note ?? "",
    reelDetails: normalizeReelDetails(task.reel_details),
    assignedTo: task.assigned_to,
    assigneeUsernames: normalizeAssigneeUsernames(
      task.assignee_usernames,
      task.assigned_to,
    ),
    watcherUsernames: task.watcher_usernames ?? [],
    slides: (task.task_slides ?? [])
      .sort((a, b) => a.slide_number - b.slide_number)
      .map((slide) => ({
        id: slide.id,
        slideNumber: slide.slide_number,
        onScreenText: slide.on_screen_text,
        visualNote: slide.visual_note,
        slideCaption: slide.slide_caption ?? "",
        warningFlag: slide.warning_flag ?? undefined,
        imageUrl: slide.image_url ?? undefined,
        references: (slide.slide_references ?? []).map((reference) => ({
          id: reference.id,
          url: reference.url,
          platform: isReferencePlatform(reference.platform)
            ? reference.platform
            : "other",
        })),
      })),
  }));
}

const statusDetails: Record<
  PostStatus,
  { label: string; className: string; dot: string }
> = {
  not_started: {
    label: "Not started",
    className: "border-[#DED0E7] bg-white text-[#695677]",
    dot: "bg-[#A693AF]",
  },
  for_review: {
    label: "For review",
    className: "border-[#E3C687] bg-[#FFF6E2] text-[#805B21]",
    dot: "bg-[#D09A3B]",
  },
  needs_revision: {
    label: "Needs revision",
    className: "border-[#E5C990] bg-[#FFF7E6] text-[#855F20]",
    dot: "bg-[#D19C3F]",
  },
  approved: {
    label: "Approved",
    className: "border-[#BBD3C2] bg-[#EDF7F0] text-[#477156]",
    dot: "bg-[#669B78]",
  },
};

function StatusBadge({ status }: { status: PostStatus }) {
  const details = statusDetails[status];

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${details.className}`}
    >
      <span className={`size-1.5 rounded-full ${details.dot}`} />
      {details.label}
    </span>
  );
}

const slidePalettes = [
  ["#341F60", "#D8C2E9"],
  ["#7D4698", "#E2D1F0"],
  ["#5F3378", "#D9C5E9"],
  ["#49306C", "#E7DAF2"],
] as const;

function getCardCoverImage(post: Post) {
  const coverLink = [...post.slides].sort(
    (first, second) => first.slideNumber - second.slideNumber,
  )[0]?.imageUrl;
  return getImagePreviewUrl(coverLink);
}

function extractGoogleDriveFileId(value: string) {
  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase();
    if (
      hostname !== "drive.google.com" &&
      hostname !== "docs.google.com"
    ) {
      return null;
    }

    const pathMatch = url.pathname.match(/\/d\/([^/]+)/);
    return pathMatch?.[1] ?? url.searchParams.get("id");
  } catch {
    return null;
  }
}

function getImagePreviewUrl(rawUrl: string | null | undefined) {
  if (!rawUrl) return null;
  const fileId = extractGoogleDriveFileId(rawUrl);
  return fileId
    ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1000`
    : rawUrl;
}

function sanitizeUploadFileName(fileName: string) {
  const sanitized = fileName
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return sanitized || "slide-image";
}

function getSlideImageStoragePath(fileUrl: string | null | undefined) {
  if (!fileUrl) return null;

  try {
    const url = new URL(fileUrl);
    const marker = `/storage/v1/object/public/${SLIDE_IMAGE_BUCKET}/`;
    const markerIndex = url.pathname.indexOf(marker);

    if (markerIndex === -1) return null;
    return decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
  } catch {
    return null;
  }
}

function Icon({
  name,
  className = "size-5",
}: {
  name:
    | "arrow"
    | "chevron"
    | "close"
    | "warning"
    | "instagram"
    | "check"
    | "link"
    | "upload";
  className?: string;
}) {
  const paths = {
    arrow: <path d="m15 18-6-6 6-6" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    close: <path d="M18 6 6 18M6 6l12 12" />,
    warning: (
      <>
        <path d="M10.3 3.7 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4M12 17h.01" />
      </>
    ),
    instagram: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <path d="M17.5 6.5h.01" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    link: (
      <>
        <path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
        <path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4M7 9l5-5 5 5" />
        <path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function PreviewImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const hasFailed = failedSrc === src;

  if (hasFailed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-[#F0E8F6] px-6 text-center text-xs leading-5 text-[#695677]">
        <div className="max-w-[260px]">
          <Icon name="warning" className="mx-auto mb-2 size-5 text-[#A57731]" />
          Image couldn&apos;t load — check that the link is public or upload the
          image directly.
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailedSrc(src)}
    />
  );
}

function SlideImageInput({
  value,
  label,
  onSave,
  onClear,
}: {
  value?: string;
  label: string;
  onSave: (link: string) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);

  function submitLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedLink = draft.trim();
    if (!extractGoogleDriveFileId(trimmedLink)) {
      setValidationError("Paste a valid Google Drive file link.");
      return;
    }

    setValidationError(null);
    onSave(trimmedLink);
  }

  return (
    <div className="min-w-0">
      <form onSubmit={submitLink} className="flex items-center gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">{label}</span>
          <span className="relative block">
            <Icon
              name="link"
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#8B7895]"
            />
            <input
              type="url"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setValidationError(null);
              }}
              placeholder="Paste Google Drive image link"
              className="h-9 w-full rounded-full border border-[#DED0E7] bg-white pl-8 pr-3 text-[11px] text-[#4F3D69] outline-none transition placeholder:text-[#A18DAA] focus:border-[#7D4698] focus:ring-2 focus:ring-[#7D4698]/20"
            />
          </span>
        </label>
        <button
          type="submit"
          aria-label={`Save ${label}`}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#7D4698] text-white shadow-sm transition hover:bg-[#6A3A82] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7D4698]"
        >
          <Icon name="check" className="size-4" />
        </button>
        {value && (
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 rounded-full border border-[#DED0E7] bg-white px-3 py-2 text-[11px] font-semibold text-[#75647F] transition hover:border-[#C7B3D2] hover:bg-[#F5EEFA] hover:text-[#4F3D69] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7D4698]"
          >
            Clear
          </button>
        )}
      </form>
      {validationError && (
        <p className="mt-1.5 text-[10px] text-[#9A5E42]">{validationError}</p>
      )}
    </div>
  );
}

function SlideImageUploadButton({
  onUpload,
}: {
  onUpload: (file: File) => Promise<string | null>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function uploadImage(file: File | undefined) {
    if (!file || isUploading) return;
    if (!file.type.startsWith("image/")) {
      setValidationError("Choose an image file to upload.");
      return;
    }
    if (file.size > MAX_SLIDE_IMAGE_BYTES) {
      setValidationError("Choose an image smaller than 20 MB.");
      return;
    }

    setIsUploading(true);
    setValidationError(null);
    try {
      const uploadError = await onUpload(file);
      setValidationError(uploadError);
    } catch {
      setValidationError("The image could not be uploaded. Please try again.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(event) => void uploadImage(event.target.files?.[0])}
        />
        <button
          type="button"
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#CDB9D8] bg-[#F8F3FB] px-3 py-2 text-[11px] font-semibold text-[#5F4D70] transition hover:border-[#B99CC8] hover:bg-[#EEE3FA] disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7D4698]"
        >
          <Icon name="upload" className="size-3.5" />
          {isUploading ? "Uploading…" : "Upload image"}
        </button>
        <span className="text-[10px] text-[#A18DAA]">Images · max 20 MB</span>
      </div>
      {validationError && (
        <p className="mt-1.5 text-[10px] text-[#9A5E42]">{validationError}</p>
      )}
    </div>
  );
}

declare global {
  interface Window {
    PinUtils?: { build: () => void };
  }
}

let pinterestWidgetPromise: Promise<void> | null = null;

function loadPinterestWidget(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.PinUtils) return Promise.resolve();
  if (!pinterestWidgetPromise) {
    pinterestWidgetPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://assets.pinterest.com/js/pinit.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => resolve();
      document.body.appendChild(script);
    });
  }
  return pinterestWidgetPromise;
}

function ReferenceInput({ onAdd }: { onAdd: (url: string) => void }) {
  const [draft, setDraft] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedLink = draft.trim();
    try {
      new URL(trimmedLink);
    } catch {
      setValidationError("Paste a valid link.");
      return;
    }
    setValidationError(null);
    onAdd(trimmedLink);
    setDraft("");
  }

  return (
    <div>
      <form onSubmit={submit} className="flex items-center gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Reference link</span>
          <span className="relative block">
            <Icon
              name="link"
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#8B7895]"
            />
            <input
              type="url"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setValidationError(null);
              }}
              placeholder="Paste Figma, Pinterest, or Instagram link"
              className="h-9 w-full rounded-full border border-[#DED0E7] bg-white pl-8 pr-3 text-[11px] text-[#4F3D69] outline-none transition placeholder:text-[#A18DAA] focus:border-[#7D4698] focus:ring-2 focus:ring-[#7D4698]/20"
            />
          </span>
        </label>
        <button
          type="submit"
          aria-label="Add reference"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#7D4698] text-white shadow-sm transition hover:bg-[#6A3A82] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7D4698]"
        >
          <Icon name="check" className="size-4" />
        </button>
      </form>
      {validationError && (
        <p className="mt-1.5 text-[10px] text-[#9A5E42]">{validationError}</p>
      )}
    </div>
  );
}

function ReferenceCell({
  reference,
  canManage,
  onDelete,
}: {
  reference: SlideReference;
  canManage: boolean;
  onDelete: () => void;
}) {
  const uploadedImagePath = getSlideImageStoragePath(reference.url);
  const isFigmaReference = (() => {
    try {
      const hostname = new URL(reference.url).hostname.toLowerCase();
      return hostname === "figma.com" || hostname.endsWith(".figma.com");
    } catch {
      return false;
    }
  })();

  useEffect(() => {
    if (reference.platform !== "pinterest") return;
    let cancelled = false;
    void loadPinterestWidget().then(() => {
      if (!cancelled) window.PinUtils?.build();
    });
    return () => {
      cancelled = true;
    };
  }, [reference.platform]);

  return (
    <div className="group relative aspect-[3/4] overflow-hidden rounded-xl border border-[#E3D8EA] bg-white">
      {uploadedImagePath ? (
        <a
          href={reference.url}
          target="_blank"
          rel="noreferrer"
          aria-label="Open uploaded reference image"
          className="block h-full w-full"
        >
          <PreviewImage
            src={reference.url}
            alt="Uploaded visual reference"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <span className="absolute bottom-2 right-2 rounded-full bg-[#7D4698]/90 px-2 py-1 text-[9px] font-semibold text-white backdrop-blur-sm">
            Image
          </span>
        </a>
      ) : reference.platform === "pinterest" ? (
        <a data-pin-do="embedPin" data-pin-width="small" href={reference.url}>
          {reference.url}
        </a>
      ) : (
        <a
          href={reference.url}
          target="_blank"
          rel="noreferrer"
          className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center text-[#7D4698] transition hover:bg-[#F5EEFA]"
        >
          <Icon
            name={reference.platform === "instagram" ? "instagram" : "link"}
            className="size-4"
          />
          <span className="text-[9px] font-semibold uppercase tracking-[0.06em]">
            {reference.platform === "instagram"
              ? "Instagram"
              : isFigmaReference
                ? "Figma"
                : "Reference"}
          </span>
        </a>
      )}
      {canManage && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="Remove reference"
          className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition group-hover:opacity-100"
        >
          <Icon name="close" className="size-3" />
        </button>
      )}
    </div>
  );
}

function PostCard({
  post,
  status,
  onSubmitForReview,
  onCancelSubmission,
  onOpen,
  canManage,
  members,
  onManagePeople,
  onEdit,
  onDelete,
  confirmDelete,
}: {
  post: Post;
  status: PostStatus;
  onSubmitForReview: () => void;
  onCancelSubmission: () => void;
  onOpen: () => void;
  canManage: boolean;
  members: TaskTeamMember[];
  onManagePeople: () => void;
  onEdit: () => void;
  onDelete: () => void;
  confirmDelete: boolean;
}) {
  const cardCoverImage = getCardCoverImage(post);
  const watcherNames = post.watcherUsernames
    .map(
      (username) =>
        members.find((member) => member.team_username === username)?.full_name,
    )
    .filter((name): name is string => Boolean(name));
  const assignedNames = post.assigneeUsernames
    .map(
      (username) =>
        members.find((member) => member.team_username === username)?.full_name ??
        username,
    )
    .filter(Boolean);
  const assignmentLabel =
    assignedNames.join(", ") || post.assignedTo || "Unassigned";
  const [coverPrimary, coverSecondary] =
    slidePalettes[(post.id - 1) % slidePalettes.length];

  return (
    <article
      className="group relative w-[78vw] max-w-[310px] shrink-0 snap-start cursor-pointer overflow-hidden rounded-[22px] border border-[#E3D8EA] bg-white shadow-[0_8px_30px_rgba(52,31,96,0.06)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_16px_42px_rgba(52,31,96,0.11)] sm:w-[310px]"
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${post.title}`}
        className="absolute inset-0 z-10 rounded-[24px] focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[#7D4698]"
      />
      <div className="relative aspect-[4/5] overflow-hidden bg-[#EEE3FA]">
        {cardCoverImage ? (
          <>
            <PreviewImage
              src={cardCoverImage}
              alt={`Cover image for ${post.title}`}
              className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#341F60]/30 via-transparent to-transparent" />
          </>
        ) : (
          <div
            role="img"
            aria-label={`Pending visuals upload for ${post.title}`}
            className="absolute inset-0 flex items-center justify-center px-8 text-center"
            style={{
              backgroundImage: `linear-gradient(145deg, ${coverSecondary} 0%, #FFF9EF 55%, ${coverPrimary} 160%)`,
            }}
          >
            <span className="rounded-full border border-white/55 bg-white/55 px-4 py-2 text-xs font-medium tracking-[0.01em] text-[#695677] backdrop-blur-sm">
              Pending visuals upload
            </span>
          </div>
        )}
        <span className="absolute left-4 top-4 rounded-full border border-white/60 bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#4F3D69] backdrop-blur">
          {SOCIAL_POST_FORMAT_LABELS[post.format]} · Post{" "}
          {String(post.id).padStart(2, "0")}
        </span>
        <span
          className={`absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-semibold ${statusDetails[status].className}`}
        >
          <span className={`size-1.5 rounded-full ${statusDetails[status].dot}`} />
          {statusDetails[status].label}
        </span>
        <span className="absolute bottom-4 left-4 max-w-[58%] truncate rounded-full border border-white/50 bg-white/85 px-2.5 py-1 text-[9px] font-semibold text-[#4F3D69] backdrop-blur-sm">
          Assigned · {assignmentLabel}
        </span>
        <span className="absolute bottom-4 right-4 rounded-full bg-[#7D4698]/90 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur">
          {post.format === "carousel"
            ? `${post.slides.length} slides`
            : SOCIAL_POST_FORMAT_LABELS[post.format]}
        </span>
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-base font-semibold tracking-[-0.02em] text-[#341F60] sm:text-lg">
            {post.title}
          </h2>
          <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full border border-[#E3D8EA] text-[#75647F] transition group-hover:border-[#C7B3D2] group-hover:bg-[#EEE3FA] group-hover:text-[#7D4698]">
            <Icon name="chevron" className="size-4" />
          </span>
        </div>
        <p className="mt-2 line-clamp-3 min-h-[60px] text-[13px] leading-5 text-[#75647F]">
          {post.brief}
        </p>
        {(status === "not_started" || status === "for_review") && (
          <div className="relative z-20 mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-[#F0E9F5] pt-4">
            {status === "not_started" && (
              <button
                type="button"
                onClick={onSubmitForReview}
                className="rounded-full bg-[#7D4698] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#6A3A82] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7D4698]"
              >
                Submit for review
              </button>
            )}
            {status === "for_review" && (
              <button
                type="button"
                onClick={onCancelSubmission}
                className="rounded-full border border-[#D9C28F] bg-white px-4 py-2 text-xs font-semibold text-[#765421] shadow-sm transition hover:border-[#C6A966] hover:bg-[#FFFAF0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C69A48]"
              >
                Cancel submission
              </button>
            )}
          </div>
        )}
        <div className="relative z-20 mt-4 flex flex-wrap items-center gap-2">
          {canManage ? (
            <>
              <TaskPeopleButton
                taskTitle={post.title}
                assigneeUsernames={post.assigneeUsernames}
                members={members}
                onClick={onManagePeople}
              />
              <TeamButton type="button" tone="secondary" onClick={onEdit}>
                Edit
              </TeamButton>
              <TeamButton type="button" tone="danger" onClick={onDelete}>
                {confirmDelete ? "Confirm delete?" : "Delete"}
              </TeamButton>
            </>
          ) : (
            <TaskPeopleButton
              taskTitle={post.title}
              assigneeUsernames={post.assigneeUsernames}
              members={members}
              disabled
              onClick={() => undefined}
            />
          )}
        </div>
        {watcherNames.length > 0 && (
          <p className="relative z-20 mt-2 text-[10px] text-[#8B7895]">
            {watcherNames.join(" + ")} watching
          </p>
        )}
      </div>
    </article>
  );
}

function SlidePreview({
  post,
  slide,
  slideIndex,
  totalSlides,
  previewUrl,
  clientLabel,
  clientInitial,
  onImageSave,
  onReferenceImageUpload,
  onClearImage,
  onEdit,
  onAddReference,
  onDeleteReference,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragging,
  isDragTarget,
  isReordering,
  canManage,
}: {
  post: Post;
  slide: Slide;
  slideIndex: number;
  totalSlides: number;
  previewUrl?: string;
  clientLabel: string;
  clientInitial: string;
  onImageSave: (link: string) => void;
  onReferenceImageUpload: (file: File) => Promise<string | null>;
  onClearImage: () => void;
  onEdit: () => void;
  onAddReference: (url: string) => void;
  onDeleteReference: (referenceId: string) => void;
  onDragStart: (event: React.DragEvent<HTMLButtonElement>) => void;
  onDragOver: (event: React.DragEvent<HTMLElement>) => void;
  onDrop: (event: React.DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  isDragTarget: boolean;
  isReordering: boolean;
  canManage: boolean;
}) {
  const [primary, secondary] = slidePalettes[(post.id - 1) % slidePalettes.length];
  const textParts = slide.onScreenText.split(" / ");
  const previewImageUrl = getImagePreviewUrl(previewUrl);

  return (
    <article
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`w-[78vw] max-w-[330px] shrink-0 snap-center rounded-[22px] transition sm:w-[330px] ${
        isDragTarget
          ? "ring-2 ring-[#7D4698] ring-offset-4 ring-offset-[#FFF9EF]"
          : ""
      } ${isDragging ? "opacity-45" : ""}`}
    >
      <div
        className="relative aspect-[4/5] overflow-hidden rounded-[22px] shadow-[0_18px_45px_rgba(52,31,96,0.16)]"
        style={{ backgroundColor: primary }}
      >
        {previewImageUrl ? (
          <PreviewImage
            src={previewImageUrl}
            alt={`Design for slide ${slideIndex + 1} of ${post.title}`}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <>
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `linear-gradient(145deg, ${secondary} 0%, #FFF9EF 55%, ${primary} 160%)`,
              }}
            />
            <div
              className="absolute -right-[14%] -top-[6%] size-[48%] rounded-full opacity-20 blur-sm"
              style={{ backgroundColor: secondary }}
            />
            <div className="absolute left-5 top-5 flex items-center gap-2 rounded-full border border-white/60 bg-white/75 px-2.5 py-1.5 text-[#4F3D69] backdrop-blur-sm">
              <span className="flex size-5 items-center justify-center rounded-full border border-[#CDB9D8] text-[7px] font-semibold tracking-[0.12em]">
                {clientInitial}
              </span>
              <span className="text-[9px] font-semibold uppercase tracking-[0.16em]">
                {clientLabel}
              </span>
            </div>
            <div className="absolute inset-0 flex items-center justify-center px-7 py-16">
              <div className="max-h-[60%] max-w-[88%] space-y-1.5 overflow-y-auto break-words rounded-2xl border border-white/60 bg-white/80 px-4 py-3 text-center shadow-[0_8px_24px_rgba(52,31,96,0.12)] backdrop-blur-sm">
                {textParts.map((part, index) => (
                  <p
                    key={`${slide.slideNumber}-${index}`}
                    className={
                      index === 0
                        ? "text-xs font-semibold leading-5 text-[#4F3D69]"
                        : "text-[11px] font-medium leading-4 text-[#75647F]"
                    }
                  >
                    {part || "Pending on-screen text"}
                  </p>
                ))}
              </div>
            </div>
          </>
        )}
        <span className="absolute right-5 top-5 rounded-full border border-white/60 bg-white/85 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#4F3D69] backdrop-blur-sm">
          {slideIndex === 0 ? "Cover" : `Slide ${slideIndex + 1}`}
        </span>
        <span
          className={`absolute bottom-5 right-6 text-[10px] font-medium ${
            previewImageUrl ? "text-white/60" : "text-[#75647F]"
          }`}
        >
          {slideIndex + 1} / {totalSlides}
        </span>
      </div>

      <div className="mt-5 min-w-0 overflow-hidden rounded-[20px] border border-[#E3D8EA] bg-white p-5">
        {canManage && (
          <div className="mb-4 flex items-start gap-2 border-b border-[#EEE6F4] pb-4">
            <div className="min-w-0 flex-1">
              <SlideImageInput
                key={previewUrl || "empty"}
                value={previewUrl}
                label={`image for slide ${slideIndex + 1}`}
                onSave={onImageSave}
                onClear={onClearImage}
              />
            </div>
            <button
              type="button"
              onClick={onEdit}
              className="h-9 shrink-0 rounded-full border border-[#DED0E7] bg-white px-3.5 text-[11px] font-semibold text-[#5F4D70] transition hover:border-[#C7B3D2] hover:bg-[#F5EEFA]"
            >
              Edit
            </button>
          </div>
        )}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E8DDED] bg-[#FAF7FC] px-3 py-2.5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7D4698]">
              {slideIndex === 0 ? "Cover slide" : `Slide ${slideIndex + 1}`}
            </p>
            <p className="mt-0.5 text-[10px] text-[#8B7895]">
              {slideIndex === 0 ? "Shown first in this post" : `${slideIndex + 1} of ${totalSlides}`}
            </p>
          </div>
          {canManage && totalSlides > 1 && (
            <button
              type="button"
              draggable={!isReordering}
              disabled={isReordering}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              className="inline-flex h-8 cursor-grab items-center gap-2 rounded-full border border-[#D9CBE1] bg-white px-3 text-[10px] font-semibold text-[#5F4D70] transition hover:border-[#B99CC8] hover:bg-[#EEE3FA] active:cursor-grabbing disabled:cursor-wait disabled:opacity-45"
            >
              <span aria-hidden="true" className="text-sm leading-none tracking-[-0.12em]">
                ⋮⋮
              </span>
              {isReordering ? "Saving order…" : "Drag to reorder"}
            </button>
          )}
        </div>
        {slide.warningFlag && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-[#E4C586] bg-[#FFF7E5] px-3 py-2.5 text-xs font-medium leading-5 text-[#805A22]">
            <Icon name="warning" className="mt-0.5 size-4 shrink-0" />
            <span>{slide.warningFlag}</span>
          </div>
        )}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#8B7895]">
            Visual direction
          </p>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#695677] [overflow-wrap:anywhere]">
            {slide.visualNote}
          </p>
        </div>
        {slide.slideCaption && (
          <div className="mt-4 border-t border-[#EEE6F4] pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#7D4698]">
              Per-slide caption
            </p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-[#341F60] [overflow-wrap:anywhere]">
              {slide.slideCaption}
            </p>
          </div>
        )}
        <div className="mt-4 border-t border-[#EEE6F4] pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#8B7895]">
            References
          </p>
          {canManage && (
            <div className="mt-2 space-y-2">
              <ReferenceInput onAdd={onAddReference} />
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#A18DAA]">
                  Or
                </span>
                <SlideImageUploadButton onUpload={onReferenceImageUpload} />
              </div>
            </div>
          )}
          {slide.references.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {slide.references.map((reference) => (
                <ReferenceCell
                  key={reference.id}
                  reference={reference}
                  canManage={canManage}
                  onDelete={() => onDeleteReference(reference.id)}
                />
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-[#A18DAA]">
              No references yet.
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

function PostDetail({
  post,
  status,
  members,
  clientLabel,
  clientInitial,
  onSlideImageSave,
  onReferenceImageUpload,
  onClearSlideImage,
  onAddSlide,
  onEditSlide,
  onAddReference,
  onDeleteReference,
  onReorderSlides,
  isReorderingSlides,
  onClose,
  canManage,
}: {
  post: Post;
  status: PostStatus;
  members: TaskTeamMember[];
  clientLabel: string;
  clientInitial: string;
  onSlideImageSave: (slideNumber: number, link: string) => void;
  onReferenceImageUpload: (
    slideId: string,
    file: File,
  ) => Promise<string | null>;
  onClearSlideImage: (slideNumber: number) => void;
  onAddSlide: () => void;
  onEditSlide: (slide: Slide) => void;
  onAddReference: (slideId: string, url: string) => void;
  onDeleteReference: (slideId: string, referenceId: string) => void;
  onReorderSlides: (orderedSlideIds: string[]) => void;
  isReorderingSlides: boolean;
  onClose: () => void;
  canManage: boolean;
}) {
  const carouselRef = useRef<HTMLDivElement>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [draggedSlideId, setDraggedSlideId] = useState<string | null>(null);
  const [dragTargetSlideId, setDragTargetSlideId] = useState<string | null>(null);
  const assignedMembers = post.assigneeUsernames
    .map((username) =>
      members.find((member) => member.team_username === username),
    )
    .filter((member): member is TaskTeamMember => Boolean(member));
  const assignedLabel =
    assignedMembers.map((member) => member.full_name).join(", ") ||
    post.assignedTo ||
    "Unassigned";

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  function scrollToSlide(index: number) {
    const nextIndex = Math.max(0, Math.min(index, post.slides.length - 1));
    const child = carouselRef.current?.children[nextIndex] as HTMLElement | undefined;
    child?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    setActiveSlide(nextIndex);
  }

  function updateActiveSlide() {
    const carousel = carouselRef.current;
    if (!carousel) return;

    const carouselCenter = carousel.getBoundingClientRect().left + carousel.clientWidth / 2;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    Array.from(carousel.children).forEach((child, index) => {
      const rect = child.getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - carouselCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    setActiveSlide(closestIndex);
  }

  function dropSlide(targetSlideId: string) {
    if (!draggedSlideId || draggedSlideId === targetSlideId) {
      setDraggedSlideId(null);
      setDragTargetSlideId(null);
      return;
    }

    const orderedSlideIds = post.slides.map((slide) => slide.id);
    const draggedIndex = orderedSlideIds.indexOf(draggedSlideId);
    const targetIndex = orderedSlideIds.indexOf(targetSlideId);
    if (draggedIndex < 0 || targetIndex < 0) return;

    orderedSlideIds.splice(draggedIndex, 1);
    orderedSlideIds.splice(targetIndex, 0, draggedSlideId);
    onReorderSlides(orderedSlideIds);
    setActiveSlide(targetIndex);
    setDraggedSlideId(null);
    setDragTargetSlideId(null);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="post-detail-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-[#FFF9EF]"
    >
      <header className="sticky top-0 z-20 border-b border-[#E3D8EA] bg-white/95 px-4 py-2.5 backdrop-blur sm:px-8">
        <div className="mx-auto max-w-[1320px]">
          <div className="flex items-center justify-between gap-4">
            <UnderstoryBrand />
            <button
              type="button"
              onClick={onClose}
              className="flex size-9 items-center justify-center rounded-full border border-[#E0D4E8] bg-white text-[#5F4D70] transition hover:bg-[#EEE3FA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7D4698]"
            >
              <Icon name="close" className="size-4" />
              <span className="sr-only">Close post details</span>
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-[#E3D8EA] bg-[#FAF7FC] px-3 py-2 shadow-sm sm:px-4">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8B7895]">
                Status
              </span>
              <StatusBadge status={status} />
            </div>
            <span className="hidden h-6 w-px bg-[#E3D8EA] sm:block" />
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8B7895]">
                Assigned
              </span>
              {assignedMembers.length > 0 && (
                <span className="flex -space-x-1.5" aria-hidden="true">
                  {assignedMembers.slice(0, 3).map((member) => (
                    <span
                      key={member.team_username}
                      className="flex size-5 items-center justify-center rounded-full border border-white bg-[#7D4698] text-[8px] font-bold text-white"
                    >
                      {member.full_name.trim().charAt(0).toUpperCase()}
                    </span>
                  ))}
                </span>
              )}
              <span className="max-w-[220px] truncate text-[11px] font-semibold text-[#4F3D69]">
                {assignedLabel}
              </span>
            </div>
            <span className="hidden h-6 w-px bg-[#E3D8EA] sm:block" />
            <p className="text-[10px] font-medium text-[#695677]">
              {SOCIAL_POST_FORMAT_LABELS[post.format]} · {post.slides.length}{" "}
              {post.slides.length === 1 ? "slide" : "slides"}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1320px] px-4 py-7 sm:px-8 sm:py-10">
        <div className="border-b border-[#E0D4E8] pb-8">
          <div className="max-w-3xl">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8B7895]">
              <Icon name="instagram" className="size-4" />
              Instagram {SOCIAL_POST_FORMAT_LABELS[post.format].toLowerCase()} ·
              Post {String(post.id).padStart(2, "0")}
            </div>
            <h1
              id="post-detail-title"
              className="text-3xl font-semibold tracking-[-0.04em] text-[#341F60] sm:text-4xl"
            >
              {post.title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#75647F] sm:text-base sm:leading-7">
              {post.brief}
            </p>
          </div>
        </div>

        {post.format !== "reel" && (
          <section className="py-8 sm:py-10" aria-labelledby="slides-heading">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8B7895]">
                  Design direction
                </p>
                <h2
                  id="slides-heading"
                  className="mt-1 text-xl font-semibold text-[#341F60]"
                >
                  {post.format === "carousel" ? "Slides" : "Visual"}
                </h2>
              </div>
              <div className="flex items-center gap-3">
                {post.slides.length > 0 && (
                  <>
                    <span
                      aria-live="polite"
                      className="min-w-10 text-center text-sm font-semibold text-[#4F3D69]"
                    >
                      {activeSlide + 1} / {post.slides.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => scrollToSlide(activeSlide - 1)}
                      disabled={activeSlide === 0}
                      className="flex size-10 items-center justify-center rounded-full border border-[#DED0E7] bg-white text-[#4F3D69] shadow-sm transition hover:bg-[#EEE3FA] disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <Icon name="arrow" className="size-4" />
                      <span className="sr-only">Previous slide</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollToSlide(activeSlide + 1)}
                      disabled={activeSlide === post.slides.length - 1}
                      className="flex size-10 items-center justify-center rounded-full border border-[#DED0E7] bg-white text-[#4F3D69] shadow-sm transition hover:bg-[#EEE3FA] disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <Icon name="chevron" className="size-4" />
                      <span className="sr-only">Next slide</span>
                    </button>
                  </>
                )}
                {canManage && (
                  <TeamButton type="button" tone="secondary" onClick={onAddSlide}>
                    + Add slide
                  </TeamButton>
                )}
              </div>
            </div>

            {post.slides.length > 0 ? (
              <>
                <div
                  ref={carouselRef}
                  onScroll={updateActiveSlide}
                  className="-mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-7 pt-2 [scrollbar-width:none] sm:-mx-8 sm:gap-6 sm:px-8 [&::-webkit-scrollbar]:hidden"
                >
                  {post.slides.map((slide, slideIndex) => (
                    <SlidePreview
                      key={slide.id}
                      post={post}
                      slide={slide}
                      slideIndex={slideIndex}
                      totalSlides={post.slides.length}
                      previewUrl={slide.imageUrl}
                      clientLabel={clientLabel}
                      clientInitial={clientInitial}
                      onImageSave={(link) =>
                        onSlideImageSave(slide.slideNumber, link)
                      }
                      onReferenceImageUpload={(file) =>
                        onReferenceImageUpload(slide.id, file)
                      }
                      onClearImage={() => onClearSlideImage(slide.slideNumber)}
                      onEdit={() => onEditSlide(slide)}
                      onAddReference={(url) => onAddReference(slide.id, url)}
                      onDeleteReference={(referenceId) =>
                        onDeleteReference(slide.id, referenceId)
                      }
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", slide.id);
                        setDraggedSlideId(slide.id);
                      }}
                      onDragOver={(event) => {
                        if (!draggedSlideId || isReorderingSlides) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setDragTargetSlideId(slide.id);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        dropSlide(slide.id);
                      }}
                      onDragEnd={() => {
                        setDraggedSlideId(null);
                        setDragTargetSlideId(null);
                      }}
                      isDragging={draggedSlideId === slide.id}
                      isDragTarget={
                        dragTargetSlideId === slide.id &&
                        draggedSlideId !== slide.id
                      }
                      isReordering={isReorderingSlides}
                      canManage={canManage}
                    />
                  ))}
                </div>
                <p className="text-center text-[11px] text-[#8B7895] sm:hidden">
                  Swipe to see the next slide
                </p>
              </>
            ) : (
              <div className="rounded-[20px] border border-dashed border-[#DED0E7] bg-white px-6 py-10 text-center text-sm text-[#75647F]">
                No slides yet.
                {canManage && (
                  <>
                    {" "}
                    <button
                      type="button"
                      onClick={onAddSlide}
                      className="font-semibold text-[#7D4698] underline underline-offset-2"
                    >
                      Add the first one
                    </button>
                  </>
                )}
              </div>
            )}
          </section>
        )}

        {post.format === "reel" && (
          <section className="grid gap-4 py-8 sm:grid-cols-2 sm:py-10">
            <article className="rounded-[22px] border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[var(--primary)]">
                Hook
              </p>
              <p className="mt-3 text-base font-semibold leading-7 text-[var(--foreground)]">
                {post.reelDetails.hook || "No hook added yet."}
              </p>
            </article>
            <article className="rounded-[22px] border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[var(--primary)]">
                CTA
              </p>
              <p className="mt-3 text-base font-semibold leading-7 text-[var(--foreground)]">
                {post.reelDetails.cta || "No CTA added yet."}
              </p>
            </article>
            <article className="rounded-[22px] border border-[var(--border)] bg-[var(--card)] p-5 sm:col-span-2 sm:p-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[var(--primary)]">
                Script
              </p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[var(--foreground)]">
                {post.reelDetails.script || "No script added yet."}
              </p>
            </article>
          </section>
        )}

        <section className="mb-6 rounded-[24px] border border-[var(--border)] bg-[var(--card)] p-5 sm:p-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">
            Visual note
          </p>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-[var(--foreground)]">
            {post.visualNote || "No overall visual note has been added yet."}
          </p>
        </section>

        <section className="rounded-[24px] border border-[#E0D4E8] bg-white p-5 shadow-[0_8px_28px_rgba(52,31,96,0.05)] sm:p-8">
          <div className="flex items-center gap-2 text-[#7D4698]">
            <Icon name="instagram" className="size-4" />
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em]">
              Post caption (shown below the whole post)
            </h2>
          </div>
          <p className="mt-4 max-w-4xl whitespace-pre-wrap text-[15px] leading-7 text-[#4F3D69]">
            {post.postCaption}
          </p>
        </section>
      </main>
    </div>
  );
}

function SlideEditorModal({
  editingSlide,
  deleteSlideId,
  onClose,
  onSave,
  onDelete,
}: {
  editingSlide: { postId: number; slide: Slide } | null;
  deleteSlideId: string | null;
  onClose: () => void;
  onSave: (fields: {
    onScreenText: string;
    visualNote: string;
    slideCaption: string;
    warningFlag: string;
  }) => void;
  onDelete: () => void;
}) {
  const [onScreenText, setOnScreenText] = useState(
    editingSlide?.slide.onScreenText ?? "",
  );
  const [visualNote, setVisualNote] = useState(
    editingSlide?.slide.visualNote ?? "",
  );
  const [slideCaption, setSlideCaption] = useState(
    editingSlide?.slide.slideCaption ?? "",
  );
  const [warningFlag, setWarningFlag] = useState(
    editingSlide?.slide.warningFlag ?? "",
  );

  return (
    <TeamModal
      open={Boolean(editingSlide)}
      title={`Edit slide ${editingSlide?.slide.slideNumber ?? ""}`}
      description="Separate a headline and subtext in on-screen text with &quot; / &quot;."
      submitLabel="Save slide"
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ onScreenText, visualNote, slideCaption, warningFlag });
      }}
    >
      <div className="grid gap-4">
        <label className="text-xs font-semibold text-[#341F60]">
          On-screen text
          <textarea
            rows={2}
            value={onScreenText}
            onChange={(event) => setOnScreenText(event.target.value)}
            className={`mt-2 ${teamInputClass}`}
          />
        </label>
        <label className="text-xs font-semibold text-[#341F60]">
          Visual direction
          <textarea
            rows={3}
            value={visualNote}
            onChange={(event) => setVisualNote(event.target.value)}
            className={`mt-2 ${teamInputClass}`}
          />
        </label>
        <label className="text-xs font-semibold text-[#341F60]">
          Per-slide caption
          <textarea
            rows={2}
            value={slideCaption}
            onChange={(event) => setSlideCaption(event.target.value)}
            className={`mt-2 ${teamInputClass}`}
          />
        </label>
        <label className="text-xs font-semibold text-[#341F60]">
          Warning flag (optional)
          <input
            value={warningFlag}
            onChange={(event) => setWarningFlag(event.target.value)}
            placeholder="e.g. Needs client approval"
            className={`mt-2 ${teamInputClass}`}
          />
        </label>
      </div>
      {editingSlide && (
        <div className="mt-5 flex justify-end border-t border-[#EEE6F4] pt-4">
          <TeamButton type="button" tone="danger" onClick={onDelete}>
            {deleteSlideId === editingSlide.slide.id
              ? "Confirm delete?"
              : "Delete slide"}
          </TeamButton>
        </div>
      )}
    </TeamModal>
  );
}

type PostEditorState = {
  post?: Post;
  format: SocialPostFormat;
  title: string;
  brief: string;
  postCaption: string;
  visualNote: string;
  reelDetails: ReelDetails;
  status: PostStatus;
  assignedTo: string;
};

function PostEditorModal({
  editor,
  isSaving,
  onChange,
  onClose,
  onSave,
}: {
  editor: PostEditorState | null;
  isSaving: boolean;
  onChange: (editor: PostEditorState) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <TeamModal
      open={Boolean(editor)}
      title={editor?.post ? "Edit social media task" : "Add social media task"}
      description="Choose the post format, then capture the shared production details."
      submitLabel={editor?.post ? "Save changes" : "Add task"}
      isSaving={isSaving}
      submitDisabled={!editor?.title.trim()}
      themed
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      {editor && (
        <div className="space-y-4">
          <fieldset>
            <legend className="text-xs font-semibold text-[#341F60]">
              Format
            </legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {SOCIAL_POST_FORMATS.map((format) => (
                <label
                  key={format}
                  className={`cursor-pointer rounded-xl border px-3 py-2.5 text-center text-xs font-semibold transition ${
                    editor.format === format
                      ? "border-[var(--primary)] bg-[var(--muted)] text-[var(--foreground)]"
                      : "border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="post-format"
                    value={format}
                    checked={editor.format === format}
                    onChange={() =>
                      onChange({
                        ...editor,
                        format,
                        reelDetails:
                          format === "reel"
                            ? editor.reelDetails
                            : { ...EMPTY_REEL_DETAILS },
                      })
                    }
                    className="sr-only"
                  />
                  {SOCIAL_POST_FORMAT_LABELS[format]}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block text-xs font-semibold text-[#341F60]">
            Title
            <input
              value={editor.title}
              onChange={(event) =>
                onChange({ ...editor, title: event.target.value })
              }
              className={`mt-2 ${teamInputClass}`}
            />
          </label>
          <label className="block text-xs font-semibold text-[#341F60]">
            Brief
            <textarea
              rows={4}
              value={editor.brief}
              onChange={(event) =>
                onChange({ ...editor, brief: event.target.value })
              }
              className={`mt-2 resize-none ${teamInputClass}`}
            />
          </label>
          <label className="block text-xs font-semibold text-[#341F60]">
            Post caption
            <textarea
              rows={5}
              value={editor.postCaption}
              onChange={(event) =>
                onChange({ ...editor, postCaption: event.target.value })
              }
              className={`mt-2 resize-none ${teamInputClass}`}
            />
          </label>
          <label className="block text-xs font-semibold text-[#341F60]">
            Visual note
            <textarea
              rows={4}
              value={editor.visualNote}
              onChange={(event) =>
                onChange({ ...editor, visualNote: event.target.value })
              }
              className={`mt-2 resize-none ${teamInputClass}`}
              placeholder="Describe the overall visual direction."
            />
          </label>
          {editor.format === "reel" && (
            <div className="grid gap-4 rounded-2xl border border-[var(--border)] bg-[var(--muted)]/45 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--primary)]">
                Reel details
              </p>
              <label className="text-xs font-semibold text-[#341F60]">
                Hook
                <input
                  value={editor.reelDetails.hook}
                  onChange={(event) =>
                    onChange({
                      ...editor,
                      reelDetails: {
                        ...editor.reelDetails,
                        hook: event.target.value,
                      },
                    })
                  }
                  className={`mt-2 ${teamInputClass}`}
                  placeholder="Opening line or first-frame hook"
                />
              </label>
              <label className="text-xs font-semibold text-[#341F60]">
                Script
                <textarea
                  rows={7}
                  value={editor.reelDetails.script}
                  onChange={(event) =>
                    onChange({
                      ...editor,
                      reelDetails: {
                        ...editor.reelDetails,
                        script: event.target.value,
                      },
                    })
                  }
                  className={`mt-2 resize-y ${teamInputClass}`}
                  placeholder="Write the Reel script."
                />
              </label>
              <label className="text-xs font-semibold text-[#341F60]">
                CTA
                <input
                  value={editor.reelDetails.cta}
                  onChange={(event) =>
                    onChange({
                      ...editor,
                      reelDetails: {
                        ...editor.reelDetails,
                        cta: event.target.value,
                      },
                    })
                  }
                  className={`mt-2 ${teamInputClass}`}
                  placeholder="What should the viewer do next?"
                />
              </label>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-[#341F60]">
              Status
              <select
                value={editor.status}
                onChange={(event) =>
                  onChange({
                    ...editor,
                    status: event.target.value as PostStatus,
                  })
                }
                className={`mt-2 ${teamInputClass}`}
              >
                {Object.entries(statusDetails).map(([value, details]) => (
                  <option key={value} value={value}>
                    {details.label}
                  </option>
                ))}
              </select>
            </label>
            {!editor.post && (
              <label className="text-xs font-semibold text-[#341F60]">
                Initial assignee
                <select
                  value={editor.assignedTo}
                  onChange={(event) =>
                    onChange({ ...editor, assignedTo: event.target.value })
                  }
                  className={`mt-2 ${teamInputClass}`}
                >
                  <option value="">Unassigned</option>
                  {PROJECT_ASSIGNEES.map((assignee) => (
                    <option key={assignee} value={assignee}>
                      {assignee}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
      )}
    </TeamModal>
  );
}

function AugustContentCalendarContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pathCalendarId = pathname.match(
    /^\/team-hub\/projects\/([0-9a-f-]{36})\/calendar$/i,
  )?.[1];
  const requestedCalendarId = searchParams.get("calendar") ?? pathCalendarId;
  const routeClientSlug = pathname.split("/")[2] ?? null;
  const fallbackClientSlug = isWorkspaceClientSlug(routeClientSlug)
    ? routeClientSlug
    : "mvp";
  const [clientSlug, setClientSlug] =
    useState<keyof typeof WORKSPACE_CLIENTS>(fallbackClientSlug);
  const clientLabel = WORKSPACE_CLIENTS[clientSlug].name;
  const clientInitial = projectClientInitial(clientSlug);
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null);
  const [editingSlide, setEditingSlide] = useState<{
    postId: number;
    slide: Slide;
  } | null>(null);
  const [deleteSlideId, setDeleteSlideId] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [statuses, setStatuses] = useState<Record<number, PostStatus>>({});
  const [isReorderingSlides, setIsReorderingSlides] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [calendarTaskId, setCalendarTaskId] = useState<string | null>(null);
  const [calendarTitle, setCalendarTitle] = useState(
    "August content calendar",
  );
  const [calendarDescription, setCalendarDescription] = useState(
    "Open a post to review the copy, visual direction, and captions for every slide.",
  );
  const [teamProfile, setTeamProfile] = useState<{
    username: string;
    name: string;
    accessLevel: TeamAccessLevel;
  } | null>(null);
  const [isTeamProfileReady, setIsTeamProfileReady] = useState(false);
  const [editor, setEditor] = useState<PostEditorState | null>(null);
  const [isSavingPost, setIsSavingPost] = useState(false);
  const [postToAssign, setPostToAssign] = useState<Post | null>(null);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [isSavingAssignees, setIsSavingAssignees] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const teamMembers = useTaskTeamMembers();
  const [deletePostId, setDeletePostId] = useState<number | null>(null);
  const [postRailState, setPostRailState] = useState({
    canScrollLeft: false,
    canScrollRight: false,
    hasOverflow: false,
  });
  const postRailRef = useRef<HTMLDivElement>(null);

  const selectedPost = posts.find((post) => post.id === selectedPostId);
  // Any signed-in team member can add/edit/delete posts and manage
  // assignees here — only the "see every assignment" scope below stays
  // owner-only, since staff still only load posts assigned to them.
  const canManage = Boolean(teamProfile);
  const seesAllAssignments = teamProfile?.accessLevel === "owner";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const profile = readTeamSessionProfile();
      setTeamProfile(
        profile
          ? {
              username: profile.username,
              name: profile.name,
              accessLevel: profile.accessLevel,
            }
          : null,
      );
      setIsTeamProfileReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!isTeamProfileReady || !teamProfile) return;
    let isActive = true;
    const activeProfile = teamProfile;

    async function loadPosts() {
      setIsLoading(true);
      setPosts([]);
      setSelectedPostId(null);
      let calendar: {
        id: string;
        title: string;
        description: string | null;
        client_id: string;
      } | null = null;
      let resolvedClientId: string | null = null;
      let resolvedClientSlug = fallbackClientSlug;

      if (requestedCalendarId) {
        const { data, error } = await supabase
          .from("division_tasks")
          .select("id, title, description, client_id")
          .eq("id", requestedCalendarId)
          .eq("division", "social-media")
          .eq("template_type", "content_calendar")
          .maybeSingle();

        if (!isActive) return;
        if (error || !data) {
          setErrorMessage(
            `Could not load this content calendar: ${
              error?.message ?? "Calendar not found."
            }`,
          );
          setIsLoading(false);
          return;
        }
        calendar = data;
        resolvedClientId = data.client_id;

        const { data: clientRecord, error: clientError } = await supabase
          .from("clients")
          .select("slug")
          .eq("id", data.client_id)
          .maybeSingle();

        const resolvedSlug = clientRecord?.slug ?? null;
        if (!isActive || clientError || !isWorkspaceClientSlug(resolvedSlug)) {
          if (isActive) {
            setErrorMessage(
              `Could not resolve this calendar's client: ${
                clientError?.message ?? "Client not found."
              }`,
            );
            setIsLoading(false);
          }
          return;
        }
        resolvedClientSlug = resolvedSlug;
      } else {
        const { data: client, error: clientError } = await supabase
          .from("clients")
          .select("id")
          .eq("slug", fallbackClientSlug)
          .maybeSingle();

        if (!isActive) return;
        if (clientError || !client) {
          setErrorMessage(
            `Could not load ${WORKSPACE_CLIENTS[fallbackClientSlug].name}: ${
              clientError?.message ?? "Client not found."
            }`,
          );
          setIsLoading(false);
          return;
        }
        resolvedClientId = client.id;

        const { data } = await supabase
          .from("division_tasks")
          .select("id, title, description, client_id")
          .eq("client_id", client.id)
          .eq("division", "social-media")
          .eq("template_type", "content_calendar")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        calendar = data;
      }

      if (!resolvedClientId) return;
      setClientSlug(resolvedClientSlug);
      setClientId(resolvedClientId);

      const activeCalendarId = calendar?.id ?? null;
      setCalendarTaskId(activeCalendarId);
      setCalendarTitle(calendar?.title ?? "August content calendar");
      setCalendarDescription(
        calendar?.description ||
          "Open a post to review the copy, visual direction, and captions for every slide.",
      );

      let query = supabase
        .from("tasks")
        .select(
          `
            id,
            title,
            brief,
            status,
            format,
            post_caption,
            visual_note,
            reel_details,
            assigned_to,
            assignee_usernames,
            watcher_usernames,
            created_at,
            task_slides (
              id,
              slide_number,
              on_screen_text,
              visual_note,
              slide_caption,
              warning_flag,
              image_url,
              slide_references (
                id,
                url,
                platform
              )
            )
          `,
        )
        .eq("client_id", resolvedClientId)
        .order("created_at", { ascending: true });
      query = activeCalendarId
        ? query.eq("division_task_id", activeCalendarId)
        : query.is("division_task_id", null);
      if (activeProfile.accessLevel === "staff") {
        query = query.contains("assignee_usernames", [activeProfile.username]);
      }
      const { data, error } = await query;

      if (!isActive) return;

      if (error) {
        setErrorMessage(`Could not load the content calendar: ${error.message}`);
        setIsLoading(false);
        return;
      }

      const loadedPosts = mapTaskRows((data ?? []) as unknown as TaskRow[]);
      setPosts(loadedPosts);
      setStatuses(
        Object.fromEntries(
          loadedPosts.map((post) => [post.id, post.status]),
        ),
      );
      setErrorMessage(null);
      setIsLoading(false);
    }

    void loadPosts();
    return () => {
      isActive = false;
    };
  }, [
    fallbackClientSlug,
    isTeamProfileReady,
    requestedCalendarId,
    teamProfile,
  ]);

  const updatePostRailState = useCallback(() => {
    const rail = postRailRef.current;
    if (!rail) return;

    const hasOverflow = rail.scrollWidth > rail.clientWidth + 2;
    setPostRailState({
      hasOverflow,
      canScrollLeft: hasOverflow && rail.scrollLeft > 4,
      canScrollRight:
        hasOverflow && rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    const rail = postRailRef.current;
    if (!rail) return;

    const resizeObserver = new ResizeObserver(updatePostRailState);
    resizeObserver.observe(rail);
    updatePostRailState();

    return () => resizeObserver.disconnect();
  }, [posts.length, updatePostRailState]);

  async function updateStatus(
    postId: number,
    status: "not_started" | "for_review",
  ) {
    const post = posts.find((candidate) => candidate.id === postId);
    if (!post) return;

    const previousStatus = statuses[postId];
    setStatuses((current) => ({ ...current, [postId]: status }));
    setPosts((current) =>
      current.map((candidate) =>
        candidate.id === postId ? { ...candidate, status } : candidate,
      ),
    );

    const { error } = await supabase
      .from("tasks")
      .update({ status })
      .eq("id", post.databaseId);

    if (error) {
      setStatuses((current) => ({
        ...current,
        [postId]: previousStatus,
      }));
      setPosts((current) =>
        current.map((candidate) =>
          candidate.id === postId
            ? { ...candidate, status: previousStatus }
            : candidate,
        ),
      );
      setErrorMessage(`Could not update the post status: ${error.message}`);
      return;
    }

    setErrorMessage(null);
    if (status === "for_review") {
      void sendSlackNotification({
        type: "task_review",
        clientSlug,
        title: post.title,
      });
    }
  }

  async function saveSlideImageLink(
    postId: number,
    slideNumber: number,
    rawLink: string,
  ) {
    if (!canManage) return false;
    const post = posts.find((candidate) => candidate.id === postId);
    const slide = post?.slides.find(
      (candidate) => candidate.slideNumber === slideNumber,
    );
    if (!post || !slide) return false;

    const { error } = await supabase
      .from("task_slides")
      .update({ image_url: rawLink })
      .eq("id", slide.id);
    if (error) {
      setErrorMessage(`Could not save the slide image link: ${error.message}`);
      return false;
    }

    setPosts((current) =>
      current.map((candidate) =>
        candidate.id === postId
          ? {
              ...candidate,
              slides: candidate.slides.map((candidateSlide) =>
                candidateSlide.id === slide.id
                  ? { ...candidateSlide, imageUrl: rawLink }
                  : candidateSlide,
              ),
            }
          : candidate,
      ),
    );
    setErrorMessage(null);
    return true;
  }

  async function uploadReferenceImage(
    postId: number,
    slideId: string,
    file: File,
  ): Promise<string | null> {
    if (!canManage || !clientId) return "The project is not ready for uploads.";
    const post = posts.find((candidate) => candidate.id === postId);
    const slide = post?.slides.find((candidate) => candidate.id === slideId);
    if (!post || !slide) return "This slide could not be found.";

    const storagePath = `${clientId}/social-references/${slide.id}/${crypto.randomUUID()}-${sanitizeUploadFileName(file.name)}`;

    const { error: uploadError } = await supabase.storage
      .from(SLIDE_IMAGE_BUCKET)
      .upload(storagePath, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      const message = `Could not upload the image: ${uploadError.message}`;
      setErrorMessage(message);
      return message;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(SLIDE_IMAGE_BUCKET).getPublicUrl(storagePath);
    const didSave = await addReference(postId, slide.id, publicUrl);

    if (!didSave) {
      await supabase.storage.from(SLIDE_IMAGE_BUCKET).remove([storagePath]);
      return "The image uploaded, but it could not be added as a reference.";
    }

    return null;
  }

  async function reorderSlides(postId: number, orderedSlideIds: string[]) {
    if (!canManage || isReorderingSlides) return;
    const post = posts.find((candidate) => candidate.id === postId);
    if (!post || orderedSlideIds.length !== post.slides.length) return;

    const slidesById = new Map(post.slides.map((slide) => [slide.id, slide]));
    if (orderedSlideIds.some((slideId) => !slidesById.has(slideId))) return;

    const originalSlides = [...post.slides].sort(
      (first, second) => first.slideNumber - second.slideNumber,
    );
    const maxSlideNumber = Math.max(
      ...originalSlides.map((slide) => slide.slideNumber),
    );

    async function writeSlideNumbers(
      assignments: Array<{ id: string; slideNumber: number }>,
    ) {
      for (const assignment of assignments) {
        const { error } = await supabase
          .from("task_slides")
          .update({ slide_number: assignment.slideNumber })
          .eq("id", assignment.id);
        if (error) return error;
      }
      return null;
    }

    async function restoreOriginalOrder() {
      const recoveryBase = maxSlideNumber + 3000;
      await writeSlideNumbers(
        originalSlides.map((slide, index) => ({
          id: slide.id,
          slideNumber: recoveryBase + index,
        })),
      );
      await writeSlideNumbers(
        originalSlides.map((slide) => ({
          id: slide.id,
          slideNumber: slide.slideNumber,
        })),
      );
    }

    setIsReorderingSlides(true);
    setErrorMessage(null);

    const temporaryBase = maxSlideNumber + 1000;
    const temporaryError = await writeSlideNumbers(
      orderedSlideIds.map((slideId, index) => ({
        id: slideId,
        slideNumber: temporaryBase + index,
      })),
    );
    if (temporaryError) {
      await restoreOriginalOrder();
      setErrorMessage(`Could not save the new slide order: ${temporaryError.message}`);
      setIsReorderingSlides(false);
      return;
    }

    const finalError = await writeSlideNumbers(
      orderedSlideIds.map((slideId, index) => ({
        id: slideId,
        slideNumber: index + 1,
      })),
    );
    if (finalError) {
      await restoreOriginalOrder();
      setErrorMessage(`Could not save the new slide order: ${finalError.message}`);
      setIsReorderingSlides(false);
      return;
    }

    setPosts((current) =>
      current.map((candidate) =>
        candidate.id === postId
          ? {
              ...candidate,
              slides: orderedSlideIds.map((slideId, index) => ({
                ...(slidesById.get(slideId) as Slide),
                slideNumber: index + 1,
              })),
            }
          : candidate,
      ),
    );
    setIsReorderingSlides(false);
  }

  async function addSlide(postId: number) {
    if (!canManage) return;
    const post = posts.find((candidate) => candidate.id === postId);
    if (!post) return;
    const nextSlideNumber =
      post.slides.reduce((max, slide) => Math.max(max, slide.slideNumber), 0) +
      1;

    const { data, error } = await supabase
      .from("task_slides")
      .insert({
        task_id: post.databaseId,
        slide_number: nextSlideNumber,
        on_screen_text: "",
        visual_note: "",
      })
      .select(
        "id, slide_number, on_screen_text, visual_note, slide_caption, warning_flag, image_url",
      )
      .single();
    if (error || !data) {
      setErrorMessage(
        `Could not add the slide: ${error?.message ?? "No slide returned."}`,
      );
      return;
    }

    const newSlide: Slide = {
      id: data.id,
      slideNumber: data.slide_number,
      onScreenText: data.on_screen_text,
      visualNote: data.visual_note,
      slideCaption: data.slide_caption ?? "",
      warningFlag: data.warning_flag ?? undefined,
      imageUrl: data.image_url ?? undefined,
      references: [],
    };
    setPosts((current) =>
      current.map((candidate) =>
        candidate.id === postId
          ? { ...candidate, slides: [...candidate.slides, newSlide] }
          : candidate,
      ),
    );
    setErrorMessage(null);
    setEditingSlide({ postId, slide: newSlide });
  }

  async function updateSlide(
    postId: number,
    slideId: string,
    fields: {
      onScreenText: string;
      visualNote: string;
      slideCaption: string;
      warningFlag: string;
    },
  ) {
    if (!canManage) return;
    const { error } = await supabase
      .from("task_slides")
      .update({
        on_screen_text: fields.onScreenText,
        visual_note: fields.visualNote,
        slide_caption: fields.slideCaption || null,
        warning_flag: fields.warningFlag || null,
      })
      .eq("id", slideId);
    if (error) {
      setErrorMessage(`Could not save the slide: ${error.message}`);
      return;
    }

    setPosts((current) =>
      current.map((candidate) =>
        candidate.id === postId
          ? {
              ...candidate,
              slides: candidate.slides.map((slide) =>
                slide.id === slideId
                  ? {
                      ...slide,
                      onScreenText: fields.onScreenText,
                      visualNote: fields.visualNote,
                      slideCaption: fields.slideCaption,
                      warningFlag: fields.warningFlag || undefined,
                    }
                  : slide,
              ),
            }
          : candidate,
      ),
    );
    setErrorMessage(null);
    setEditingSlide(null);
  }

  async function deleteSlide(postId: number, slideId: string) {
    if (!canManage) return;
    const { error } = await supabase
      .from("task_slides")
      .delete()
      .eq("id", slideId);
    if (error) {
      setErrorMessage(`Could not delete the slide: ${error.message}`);
      return;
    }

    setPosts((current) =>
      current.map((candidate) =>
        candidate.id === postId
          ? {
              ...candidate,
              slides: candidate.slides.filter((slide) => slide.id !== slideId),
            }
          : candidate,
      ),
    );
    setErrorMessage(null);
    setEditingSlide(null);
  }

  async function addReference(postId: number, slideId: string, url: string) {
    if (!canManage) return false;
    const platform = detectReferencePlatform(url);
    const { data, error } = await supabase
      .from("slide_references")
      .insert({
        task_slide_id: slideId,
        url,
        platform,
        created_by: teamProfile?.username,
      })
      .select("id, url, platform")
      .single();
    if (error || !data) {
      setErrorMessage(
        `Could not add the reference: ${error?.message ?? "No reference returned."}`,
      );
      return false;
    }

    const newReference: SlideReference = {
      id: data.id,
      url: data.url,
      platform: isReferencePlatform(data.platform) ? data.platform : "other",
    };
    setPosts((current) =>
      current.map((candidate) =>
        candidate.id === postId
          ? {
              ...candidate,
              slides: candidate.slides.map((slide) =>
                slide.id === slideId
                  ? { ...slide, references: [...slide.references, newReference] }
                  : slide,
              ),
            }
          : candidate,
      ),
    );
    setErrorMessage(null);
    return true;
  }

  async function deleteReference(
    postId: number,
    slideId: string,
    referenceId: string,
  ) {
    if (!canManage) return;
    const referenceUrl = posts
      .find((candidate) => candidate.id === postId)
      ?.slides.find((slide) => slide.id === slideId)
      ?.references.find((reference) => reference.id === referenceId)?.url;
    const uploadedImagePath = getSlideImageStoragePath(referenceUrl);
    const { error } = await supabase
      .from("slide_references")
      .delete()
      .eq("id", referenceId);
    if (error) {
      setErrorMessage(`Could not remove the reference: ${error.message}`);
      return;
    }

    setPosts((current) =>
      current.map((candidate) =>
        candidate.id === postId
          ? {
              ...candidate,
              slides: candidate.slides.map((slide) =>
                slide.id === slideId
                  ? {
                      ...slide,
                      references: slide.references.filter(
                        (reference) => reference.id !== referenceId,
                      ),
                    }
                  : slide,
              ),
            }
          : candidate,
      ),
    );
    if (uploadedImagePath) {
      const { error: removeError } = await supabase.storage
        .from(SLIDE_IMAGE_BUCKET)
        .remove([uploadedImagePath]);
      if (removeError) {
        setErrorMessage(
          `The reference was removed, but its uploaded file could not be deleted: ${removeError.message}`,
        );
        return;
      }
    }
    setErrorMessage(null);
  }

  async function clearSlideImage(postId: number, slideNumber: number) {
    if (!canManage) return;
    const post = posts.find((candidate) => candidate.id === postId);
    const slide = post?.slides.find(
      (candidate) => candidate.slideNumber === slideNumber,
    );
    if (!post || !slide) return;

    const { error } = await supabase
      .from("task_slides")
      .update({ image_url: null })
      .eq("id", slide.id);
    if (error) {
      setErrorMessage(`Could not clear the slide image: ${error.message}`);
      return;
    }

    const storagePath = getSlideImageStoragePath(slide.imageUrl);
    setPosts((current) =>
      current.map((candidate) =>
        candidate.id === postId
          ? {
              ...candidate,
              slides: candidate.slides.map((candidateSlide) =>
                candidateSlide.id === slide.id
                  ? { ...candidateSlide, imageUrl: undefined }
                  : candidateSlide,
              ),
            }
          : candidate,
      ),
    );
    if (storagePath) {
      const { error: removeError } = await supabase.storage
        .from(SLIDE_IMAGE_BUCKET)
        .remove([storagePath]);
      if (removeError) {
        setErrorMessage(
          `The slide was cleared, but the old upload could not be removed: ${removeError.message}`,
        );
        return;
      }
    }
    setErrorMessage(null);
  }

  function openPeoplePicker(post: Post) {
    if (!canManage) return;
    setPostToAssign(post);
    setSelectedAssignees(post.assigneeUsernames);
    setAssignmentError(null);
  }

  function closePeoplePicker() {
    if (isSavingAssignees) return;
    setPostToAssign(null);
    setSelectedAssignees([]);
    setAssignmentError(null);
  }

  function toggleAssignee(username: string) {
    setSelectedAssignees((current) =>
      current.includes(username)
        ? current.filter((candidate) => candidate !== username)
        : [...current, username],
    );
    setAssignmentError(null);
  }

  async function saveAssignees() {
    if (!canManage || !postToAssign || isSavingAssignees) return;
    const postId = postToAssign.id;
    const databaseId = postToAssign.databaseId;
    const assignedTo = teamNameForUsername(selectedAssignees[0]);

    setIsSavingAssignees(true);
    setAssignmentError(null);
    const { error } = await supabase
      .from("tasks")
      .update({
        assignee_usernames: selectedAssignees,
        assigned_to: assignedTo,
        assignee: assignedTo ?? "Unassigned",
      })
      .eq("id", databaseId);
    setIsSavingAssignees(false);

    if (error) {
      setAssignmentError(`Could not save people: ${error.message}`);
      return;
    }

    setPosts((current) =>
      current.map((post) =>
        post.id === postId
          ? {
              ...post,
              assigneeUsernames: selectedAssignees,
              assignedTo,
            }
          : post,
      ),
    );
    closePeoplePicker();
  }

  function openPostEditor(post?: Post) {
    if (!canManage) return;
    setEditor({
      post,
      format: post?.format ?? "carousel",
      title: post?.title ?? "",
      brief: post?.brief ?? "",
      postCaption: post?.postCaption ?? "",
      visualNote: post?.visualNote ?? "",
      reelDetails: post?.reelDetails ?? { ...EMPTY_REEL_DETAILS },
      status: post?.status ?? "not_started",
      assignedTo: post?.assignedTo ?? "",
    });
  }

  async function savePost() {
    if (!canManage || !editor || !clientId || !editor.title.trim()) return;
    setIsSavingPost(true);
    const initialUsername = teamUsernameForName(editor.assignedTo);
    const payload = {
      client_id: clientId,
      title: editor.title.trim(),
      brief: editor.brief.trim(),
      format: editor.format,
      post_caption: editor.postCaption.trim(),
      visual_note: editor.visualNote.trim() || null,
      reel_details:
        editor.format === "reel"
          ? {
              hook: editor.reelDetails.hook.trim(),
              script: editor.reelDetails.script.trim(),
              cta: editor.reelDetails.cta.trim(),
            }
          : null,
      status: editor.status,
      division_task_id: calendarTaskId,
      ...(editor.post
        ? {}
        : {
            assigned_to: editor.assignedTo || null,
            assignee_usernames: initialUsername ? [initialUsername] : [],
            assignee: editor.assignedTo || "Unassigned",
          }),
    };
    const mutation = editor.post
      ? supabase
          .from("tasks")
          .update(payload)
          .eq("id", editor.post.databaseId)
      : supabase.from("tasks").insert(payload);
    const { error } = await mutation;
    setIsSavingPost(false);
    if (error) {
      setErrorMessage(`Could not save the social media task: ${error.message}`);
      return;
    }
    setEditor(null);
    setErrorMessage(null);
    window.location.reload();
  }

  async function deletePost(post: Post) {
    if (!canManage) return;
    if (deletePostId !== post.id) {
      setDeletePostId(post.id);
      return;
    }
    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", post.databaseId);
    if (error) {
      setErrorMessage(`Could not delete the task: ${error.message}`);
      return;
    }
    setPosts((current) =>
      current.filter((candidate) => candidate.id !== post.id),
    );
    setDeletePostId(null);
    setSelectedPostId(null);
  }

  function scrollPostRail(direction: "left" | "right") {
    const rail = postRailRef.current;
    if (!rail) return;
    rail.scrollBy({
      left: direction === "left" ? -rail.clientWidth * 0.8 : rail.clientWidth * 0.8,
      behavior: "smooth",
    });
  }

  const workflowCounts = (Object.keys(statusDetails) as PostStatus[]).map(
    (status) => ({
      status,
      count: posts.filter((post) => statuses[post.id] === status).length,
    }),
  );

  return (
    <div className="min-h-screen bg-[#FFF9EF] text-[#341F60]">
      <header className="border-b border-[#E3D8EA] bg-white px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4">
          <UnderstoryBrand />
          <p className="text-right text-[11px] leading-5 text-[#8B7895]">
            {seesAllAssignments ? (
              "Owner view · All assignments"
            ) : (
              <>
                Assigned to:{" "}
                <span className="font-medium text-[#695677]">
                  {teamProfile?.name ?? "Team member"}
                </span>
              </>
            )}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-5 py-9 sm:px-8 sm:py-12">
        <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7D4698]">
              Content production · Content calendar
            </p>
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[#341F60] sm:text-4xl lg:text-[42px]">
              {clientLabel} — Social media · {calendarTitle}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#75647F] sm:text-base">
              {calendarDescription}
            </p>
          </div>
          <div className="flex items-center gap-2 self-start rounded-full border border-[#E0D4E8] bg-white px-4 py-2 text-xs font-medium text-[#695677] shadow-sm sm:self-auto">
            <span className="size-2 rounded-full bg-[#7D4698]" />
            {isLoading ? "Loading posts…" : `${posts.length} posts assigned`}
          </div>
        </section>

        {canManage && (
          <div className="mt-6 flex max-w-3xl items-start gap-2 rounded-2xl border border-[#E0D4E8] bg-white/70 px-4 py-3 text-xs leading-5 text-[#75647F]">
            <Icon name="link" className="mt-0.5 size-4 shrink-0 text-[#7D4698]" />
            <p>
              Paste a Google Drive link — make sure it&apos;s shared as
              &apos;Anyone with the link can view&apos; so it previews correctly here.
            </p>
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="mt-6 rounded-2xl border border-[#E5C990] bg-[#FFF7E6] px-4 py-3 text-sm leading-6 text-[#805A22]"
          >
            {errorMessage}
          </div>
        )}

        <section
          aria-label="Workflow status"
          className="mt-6 rounded-[24px] border border-[#E0D4E8] bg-white p-4 shadow-[0_6px_20px_rgba(52,31,96,0.04)] sm:p-5"
        >
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8B7895]">
                Workflow
              </p>
              <h2 className="mt-1 text-base font-semibold text-[#341F60]">
                Post status
              </h2>
            </div>
            <p className="text-xs font-medium text-[#75647F]">
              {posts.length} {posts.length === 1 ? "post" : "posts"} total
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {workflowCounts.map(({ status, count }) => (
              <article
                key={status}
                className={`min-h-28 rounded-[20px] border p-4 shadow-[0_5px_18px_rgba(52,31,96,0.035)] ${statusDetails[status].className}`}
              >
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em]">
                  <span className={`size-2 rounded-full ${statusDetails[status].dot}`} />
                  {statusDetails[status].label}
                </div>
                <p className="mt-4 text-3xl font-semibold tracking-[-0.04em]">
                  {count}
                </p>
                <p className="mt-1 text-[10px] font-medium opacity-75">
                  {count === 1 ? "post" : "posts"}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section aria-label="Assigned posts" className="mt-6">
          {canManage && (
            <div className="mb-4 flex justify-end">
              <TeamButton type="button" onClick={() => openPostEditor()}>
                + Add task
              </TeamButton>
            </div>
          )}
          <div className="relative px-12 sm:px-14">
            <div
              ref={postRailRef}
              onScroll={updatePostRailState}
              className="flex snap-x snap-mandatory gap-6 overflow-x-auto pb-7 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {isLoading
                ? Array.from({ length: 4 }, (_, index) => (
                    <div
                      key={index}
                      className="h-[460px] w-[78vw] max-w-[310px] shrink-0 animate-pulse rounded-[22px] border border-[#E5DBEC] bg-white sm:w-[310px]"
                    >
                      <div className="aspect-[16/10] bg-[#E9DFF1]" />
                      <div className="space-y-4 p-6">
                        <div className="h-5 w-3/4 rounded bg-[#EEE6F4]" />
                        <div className="h-3 w-full rounded bg-[#F0E8F6]" />
                        <div className="h-3 w-5/6 rounded bg-[#F0E8F6]" />
                      </div>
                    </div>
                  ))
                : posts.map((post) => (
                    <PostCard
                      key={post.databaseId}
                      post={post}
                      status={statuses[post.id]}
                      onSubmitForReview={() =>
                        void updateStatus(post.id, "for_review")
                      }
                      onCancelSubmission={() =>
                        void updateStatus(post.id, "not_started")
                      }
                      onOpen={() => setSelectedPostId(post.id)}
                      canManage={canManage}
                      members={teamMembers}
                      onManagePeople={() => openPeoplePicker(post)}
                      onEdit={() => openPostEditor(post)}
                      onDelete={() => void deletePost(post)}
                      confirmDelete={deletePostId === post.id}
                    />
                  ))}
              {!isLoading && posts.length === 0 && (
                <div className="w-full rounded-[24px] border border-dashed border-[#DED0E7] bg-white px-6 py-12 text-center text-sm text-[#75647F]">
                  No social media tasks have been added for {clientLabel} yet.
                </div>
              )}
            </div>

            {postRailState.canScrollLeft && (
              <>
                <div className="pointer-events-none absolute inset-y-0 left-12 w-10 bg-gradient-to-r from-[#FFF9EF] to-transparent sm:left-14" />
                <button
                  type="button"
                  onClick={() => scrollPostRail("left")}
                  className="absolute left-0 top-1/2 z-40 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-[#DED0E7] bg-white text-[#4F3D69] shadow-[0_6px_20px_rgba(52,31,96,0.2)] transition hover:scale-105 hover:bg-[#F7F1FB] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7D4698]"
                >
                  <Icon name="arrow" className="size-5" />
                  <span className="sr-only">Scroll to previous posts</span>
                </button>
              </>
            )}

            {postRailState.canScrollRight && (
              <>
                <div className="pointer-events-none absolute inset-y-0 right-12 w-10 bg-gradient-to-l from-[#FFF9EF] to-transparent sm:right-14" />
                <button
                  type="button"
                  onClick={() => scrollPostRail("right")}
                  className="absolute right-0 top-1/2 z-40 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-[#DED0E7] bg-white text-[#4F3D69] shadow-[0_6px_20px_rgba(52,31,96,0.2)] transition hover:scale-105 hover:bg-[#F7F1FB] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7D4698]"
                >
                  <Icon name="chevron" className="size-5" />
                  <span className="sr-only">Scroll to more posts</span>
                </button>
              </>
            )}
          </div>

          {postRailState.hasOverflow && (
            <div className="mt-1 flex items-center justify-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-[#8B7895]">
              <span className="h-px w-7 bg-[#D7C8E0]" />
              Swipe or use arrows for more
              <Icon name="chevron" className="size-3" />
            </div>
          )}
        </section>

        <footer className="mt-10 flex flex-col gap-1 border-t border-[#E0D4E8] py-6 text-xs text-[#8B7895] sm:flex-row sm:justify-between">
          <p>{clientLabel} · Internal content workspace</p>
          <p>Changes are saved automatically.</p>
        </footer>
      </main>

      {selectedPost && (
        <PostDetail
          key={selectedPost.id}
          post={selectedPost}
          status={statuses[selectedPost.id]}
          members={teamMembers}
          clientLabel={clientLabel}
          clientInitial={clientInitial}
          onSlideImageSave={(slideNumber, link) =>
            void saveSlideImageLink(selectedPost.id, slideNumber, link)
          }
          onReferenceImageUpload={(slideId, file) =>
            uploadReferenceImage(selectedPost.id, slideId, file)
          }
          onClearSlideImage={(slideNumber) =>
            void clearSlideImage(selectedPost.id, slideNumber)
          }
          onAddSlide={() => void addSlide(selectedPost.id)}
          onEditSlide={(slide) =>
            setEditingSlide({ postId: selectedPost.id, slide })
          }
          onAddReference={(slideId, url) =>
            void addReference(selectedPost.id, slideId, url)
          }
          onDeleteReference={(slideId, referenceId) =>
            void deleteReference(selectedPost.id, slideId, referenceId)
          }
          onReorderSlides={(orderedSlideIds) =>
            void reorderSlides(selectedPost.id, orderedSlideIds)
          }
          isReorderingSlides={isReorderingSlides}
          onClose={() => setSelectedPostId(null)}
          canManage={canManage}
        />
      )}
      <PostEditorModal
        editor={editor}
        isSaving={isSavingPost}
        onChange={setEditor}
        onClose={() => setEditor(null)}
        onSave={() => void savePost()}
      />
      <SlideEditorModal
        key={editingSlide?.slide.id ?? "none"}
        editingSlide={editingSlide}
        deleteSlideId={deleteSlideId}
        onClose={() => {
          setEditingSlide(null);
          setDeleteSlideId(null);
        }}
        onSave={(fields) => {
          if (!editingSlide) return;
          void updateSlide(editingSlide.postId, editingSlide.slide.id, fields);
        }}
        onDelete={() => {
          if (!editingSlide) return;
          if (deleteSlideId !== editingSlide.slide.id) {
            setDeleteSlideId(editingSlide.slide.id);
            return;
          }
          void deleteSlide(editingSlide.postId, editingSlide.slide.id);
        }}
      />
      <TaskPeopleModal
        open={Boolean(postToAssign)}
        taskTitle={postToAssign?.title ?? ""}
        members={teamMembers}
        selectedUsernames={selectedAssignees}
        isSaving={isSavingAssignees}
        error={assignmentError}
        onToggle={toggleAssignee}
        onClose={closePeoplePicker}
        onSave={() => void saveAssignees()}
      />
    </div>
  );
}

export default function AugustContentCalendarPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FFF9EF] px-5 py-12 text-[#75647F]">
          <div className="mx-auto max-w-[1200px]">
            <div className="h-80 animate-pulse rounded-[24px] border border-[#E5DBEC] bg-white" />
          </div>
        </div>
      }
    >
      <AugustContentCalendarContent />
    </Suspense>
  );
}
