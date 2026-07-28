import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  calculateStaffBudgetProgress,
  parseStaffMonth,
  staffMonthWindow,
  validateStaffBudgetInput,
  validateStaffTimeEntryInput,
} from "@/lib/staff-hours-core";

type ProfileRow = {
  id: string;
  full_name: string;
  team_username: string | null;
  title: string | null;
  avatar_url: string | null;
};

type BudgetRow = {
  id: string;
  staff_profile_id: string;
  budget_amount: number | string;
  planned_hours: number | string;
  hourly_rate: number | string;
};

type EntryRow = {
  id: string;
  staff_profile_id: string;
  work_date: string;
  hours: number | string;
  work_label: string;
  notes: string | null;
  created_at: string;
};

export class StaffHoursError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 500, code = "STAFF_HOURS_ERROR") {
    super(message);
    this.name = "StaffHoursError";
    this.status = status;
    this.code = code;
  }
}

function adminClient() {
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new StaffHoursError(
      "Staff hours storage is not configured.",
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

async function requireStaffProfile(staffProfileId: string) {
  const admin = adminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("id", staffProfileId)
    .eq("role", "staff")
    .maybeSingle();
  if (error) {
    throw new StaffHoursError(
      "Could not verify the staff member.",
      503,
      "STORAGE_ERROR",
    );
  }
  if (!data) {
    throw new StaffHoursError(
      "The selected staff member was not found.",
      400,
      "INVALID_STAFF",
    );
  }
}

export async function getStaffHoursSnapshot(monthValue: unknown) {
  let month: string;
  try {
    month = parseStaffMonth(monthValue);
  } catch (caught) {
    throw new StaffHoursError(
      caught instanceof Error ? caught.message : "Invalid month.",
      400,
      "INVALID_INPUT",
    );
  }

  const admin = adminClient();
  const { start, next } = staffMonthWindow(month);
  const [profilesResult, budgetsResult, entriesResult] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name, team_username, title, avatar_url")
      .eq("role", "staff")
      .order("full_name"),
    admin
      .from("staff_monthly_budgets")
      .select(
        "id, staff_profile_id, budget_amount, planned_hours, hourly_rate",
      )
      .eq("budget_month", start),
    admin
      .from("staff_time_entries")
      .select(
        "id, staff_profile_id, work_date, hours, work_label, notes, created_at",
      )
      .gte("work_date", start)
      .lt("work_date", next)
      .order("work_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (profilesResult.error || budgetsResult.error || entriesResult.error) {
    throw new StaffHoursError(
      "Could not load staff budgets and hours.",
      503,
      "STORAGE_ERROR",
    );
  }

  const profiles = (profilesResult.data ?? []) as ProfileRow[];
  const budgets = (budgetsResult.data ?? []) as BudgetRow[];
  const entries = (entriesResult.data ?? []) as EntryRow[];
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const budgetsByStaff = new Map(
    budgets.map((budget) => [budget.staff_profile_id, budget]),
  );
  const loggedByStaff = new Map<string, number>();

  entries.forEach((entry) => {
    loggedByStaff.set(
      entry.staff_profile_id,
      number(loggedByStaff.get(entry.staff_profile_id)) + number(entry.hours),
    );
  });

  const staff = profiles.map((profile) => {
    const budget = budgetsByStaff.get(profile.id);
    const budgetAmount = number(budget?.budget_amount);
    const plannedHours = number(budget?.planned_hours);
    const hourlyRate = number(budget?.hourly_rate);
    const loggedHours =
      Math.round(number(loggedByStaff.get(profile.id)) * 100) / 100;
    return {
      id: profile.id,
      teamUsername: profile.team_username,
      name: profile.full_name,
      title: profile.title,
      avatarUrl: profile.avatar_url,
      budgetId: budget?.id ?? null,
      budgetAmount,
      plannedHours,
      hourlyRate,
      loggedHours,
      ...calculateStaffBudgetProgress({
        budgetAmount,
        plannedHours,
        hourlyRate,
        loggedHours,
      }),
    };
  });

  const safeEntries = entries.flatMap((entry) => {
    const profile = profilesById.get(entry.staff_profile_id);
    if (!profile) return [];
    return [
      {
        id: entry.id,
        staffProfileId: entry.staff_profile_id,
        staffName: profile.full_name,
        workDate: entry.work_date,
        hours: number(entry.hours),
        workLabel: entry.work_label,
        notes: entry.notes,
        createdAt: entry.created_at,
      },
    ];
  });

  return {
    month,
    currencyCode: "CAD",
    summary: {
      totalBudget: staff.reduce((sum, row) => sum + row.budgetAmount, 0),
      totalPlannedHours: staff.reduce(
        (sum, row) => sum + row.plannedHours,
        0,
      ),
      totalLoggedHours: staff.reduce(
        (sum, row) => sum + row.loggedHours,
        0,
      ),
      totalEstimatedCost: staff.reduce(
        (sum, row) => sum + row.estimatedCost,
        0,
      ),
    },
    staff,
    entries: safeEntries,
  };
}

export async function saveStaffBudget(
  rawInput: Record<string, unknown>,
  userId: string,
) {
  let input;
  try {
    input = validateStaffBudgetInput(rawInput);
  } catch (caught) {
    throw new StaffHoursError(
      caught instanceof Error ? caught.message : "Invalid budget.",
      400,
      "INVALID_INPUT",
    );
  }
  await requireStaffProfile(input.staffProfileId);
  const admin = adminClient();
  const now = new Date().toISOString();
  const { error } = await admin.from("staff_monthly_budgets").upsert(
    {
      staff_profile_id: input.staffProfileId,
      budget_month: `${input.month}-01`,
      budget_amount: input.budgetAmount,
      planned_hours: input.plannedHours,
      hourly_rate: input.hourlyRate,
      created_by: userId,
      updated_at: now,
    },
    { onConflict: "staff_profile_id,budget_month" },
  );
  if (error) {
    throw new StaffHoursError(
      "Could not save the staff budget.",
      503,
      "STORAGE_ERROR",
    );
  }
}

export async function addStaffTimeEntry(
  rawInput: Record<string, unknown>,
  userId: string,
) {
  let input;
  try {
    input = validateStaffTimeEntryInput(rawInput);
  } catch (caught) {
    throw new StaffHoursError(
      caught instanceof Error ? caught.message : "Invalid time entry.",
      400,
      "INVALID_INPUT",
    );
  }
  await requireStaffProfile(input.staffProfileId);
  const admin = adminClient();
  const { error } = await admin.from("staff_time_entries").insert({
    staff_profile_id: input.staffProfileId,
    work_date: input.workDate,
    hours: input.hours,
    work_label: input.workLabel,
    notes: input.notes,
    created_by: userId,
  });
  if (error) {
    throw new StaffHoursError(
      "Could not save the time entry.",
      503,
      "STORAGE_ERROR",
    );
  }
}

export async function removeStaffTimeEntry(entryId: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      entryId,
    )
  ) {
    throw new StaffHoursError(
      "Invalid time entry.",
      400,
      "INVALID_INPUT",
    );
  }
  const admin = adminClient();
  const { error } = await admin
    .from("staff_time_entries")
    .delete()
    .eq("id", entryId);
  if (error) {
    throw new StaffHoursError(
      "Could not delete the time entry.",
      503,
      "STORAGE_ERROR",
    );
  }
}

export function staffHoursRouteError(caught: unknown) {
  if (caught instanceof StaffHoursError) {
    return Response.json(
      { error: caught.message, code: caught.code },
      { status: caught.status },
    );
  }
  return Response.json(
    { error: "The staff hours service could not complete the request." },
    { status: 500 },
  );
}
