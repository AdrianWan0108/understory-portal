"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
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
  icon: "instagram" | "calendar";
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

function ApprovalVisual({
  item,
  compact = false,
}: {
  item: ApprovalItem;
  compact?: boolean;
}) {
  const [hasFailed, setHasFailed] = useState(false);
  const category = categoryConfig[item.category];

  return (
    <div
      className={
        compact
          ? "flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted text-primary sm:size-[4.5rem]"
          : "relative flex aspect-square w-full items-center justify-center overflow-hidden border-b border-border bg-muted"
      }
    >
      {item.thumbnailSrc && !hasFailed ? (
        <img
          src={item.thumbnailSrc}
          alt={`${item.title} visual`}
          className={compact ? "size-full object-cover" : "absolute inset-0 size-full object-contain"}
          onError={() => setHasFailed(true)}
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
        <ApprovalVisual item={item} />

        <div className="flex flex-1 flex-col p-4">
          <h3 className="text-lg font-semibold leading-6 tracking-[-0.02em] text-foreground">
            {item.title}
          </h3>

          <div className="mt-4 border-t border-border pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Caption
            </p>
            <p className="mt-2 max-h-28 overflow-y-auto whitespace-pre-line pr-1 text-xs leading-5 text-foreground/75">
              {item.caption?.trim() || "No caption provided."}
            </p>
          </div>

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
                  className="rounded-full bg-primary px-3 py-2.5 text-[11px] font-semibold text-primary-foreground shadow-[0_6px_16px_rgba(52,31,96,0.12)] transition hover:bg-primary/90 disabled:cursor-wait disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
