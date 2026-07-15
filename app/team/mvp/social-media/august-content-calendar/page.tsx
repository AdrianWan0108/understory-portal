"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type PostStatus =
  | "not_started"
  | "for_review"
  | "needs_revision"
  | "approved";

type Slide = {
  id: string;
  slideNumber: number;
  onScreenText: string;
  visualNote: string;
  slideCaption?: string;
  warningFlag?: string;
  imageUrl?: string;
};

type Post = {
  id: number;
  databaseId: string;
  title: string;
  brief: string;
  refImageUrl: string | null;
  status: PostStatus;
  postCaption: string;
  slides: Slide[];
};

type TaskSlideRow = {
  id: string;
  slide_number: number;
  on_screen_text: string;
  visual_note: string;
  slide_caption: string | null;
  warning_flag: string | null;
  image_url: string | null;
};

type TaskRow = {
  id: string;
  title: string;
  brief: string;
  status: string;
  post_caption: string;
  ref_image_url: string | null;
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
    refImageUrl: task.ref_image_url,
    status: isPostStatus(task.status) ? task.status : "not_started",
    postCaption: task.post_caption,
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
      })),
  }));
}

const statusDetails: Record<
  PostStatus,
  { label: string; className: string; dot: string }
> = {
  not_started: {
    label: "Not started",
    className: "border-[#D9DEDA] bg-white text-[#536159]",
    dot: "bg-[#A8B0AA]",
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
  ["#213F32", "#AFC4B7"],
  ["#765B49", "#D6BCA9"],
  ["#49666B", "#A9C3C5"],
  ["#605267", "#C7B7CA"],
] as const;

const fallbackImages = [
  "https://placehold.co/400x500/E4E9E3/294B3B?text=Rebrand%0Areference",
  "https://placehold.co/400x500/E9E0D9/4C4038?text=Myth-busting%0Areference",
  "https://placehold.co/400x500/DDE8E8/314F53?text=Polestar%0Areference",
  "https://placehold.co/400x500/E7E0E8/4B3F50?text=Founder+story%0Areference",
] as const;

function getPostImage(post: Post) {
  const rawUrl =
    post.refImageUrl ?? fallbackImages[(post.id - 1) % fallbackImages.length];
  return getImagePreviewUrl(rawUrl) ?? rawUrl;
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
    ? `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`
    : rawUrl;
}

function getEditableImageLink(rawUrl: string | null | undefined) {
  if (!rawUrl || rawUrl.startsWith("https://placehold.co/")) return "";
  return rawUrl;
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
    | "link";
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
      <div className="absolute inset-0 flex items-center justify-center bg-[#EEF2EE] px-6 text-center text-xs leading-5 text-[#5F6F66]">
        <div className="max-w-[260px]">
          <Icon name="warning" className="mx-auto mb-2 size-5 text-[#A57731]" />
          Image couldn&apos;t load — make sure the Google Drive file is shared as
          &apos;Anyone with the link can view&apos;.
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

function DriveLinkInput({
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
    <div>
      <form onSubmit={submitLink} className="flex items-center gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">{label}</span>
          <span className="relative block">
            <Icon
              name="link"
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#839087]"
            />
            <input
              type="url"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setValidationError(null);
              }}
              placeholder="Paste Google Drive link"
              className="h-9 w-full rounded-full border border-[#CBD6CE] bg-white pl-8 pr-3 text-[11px] text-[#405349] outline-none transition placeholder:text-[#9BA59F] focus:border-[#7E9E8A] focus:ring-2 focus:ring-[#6E967F]/20"
            />
          </span>
        </label>
        <button
          type="submit"
          aria-label={`Save ${label}`}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#294B3B] text-white shadow-sm transition hover:bg-[#365D49] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6E967F]"
        >
          <Icon name="check" className="size-4" />
        </button>
        {value && (
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 rounded-full border border-[#D8DEDA] bg-white px-3 py-2 text-[11px] font-semibold text-[#68766E] transition hover:border-[#BFC9C2] hover:bg-[#F5F7F5] hover:text-[#3F5147] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6E967F]"
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

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <span className="relative flex size-10 items-center justify-center rounded-full border border-[#AFC2B7] text-[10px] font-semibold tracking-[0.18em] text-[#294B3B]">
        MV
        <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[#C8A77B]" />
      </span>
      <span>
        <span className="block text-sm font-semibold tracking-wide text-[#294B3B]">
          Motion Vitality
        </span>
        <span className="block text-[9px] uppercase tracking-[0.25em] text-[#849087]">
          Pilates
        </span>
      </span>
    </div>
  );
}

function PostCard({
  post,
  status,
  onSubmitForReview,
  onCancelSubmission,
  onImageSave,
  onClearImage,
  onOpen,
}: {
  post: Post;
  status: PostStatus;
  onSubmitForReview: () => void;
  onCancelSubmission: () => void;
  onImageSave: (link: string) => void;
  onClearImage: () => void;
  onOpen: () => void;
}) {
  const savedImageLink = getEditableImageLink(post.refImageUrl);

  return (
    <article
      className="group relative w-[82vw] max-w-[360px] shrink-0 snap-start cursor-pointer overflow-hidden rounded-[24px] border border-[#DFE4DF] bg-white shadow-[0_8px_30px_rgba(38,61,49,0.06)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_16px_42px_rgba(38,61,49,0.11)] sm:w-[360px]"
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${post.title}`}
        className="absolute inset-0 z-10 rounded-[24px] focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[#6E967F]"
      />
      <div className="relative aspect-[16/10] overflow-hidden bg-[#E6EBE6]">
        <PreviewImage
          src={getPostImage(post)}
          alt={`Reference image for ${post.title}`}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1F3328]/30 via-transparent to-transparent" />
        <span className="absolute left-4 top-4 rounded-full border border-white/60 bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#42554A] backdrop-blur">
          Post {String(post.id).padStart(2, "0")}
        </span>
        <span className="absolute bottom-4 right-4 rounded-full bg-[#294B3B]/90 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur">
          {post.slides.length} slides
        </span>
      </div>

      <div className="relative z-20 border-b border-[#E8ECE9] bg-[#F8FAF8] px-4 py-3">
        <DriveLinkInput
          key={savedImageLink || "empty"}
          value={savedImageLink || undefined}
          label={`reference image for ${post.title}`}
          onSave={onImageSave}
          onClear={onClearImage}
        />
      </div>

      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-[#263E32] sm:text-xl">
            {post.title}
          </h2>
          <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full border border-[#E0E5E1] text-[#718078] transition group-hover:border-[#B8C8BE] group-hover:bg-[#EFF4F0] group-hover:text-[#294B3B]">
            <Icon name="chevron" className="size-4" />
          </span>
        </div>
        <p className="mt-3 min-h-[72px] text-sm leading-6 text-[#68766E]">
          {post.brief}
        </p>
        <div className="relative z-20 mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#EBEEEB] pt-5">
          <StatusBadge status={status} />
          {status === "not_started" && (
            <button
              type="button"
              onClick={onSubmitForReview}
              className="rounded-full bg-[#294B3B] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#365D49] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6E967F]"
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
      </div>
    </article>
  );
}

function SlidePreview({
  post,
  slide,
  previewUrl,
  onImageSave,
  onClearImage,
}: {
  post: Post;
  slide: Slide;
  previewUrl?: string;
  onImageSave: (link: string) => void;
  onClearImage: () => void;
}) {
  const [primary, secondary] = slidePalettes[(post.id - 1) % slidePalettes.length];
  const textParts = slide.onScreenText.split(" / ");
  const previewImageUrl = getImagePreviewUrl(previewUrl);

  return (
    <article className="w-[84vw] max-w-[390px] shrink-0 snap-center sm:w-[390px]">
      <div
        className="relative aspect-[4/5] overflow-hidden rounded-[22px] shadow-[0_18px_45px_rgba(27,49,38,0.16)]"
        style={{ backgroundColor: primary }}
      >
        {previewImageUrl ? (
          <PreviewImage
            src={previewImageUrl}
            alt={`Design for slide ${slide.slideNumber} of ${post.title}`}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center opacity-20 mix-blend-luminosity"
              style={{ backgroundImage: `url(${getPostImage(post)})` }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/5 to-black/35" />
            <div
              className="absolute -right-[14%] -top-[6%] size-[48%] rounded-full opacity-50 blur-sm"
              style={{ backgroundColor: secondary }}
            />
            <div className="absolute left-6 top-6 flex items-center gap-2 text-white/75">
              <span className="flex size-7 items-center justify-center rounded-full border border-white/40 text-[8px] font-semibold tracking-[0.12em]">
                MV
              </span>
              <span className="text-[9px] font-semibold uppercase tracking-[0.2em]">
                Motion Vitality
              </span>
            </div>
            <div className="absolute inset-x-0 bottom-[11%] px-7 sm:px-8">
              <div className="space-y-3">
                {textParts.map((part, index) => (
                  <p
                    key={`${slide.slideNumber}-${index}`}
                    className={
                      index === 0
                        ? "text-[clamp(1.35rem,5vw,2rem)] font-semibold leading-[1.08] tracking-[-0.035em] text-white"
                        : "max-w-[95%] text-sm font-medium leading-5 text-white/90 sm:text-[15px] sm:leading-6"
                    }
                  >
                    {part}
                  </p>
                ))}
              </div>
            </div>
          </>
        )}
        <span className="absolute bottom-5 right-6 text-[10px] font-medium text-white/60">
          {slide.slideNumber} / {post.slides.length}
        </span>
      </div>

      <div className="mt-5 rounded-[20px] border border-[#E0E5E1] bg-white p-5">
        <div className="mb-4 border-b border-[#E8ECE9] pb-4">
          <DriveLinkInput
            key={previewUrl || "empty"}
            value={previewUrl}
            label={`image for slide ${slide.slideNumber}`}
            onSave={onImageSave}
            onClear={onClearImage}
          />
        </div>
        {slide.warningFlag && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-[#E4C586] bg-[#FFF7E5] px-3 py-2.5 text-xs font-medium leading-5 text-[#805A22]">
            <Icon name="warning" className="mt-0.5 size-4 shrink-0" />
            <span>{slide.warningFlag}</span>
          </div>
        )}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#939D97]">
            Visual direction
          </p>
          <p className="mt-2 text-sm leading-6 text-[#526159]">{slide.visualNote}</p>
        </div>
        {slide.slideCaption && (
          <div className="mt-4 border-t border-[#E8ECE9] pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#718D7C]">
              Per-slide caption
            </p>
            <p className="mt-2 text-sm font-medium leading-6 text-[#314B3E]">
              {slide.slideCaption}
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

function PostDetail({
  post,
  status,
  slideImageLinks,
  onSlideImageSave,
  onClearSlideImage,
  onClose,
}: {
  post: Post;
  status: PostStatus;
  slideImageLinks: Record<string, string>;
  onSlideImageSave: (slideNumber: number, link: string) => void;
  onClearSlideImage: (slideNumber: number) => void;
  onClose: () => void;
}) {
  const carouselRef = useRef<HTMLDivElement>(null);
  const [activeSlide, setActiveSlide] = useState(0);

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="post-detail-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-[#F4F6F2]"
    >
      <header className="sticky top-0 z-20 border-b border-[#DFE5DF] bg-white/95 px-4 py-3 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-4">
          <Logo />
          <button
            type="button"
            onClick={onClose}
            className="flex size-10 items-center justify-center rounded-full border border-[#DCE2DD] bg-white text-[#4B5D53] transition hover:bg-[#EFF3EF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#668A75]"
          >
            <Icon name="close" className="size-5" />
            <span className="sr-only">Close post details</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1320px] px-4 py-7 sm:px-8 sm:py-10">
        <div className="flex flex-col justify-between gap-5 border-b border-[#DDE3DE] pb-8 md:flex-row md:items-end">
          <div className="max-w-3xl">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#829087]">
              <Icon name="instagram" className="size-4" />
              Instagram carousel · Post {String(post.id).padStart(2, "0")}
            </div>
            <h1
              id="post-detail-title"
              className="text-3xl font-semibold tracking-[-0.04em] text-[#263E32] sm:text-4xl"
            >
              {post.title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#68766E] sm:text-base sm:leading-7">
              {post.brief}
            </p>
          </div>
          <div className="shrink-0">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#939D97]">
              Status
            </p>
            <StatusBadge status={status} />
          </div>
        </div>

        <section className="py-8 sm:py-10" aria-labelledby="slides-heading">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8B9790]">
                Design direction
              </p>
              <h2 id="slides-heading" className="mt-1 text-xl font-semibold text-[#294B3B]">
                Slides
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <span aria-live="polite" className="min-w-10 text-center text-sm font-semibold text-[#475A50]">
                {activeSlide + 1} / {post.slides.length}
              </span>
              <button
                type="button"
                onClick={() => scrollToSlide(activeSlide - 1)}
                disabled={activeSlide === 0}
                className="flex size-10 items-center justify-center rounded-full border border-[#D6DED8] bg-white text-[#42554A] shadow-sm transition hover:bg-[#EDF3EE] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Icon name="arrow" className="size-4" />
                <span className="sr-only">Previous slide</span>
              </button>
              <button
                type="button"
                onClick={() => scrollToSlide(activeSlide + 1)}
                disabled={activeSlide === post.slides.length - 1}
                className="flex size-10 items-center justify-center rounded-full border border-[#D6DED8] bg-white text-[#42554A] shadow-sm transition hover:bg-[#EDF3EE] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Icon name="chevron" className="size-4" />
                <span className="sr-only">Next slide</span>
              </button>
            </div>
          </div>

          <div
            ref={carouselRef}
            onScroll={updateActiveSlide}
            className="-mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-7 pt-2 [scrollbar-width:none] sm:-mx-8 sm:gap-6 sm:px-8 [&::-webkit-scrollbar]:hidden"
          >
            {post.slides.map((slide) => (
              <SlidePreview
                key={slide.slideNumber}
                post={post}
                slide={slide}
                previewUrl={slideImageLinks[`${post.id}-${slide.slideNumber}`]}
                onImageSave={(link) =>
                  onSlideImageSave(slide.slideNumber, link)
                }
                onClearImage={() => onClearSlideImage(slide.slideNumber)}
              />
            ))}
          </div>
          <p className="text-center text-[11px] text-[#8B9690] sm:hidden">
            Swipe to see the next slide
          </p>
        </section>

        <section className="rounded-[24px] border border-[#DDE4DE] bg-white p-5 shadow-[0_8px_28px_rgba(38,61,49,0.05)] sm:p-8">
          <div className="flex items-center gap-2 text-[#6F8C7A]">
            <Icon name="instagram" className="size-4" />
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em]">
              Post caption (shown below the whole post)
            </h2>
          </div>
          <p className="mt-4 max-w-4xl whitespace-pre-wrap text-[15px] leading-7 text-[#3D5046]">
            {post.postCaption}
          </p>
        </section>
      </main>
    </div>
  );
}

export default function AugustContentCalendarPage() {
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [statuses, setStatuses] = useState<Record<number, PostStatus>>({});
  const [slideImageLinks, setSlideImageLinks] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [postRailState, setPostRailState] = useState({
    canScrollLeft: false,
    canScrollRight: false,
    hasOverflow: false,
  });
  const postRailRef = useRef<HTMLDivElement>(null);

  const selectedPost = posts.find((post) => post.id === selectedPostId);

  useEffect(() => {
    let isActive = true;

    async function loadPosts() {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("tasks")
        .select(
          `
            id,
            title,
            brief,
            status,
            post_caption,
            ref_image_url,
            created_at,
            task_slides (
              id,
              slide_number,
              on_screen_text,
              visual_note,
              slide_caption,
              warning_flag,
              image_url
            )
          `,
        )
        .eq("assignee", "Emilia")
        .order("created_at", { ascending: true });

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
      setSlideImageLinks(
        Object.fromEntries(
          loadedPosts.flatMap((post) =>
            post.slides
              .filter((slide) => Boolean(slide.imageUrl))
              .map((slide) => [
                `${post.id}-${slide.slideNumber}`,
                slide.imageUrl as string,
              ]),
          ),
        ),
      );
      setErrorMessage(null);
      setIsLoading(false);
    }

    void loadPosts();
    return () => {
      isActive = false;
    };
  }, []);

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
  }

  async function savePostImageLink(postId: number, rawLink: string) {
    const post = posts.find((candidate) => candidate.id === postId);
    if (!post) return;

    const { error } = await supabase
      .from("tasks")
      .update({ ref_image_url: rawLink })
      .eq("id", post.databaseId);
    if (error) {
      setErrorMessage(
        `Could not save the post image link: ${error.message}`,
      );
      return;
    }

    setPosts((current) =>
      current.map((candidate) =>
        candidate.id === postId
          ? { ...candidate, refImageUrl: rawLink }
          : candidate,
      ),
    );
    setErrorMessage(null);
  }

  async function clearPostImage(postId: number) {
    const post = posts.find((candidate) => candidate.id === postId);
    if (!post) return;

    const { error } = await supabase
      .from("tasks")
      .update({ ref_image_url: null })
      .eq("id", post.databaseId);
    if (error) {
      setErrorMessage(`Could not clear the post image: ${error.message}`);
      return;
    }

    setPosts((current) =>
      current.map((candidate) =>
        candidate.id === postId
          ? { ...candidate, refImageUrl: null }
          : candidate,
      ),
    );
    setErrorMessage(null);
  }

  async function saveSlideImageLink(
    postId: number,
    slideNumber: number,
    rawLink: string,
  ) {
    const post = posts.find((candidate) => candidate.id === postId);
    const slide = post?.slides.find(
      (candidate) => candidate.slideNumber === slideNumber,
    );
    if (!post || !slide) return;

    const { error } = await supabase
      .from("task_slides")
      .update({ image_url: rawLink })
      .eq("id", slide.id);
    if (error) {
      setErrorMessage(`Could not save the slide image link: ${error.message}`);
      return;
    }

    const key = `${postId}-${slideNumber}`;
    setSlideImageLinks((current) => ({ ...current, [key]: rawLink }));
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
  }

  async function clearSlideImage(postId: number, slideNumber: number) {
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

    const key = `${postId}-${slideNumber}`;
    setSlideImageLinks((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
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
    setErrorMessage(null);
  }

  function scrollPostRail(direction: "left" | "right") {
    const rail = postRailRef.current;
    if (!rail) return;
    rail.scrollBy({
      left: direction === "left" ? -rail.clientWidth * 0.8 : rail.clientWidth * 0.8,
      behavior: "smooth",
    });
  }

  return (
    <div className="min-h-screen bg-[#F4F6F2] text-[#293F34]">
      <header className="border-b border-[#E0E5E0] bg-white px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4">
          <Logo />
          <p className="text-right text-[11px] leading-5 text-[#87928B]">
            Assigned to: <span className="font-medium text-[#5D6C64]">Emilia</span>
            <span className="mx-1.5 text-[#B3BBB6]">·</span>
            Graphic designer
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-5 py-9 sm:px-8 sm:py-12">
        <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9B7653]">
              Content production · August 2026
            </p>
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[#263E32] sm:text-4xl lg:text-[42px]">
              MVP — Social media · August content calendar
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#718078] sm:text-base">
              Open a post to review the copy, visual direction, and captions for every slide.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start rounded-full border border-[#DDE4DE] bg-white px-4 py-2 text-xs font-medium text-[#5B6A62] shadow-sm sm:self-auto">
            <span className="size-2 rounded-full bg-[#7A9D87]" />
            {isLoading ? "Loading posts…" : `${posts.length} posts assigned`}
          </div>
        </section>

        <div className="mt-6 flex max-w-3xl items-start gap-2 rounded-2xl border border-[#DDE5DF] bg-white/70 px-4 py-3 text-xs leading-5 text-[#66756D]">
          <Icon name="link" className="mt-0.5 size-4 shrink-0 text-[#6F8D7B]" />
          <p>
            Paste a Google Drive link — make sure it&apos;s shared as
            &apos;Anyone with the link can view&apos; so it previews correctly here.
          </p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mt-6 rounded-2xl border border-[#E5C990] bg-[#FFF7E6] px-4 py-3 text-sm leading-6 text-[#805A22]"
          >
            {errorMessage}
          </div>
        )}

        <section aria-label="Assigned posts" className="mt-9">
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
                      className="h-[520px] w-[82vw] max-w-[360px] shrink-0 animate-pulse rounded-[24px] border border-[#E1E6E1] bg-white sm:w-[360px]"
                    >
                      <div className="aspect-[16/10] bg-[#E5EAE5]" />
                      <div className="space-y-4 p-6">
                        <div className="h-5 w-3/4 rounded bg-[#E8ECE8]" />
                        <div className="h-3 w-full rounded bg-[#EEF1EE]" />
                        <div className="h-3 w-5/6 rounded bg-[#EEF1EE]" />
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
                      onImageSave={(link) =>
                        void savePostImageLink(post.id, link)
                      }
                      onClearImage={() => void clearPostImage(post.id)}
                      onOpen={() => setSelectedPostId(post.id)}
                    />
                  ))}
              {!isLoading && posts.length === 0 && (
                <div className="w-full rounded-[24px] border border-dashed border-[#CCD6CE] bg-white px-6 py-12 text-center text-sm text-[#718078]">
                  No assigned tasks found. Run the seed script, then refresh this page.
                </div>
              )}
            </div>

            {postRailState.canScrollLeft && (
              <>
                <div className="pointer-events-none absolute inset-y-0 left-12 w-10 bg-gradient-to-r from-[#F4F6F2] to-transparent sm:left-14" />
                <button
                  type="button"
                  onClick={() => scrollPostRail("left")}
                  className="absolute left-0 top-1/2 z-40 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-[#CBD6CE] bg-white text-[#40564A] shadow-[0_6px_20px_rgba(38,61,49,0.2)] transition hover:scale-105 hover:bg-[#F7F9F7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6E967F]"
                >
                  <Icon name="arrow" className="size-5" />
                  <span className="sr-only">Scroll to previous posts</span>
                </button>
              </>
            )}

            {postRailState.canScrollRight && (
              <>
                <div className="pointer-events-none absolute inset-y-0 right-12 w-10 bg-gradient-to-l from-[#F4F6F2] to-transparent sm:right-14" />
                <button
                  type="button"
                  onClick={() => scrollPostRail("right")}
                  className="absolute right-0 top-1/2 z-40 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-[#CBD6CE] bg-white text-[#40564A] shadow-[0_6px_20px_rgba(38,61,49,0.2)] transition hover:scale-105 hover:bg-[#F7F9F7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6E967F]"
                >
                  <Icon name="chevron" className="size-5" />
                  <span className="sr-only">Scroll to more posts</span>
                </button>
              </>
            )}
          </div>

          {postRailState.hasOverflow && (
            <div className="mt-1 flex items-center justify-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-[#929D96]">
              <span className="h-px w-7 bg-[#CAD2CC]" />
              Swipe or use arrows for more
              <Icon name="chevron" className="size-3" />
            </div>
          )}
        </section>

        <footer className="mt-10 flex flex-col gap-1 border-t border-[#DCE3DD] py-6 text-xs text-[#8A958E] sm:flex-row sm:justify-between">
          <p>Motion Vitality Pilates · Internal content workspace</p>
          <p>Changes are saved automatically.</p>
        </footer>
      </main>

      {selectedPost && (
        <PostDetail
          key={selectedPost.id}
          post={selectedPost}
          status={statuses[selectedPost.id]}
          slideImageLinks={slideImageLinks}
          onSlideImageSave={(slideNumber, link) =>
            void saveSlideImageLink(selectedPost.id, slideNumber, link)
          }
          onClearSlideImage={(slideNumber) =>
            void clearSlideImage(selectedPost.id, slideNumber)
          }
          onClose={() => setSelectedPostId(null)}
        />
      )}
    </div>
  );
}
