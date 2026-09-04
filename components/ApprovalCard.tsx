"use client";

/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from "react";
import { resolveGoogleDriveFileUrls } from "@/lib/google-drive";
import type { ApprovalItem } from "@/types/approvals";
import { categoryConfig, statusConfig } from "@/types/approvals";

interface ApprovalCardProps {
  item: ApprovalItem;
  reviewLayout?: boolean;
  isUpdating?: boolean;
  onApprove: (id: string, comment?: string) => void | Promise<void>;
  onRequestChanges: (id: string, comment: string) => void | Promise<void>;
}

export function CategoryIcon({
  icon,
  className = "size-4",
}: {
  icon: "instagram" | "calendar" | "palette";
  className?: string;
}) {
  if (icon === "instagram") {
    return (
      <svg
        aria-hidden="true"
        className={className}
        viewBox="0 0 24 24"
        fill="none"
      >
        <rect
          x="3"
          y="3"
          width="18"
          height="18"
          rx="5"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <circle
          cx="12"
          cy="12"
          r="4"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" />
      </svg>
    );
  }

  if (icon === "palette") {
    return (
      <svg
        aria-hidden="true"
        className={className}
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h3.5A5.5 5.5 0 0 0 21 7.5C21 5 17 3 12 3Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <circle cx="8" cy="9" r="1" fill="currentColor" />
        <circle cx="11" cy="6.5" r="1" fill="currentColor" />
        <circle cx="15" cy="7" r="1" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
    >
      <rect
        x="3"
        y="5"
        width="18"
        height="16"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M3 9h18" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M8 3v4M16 3v4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

const toneClasses = {
  amber: "border-[#DFC994] bg-[#FFF8E7] text-[#755D27]",
  red: "border-[#DDB7AB] bg-[#F8ECE8] text-[#875344]",
  green: "border-[#BFD8C7] bg-[#EAF5ED] text-[#356346]",
};

function PlayIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M8 5.8v12.4a1 1 0 0 0 1.53.85l9.3-6.2a1 1 0 0 0 0-1.7l-9.3-6.2A1 1 0 0 0 8 5.8Z" />
    </svg>
  );
}

function ApprovalVisual({
  item,
  compact = false,
  activeSlide: controlledActiveSlide,
  onActiveSlideChange,
}: {
  item: ApprovalItem;
  compact?: boolean;
  activeSlide?: number;
  onActiveSlideChange?: (index: number) => void;
}) {
  const [internalActiveSlide, setInternalActiveSlide] = useState(0);
  const activeSlide = controlledActiveSlide ?? internalActiveSlide;
  const [failedSlides, setFailedSlides] = useState<number[]>([]);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const category = categoryConfig[item.category];
  const isCarousel = item.format === "carousel";
  const isPlayableReel =
    item.format === "reel" && Boolean(item.videoSrc) && !compact;
  const driveVideoUrls = item.videoSrc
    ? resolveGoogleDriveFileUrls(item.videoSrc)
    : null;
  const slides =
    isCarousel && item.slides && item.slides.length > 0
      ? item.slides
      : [{ number: 1, thumbnailSrc: item.thumbnailSrc }];
  const slideIndex = Math.min(activeSlide, slides.length - 1);
  const activeVisual = slides[slideIndex];
  const hasFailed = failedSlides.includes(slideIndex);

  function showSlide(index: number) {
    const next = Math.max(0, Math.min(index, slides.length - 1));
    if (onActiveSlideChange) {
      onActiveSlideChange(next);
    } else {
      setInternalActiveSlide(next);
    }
  }

  function playVideo() {
    if (driveVideoUrls) {
      setIsVideoPlaying(true);
      return;
    }

    void videoRef.current?.play().then(() => setIsVideoPlaying(true));
  }

  return (
    <div
      className={
        compact
          ? "flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted text-primary sm:size-[4.5rem]"
          : "relative flex aspect-square w-full items-center justify-center overflow-hidden border-b border-border bg-muted"
      }
    >
      {isPlayableReel && isVideoPlaying && driveVideoUrls ? (
        <iframe
          src={`${driveVideoUrls.previewUrl}?autoplay=1`}
          title={`${item.title} video`}
          allow="autoplay; fullscreen"
          allowFullScreen
          className="absolute inset-0 size-full border-0"
        />
      ) : isPlayableReel && !driveVideoUrls ? (
        <video
          ref={videoRef}
          src={item.videoSrc}
          poster={activeVisual.thumbnailSrc}
          aria-label={`${item.title} video`}
          controls
          playsInline
          preload="metadata"
          onPlay={() => setIsVideoPlaying(true)}
          onPause={() => setIsVideoPlaying(false)}
          onEnded={() => setIsVideoPlaying(false)}
          className="absolute inset-0 size-full object-contain"
        />
      ) : activeVisual.thumbnailSrc && !hasFailed ? (
        <img
          src={activeVisual.thumbnailSrc}
          alt={
            isCarousel
              ? `${item.title}, slide ${slideIndex + 1} of ${slides.length}`
              : `${item.title} visual`
          }
          className={compact ? "size-full object-cover" : "absolute inset-0 size-full object-contain"}
          onError={() =>
            setFailedSlides((current) =>
              current.includes(slideIndex) ? current : [...current, slideIndex],
            )
          }
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 px-5 text-center text-primary">
          <span
            className={
              compact
                ? "contents"
                : "flex size-12 items-center justify-center rounded-2xl bg-card/70"
            }
          >
            <CategoryIcon icon={category.icon} />
          </span>
          {!compact && (
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Visual preview unavailable
            </span>
          )}
        </div>
      )}

      {isPlayableReel && !isVideoPlaying && (
        <button
          type="button"
          aria-label={`Play ${item.title}`}
          onClick={playVideo}
          className="absolute left-1/2 top-1/2 z-20 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-white/95 pl-1 text-foreground shadow-[0_10px_30px_rgba(17,28,33,0.28)] transition hover:scale-105 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <PlayIcon className="size-7" />
        </button>
      )}

      {isCarousel && !compact && (
        <>
          <div className="absolute left-3 top-3 z-10 rounded-full bg-foreground/85 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-background shadow-sm">
            Carousel · {slideIndex + 1} of {slides.length}
          </div>

          {slides.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous carousel slide"
                disabled={slideIndex === 0}
                onClick={() => showSlide(slideIndex - 1)}
                className="absolute left-3 top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-white/90 text-lg font-semibold text-foreground shadow-md transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span aria-hidden="true">‹</span>
              </button>
              <button
                type="button"
                aria-label="Next carousel slide"
                disabled={slideIndex === slides.length - 1}
                onClick={() => showSlide(slideIndex + 1)}
                className="absolute right-3 top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-white/90 text-lg font-semibold text-foreground shadow-md transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span aria-hidden="true">›</span>
              </button>

              <div
                className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5 rounded-full bg-foreground/70 px-2.5 py-2"
                aria-label={`Carousel slide ${slideIndex + 1} of ${slides.length}`}
              >
                {slides.map((slide, index) => (
                  <button
                    key={`${slide.number}-${index}`}
                    type="button"
                    aria-label={`Show slide ${index + 1}`}
                    aria-current={index === slideIndex ? "true" : undefined}
                    onClick={() => showSlide(index)}
                    className={`size-1.5 rounded-full transition ${
                      index === slideIndex ? "bg-white" : "bg-white/45"
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function ApprovalCard({
  item,
  reviewLayout = false,
  isUpdating = false,
  onApprove,
  onRequestChanges,
}: ApprovalCardProps) {
  const category = categoryConfig[item.category];
  const status = statusConfig[item.status];
  const [comment, setComment] = useState("");
  const [commentError, setCommentError] = useState(false);
  const [isRequestingChanges, setIsRequestingChanges] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const isCarousel = item.format === "carousel";
  const carouselSlides =
    isCarousel && item.slides && item.slides.length > 0 ? item.slides : null;
  const displayCaption = carouselSlides
    ? carouselSlides[Math.min(activeSlide, carouselSlides.length - 1)]?.caption
    : item.caption;

  function requestChanges() {
    const note = comment.trim();
    if (!note) {
      setCommentError(true);
      return;
    }
    void onRequestChanges(item.id, note);
  }

  if (reviewLayout) {
    return (
      <article className="flex h-full min-w-0 flex-col overflow-hidden rounded-[20px] border border-border bg-card shadow-[0_8px_24px_rgba(52,31,96,0.065)]">
        <ApprovalVisual
          item={item}
          activeSlide={activeSlide}
          onActiveSlideChange={setActiveSlide}
        />

        <div className="flex flex-1 flex-col p-4">
          <h3 className="text-lg font-semibold leading-6 tracking-[-0.02em] text-foreground">
            {item.title}
          </h3>
          {item.plannedAt && (
            <p className="mt-1 text-[11px] font-medium text-muted-foreground">
              Planned for{" "}
              {new Intl.DateTimeFormat("en-CA", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(item.plannedAt))}
            </p>
          )}

          <div className="mt-4 border-t border-border pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {item.category === "social_media"
                ? carouselSlides
                  ? `Slide ${Math.min(activeSlide, carouselSlides.length - 1) + 1} caption`
                  : "Caption"
                : "Description"}
            </p>
            <p className="mt-2 max-h-28 overflow-y-auto whitespace-pre-line pr-1 text-xs leading-5 text-foreground/75">
              {displayCaption?.trim() ||
                (item.category === "social_media"
                  ? "No caption provided."
                  : "No description provided.")}
            </p>
          </div>

          {item.creativeUrl && (
            <a
              href={item.creativeUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex w-fit text-[11px] font-semibold text-primary underline underline-offset-4"
            >
              Open creative in Google Drive ↗
            </a>
          )}

          <div className="mt-auto pt-5">
            {isRequestingChanges ? (
              <div className="rounded-2xl border border-[#DDB7AB] bg-[#F8ECE8]/70 p-3">
                <label
                  htmlFor={`approval-comment-${item.id}`}
                  className="text-[11px] font-semibold text-foreground"
                >
                  What needs to change?
                </label>
                <textarea
                  autoFocus
                  id={`approval-comment-${item.id}`}
                  rows={4}
                  value={comment}
                  disabled={isUpdating}
                  onChange={(event) => {
                    setComment(event.target.value);
                    if (commentError) setCommentError(false);
                  }}
                  placeholder="Leave clear feedback for the Understory team"
                  aria-invalid={commentError}
                  aria-describedby={
                    commentError
                      ? `approval-comment-error-${item.id}`
                      : undefined
                  }
                  className={`mt-2 w-full resize-none rounded-xl border bg-card px-3 py-2.5 text-xs leading-5 text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring/20 disabled:opacity-50 ${
                    commentError ? "border-[#B16954]" : "border-input"
                  }`}
                />
                {commentError && (
                  <p
                    id={`approval-comment-error-${item.id}`}
                    role="alert"
                    className="mt-1.5 text-[10px] font-medium text-[#875344]"
                  >
                    Add a comment explaining what needs to change.
                  </p>
                )}

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => {
                      setIsRequestingChanges(false);
                      setComment("");
                      setCommentError(false);
                    }}
                    className="rounded-full border border-input bg-card px-3 py-2.5 text-[11px] font-semibold text-foreground transition hover:bg-muted disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={requestChanges}
                    className="rounded-full bg-[#A76350] px-3 py-2.5 text-[11px] font-semibold text-white transition hover:bg-[#925542] disabled:cursor-wait disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {isUpdating ? "Submitting…" : "Submit request"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() => setIsRequestingChanges(true)}
                  className="rounded-full border border-input bg-card px-3 py-2.5 text-[11px] font-semibold text-foreground transition hover:bg-muted disabled:cursor-wait disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  Request changes
                </button>
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() => void onApprove(item.id)}
                  className="rounded-full bg-[#4F8A62] px-3 py-2.5 text-[11px] font-semibold text-white shadow-[0_6px_16px_rgba(79,138,98,0.2)] transition hover:bg-[#427653] disabled:cursor-wait disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {isUpdating ? "Saving…" : "Approve"}
                </button>
              </div>
            )}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-[22px] border border-border bg-card p-4 shadow-[0_8px_28px_rgba(52,31,96,0.045)] sm:p-5">
      <div className="flex min-w-0 items-start gap-3.5 sm:gap-4">
        <ApprovalVisual item={item} compact />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">
              <CategoryIcon icon={category.icon} />
              {category.label}
            </span>
          </div>

          <h3 className="mt-2 text-sm font-semibold leading-5 text-foreground sm:text-base">
            {item.title}
          </h3>

          <span
            className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${toneClasses[status.tone]}`}
          >
            {status.label}
          </span>
        </div>
      </div>
    </article>
  );
}
