export type StaffBudgetInput = {
  staffProfileId: string;
  month: string;
  budgetAmount: number;
  plannedHours: number;
  hourlyRate: number;
};

export type StaffTimeEntryInput = {
  staffProfileId: string;
  workDate: string;
  hours: number;
  workLabel: string;
  notes: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function finiteNumber(value: unknown, field: string, maximum: number) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > maximum) {
    throw new Error(`${field} must be between 0 and ${maximum}.`);
  }
  return Math.round(parsed * 100) / 100;
}

function validDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function parseStaffMonth(value: unknown) {
  if (typeof value !== "string" || !MONTH_PATTERN.test(value)) {
    throw new Error("Month must use YYYY-MM format.");
  }
  const year = Number(value.slice(0, 4));
  if (year < 2020 || year > 2100) {
    throw new Error("Month is outside the supported range.");
  }
  return value;
}

export function staffMonthWindow(month: string) {
  const validMonth = parseStaffMonth(month);
  const [year, monthNumber] = validMonth.split("-").map(Number);
  const start = `${validMonth}-01`;
  const next =
    monthNumber === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(monthNumber + 1).padStart(2, "0")}-01`;
  return { start, next };
}

export function validateStaffBudgetInput(
  input: Record<string, unknown>,
): StaffBudgetInput {
  const staffProfileId = String(input.staffProfileId ?? "");
  if (!UUID_PATTERN.test(staffProfileId)) {
    throw new Error("Choose a valid staff member.");
  }
  return {
    staffProfileId,
    month: parseStaffMonth(input.month),
    budgetAmount: finiteNumber(input.budgetAmount, "Budget", 10_000_000),
    plannedHours: finiteNumber(input.plannedHours, "Planned hours", 744),
    hourlyRate: finiteNumber(input.hourlyRate, "Hourly rate", 100_000),
  };
}

export function validateStaffTimeEntryInput(
  input: Record<string, unknown>,
): StaffTimeEntryInput {
  const staffProfileId = String(input.staffProfileId ?? "");
  const workDate = String(input.workDate ?? "");
  const workLabel = String(input.workLabel ?? "").trim();
  const notes = String(input.notes ?? "").trim();
  if (!UUID_PATTERN.test(staffProfileId)) {
    throw new Error("Choose a valid staff member.");
  }
  if (!validDate(workDate)) {
    throw new Error("Choose a valid work date.");
  }
  const hours = finiteNumber(input.hours, "Hours", 24);
  if (hours <= 0) throw new Error("Hours must be greater than zero.");
  if (!workLabel || workLabel.length > 120) {
    throw new Error("Work or project must be between 1 and 120 characters.");
  }
  if (notes.length > 500) {
    throw new Error("Notes must be 500 characters or fewer.");
  }
  return {
    staffProfileId,
    workDate,
    hours,
    workLabel,
    notes: notes || null,
  };
}

export function calculateStaffBudgetProgress(input: {
  budgetAmount: number;
  plannedHours: number;
  hourlyRate: number;
  loggedHours: number;
}) {
  const estimatedCost =
    Math.round(input.loggedHours * input.hourlyRate * 100) / 100;
  return {
    estimatedCost,
    remainingBudget:
      Math.round((input.budgetAmount - estimatedCost) * 100) / 100,
    remainingHours:
      Math.round((input.plannedHours - input.loggedHours) * 100) / 100,
    utilizationPercent:
      input.plannedHours > 0
        ? Math.round((input.loggedHours / input.plannedHours) * 1000) / 10
        : 0,
  };
}
