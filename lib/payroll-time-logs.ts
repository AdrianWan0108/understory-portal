import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  contractorWeeklyAllowance,
  contractorWeekTotals,
  payrollWeekWindow,
  validateContractorTimeEntryInput,
} from "@/lib/payroll-time-logs-core";

type ProfileRow = {
  id: string;
  full_name: string;
  team_username: string;
  role: string | null;
};

type SettingRow = {
  hourly_rate: number | string;
  weekly_cap: number | string;
  enabled: boolean;
};

type EntryRow = {
  id: string;
  work_date: string;
  hours: number | string;
  work_label: string;
  notes: string | null;
  created_at: string;
  submitted_by_team_username: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class PayrollTimeLogError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 500, code = "PAYROLL_TIME_LOG_ERROR") {
    super(message);
    this.name = "PayrollTimeLogError";
    this.status = status;
    this.code = code;
  }
}

function adminClient() {
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new PayrollTimeLogError(
      "Time logging is not configured.",
      503,
      "NOT_CONFIGURED",
    );
  }
  return admin;
}

function number(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function contractorForUsername(teamUsername: string) {
  const admin = adminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name, team_username, role")
    .eq("team_username", teamUsername)
    .eq("role", "staff")
    .maybeSingle();

  if (error) {
    throw new PayrollTimeLogError(
      "Could not verify your Team Hub profile.",
      503,
      "STORAGE_ERROR",
    );
  }
  if (!data) {
    throw new PayrollTimeLogError(
      "A staff profile is required to log time.",
      403,
      "NOT_STAFF",
    );
  }
  return data as ProfileRow;
}

async function settingsForProfile(profileId: string) {
  const admin = adminClient();
  const { data, error } = await admin
    .from("contractor_settings")
    .select("hourly_rate, weekly_cap, enabled")
    .eq("staff_profile_id", profileId)
    .maybeSingle();

  if (error) {
    throw new PayrollTimeLogError(
      "Contractor time logging has not been set up yet.",
      503,
      "MIGRATION_REQUIRED",
    );
  }
  if (!data || !data.enabled) {
    throw new PayrollTimeLogError(
      "Time logging is not enabled for this profile.",
      403,
      "NOT_ENABLED",
    );
  }
  return data as SettingRow;
}

export async function getPayrollTimeLogSnapshot(
  teamUsername: string,
  weekValue: unknown,
) {
  let window;
  try {
    window = payrollWeekWindow(weekValue);
  } catch (caught) {
    throw new PayrollTimeLogError(
      caught instanceof Error ? caught.message : "Invalid week.",
      400,
      "INVALID_INPUT",
    );
  }

  const admin = adminClient();
  const profile = await contractorForUsername(teamUsername);
  const settings = await settingsForProfile(profile.id);
  const { data, error } = await admin
    .from("staff_time_entries")
    .select(
      "id, work_date, hours, work_label, notes, created_at, submitted_by_team_username",
    )
    .eq("staff_profile_id", profile.id)
    .gte("work_date", window.start)
    .lte("work_date", window.end)
    .order("work_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new PayrollTimeLogError(
      "Could not load this week's time logs.",
      503,
      "STORAGE_ERROR",
    );
  }

  const entries = ((data ?? []) as EntryRow[]).map((entry) => ({
    id: entry.id,
    workDate: entry.work_date,
    hours: number(entry.hours),
    workLabel: entry.work_label,
    notes: entry.notes,
    createdAt: entry.created_at,
    canDelete: entry.submitted_by_team_username === profile.team_username,
  }));
  const hourlyRate = number(settings.hourly_rate);
  const weeklyCap = number(settings.weekly_cap);
  const totals = contractorWeekTotals({
    loggedHours: entries.reduce((sum, entry) => sum + entry.hours, 0),
    hourlyRate,
    weeklyCap,
  });

  return {
    profile: {
      id: profile.id,
      name: profile.full_name,
      teamUsername: profile.team_username,
    },
    week: window,
    hourlyRate,
    weeklyCap,
    ...totals,
    entries,
  };
}

