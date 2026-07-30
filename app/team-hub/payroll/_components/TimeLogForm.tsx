"use client";

import { useState } from "react";
import {
  TeamButton,
  teamInputClass,
} from "@/app/team-hub/_components/TeamHubUi";

type TimeLogFormProps = {
  onSaved: () => void;
};

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function TimeLogForm({ onSaved }: TimeLogFormProps) {
  const [workDate, setWorkDate] = useState(localDate);
  const [hours, setHours] = useState("");
  const [workLabel, setWorkLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/team-hub/payroll/time-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workDate, hours, workLabel, notes }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error || "Could not save your time entry.");
      }

      setHours("");
      setWorkLabel("");
      setNotes("");
      setMessage("Hours logged. Your weekly total has been updated.");
      onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not save your time entry.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-[24px] border border-[#D7CBE0] bg-white p-5 shadow-[0_8px_28px_rgba(40,21,79,0.055)] sm:p-6">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7D4698]">
          Your time
        </p>
        <h2 className="mt-1 text-xl font-semibold text-[#341F60]">
          Log hours
        </h2>
        <p className="mt-1 text-sm leading-6 text-[#75647F]">
          Add the time you worked and a short description of what it covered.
        </p>
      </div>

      <form onSubmit={submit} className="mt-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold text-[#5F3378]">
            Work date
            <input
              type="date"
              required
              value={workDate}
              onChange={(event) => setWorkDate(event.target.value)}
              className={`mt-2 ${teamInputClass}`}
            />
          </label>
          <label className="text-xs font-semibold text-[#5F3378]">
            Hours
            <input
              type="number"
              min="0.25"
              max="10"
              step="0.25"
              required
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              className={`mt-2 ${teamInputClass}`}
              placeholder="2.5"
            />
          </label>
        </div>
        <label className="block text-xs font-semibold text-[#5F3378]">
          Work or project
          <input
            type="text"
            maxLength={120}
            required
            value={workLabel}
            onChange={(event) => setWorkLabel(event.target.value)}
            className={`mt-2 ${teamInputClass}`}
            placeholder="Boardwalk campaign setup"
          />
        </label>
        <label className="block text-xs font-semibold text-[#5F3378]">
          Notes <span className="font-normal text-[#8B7895]">(optional)</span>
          <textarea
            maxLength={500}
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className={`mt-2 resize-y ${teamInputClass}`}
            placeholder="Anything Karen should know about this entry"
          />
        </label>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div aria-live="polite" className="min-h-5 text-sm">
            {error && <p className="text-[#9A4040]">{error}</p>}
            {message && <p className="text-[#356346]">{message}</p>}
          </div>
          <TeamButton
            type="submit"
            disabled={
              isSaving || !workDate || !hours || !workLabel.trim()
            }
          >
            {isSaving ? "Logging…" : "Log hours"}
          </TeamButton>
        </div>
      </form>
    </section>
  );
}
