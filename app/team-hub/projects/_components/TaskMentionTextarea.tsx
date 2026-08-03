"use client";

import Image from "next/image";
import { useId, useMemo, useRef, useState } from "react";
import type { TaskTeamMember } from "./TaskPeoplePicker";

type MentionMatch = {
  start: number;
  end: number;
  query: string;
};

function mentionHandle(member: TaskTeamMember) {
  return member.full_name.trim().replace(/\s+/g, "");
}

function mentionMatchAtCaret(value: string, caret: number): MentionMatch | null {
  const beforeCaret = value.slice(0, caret);
  const match = beforeCaret.match(/(?:^|\s)@([\w-]*)$/);
  if (!match) return null;

  const query = match[1] ?? "";
  return {
    start: caret - query.length - 1,
    end: caret,
    query,
  };
}

export function extractMentionedUsernames(
  value: string,
  members: TaskTeamMember[],
) {
  const handles = Array.from(value.matchAll(/@([\w-]+)/g), (match) =>
    match[1].toLocaleLowerCase(),
  );

  return Array.from(
    new Set(
      members
        .filter((member) => {
          const username = member.team_username.toLocaleLowerCase();
          const shortUsername = username.replace(/^understory_/, "");
          const displayHandle = mentionHandle(member).toLocaleLowerCase();
          return handles.some(
            (handle) =>
              handle === username ||
              handle === shortUsername ||
              handle === displayHandle,
          );
        })
        .map((member) => member.team_username),
    ),
  );
}