export async function addPayrollTimeLog(
  teamUsername: string,
  rawInput: Record<string, unknown>,
) {
  let input;
  try {
    input = validateContractorTimeEntryInput(rawInput);
  } catch (caught) {
    throw new PayrollTimeLogError(
      caught instanceof Error ? caught.message : "Invalid time entry.",
      400,
      "INVALID_INPUT",
    );
  }

  const admin = adminClient();
  const profile = await contractorForUsername(teamUsername);
  const settings = await settingsForProfile(profile.id);
  const weeklyCap = number(settings.weekly_cap);
  const week = payrollWeekWindow(input.workDate);
  const { data: existingEntries, error: entriesError } = await admin
    .from("staff_time_entries")
    .select("hours")
    .eq("staff_profile_id", profile.id)
    .gte("work_date", week.start)
    .lte("work_date", week.end);

  if (entriesError) {
    throw new PayrollTimeLogError(
      "Could not verify your remaining hours for this week.",
      503,
      "STORAGE_ERROR",
    );
  }

  const alreadyLogged = (existingEntries ?? []).reduce(
    (sum, entry) => sum + number(entry.hours),
    0,
  );
  const allowance = contractorWeeklyAllowance({
    loggedHours: alreadyLogged,
    weeklyCap,
    requestedHours: input.hours,
  });
  if (!allowance.canLog) {
    throw new PayrollTimeLogError(
      allowance.remainingHours > 0
        ? `You can log up to ${allowance.remainingHours} more hours this week. The weekly maximum is ${weeklyCap} hours.`
        : `You have reached the ${weeklyCap}-hour weekly maximum.`,
      400,
      "WEEKLY_CAP_EXCEEDED",
    );
  }

  const { error } = await admin.from("staff_time_entries").insert({
    staff_profile_id: profile.id,
    work_date: input.workDate,
    hours: input.hours,
    work_label: input.workLabel,
    notes: input.notes,
    submitted_by_team_username: profile.team_username,
  });

  if (error) {
    if (error.code === "23514") {
      throw new PayrollTimeLogError(
        `This entry would exceed the ${weeklyCap}-hour weekly maximum.`,
        400,
        "WEEKLY_CAP_EXCEEDED",
      );
    }
    throw new PayrollTimeLogError(
      "Could not save the time entry.",
      503,
      "STORAGE_ERROR",
    );
  }

  return getPayrollTimeLogSnapshot(teamUsername, input.workDate);
}

export async function removePayrollTimeLog(
  teamUsername: string,
  entryId: string,
) {
  if (!UUID_PATTERN.test(entryId)) {
    throw new PayrollTimeLogError(
      "Invalid time entry.",
      400,
      "INVALID_INPUT",
    );
  }

  const admin = adminClient();
  const profile = await contractorForUsername(teamUsername);
  await settingsForProfile(profile.id);
  const { data, error } = await admin
    .from("staff_time_entries")
    .delete()
    .eq("id", entryId)
    .eq("staff_profile_id", profile.id)
    .eq("submitted_by_team_username", profile.team_username)
    .select("work_date")
    .maybeSingle();

  if (error) {
    throw new PayrollTimeLogError(
      "Could not delete the time entry.",
      503,
      "STORAGE_ERROR",
    );
  }
  if (!data) {
    throw new PayrollTimeLogError(
      "That time entry was not found or cannot be deleted.",
      404,
      "NOT_FOUND",
    );
  }

  return getPayrollTimeLogSnapshot(teamUsername, data.work_date);
}

export function payrollTimeLogRouteError(caught: unknown) {
  if (caught instanceof PayrollTimeLogError) {
    return Response.json(
      { error: caught.message, code: caught.code },
      { status: caught.status },
    );
  }
  return Response.json(
    { error: "The payroll time log service could not complete the request." },
    { status: 500 },
  );
}