function MentionAvatar({ member }: { member: TaskTeamMember }) {
  if (member.avatar_url) {
    return (
      <Image
        src={member.avatar_url}
        alt=""
        width={28}
        height={28}
        className="size-7 rounded-full object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex size-7 items-center justify-center rounded-full bg-[var(--primary)] text-[10px] font-bold text-[var(--primary-foreground)]"
    >
      {member.full_name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export function TaskMentionTextarea({
  value,
  onChange,
  members,
  rows = 4,
  placeholder,
  className,
  autoFocus = false,
  onMention,
}: {
  value: string;
  onChange: (value: string) => void;
  members: TaskTeamMember[];
  rows?: number;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  onMention?: (username: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionListId = useId();
  const [mentionMatch, setMentionMatch] = useState<MentionMatch | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const suggestions = useMemo(() => {
    if (!mentionMatch) return [];
    const query = mentionMatch.query.toLocaleLowerCase();
    return members
      .filter((member) => {
        const name = member.full_name.toLocaleLowerCase();
        const username = member.team_username.toLocaleLowerCase();
        return !query || name.includes(query) || username.includes(query);
      })
      .slice(0, 6);
  }, [members, mentionMatch]);

  function updateMentionMatch(nextValue: string, caret: number) {
    const nextMatch = mentionMatchAtCaret(nextValue, caret);
    setMentionMatch(nextMatch);
    setActiveIndex(0);
  }

  function selectMember(member: TaskTeamMember) {
    if (!mentionMatch) return;
    const nextValue = `${value.slice(0, mentionMatch.start)}@${mentionHandle(
      member,
    )} ${value.slice(mentionMatch.end)}`;
    const nextCaret =
      mentionMatch.start + mentionHandle(member).length + 2;
    onChange(nextValue);
    onMention?.(member.team_username);
    setMentionMatch(null);

    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        role="combobox"
        autoFocus={autoFocus}
        rows={rows}
        value={value}
        placeholder={placeholder}
        aria-autocomplete="list"
        aria-expanded={Boolean(mentionMatch && suggestions.length)}
        aria-controls={suggestionListId}
        className={className}
        onChange={(event) => {
          const nextValue = event.target.value;
          onChange(nextValue);
          updateMentionMatch(nextValue, event.target.selectionStart);
        }}
        onClick={(event) =>
          updateMentionMatch(value, event.currentTarget.selectionStart)
        }
        onKeyUp={(event) => {
          if (["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)) {
            return;
          }
          updateMentionMatch(value, event.currentTarget.selectionStart);
        }}
        onKeyDown={(event) => {
          if (!mentionMatch || !suggestions.length) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((current) => (current + 1) % suggestions.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex(
              (current) =>
                (current - 1 + suggestions.length) % suggestions.length,
            );
          } else if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            selectMember(suggestions[activeIndex] ?? suggestions[0]);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setMentionMatch(null);
          }
        }}
        onBlur={() => {
          window.setTimeout(() => setMentionMatch(null), 120);
        }}
      />

      {mentionMatch && suggestions.length > 0 && (
        <div
          id={suggestionListId}
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-1.5 shadow-[0_14px_34px_rgba(52,31,96,0.18)]"
        >
          {suggestions.map((member, index) => (
            <button
              key={member.team_username}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectMember(member)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                index === activeIndex
                  ? "bg-[var(--muted)]"
                  : "hover:bg-[var(--muted)]"
              }`}
            >
              <MentionAvatar member={member} />
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-[var(--foreground)]">
                  {member.full_name}
                </span>
                <span className="block truncate text-[10px] text-[var(--muted-foreground)]">
                  @{mentionHandle(member)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TaskMentionInput({
  value,
  onChange,
  members,
  placeholder,
  className,
  autoFocus = false,
  required = false,
  onMention,
  onEnter,
}: {
  value: string;
  onChange: (value: string) => void;
  members: TaskTeamMember[];
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  required?: boolean;
  onMention?: (username: string) => void;
  onEnter?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionListId = useId();
  const [mentionMatch, setMentionMatch] = useState<MentionMatch | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const suggestions = useMemo(() => {
    if (!mentionMatch) return [];
    const query = mentionMatch.query.toLocaleLowerCase();
    return members
      .filter((member) => {
        const name = member.full_name.toLocaleLowerCase();
        const username = member.team_username.toLocaleLowerCase();
        return !query || name.includes(query) || username.includes(query);
      })
      .slice(0, 6);
  }, [members, mentionMatch]);

  function updateMentionMatch(nextValue: string, caret: number) {
    setMentionMatch(mentionMatchAtCaret(nextValue, caret));
    setActiveIndex(0);
  }

  function selectMember(member: TaskTeamMember) {
    if (!mentionMatch) return;
    const handle = mentionHandle(member);
    const nextValue = `${value.slice(0, mentionMatch.start)}@${handle} ${value.slice(mentionMatch.end)}`;
    const nextCaret = mentionMatch.start + handle.length + 2;
    onChange(nextValue);
    onMention?.(member.team_username);
    setMentionMatch(null);

    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        role="combobox"
        type="text"
        autoFocus={autoFocus}
        required={required}
        value={value}
        placeholder={placeholder}
        aria-autocomplete="list"
        aria-expanded={Boolean(mentionMatch && suggestions.length)}
        aria-controls={suggestionListId}
        className={className}
        onChange={(event) => {
          const nextValue = event.target.value;
          onChange(nextValue);
          updateMentionMatch(nextValue, event.target.selectionStart ?? nextValue.length);
        }}
        onClick={(event) =>
          updateMentionMatch(value, event.currentTarget.selectionStart ?? value.length)
        }
        onKeyUp={(event) => {
          if (["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)) {
            return;
          }
          updateMentionMatch(
            value,
            event.currentTarget.selectionStart ?? value.length,
          );
        }}
        onKeyDown={(event) => {
          if (
            (!mentionMatch || !suggestions.length) &&
            event.key === "Enter" &&
            onEnter
          ) {
            event.preventDefault();
            onEnter();
            return;
          }
          if (!mentionMatch || !suggestions.length) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((current) => (current + 1) % suggestions.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex(
              (current) =>
                (current - 1 + suggestions.length) % suggestions.length,
            );
          } else if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            selectMember(suggestions[activeIndex] ?? suggestions[0]);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setMentionMatch(null);
          }
        }}
        onBlur={() => {
          window.setTimeout(() => setMentionMatch(null), 120);
        }}
      />

      {mentionMatch && suggestions.length > 0 && (
        <div
          id={suggestionListId}
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-1.5 shadow-[0_14px_34px_rgba(52,31,96,0.18)]"
        >
          {suggestions.map((member, index) => (
            <button
              key={member.team_username}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectMember(member)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                index === activeIndex
                  ? "bg-[var(--muted)]"
                  : "hover:bg-[var(--muted)]"
              }`}
            >
              <MentionAvatar member={member} />
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-[var(--foreground)]">
                  {member.full_name}
                </span>
                <span className="block truncate text-[10px] text-[var(--muted-foreground)]">
                  @{mentionHandle(member)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
